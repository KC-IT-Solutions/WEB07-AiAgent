import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/server/migrations.js';
import type { StructuredLogger } from '../../src/server/logging/logger.js';
import { ModelConnectionRepository } from '../../src/server/repositories/model-connection-repository.js';
import { ModelConnectionService } from '../../src/server/services/model-connection-service.js';
import { ModelCredentialCipher } from '../../src/server/services/model-credential-cipher.js';

const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const API_KEY = 'saved-provider-secret';
const REPLACEMENT_API_KEY = 'replacement-provider-secret';
const temporaryDirectories: string[] = [];

const BASE_INPUT = {
  name: 'Credential connection',
  baseUrl: 'http://model.test',
  timeoutMinutes: 30,
  modelId: 'model-a',
  enabled: true,
} as const;

interface CapturedLogEntry {
  level: string;
  event: string;
  fields: Record<string, unknown>;
}

function capturingLogger(
  entries: CapturedLogEntry[],
  failure?: Error,
): Pick<StructuredLogger, 'application'> {
  return {
    async application(level, event, fields = {}) {
      entries.push({ level, event, fields });
      if (failure) {
        throw failure;
      }
    },
  };
}

function openDatabase(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

await describe('saved model connection credentials', async () => {
  await it('encrypts, survives a database reopen, preserves blank edits, replaces, and cascades', async () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'web07-model-credential-'));
    temporaryDirectories.push(directory);
    const databasePath = resolve(directory, 'credentials.db');
    let db = openDatabase(databasePath);
    let service = new ModelConnectionService(new ModelConnectionRepository(db), ENCRYPTION_KEY);

    const created = await service.createConnection({ ...BASE_INPUT, apiKey: API_KEY });
    assert.equal(created.hasApiKey, true);
    assert.equal((created as unknown as Record<string, unknown>).apiKey, undefined);
    assert.ok(!JSON.stringify(created).includes(API_KEY));

    const connectionRow = db
      .prepare('SELECT data FROM model_connections WHERE id = ?')
      .get(created.id) as { data: string };
    assert.ok(!connectionRow.data.includes('apiKey'));
    assert.ok(!connectionRow.data.includes(API_KEY));

    const credentialRow = db
      .prepare(
        'SELECT ciphertext, iv, auth_tag FROM model_connection_credentials WHERE connection_id = ?',
      )
      .get(created.id) as { ciphertext: string; iv: string; auth_tag: string };
    assert.ok(credentialRow);
    assert.ok(!Object.values(credentialRow).some((value) => value.includes(API_KEY)));
    assert.equal(
      new ModelCredentialCipher(ENCRYPTION_KEY).decrypt({
        ciphertext: credentialRow.ciphertext,
        iv: credentialRow.iv,
        authTag: credentialRow.auth_tag,
      }),
      API_KEY,
    );

    db.close();
    db = openDatabase(databasePath);
    service = new ModelConnectionService(new ModelConnectionRepository(db), ENCRYPTION_KEY);
    assert.equal((await service.getConnectionForInference(created.id))?.apiKey, API_KEY);

    const blankUpdate = await service.updateConnection(created.id, {
      ...BASE_INPUT,
      baseUrl: 'http://updated-model.test',
      apiKey: '   ',
    });
    assert.equal(blankUpdate?.data.baseUrl, 'http://updated-model.test');
    assert.equal(blankUpdate?.hasApiKey, true);
    assert.equal((await service.getConnectionForInference(created.id))?.apiKey, API_KEY);

    const replacement = await service.updateConnection(created.id, {
      ...BASE_INPUT,
      baseUrl: 'http://updated-model.test',
      apiKey: REPLACEMENT_API_KEY,
    });
    assert.equal(replacement?.hasApiKey, true);
    assert.equal(
      (await service.getConnectionForInference(created.id))?.apiKey,
      REPLACEMENT_API_KEY,
    );

    assert.equal(await service.deleteConnection(created.id), true);
    assert.equal(
      (
        db
          .prepare(
            'SELECT COUNT(*) AS count FROM model_connection_credentials WHERE connection_id = ?',
          )
          .get(created.id) as { count: number }
      ).count,
      0,
    );
    db.close();
  });

  await it('keeps uncredentialed connections usable without encryption configuration', async () => {
    const db = openDatabase(':memory:');
    const service = new ModelConnectionService(new ModelConnectionRepository(db), undefined);
    const created = await service.createConnection({ ...BASE_INPUT });

    assert.equal(created.hasApiKey, false);
    assert.deepEqual(await service.getConnectionForInference(created.id), {
      connection: created,
    });
    db.close();
  });

  await it('fails safely for missing or invalid master keys when credential operations require one', async () => {
    const db = openDatabase(':memory:');
    const repository = new ModelConnectionRepository(db);
    const missingKeyService = new ModelConnectionService(repository, '');
    const invalidKeyService = new ModelConnectionService(repository, 'not-base64');

    await assert.rejects(
      () => missingKeyService.createConnection({ ...BASE_INPUT, apiKey: API_KEY }),
      /MODEL_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64 key/,
    );
    await assert.rejects(
      () => invalidKeyService.createConnection({ ...BASE_INPUT, apiKey: API_KEY }),
      /MODEL_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64 key/,
    );
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM model_connections').get() as { count: number })
        .count,
      0,
    );

    const keyedService = new ModelConnectionService(repository, ENCRYPTION_KEY);
    const created = await keyedService.createConnection({ ...BASE_INPUT, apiKey: API_KEY });
    await assert.rejects(
      () => missingKeyService.getConnectionForInference(created.id),
      /MODEL_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64 key/,
    );
    db.close();
  });

  await it('logs controlled credential configuration diagnostics for create and update', async () => {
    const db = openDatabase(':memory:');
    const repository = new ModelConnectionRepository(db);
    const entries: CapturedLogEntry[] = [];
    const created = await new ModelConnectionService(repository, ENCRYPTION_KEY).createConnection({
      ...BASE_INPUT,
    });
    const missingKeyService = new ModelConnectionService(
      repository,
      '',
      capturingLogger(entries),
    );
    const invalidKeyService = new ModelConnectionService(
      repository,
      'not-base64',
      capturingLogger(entries),
    );

    await assert.rejects(() =>
      missingKeyService.createConnection({ ...BASE_INPUT, apiKey: API_KEY }),
    );
    await assert.rejects(() =>
      invalidKeyService.updateConnection(created.id, {
        ...BASE_INPUT,
        apiKey: REPLACEMENT_API_KEY,
      }),
    );

    assert.deepEqual(entries, [
      {
        level: 'error',
        event: 'model_connection_save_failed',
        fields: {
          operation: 'create',
          connectionId: null,
          stage: 'credential_configuration',
          errorCode: 'MODEL_CREDENTIAL_ENCRYPTION_KEY_MISSING',
          errorName: 'ModelCredentialCipherError',
        },
      },
      {
        level: 'error',
        event: 'model_connection_save_failed',
        fields: {
          operation: 'update',
          connectionId: created.id,
          stage: 'credential_configuration',
          errorCode: 'MODEL_CREDENTIAL_ENCRYPTION_KEY_INVALID',
          errorName: 'ModelCredentialCipherError',
        },
      },
    ]);
    const serializedEntries = JSON.stringify(entries);
    assert.ok(!serializedEntries.includes(API_KEY));
    assert.ok(!serializedEntries.includes(REPLACEMENT_API_KEY));
    assert.ok(!serializedEntries.includes(ENCRYPTION_KEY));
    db.close();
  });

  await it('logs safe repository diagnostics without masking save or logging failures', async () => {
    const db = openDatabase(':memory:');
    const repository = new ModelConnectionRepository(db);
    const entries: CapturedLogEntry[] = [];
    const ciphertext = 'sensitive-ciphertext';
    const iv = 'sensitive-iv';
    const authTag = 'sensitive-auth-tag';
    const saveFailure = Object.assign(
      new Error(`${API_KEY} ${ENCRYPTION_KEY} ${ciphertext} ${iv} ${authTag}`),
      { apiKey: API_KEY, ciphertext, iv, authTag },
    );
    repository.update = async () => {
      throw saveFailure;
    };
    const service = new ModelConnectionService(
      repository,
      ENCRYPTION_KEY,
      capturingLogger(entries),
    );

    await assert.rejects(
      () => service.updateConnection(42, { ...BASE_INPUT, apiKey: API_KEY }),
      (error) => error === saveFailure,
    );

    assert.deepEqual(entries, [
      {
        level: 'error',
        event: 'model_connection_save_failed',
        fields: {
          operation: 'update',
          connectionId: 42,
          stage: 'repository',
          errorCode: 'MODEL_CONNECTION_PERSISTENCE_FAILED',
          errorName: 'Error',
        },
      },
    ]);
    const serializedEntries = JSON.stringify(entries);
    for (const secret of [API_KEY, ENCRYPTION_KEY, ciphertext, iv, authTag]) {
      assert.ok(!serializedEntries.includes(secret));
    }

    const loggingFailure = new Error('logging failed');
    repository.create = async () => {
      throw saveFailure;
    };
    const serviceWithFailingLogger = new ModelConnectionService(
      repository,
      ENCRYPTION_KEY,
      capturingLogger([], loggingFailure),
    );
    await assert.rejects(
      () => serviceWithFailingLogger.createConnection({ ...BASE_INPUT }),
      (error) => error === saveFailure,
    );
    db.close();
  });
});
