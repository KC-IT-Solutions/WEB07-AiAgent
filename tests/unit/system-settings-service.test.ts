import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { SystemSettingsRepository } from '../../src/server/repositories/system-settings-repository.js';
import {
  SystemSettingsError,
  SystemSettingsService,
} from '../../src/server/services/system-settings-service.js';
import { AuthorizationService } from '../../src/server/services/authorization-service.js';
import type { LogLevel } from '../../src/server/logging/logger.js';

await describe('global system logging settings', async () => {
  await it('uses conservative defaults and persists one global value', async () => {
    const db = createTestDatabase();
    const repository = new SystemSettingsRepository(db);
    let effectiveLevel: LogLevel = 'error';
    const effectiveStreams = new Map<string, boolean>();
    const service = new SystemSettingsService(repository, {
      setLevel: (level) => {
        effectiveLevel = level;
      },
      setStreamEnabled: (stream, enabled) => {
        effectiveStreams.set(stream, enabled);
      },
    });
    assert.deepEqual(await service.getLoggingSettings(), {
      level: 'info',
      applicationLogEnabled: true,
      modelInferenceLogEnabled: true,
      clearLogsOnStartup: false,
    });
    assert.deepEqual(
      await service.updateLoggingSettings({
        level: 'trace',
        applicationLogEnabled: false,
        modelInferenceLogEnabled: true,
        clearLogsOnStartup: true,
      }),
      {
        level: 'trace',
        applicationLogEnabled: false,
        modelInferenceLogEnabled: true,
        clearLogsOnStartup: true,
      },
    );
    assert.equal(effectiveLevel, 'trace');
    assert.deepEqual(Object.fromEntries(effectiveStreams), {
      application: false,
      'model-inference': true,
    });
    assert.deepEqual(await new SystemSettingsService(repository).getLoggingSettings(), {
      level: 'trace',
      applicationLogEnabled: false,
      modelInferenceLogEnabled: true,
      clearLogsOnStartup: true,
    });
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM system_settings').get() as { count: number })
        .count,
      1,
    );
    db.close();
  });

  await it('defaults both log types to enabled for historical settings', async () => {
    const db = createTestDatabase();
    db.prepare(
      'INSERT INTO system_settings (id, created_at, updated_at, data) VALUES (1, 1, 1, ?)',
    ).run(JSON.stringify({ level: 'warn', clearLogsOnStartup: true }));

    assert.deepEqual(
      await new SystemSettingsService(new SystemSettingsRepository(db)).getLoggingSettings(),
      {
        level: 'warn',
        applicationLogEnabled: true,
        modelInferenceLogEnabled: true,
        clearLogsOnStartup: true,
      },
    );
    db.close();
  });

  await it('rejects invalid levels, booleans, and extra fields', async () => {
    const db = createTestDatabase();
    const service = new SystemSettingsService(new SystemSettingsRepository(db));
    const validSettings = {
      level: 'info',
      applicationLogEnabled: true,
      modelInferenceLogEnabled: true,
      clearLogsOnStartup: false,
    };
    for (const value of [
      { ...validSettings, level: 'verbose' },
      { ...validSettings, applicationLogEnabled: 'yes' },
      { ...validSettings, modelInferenceLogEnabled: 1 },
      { ...validSettings, clearLogsOnStartup: 'yes' },
      { ...validSettings, userId: 1 },
    ]) {
      await assert.rejects(
        () => service.updateLoggingSettings(value),
        (error: unknown) => error instanceof SystemSettingsError,
      );
    }
    db.close();
  });
});

await describe('authorization service', async () => {
  await it('reports user 1 as admin and another server identity as non-admin', () => {
    assert.deepEqual(new AuthorizationService(() => 1).getCurrentUserCapabilities(), {
      isAdmin: true,
    });
    assert.deepEqual(new AuthorizationService(() => 2).getCurrentUserCapabilities(), {
      isAdmin: false,
    });
  });
});
