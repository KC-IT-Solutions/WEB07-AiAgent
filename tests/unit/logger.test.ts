import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { StructuredLogger } from '../../src/server/logging/logger.js';

function readEntries(path: string): Array<Record<string, unknown>> {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

await describe('structured server logger', async () => {
  await it('creates separate append-only JSONL streams and filters ordered levels', async () => {
    const root = mkdtempSync(`${tmpdir()}web07-logger-`);
    const logger = new StructuredLogger(root, 'info');
    await logger.initialize();
    await logger.application('debug', 'omitted');
    await logger.application('error', 'first', { requestId: 'one' });
    await logger.application('info', 'second');
    await logger.model('info', 'model_event', { inferenceId: 'inference-one' });

    const applicationEntries = readEntries(resolve(root, 'application.log'));
    assert.deepEqual(
      applicationEntries.map((entry) => entry.event),
      ['first', 'second'],
    );
    assert.equal(applicationEntries[0].requestId, 'one');
    assert.ok(applicationEntries.every((entry) => typeof entry.timestamp === 'string'));
    assert.deepEqual(readEntries(resolve(root, 'model-inference.log'))[0].event, 'model_event');
  });

  await it('redacts secret fields recursively', async () => {
    const root = mkdtempSync(`${tmpdir()}web07-logger-secrets-`);
    const logger = new StructuredLogger(root, 'trace');
    await logger.application('trace', 'redaction', {
      apiKey: 'top-secret',
      nested: { Authorization: 'Bearer private', cookie: 'session=private' },
      safe: 'visible',
    });
    const contents = readFileSync(resolve(root, 'application.log'), 'utf8');
    assert.ok(!contents.includes('top-secret'));
    assert.ok(!contents.includes('Bearer private'));
    assert.ok(!contents.includes('session=private'));
    assert.ok(contents.includes('[REDACTED]'));
    assert.ok(contents.includes('visible'));
  });

  await it('disables streams independently and resumes enabled writes at the configured level', async () => {
    const root = mkdtempSync(`${tmpdir()}web07-logger-streams-`);
    const logger = new StructuredLogger(root, 'info', { application: false });
    await logger.initialize();

    await logger.application('error', 'disabled_application');
    await logger.model('info', 'enabled_model');

    // Disabled stream file is not created by initialize() and writes are suppressed
    assert.ok(!existsSync(resolve(root, 'application.log')));
    assert.deepEqual(readEntries(resolve(root, 'model-inference.log'))[0].event, 'enabled_model');

    logger.setStreamEnabled('application', true);
    logger.setStreamEnabled('model-inference', false);
    await logger.application('debug', 'filtered_application');
    await logger.application('info', 'enabled_application');
    await logger.model('error', 'disabled_model');

    logger.setStreamEnabled('model-inference', true);
    await logger.model('info', 'resumed_model');

    assert.deepEqual(
      readEntries(resolve(root, 'application.log')).map((entry) => entry.event),
      ['enabled_application'],
    );
    assert.deepEqual(
      readEntries(resolve(root, 'model-inference.log')).map((entry) => entry.event),
      ['enabled_model', 'resumed_model'],
    );
  });

  await it('clears only managed files inside the configured root', async () => {
    const parent = mkdtempSync(`${tmpdir()}web07-logger-clear-`);
    const root = resolve(parent, 'logs');
    const outside = resolve(parent, 'unrelated.txt');
    const logger = new StructuredLogger(root, 'info');
    await logger.initialize();
    await logger.application('info', 'old_application');
    await logger.model('info', 'old_model');
    writeFileSync(resolve(root, 'unmanaged.log'), 'keep', 'utf8');
    writeFileSync(outside, 'keep outside', 'utf8');

    logger.setStreamEnabled('application', false);
    logger.setStreamEnabled('model-inference', false);
    await logger.initialize(true);

    assert.equal(readFileSync(resolve(root, 'application.log'), 'utf8'), '');
    assert.equal(readFileSync(resolve(root, 'model-inference.log'), 'utf8'), '');
    assert.equal(readFileSync(resolve(root, 'unmanaged.log'), 'utf8'), 'keep');
    assert.equal(readFileSync(outside, 'utf8'), 'keep outside');
  });

  await it('initialize creates files only for enabled streams', async () => {
    const root = mkdtempSync(`${tmpdir()}web07-logger-init-enabled-`);
    const logger = new StructuredLogger(root, 'info', {
      application: true,
      'model-inference': false,
    });
    await logger.initialize();

    assert.ok(existsSync(resolve(root, 'application.log')));
    assert.ok(!existsSync(resolve(root, 'model-inference.log')));
  });

  await it('initialize with all streams disabled creates no files', async () => {
    const root = mkdtempSync(`${tmpdir()}web07-logger-init-none-`);
    const logger = new StructuredLogger(root, 'info', {
      application: false,
      'model-inference': false,
    });
    await logger.initialize();

    assert.ok(!existsSync(resolve(root, 'application.log')));
    assert.ok(!existsSync(resolve(root, 'model-inference.log')));
  });

  await it('clear-on-start clears all managed files regardless of stream enablement', async () => {
    const root = mkdtempSync(`${tmpdir()}web07-logger-clear-all-`);
    writeFileSync(resolve(root, 'application.log'), 'old data\n', 'utf8');
    writeFileSync(resolve(root, 'model-inference.log'), 'old model data\n', 'utf8');

    const logger = new StructuredLogger(root, 'info', {
      application: false,
      'model-inference': true,
    });
    await logger.initialize(true);

    assert.equal(readFileSync(resolve(root, 'application.log'), 'utf8'), '');
    assert.equal(readFileSync(resolve(root, 'model-inference.log'), 'utf8'), '');
  });

  await it('enabled application log produces output at configured level', async () => {
    const root = mkdtempSync(`${tmpdir()}web07-logger-app-enabled-`);
    const logger = new StructuredLogger(root, 'debug', { application: true });
    await logger.initialize();

    await logger.application('info', 'test_event');
    const entries = readEntries(resolve(root, 'application.log'));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'test_event');
  });

  await it('disabled application log suppresses all output', async () => {
    const root = mkdtempSync(`${tmpdir()}web07-logger-app-disabled-`);
    const logger = new StructuredLogger(root, 'trace', { application: false });
    await logger.initialize();

    await logger.application('error', 'should_not_appear');
    assert.ok(!existsSync(resolve(root, 'application.log')));
  });

  await it('enabled model-inference log produces output at configured level', async () => {
    const root = mkdtempSync(`${tmpdir()}web07-logger-model-enabled-`);
    const logger = new StructuredLogger(root, 'debug', { 'model-inference': true });
    await logger.initialize();

    await logger.model('info', 'inference_event');
    const entries = readEntries(resolve(root, 'model-inference.log'));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'inference_event');
  });

  await it('disabled model-inference log suppresses all output', async () => {
    const root = mkdtempSync(`${tmpdir()}web07-logger-model-disabled-`);
    const logger = new StructuredLogger(root, 'trace', { 'model-inference': false });
    await logger.initialize();

    await logger.model('error', 'should_not_appear');
    assert.ok(!existsSync(resolve(root, 'model-inference.log')));
  });

  await it('configured log level filters entries correctly', async () => {
    const root = mkdtempSync(`${tmpdir()}web07-logger-level-`);
    const logger = new StructuredLogger(root, 'warn');
    await logger.initialize();

    await logger.application('debug', 'below_threshold');
    await logger.application('info', 'also_below');
    await logger.application('warn', 'at_threshold');
    await logger.application('error', 'above_threshold');

    const entries = readEntries(resolve(root, 'application.log'));
    assert.deepEqual(
      entries.map((e) => e.event),
      ['at_threshold', 'above_threshold'],
    );
  });

  await it('missing log directory is created on write', async () => {
    const parent = mkdtempSync(`${tmpdir()}web07-logger-mkdir-`);
    const root = resolve(parent, 'nested', 'logs');
    const logger = new StructuredLogger(root, 'info');

    // Do not call initialize() - write should create the directory
    await logger.application('info', 'auto_mkdir');

    assert.ok(existsSync(resolve(root, 'application.log')));
    assert.deepEqual(
      readEntries(resolve(root, 'application.log')).map((e) => e.event),
      ['auto_mkdir'],
    );
  });
});
