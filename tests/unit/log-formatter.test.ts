import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatReadableLog } from '../../src/server/logging/log-formatter.js';

await describe('log formatter', async () => {
  await it('formats a basic JSONL entry with timestamp level and event', () => {
    const input = '{"timestamp":"2026-08-29T14:53:35.625Z","level":"info","event":"server_started"}';
    const output = formatReadableLog(input);
    assert.ok(output.includes('INFO'));
    assert.ok(output.includes('server_started'));
    assert.ok(output.includes('2026-08'));
  });

  await it('displays timestamp in local time with timezone offset', () => {
    const input = '{"timestamp":"2026-08-29T14:53:35.625Z","level":"info","event":"test"}';
    const output = formatReadableLog(input);
    assert.ok(
      /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(output),
      'should contain formatted local time',
    );
  });

  await it('renders level in uppercase', () => {
    const input = '{"timestamp":"2026-01-01T00:00:00Z","level":"warn","event":"disk_low"}';
    const output = formatReadableLog(input);
    assert.ok(output.includes('WARN'));
  });

  await it('renders remaining fields as indented key/value lines', () => {
    const input = '{"timestamp":"2026-01-01T00:00:00Z","level":"info","event":"test","port":3000,"host":"localhost"}';
    const output = formatReadableLog(input);
    assert.ok(output.includes('  port: 3000'));
    assert.ok(output.includes('  host: localhost'));
  });

  await it('renders nested objects safely', () => {
    const input = '{"timestamp":"2026-01-01T00:00:00Z","level":"info","event":"test","config":{"host":"localhost","port":8080}}';
    const output = formatReadableLog(input);
    assert.ok(output.includes('config: {'));
    assert.ok(output.includes('  host: localhost'));
    assert.ok(output.includes('  port: 8080'));
  });

  await it('renders arrays safely', () => {
    const input = '{"timestamp":"2026-01-01T00:00:00Z","level":"info","event":"test","tags":["a","b"]}';
    const output = formatReadableLog(input);
    assert.ok(output.includes('tags: ['));
  });

  await it('handles malformed JSONL lines without crashing', () => {
    const input = '{"timestamp":"2026-01-01T00:00:00Z","level":"info","event":"good"}\nthis is not json\n{"timestamp":"2026-01-01T00:00:01Z","level":"error","event":"after_bad"}';
    const output = formatReadableLog(input);
    assert.ok(output.includes('INFO'));
    assert.ok(output.includes('this is not json'));
    assert.ok(output.includes('ERROR'));
  });

  await it('handles empty input gracefully', () => {
    const output = formatReadableLog('');
    assert.equal(output, '');
  });

  await it('handles whitespace-only input', () => {
    const output = formatReadableLog('   \n\n  ');
    assert.equal(output.trim(), '');
  });

  await it('preserves chronological order of entries', () => {
    const lines = [
      '{"timestamp":"2026-01-01T00:00:00Z","level":"info","event":"first"}',
      '{"timestamp":"2026-01-01T00:00:01Z","level":"info","event":"second"}',
      '{"timestamp":"2026-01-01T00:00:02Z","level":"info","event":"third"}',
    ];
    const output = formatReadableLog(lines.join('\n'));
    const firstPos = output.indexOf('first');
    const secondPos = output.indexOf('second');
    const thirdPos = output.indexOf('third');
    assert.ok(firstPos < secondPos && secondPos < thirdPos);
  });

  await it('handles entries with missing optional fields', () => {
    const input = '{"timestamp":"2026-01-01T00:00:00Z","level":"debug"}';
    const output = formatReadableLog(input);
    assert.ok(output.includes('DEBUG'));
  });

  await it('handles deeply nested values', () => {
    const input = '{"timestamp":"2026-01-01T00:00:00Z","level":"info","event":"deep","data":{"a":{"b":{"c":42}}}}';
    const output = formatReadableLog(input);
    assert.ok(output.includes('42'));
  });

  await it('handles null and boolean field values', () => {
    const input = '{"timestamp":"2026-01-01T00:00:00Z","level":"info","event":"test","flag":true,"missing":null}';
    const output = formatReadableLog(input);
    assert.ok(output.includes('flag: true'));
    assert.ok(output.includes('missing: null'));
  });

  await it('separates entries with blank lines', () => {
    const input = '{"timestamp":"2026-01-01T00:00:00Z","level":"info","event":"a"}\n{"timestamp":"2026-01-01T00:00:01Z","level":"info","event":"b"}';
    const output = formatReadableLog(input);
    assert.ok(output.includes('\n\n'));
  });
});
