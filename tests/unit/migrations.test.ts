import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '../../src/server/database.js';
import { runMigrations } from '../../src/server/migrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findProjectRoot(startDir: string): string | null {
  let current = startDir;
  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'package.json'))) {
      return current;
    }
    current = dirname(current);
  }
  return null;
}

function tableNames(db: ReturnType<typeof createTestDatabase>): string[] {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
    name: string;
  }>;
  return rows.map((row) => row.name);
}

await describe('database migrations', () => {
  it('creates the model_connections table during test database initialization', () => {
    const db = createTestDatabase();

    assert.ok(
      tableNames(db).includes('model_connections'),
      'model_connections table should exist after database initialization',
    );

    db.close();
  });

  it('creates the chats table during test database initialization', () => {
    const db = createTestDatabase();

    assert.ok(
      tableNames(db).includes('chats'),
      'chats table should exist after database initialization',
    );

    db.close();
  });

  it('records the applied migration in schema_migrations', () => {
    const db = createTestDatabase();

    const row = db
      .prepare("SELECT name FROM schema_migrations WHERE name = '0001_create_model_connections'")
      .get() as { name: string } | undefined;

    assert.ok(row, 'migration 0001_create_model_connections should be recorded');

    db.close();
  });

  it('records the chats migration in schema_migrations', () => {
    const db = createTestDatabase();

    const row = db
      .prepare("SELECT name FROM schema_migrations WHERE name = '0002_create_chats'")
      .get() as { name: string } | undefined;

    assert.ok(row, 'migration 0002_create_chats should be recorded');

    db.close();
  });

  it('is deterministic and safe to run again on an existing database', () => {
    const db = createTestDatabase();

    assert.doesNotThrow(() => runMigrations(db));

    const count = db
      .prepare(
        "SELECT COUNT(*) AS count FROM schema_migrations WHERE name = '0001_create_model_connections'",
      )
      .get() as { count: number };

    assert.strictEqual(count.count, 1);

    assert.ok(
      tableNames(db).includes('model_connections'),
      'model_connections table should still exist',
    );
    assert.ok(tableNames(db).includes('chats'), 'chats table should still exist');

    db.close();
  });
});

await describe('server.ts architecture', () => {
  const projectRoot = findProjectRoot(__dirname);
  assert.ok(projectRoot, 'Project root should be found');
  const serverSource = readFileSync(resolve(projectRoot, 'src', 'server.ts'), 'utf8');

  it('contains no model_connections schema SQL', () => {
    assert.ok(
      !serverSource.includes('CREATE TABLE'),
      'server.ts must not contain CREATE TABLE statements',
    );
    assert.ok(
      !serverSource.includes('model_connections'),
      'server.ts must not reference the model_connections table directly',
    );
  });

  it('uses the model connection service boundary', () => {
    assert.ok(
      serverSource.includes('model-connection-service'),
      'server.ts should wire the model connection service',
    );
    assert.ok(
      !/modelConnectionRepo\.(create|listByUserId|getById)/.test(serverSource),
      'HTTP routes must not call the repository directly',
    );
  });
});
