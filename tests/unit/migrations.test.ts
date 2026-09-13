import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
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

  it('creates connection-owned credential storage with cascade deletion', () => {
    const db = createTestDatabase();
    assert.ok(tableNames(db).includes('model_connection_credentials'));
    const connectionId = Number(
      db
        .prepare(
          'INSERT INTO model_connections (user_id, created_at, updated_at, data) VALUES (1, 1, 1, ?)',
        )
        .run('{"name":"Credential owner","baseUrl":"http://model.test"}').lastInsertRowid,
    );
    db.prepare(
      `INSERT INTO model_connection_credentials
         (connection_id, created_at, updated_at, ciphertext, iv, auth_tag)
       VALUES (?, 1, 1, 'ciphertext', 'iv', 'auth-tag')`,
    ).run(connectionId);
    assert.throws(() =>
      db
        .prepare(
          `INSERT INTO model_connection_credentials
             (connection_id, created_at, updated_at, ciphertext, iv, auth_tag)
           VALUES (9999, 1, 1, 'ciphertext', 'iv', 'auth-tag')`,
        )
        .run(),
    );
    db.prepare('DELETE FROM model_connections WHERE id = ?').run(connectionId);
    assert.equal(
      (
        db
          .prepare('SELECT COUNT(*) AS count FROM model_connection_credentials')
          .get() as { count: number }
      ).count,
      0,
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

  it('creates user-owned projects with valid JSON and a user listing index', () => {
    const db = createTestDatabase();
    assert.ok(tableNames(db).includes('projects'));
    const insert = db.prepare(
      'INSERT INTO projects (user_id, created_at, updated_at, data) VALUES (?, 1, 1, ?)',
    );
    insert.run(1, '{"name":"Project","description":"Typed data"}');
    assert.throws(() => insert.run(1, 'not-json'));
    const indexes = db.prepare("PRAGMA index_list('projects')").all() as Array<{ name: string }>;
    assert.ok(indexes.some((index) => index.name === 'idx_projects_user_id'));
    const migration = db
      .prepare("SELECT name FROM schema_migrations WHERE name = '0009_create_projects'")
      .get() as { name: string } | undefined;
    assert.ok(migration);
    db.close();
  });

  it('creates Project-owned Agent tables with valid JSON, uniqueness, and cascades', () => {
    const db = createTestDatabase();
    assert.ok(tableNames(db).includes('agents'));
    assert.ok(tableNames(db).includes('agent_skills'));
    assert.ok(tableNames(db).includes('agent_tools'));
    const projectId = Number(
      db
        .prepare('INSERT INTO projects (user_id, created_at, updated_at, data) VALUES (1, 1, 1, ?)')
        .run('{"name":"Agents","description":""}').lastInsertRowid,
    );
    const agentInsert = db.prepare(
      'INSERT INTO agents (project_id, created_at, updated_at, data) VALUES (?, 1, 1, ?)',
    );
    const data = '{"name":"Agent","description":"","instructions":"","modelConnectionId":1,"modelId":"model-a","allowModelSelection":false}';
    const agentId = Number(agentInsert.run(projectId, data).lastInsertRowid);
    assert.throws(() => agentInsert.run(9999, data));
    assert.throws(() => agentInsert.run(projectId, 'not-json'));
    const skillId = Number(
      db
        .prepare('INSERT INTO skills (command_name, created_at, updated_at, data) VALUES (?, 1, 1, ?)')
        .run('agent-skill', '{"name":"Agent Skill"}').lastInsertRowid,
    );
    const skillLink = db.prepare(
      'INSERT INTO agent_skills (agent_id, skill_id, created_at, updated_at, data) VALUES (?, ?, 1, 1, ?)',
    );
    const toolLink = db.prepare(
      'INSERT INTO agent_tools (agent_id, tool_name, created_at, updated_at, data) VALUES (?, ?, 1, 1, ?)',
    );
    skillLink.run(agentId, skillId, '{}');
    toolLink.run(agentId, 'visit_website', '{}');
    assert.throws(() => skillLink.run(agentId, skillId, '{}'));
    assert.throws(() => toolLink.run(agentId, 'visit_website', '{}'));
    db.prepare('DELETE FROM skills WHERE id = ?').run(skillId);
    assert.equal((db.prepare('SELECT COUNT(*) count FROM agent_skills').get() as { count: number }).count, 0);
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    assert.equal((db.prepare('SELECT COUNT(*) count FROM agents').get() as { count: number }).count, 0);
    assert.equal((db.prepare('SELECT COUNT(*) count FROM agent_tools').get() as { count: number }).count, 0);
    assert.ok(
      db.prepare("SELECT name FROM schema_migrations WHERE name = '0010_create_project_agents'").get(),
    );
    const agentColumns = db.prepare("PRAGMA table_info('agents')").all() as Array<{ name: string }>;
    assert.ok(agentColumns.some((column) => column.name === 'next_agent_id'));
    const agentForeignKeys = db.prepare("PRAGMA foreign_key_list('agents')").all() as Array<{
      from: string;
      table: string;
      on_delete: string;
    }>;
    assert.ok(
      agentForeignKeys.some(
        (foreignKey) =>
          foreignKey.from === 'next_agent_id' &&
          foreignKey.table === 'agents' &&
          foreignKey.on_delete === 'SET NULL',
      ),
    );
    assert.ok(
      db.prepare("SELECT name FROM schema_migrations WHERE name = '0011_add_agent_chaining'").get(),
    );
    db.close();
  });

  it('backfills deterministic per-Project Agent order when applying migration 0013', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data))
      );
      CREATE TABLE agents (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL,
        next_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE TABLE agent_runs (
        id INTEGER PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        project_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
    const appliedMigrations = [
      '0001_create_model_connections',
      '0002_create_chats',
      '0003_create_tool_settings',
      '0004_create_chat_settings',
      '0005_create_system_settings',
      '0006_create_skills',
      '0007_create_chat_skills',
      '0008_create_model_connection_credentials',
      '0009_create_projects',
      '0010_create_project_agents',
      '0011_add_agent_chaining',
      '0012_create_agent_runs',
    ];
    const recordMigration = db.prepare(
      'INSERT INTO schema_migrations (name, applied_at) VALUES (?, 1)',
    );
    for (const migration of appliedMigrations) recordMigration.run(migration);
    db.prepare(
      `INSERT INTO projects (id, user_id, created_at, updated_at, data)
       VALUES (?, 1, 1, 1, '{"name":"Project","description":""}')`,
    ).run(1);
    db.prepare(
      `INSERT INTO projects (id, user_id, created_at, updated_at, data)
       VALUES (?, 1, 1, 1, '{"name":"Other","description":""}')`,
    ).run(2);
    const insertAgent = db.prepare(
      `INSERT INTO agents (id, project_id, created_at, updated_at, data)
       VALUES (?, ?, ?, ?, '{"name":"Agent"}')`,
    );
    insertAgent.run(10, 1, 200, 200);
    insertAgent.run(11, 1, 200, 200);
    insertAgent.run(12, 1, 100, 100);
    insertAgent.run(20, 2, 50, 50);

    runMigrations(db);

    const rows = db
      .prepare('SELECT id, project_id, sort_order FROM agents ORDER BY project_id, sort_order')
      .all() as Array<{ id: number; project_id: number; sort_order: number }>;
    assert.deepEqual(rows, [
      { id: 11, project_id: 1, sort_order: 0 },
      { id: 10, project_id: 1, sort_order: 1 },
      { id: 12, project_id: 1, sort_order: 2 },
      { id: 20, project_id: 2, sort_order: 0 },
    ]);
    const columns = db.prepare("PRAGMA table_info('agents')").all() as Array<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    const sortOrder = columns.find((column) => column.name === 'sort_order');
    assert.equal(sortOrder?.notnull, 1);
    assert.equal(sortOrder?.dflt_value, '0');
    assert.ok(
      (db.prepare("PRAGMA index_list('agents')").all() as Array<{ name: string }>).some(
        (index) => index.name === 'idx_agents_project_sort_order',
      ),
    );
    assert.ok(
      db.prepare("SELECT 1 FROM schema_migrations WHERE name = '0013_add_agent_sort_order'").get(),
    );
    db.close();
  });

  it('adds relational Agent run chain metadata in migration 0014', () => {
    const db = createTestDatabase();
    const columns = db.prepare("PRAGMA table_info('agent_runs')").all() as Array<{ name: string }>;
    for (const name of ['triggered_by_run_id', 'previous_agent_id', 'chain_root_run_id']) {
      assert.ok(columns.some((column) => column.name === name));
    }
    const foreignKeys = db.prepare("PRAGMA foreign_key_list('agent_runs')").all() as Array<{
      from: string;
      table: string;
      on_delete: string;
    }>;
    assert.ok(foreignKeys.some((key) => key.from === 'triggered_by_run_id' && key.table === 'agent_runs' && key.on_delete === 'SET NULL'));
    assert.ok(foreignKeys.some((key) => key.from === 'previous_agent_id' && key.table === 'agents' && key.on_delete === 'SET NULL'));
    assert.ok(foreignKeys.some((key) => key.from === 'chain_root_run_id' && key.table === 'agent_runs' && key.on_delete === 'SET NULL'));
    assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE name = '0014_add_agent_run_chain_metadata'").get());
    db.close();
  });

  it('creates uniquely user-owned tool settings', () => {
    const db = createTestDatabase();
    assert.ok(tableNames(db).includes('tool_settings'));
    const insert = db.prepare(
      'INSERT INTO tool_settings (user_id, tool_name, created_at, updated_at, data) VALUES (?, ?, 1, 1, ?)',
    );
    insert.run(1, 'duckduckgo_search', '{}');
    assert.throws(() => insert.run(1, 'duckduckgo_search', '{}'));
    assert.doesNotThrow(() => insert.run(2, 'duckduckgo_search', '{}'));
    db.close();
  });

  it('creates one Chat settings record per user', () => {
    const db = createTestDatabase();
    assert.ok(tableNames(db).includes('chat_settings'));
    const insert = db.prepare(
      'INSERT INTO chat_settings (user_id, created_at, updated_at, data) VALUES (?, 1, 1, ?)',
    );
    insert.run(1, '{"defaultModelConnectionId":null,"defaultModelId":null}');
    assert.throws(() => insert.run(1, '{"defaultModelConnectionId":null,"defaultModelId":null}'));
    assert.doesNotThrow(() =>
      insert.run(2, '{"defaultModelConnectionId":null,"defaultModelId":null}'),
    );
    db.close();
  });

  it('creates one global system settings row with valid JSON', () => {
    const db = createTestDatabase();
    assert.ok(tableNames(db).includes('system_settings'));
    const insert = db.prepare(
      'INSERT INTO system_settings (id, created_at, updated_at, data) VALUES (?, 1, 1, ?)',
    );
    insert.run(1, '{"level":"info","clearLogsOnStartup":false}');
    assert.throws(() => insert.run(2, '{}'));
    assert.throws(() => insert.run(1, 'not-json'));
    db.close();
  });

  it('creates relational Skills tables with uniqueness, foreign keys, cascade, and valid JSON', () => {
    const db = createTestDatabase();
    assert.ok(tableNames(db).includes('skills'));
    assert.ok(tableNames(db).includes('skill_tools'));
    const skillInsert = db.prepare(
      'INSERT INTO skills (command_name, created_at, updated_at, data) VALUES (?, 1, 1, ?)',
    );
    const skillId = Number(skillInsert.run('research', '{"name":"Research"}').lastInsertRowid);
    assert.throws(() => skillInsert.run('research', '{"name":"Duplicate"}'));
    assert.throws(() => skillInsert.run('invalid-json', 'not-json'));
    const toolInsert = db.prepare(
      'INSERT INTO skill_tools (skill_id, tool_name, created_at, updated_at, data) VALUES (?, ?, 1, 1, ?)',
    );
    toolInsert.run(skillId, 'duckduckgo_search', '{}');
    assert.throws(() => toolInsert.run(skillId, 'duckduckgo_search', '{}'));
    assert.throws(() => toolInsert.run(9999, 'visit_website', '{}'));
    db.prepare('DELETE FROM skills WHERE id = ?').run(skillId);
    const children = db
      .prepare('SELECT COUNT(*) count FROM skill_tools WHERE skill_id = ?')
      .get(skillId) as { count: number };
    assert.equal(children.count, 0);
    db.close();
  });

  it('creates relational Chat Skill links with foreign keys, uniqueness, cascades, and valid JSON', () => {
    const db = createTestDatabase();
    assert.ok(tableNames(db).includes('chat_skills'));
    const chatId = Number(
      db
        .prepare('INSERT INTO chats (user_id, created_at, updated_at, data) VALUES (1, 1, 1, ?)')
        .run('{"title":"Chat","modelConnectionId":null,"modelId":null}').lastInsertRowid,
    );
    const skillId = Number(
      db
        .prepare(
          'INSERT INTO skills (command_name, created_at, updated_at, data) VALUES (?, 1, 1, ?)',
        )
        .run('linked', '{"name":"Linked"}').lastInsertRowid,
    );
    const insert = db.prepare(
      'INSERT INTO chat_skills (chat_id, skill_id, created_at, updated_at, data) VALUES (?, ?, 1, 1, ?)',
    );
    insert.run(chatId, skillId, '{}');
    assert.throws(() => insert.run(chatId, skillId, '{}'));
    assert.throws(() => insert.run(9999, skillId, '{}'));
    assert.throws(() => insert.run(chatId, 9999, '{}'));
    assert.throws(() =>
      db
        .prepare(
          'INSERT INTO chat_skills (chat_id, skill_id, created_at, updated_at, data) VALUES (?, ?, 1, 1, ?)',
        )
        .run(chatId, skillId, 'not-json'),
    );

    db.prepare('DELETE FROM skills WHERE id = ?').run(skillId);
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM chat_skills').get() as { count: number }).count,
      0,
    );
    const secondSkillId = Number(
      db
        .prepare(
          'INSERT INTO skills (command_name, created_at, updated_at, data) VALUES (?, 1, 1, ?)',
        )
        .run('second-linked', '{"name":"Second"}').lastInsertRowid,
    );
    insert.run(chatId, secondSkillId, '{}');
    db.prepare('DELETE FROM chats WHERE id = ?').run(chatId);
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM chat_skills').get() as { count: number }).count,
      0,
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
