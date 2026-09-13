import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createTestDatabase } from '../../src/server/database.js';
import { SkillRepository } from '../../src/server/repositories/skill-repository.js';
import { SkillToolRepository } from '../../src/server/repositories/skill-tool-repository.js';
import { SkillError, SkillService } from '../../src/server/services/skill-service.js';
import {
  FileSkillContentStore,
  SkillContentStoreError,
  type SkillContentStore,
} from '../../src/server/stores/skill-content-store.js';
import { DuckDuckGoSearchTool } from '../../src/server/tools/duckduckgo-search-tool.js';
import { ToolRegistry } from '../../src/server/tools/tool-registry.js';
import { VisitWebsiteTool } from '../../src/server/tools/visit-website-tool.js';

const temporaryRoots: string[] = [];

async function setup(contentStore?: SkillContentStore) {
  const db = createTestDatabase();
  const root = await mkdtemp(resolve(tmpdir(), 'web07-skill-service-'));
  temporaryRoots.push(root);
  const store = contentStore ?? new FileSkillContentStore(root);
  const service = new SkillService(
    new SkillRepository(db),
    new SkillToolRepository(db),
    store,
    new ToolRegistry([new DuckDuckGoSearchTool(), new VisitWebsiteTool()]),
  );
  return { db, root, store, service };
}

const validInput = {
  name: 'Ekonomianalys',
  commandName: 'ekonomi',
  markdown: '# Instruktioner',
  requiredTools: ['duckduckgo_search'],
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

await describe('SkillService consistency', async () => {
  await it('creates a complete Skill across the database, relationship, and filesystem', async () => {
    const { db, store, service } = await setup();
    const created = await service.create(validInput);
    assert.equal(created.name, validInput.name);
    assert.equal(created.markdown, validInput.markdown);
    assert.deepEqual(created.requiredTools, validInput.requiredTools);
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM skills').get() as { count: number }).count,
      1,
    );
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM skill_tools').get() as { count: number }).count,
      1,
    );
    assert.equal(await store.read(created.id), validInput.markdown);
    db.close();
  });

  await it('compensates database creation when the Markdown write fails', async () => {
    const failingStore: SkillContentStore = {
      read: async () => {
        throw new SkillContentStoreError('NOT_FOUND');
      },
      write: async () => {
        throw new SkillContentStoreError('WRITE_FAILED');
      },
      delete: async () => undefined,
    };
    const { db, service } = await setup(failingStore);
    await assert.rejects(
      service.create(validInput),
      (error: unknown) => error instanceof SkillError && error.code === 'PERSISTENCE_FAILED',
    );
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM skills').get() as { count: number }).count,
      0,
    );
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM skill_tools').get() as { count: number }).count,
      0,
    );
    db.close();
  });

  await it('preserves an oversized persisted Skill distinction when reading', async () => {
    const oversizedStore: SkillContentStore = {
      read: async () => { throw new SkillContentStoreError('INVALID_CONTENT'); },
      write: async () => undefined,
      delete: async () => undefined,
    };
    const { db, service } = await setup(oversizedStore);
    const created = await service.create(validInput);
    await assert.rejects(
      service.get(created.id),
      (error: unknown) => error instanceof SkillError && error.code === 'CONTENT_TOO_LARGE',
    );
    db.close();
  });

  await it('updates all Skill fields and deletes all owned state', async () => {
    const { db, store, service } = await setup();
    const created = await service.create(validInput);
    const updated = await service.update(created.id, {
      name: 'Webbanalys',
      commandName: 'web-analysis',
      markdown: '# Updated',
      requiredTools: ['visit_website'],
    });
    assert.ok(updated);
    assert.equal(updated.commandName, 'web-analysis');
    assert.equal(updated.name, 'Webbanalys');
    assert.equal(updated.markdown, '# Updated');
    assert.deepEqual(updated.requiredTools, ['visit_website']);
    assert.ok(updated.updatedAt > created.updatedAt);
    assert.equal(await service.delete(created.id), true);
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM skills').get() as { count: number }).count,
      0,
    );
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM skill_tools').get() as { count: number }).count,
      0,
    );
    await assert.rejects(store.read(created.id), SkillContentStoreError);
    db.close();
  });

  await it('restores prior Markdown and metadata when an update conflicts in the database', async () => {
    const { db, service } = await setup();
    const first = await service.create(validInput);
    await service.create({
      ...validInput,
      name: 'Other',
      commandName: 'other',
      markdown: '# Other',
      requiredTools: ['visit_website'],
    });
    await assert.rejects(
      service.update(first.id, {
        ...validInput,
        commandName: 'other',
        markdown: '# Must be rolled back',
        requiredTools: ['visit_website'],
      }),
      (error: unknown) => error instanceof SkillError && error.code === 'DUPLICATE_COMMAND',
    );
    assert.deepEqual(await service.get(first.id), first);
    db.close();
  });

  await it('rejects unknown tools before creating database or filesystem state', async () => {
    const { db, root, service } = await setup();
    await assert.rejects(
      service.create({ ...validInput, requiredTools: ['unknown_tool'] }),
      (error: unknown) => error instanceof SkillError && error.code === 'UNKNOWN_TOOL',
    );
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM skills').get() as { count: number }).count,
      0,
    );
    const store = new FileSkillContentStore(root);
    await assert.rejects(store.read(1), SkillContentStoreError);
    db.close();
  });
});
