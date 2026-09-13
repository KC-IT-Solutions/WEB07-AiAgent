import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  FileSkillContentStore,
  MAX_SKILL_MARKDOWN_BYTES,
  SkillContentStoreError,
} from '../../src/server/stores/skill-content-store.js';

await describe('FileSkillContentStore', () => {
  let rootPath: string;
  let store: FileSkillContentStore;

  beforeEach(async () => {
    rootPath = await mkdtemp(resolve(tmpdir(), 'web07-skills-'));
    store = new FileSkillContentStore(rootPath);
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it('writes, reads, normalizes, overwrites, and deletes UTF-8 Markdown', async () => {
    await store.write(12, '# Instruktioner\r\n\r\nSök efter räksmörgåsar.');
    assert.equal(await store.read(12), '# Instruktioner\n\nSök efter räksmörgåsar.');
    assert.equal(
      await readFile(resolve(rootPath, 'skill-12.md'), 'utf8'),
      '# Instruktioner\n\nSök efter räksmörgåsar.',
    );
    await store.write(12, 'こんにちは');
    assert.equal(await store.read(12), 'こんにちは');
    await store.delete(12);
    await store.delete(12);
    await assert.rejects(
      store.read(12),
      (error: unknown) => error instanceof SkillContentStoreError && error.code === 'NOT_FOUND',
    );
  });

  it('derives paths only from positive numeric IDs and keeps them under the root', async () => {
    for (const id of [0, -1, Number.NaN, 1.5]) {
      await assert.rejects(
        store.write(id, 'text'),
        (error: unknown) => error instanceof SkillContentStoreError && error.code === 'INVALID_ID',
      );
    }
    await store.write(7, 'trusted');
    assert.equal(await readFile(resolve(rootPath, 'skill-7.md'), 'utf8'), 'trusted');
  });

  it('rejects content beyond the bounded UTF-8 size', async () => {
    await assert.rejects(
      store.write(1, 'a'.repeat(MAX_SKILL_MARKDOWN_BYTES + 1)),
      (error: unknown) =>
        error instanceof SkillContentStoreError && error.code === 'INVALID_CONTENT',
    );
  });
});
