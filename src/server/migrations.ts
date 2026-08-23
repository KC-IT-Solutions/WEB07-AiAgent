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
