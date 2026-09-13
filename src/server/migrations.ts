import type { Database } from 'better-sqlite3';

interface Migration {
  id: string;
  sql: string;
}

// Migrations are applied in this fixed order. Do not reorder or edit
// applied migrations; add new ones at the end.
const MIGRATIONS: readonly Migration[] = [
  {
    id: '0001_create_model_connections',
    // IF NOT EXISTS keeps the migration safe for databases where the table
    // was already created before the migration mechanism existed.
    sql: `
      CREATE TABLE IF NOT EXISTS model_connections (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data))
      )
    `,
  },
  {
    id: '0002_create_chats',
    sql: `
      CREATE TABLE chats (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data))
      )
    `,
  },
  {
    id: '0003_create_tool_settings',
    sql: `
      CREATE TABLE tool_settings (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        UNIQUE (user_id, tool_name)
      )
    `,
  },
  {
    id: '0004_create_chat_settings',
    sql: `
      CREATE TABLE chat_settings (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data))
      )
    `,
  },
  {
    id: '0005_create_system_settings',
    sql: `
      CREATE TABLE system_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data))
      )
    `,
  },
  {
    id: '0006_create_skills',
    sql: `
      CREATE TABLE skills (
        id INTEGER PRIMARY KEY,
        command_name TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data))
      );

      CREATE TABLE skill_tools (
        id INTEGER PRIMARY KEY,
        skill_id INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        UNIQUE (skill_id, tool_name)
      )
    `,
  },
  {
    id: '0007_create_chat_skills',
    sql: `
      CREATE TABLE chat_skills (
        id INTEGER PRIMARY KEY,
        chat_id INTEGER NOT NULL,
        skill_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        UNIQUE (chat_id, skill_id)
      )
    `,
  },
  {
    id: '0008_create_model_connection_credentials',
    sql: `
      CREATE TABLE model_connection_credentials (
        connection_id INTEGER PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        FOREIGN KEY (connection_id) REFERENCES model_connections(id) ON DELETE CASCADE
      )
    `,
  },
  {
    id: '0009_create_projects',
    sql: `
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data))
      );

      CREATE INDEX idx_projects_user_id ON projects(user_id)
    `,
  },
  {
    id: '0010_create_project_agents',
    sql: `
      CREATE TABLE agents (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL,
        next_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_agents_project_id ON agents(project_id);

      CREATE TABLE agent_skills (
        id INTEGER PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        skill_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        UNIQUE (agent_id, skill_id)
      );

      CREATE TABLE agent_tools (
        id INTEGER PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
        UNIQUE (agent_id, tool_name)
      )
    `,
  },
  {
    id: '0011_add_agent_chaining',
    sql: `
      CREATE INDEX idx_agents_next_agent_id ON agents(next_agent_id);
    `,
  },
  {
    id: '0014_add_agent_filesystem_permissions',
    sql: `
      ALTER TABLE agents
      ADD COLUMN project_filesystem_permissions TEXT NOT NULL DEFAULT '{"list":true,"read":true,"write":false,"create_directory":false,"rename":false,"delete":false}';
    `,
  },
  {
    id: '0012_create_agent_runs',
    sql: `
      CREATE UNIQUE INDEX idx_agents_id_project_id ON agents(id, project_id);

      CREATE TABLE agent_runs (
        id INTEGER PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        project_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'done', 'error', 'cancelled')),
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        FOREIGN KEY (agent_id, project_id) REFERENCES agents(id, project_id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_agent_runs_latest ON agent_runs(agent_id, id DESC);
      CREATE UNIQUE INDEX idx_agent_runs_one_active
      ON agent_runs(agent_id)
      WHERE status IN ('running', 'paused');

      CREATE TABLE agent_run_events (
        id INTEGER PRIMARY KEY,
        run_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_agent_run_events_run ON agent_run_events(run_id, id)
    `,
  },
  {
    id: '0013_add_agent_sort_order',
    sql: `
      ALTER TABLE agents
      ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

      UPDATE agents AS current
      SET sort_order = (
        SELECT COUNT(*)
        FROM agents AS preceding
        WHERE preceding.project_id = current.project_id
          AND (
            preceding.created_at > current.created_at
            OR (preceding.created_at = current.created_at AND preceding.id > current.id)
          )
      );

      CREATE INDEX idx_agents_project_sort_order ON agents(project_id, sort_order);
    `,
  },
  {
    id: '0014_add_agent_run_chain_metadata',
    sql: `
      ALTER TABLE agent_runs
      ADD COLUMN triggered_by_run_id INTEGER REFERENCES agent_runs(id) ON DELETE SET NULL;

      ALTER TABLE agent_runs
      ADD COLUMN previous_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL;

      ALTER TABLE agent_runs
      ADD COLUMN chain_root_run_id INTEGER REFERENCES agent_runs(id) ON DELETE SET NULL
    `,
  },
];

export function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(
    (
      db.prepare('SELECT name FROM schema_migrations').all() as Array<{
        name: string;
      }>
    ).map((row) => row.name),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) {
      continue;
    }

    const apply = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
        migration.id,
        Math.floor(Date.now() / 1000),
      );
    });

    apply();
  }
}
