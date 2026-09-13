import type { Database } from 'better-sqlite3';
import type {
  ModelConnection,
  ModelConnectionData,
  CreateModelConnectionInput,
  ModelDescriptions,
} from '../model-connection-types.js';
import { MAX_MODEL_DESCRIPTION_LENGTH } from '../model-connection-types.js';
import type { EncryptedModelCredential } from '../services/model-credential-cipher.js';

const DEFAULT_TIMEOUT_MINUTES = 30;
const DEFAULT_ENABLED = true;

function parseModelConnectionData(raw: string): ModelConnectionData {
  const parsed = JSON.parse(raw) as unknown;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid model connection data');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
    throw new Error('Invalid model connection data: name is required');
  }

  if (typeof obj.baseUrl !== 'string' || obj.baseUrl.trim().length === 0) {
    throw new Error('Invalid model connection data: baseUrl is required');
  }

  const timeoutMinutes =
    typeof obj.timeoutMinutes === 'number' && obj.timeoutMinutes > 0
      ? obj.timeoutMinutes
      : DEFAULT_TIMEOUT_MINUTES;

  const modelId =
    obj.modelId !== undefined && obj.modelId !== null
      ? typeof obj.modelId === 'string'
        ? obj.modelId
        : null
      : null;

  const enabled =
    typeof obj.enabled === 'boolean' ? obj.enabled : DEFAULT_ENABLED;

  const filterConfigured =
    typeof obj.filterConfigured === 'boolean' ? obj.filterConfigured : false;
  const visibleModelIds = Array.isArray(obj.visibleModelIds)
    ? obj.visibleModelIds.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      )
    : [];
  const modelDescriptionEntries: Array<[string, string]> = [];
  if (
    typeof obj.modelDescriptions === 'object' &&
    obj.modelDescriptions !== null &&
    !Array.isArray(obj.modelDescriptions)
  ) {
    for (const [modelId, description] of Object.entries(obj.modelDescriptions)) {
      if (
        modelId.trim().length > 0 &&
        typeof description === 'string' &&
        description.trim().length > 0 &&
        description.trim().length <= MAX_MODEL_DESCRIPTION_LENGTH
      ) {
        modelDescriptionEntries.push([modelId, description.trim()]);
      }
    }
  }
  const modelDescriptions: ModelDescriptions = Object.fromEntries(modelDescriptionEntries);

  return {
    name: obj.name.trim(),
    baseUrl: obj.baseUrl.trim(),
    timeoutMinutes,
    modelId,
    enabled,
    filterConfigured,
    visibleModelIds: [...new Set(visibleModelIds)],
    modelDescriptions,
  };
}

function rowToModelConnection(row: {
  id: number;
  user_id: number;
  created_at: number;
  updated_at: number;
  data: string;
  has_api_key: number;
}): ModelConnection {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasApiKey: row.has_api_key === 1,
    data: parseModelConnectionData(row.data),
  };
}

export class ModelConnectionRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async create(
    userId: number,
    input: CreateModelConnectionInput,
    credential?: EncryptedModelCredential,
  ): Promise<ModelConnection> {
    const now = Math.floor(Date.now() / 1000);

    const data = {
      name: input.name,
      baseUrl: input.baseUrl,
      timeoutMinutes: input.timeoutMinutes,
      modelId: input.modelId,
      enabled: input.enabled,
      filterConfigured: false,
      visibleModelIds: [],
      modelDescriptions: {},
    };

    const create = this.db.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO model_connections (user_id, created_at, updated_at, data)
           VALUES (?, ?, ?, ?)`,
        )
        .run(userId, now, now, JSON.stringify(data));
      const id = Number(result.lastInsertRowid);

      if (credential) {
        this.insertCredential(id, now, credential);
      }
      return id;
    });
    const id = create();

    return {
      id,
      userId,
      createdAt: now,
      updatedAt: now,
      hasApiKey: credential !== undefined,
      data,
    };
  }

  async update(
    userId: number,
    id: number,
    input: CreateModelConnectionInput,
    credential?: EncryptedModelCredential,
  ): Promise<ModelConnection | null> {
    const now = Math.floor(Date.now() / 1000);

    const update = this.db.transaction(() => {
      const existing = this.db
        .prepare('SELECT data FROM model_connections WHERE id = ? AND user_id = ?')
        .get(id, userId) as { data: string } | undefined;
      if (!existing) {
        return 0;
      }
      const visibility = parseModelConnectionData(existing.data);
      const data = {
        name: input.name,
        baseUrl: input.baseUrl,
        timeoutMinutes: input.timeoutMinutes,
        modelId: input.modelId,
        enabled: input.enabled,
        filterConfigured: visibility.filterConfigured,
        visibleModelIds: visibility.visibleModelIds,
        modelDescriptions: visibility.modelDescriptions,
      };
      const result = this.db
        .prepare(
          `UPDATE model_connections
             SET data = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .run(JSON.stringify(data), now, id, userId);

      if (result.changes > 0 && credential) {
        this.upsertCredential(id, now, credential);
      }
      return result.changes;
    });
    const changes = update();

    if (changes === 0) {
      return null;
    }

    return this.getById(userId, id);
  }

  async updateModelVisibility(
    userId: number,
    id: number,
    filterConfigured: boolean,
    visibleModelIds: readonly string[],
  ): Promise<ModelConnection | null> {
    const now = Math.floor(Date.now() / 1000);
    const update = this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT data FROM model_connections WHERE id = ? AND user_id = ?')
        .get(id, userId) as { data: string } | undefined;
      if (!row) return false;
      const data: ModelConnectionData = {
        ...parseModelConnectionData(row.data),
        filterConfigured,
        visibleModelIds: [...visibleModelIds],
      };
      return (
        this.db
          .prepare(
            `UPDATE model_connections
               SET data = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`,
          )
          .run(JSON.stringify(data), now, id, userId).changes > 0
      );
    });
    return update() ? this.getById(userId, id) : null;
  }

  async updateModelDescriptions(
    userId: number,
    id: number,
    modelDescriptions: Readonly<ModelDescriptions>,
  ): Promise<ModelConnection | null> {
    const now = Math.floor(Date.now() / 1000);
    const update = this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT data FROM model_connections WHERE id = ? AND user_id = ?')
        .get(id, userId) as { data: string } | undefined;
      if (!row) return false;
      const data: ModelConnectionData = {
        ...parseModelConnectionData(row.data),
        modelDescriptions: { ...modelDescriptions },
      };
      return (
        this.db
          .prepare(
            `UPDATE model_connections
               SET data = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`,
          )
          .run(JSON.stringify(data), now, id, userId).changes > 0
      );
    });
    return update() ? this.getById(userId, id) : null;
  }

  async delete(userId: number, id: number): Promise<boolean> {
    const stmt = this.db.prepare(
      `DELETE FROM model_connections
       WHERE id = ? AND user_id = ?`,
    );

    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  async listByUserId(userId: number): Promise<ModelConnection[]> {
    const stmt = this.db.prepare(
      `SELECT mc.id, mc.user_id, mc.created_at, mc.updated_at, mc.data,
              EXISTS (
                SELECT 1 FROM model_connection_credentials mcc
                WHERE mcc.connection_id = mc.id
              ) AS has_api_key
       FROM model_connections mc
       WHERE mc.user_id = ?
       ORDER BY created_at DESC`,
    );

    const rows = stmt.all(userId) as Array<{
      id: number;
      user_id: number;
      created_at: number;
      updated_at: number;
      data: string;
      has_api_key: number;
    }>;

    return rows.map(rowToModelConnection);
  }

  async getById(userId: number, id: number): Promise<ModelConnection | null> {
    const stmt = this.db.prepare(
      `SELECT mc.id, mc.user_id, mc.created_at, mc.updated_at, mc.data,
              EXISTS (
                SELECT 1 FROM model_connection_credentials mcc
                WHERE mcc.connection_id = mc.id
              ) AS has_api_key
       FROM model_connections mc
       WHERE mc.id = ? AND mc.user_id = ?`,
    );

    const row = stmt.get(id, userId) as
      | {
          id: number;
          user_id: number;
          created_at: number;
          updated_at: number;
          data: string;
          has_api_key: number;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return rowToModelConnection(row);
  }

  async getCredential(
    userId: number,
    id: number,
  ): Promise<EncryptedModelCredential | null> {
    const row = this.db
      .prepare(
        `SELECT mcc.ciphertext, mcc.iv, mcc.auth_tag
         FROM model_connection_credentials mcc
         INNER JOIN model_connections mc ON mc.id = mcc.connection_id
         WHERE mcc.connection_id = ? AND mc.user_id = ?`,
      )
      .get(id, userId) as
      | { ciphertext: string; iv: string; auth_tag: string }
      | undefined;

    return row
      ? { ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag }
      : null;
  }

  private insertCredential(
    connectionId: number,
    now: number,
    credential: EncryptedModelCredential,
  ): void {
    this.db
      .prepare(
        `INSERT INTO model_connection_credentials
           (connection_id, created_at, updated_at, ciphertext, iv, auth_tag)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        connectionId,
        now,
        now,
        credential.ciphertext,
        credential.iv,
        credential.authTag,
      );
  }

  private upsertCredential(
    connectionId: number,
    now: number,
    credential: EncryptedModelCredential,
  ): void {
    this.db
      .prepare(
        `INSERT INTO model_connection_credentials
           (connection_id, created_at, updated_at, ciphertext, iv, auth_tag)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(connection_id) DO UPDATE SET
           updated_at = excluded.updated_at,
           ciphertext = excluded.ciphertext,
           iv = excluded.iv,
           auth_tag = excluded.auth_tag`,
      )
      .run(
        connectionId,
        now,
        now,
        credential.ciphertext,
        credential.iv,
        credential.authTag,
      );
  }
}
