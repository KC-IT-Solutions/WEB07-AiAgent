import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { SystemSettingsRepository } from '../../src/server/repositories/system-settings-repository.js';
import {
  AgentRuntimeSettingsError,
  SystemSettingsError,
  SystemSettingsService,
} from '../../src/server/services/system-settings-service.js';
import { AuthorizationService } from '../../src/server/services/authorization-service.js';
import type { LogLevel } from '../../src/server/logging/logger.js';
import {
  AGENT_RUNTIME_LIMITS_BOUNDS,
  AGENT_RUNTIME_LIMITS_DEFAULTS,
  AgentRuntimeLimitsValidationError,
  isAgentRuntimeLimits,
  validateAgentRuntimeLimits,
  type AgentRuntimeLimits,
} from '../../src/server/runtime-limits.js';

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

await describe('agent runtime limits settings', async () => {
  await it('uses defaults when no settings row or historical settings omit runtime limits', async () => {
    const db = createTestDatabase();
    const repository = new SystemSettingsRepository(db);
    const service = new SystemSettingsService(repository);

    assert.deepEqual(await service.getAgentRuntimeLimits(), AGENT_RUNTIME_LIMITS_DEFAULTS);
    assert.deepEqual(await service.getAgentRuntimeLimitsConfiguration(), {
      limits: AGENT_RUNTIME_LIMITS_DEFAULTS,
      defaults: AGENT_RUNTIME_LIMITS_DEFAULTS,
      bounds: AGENT_RUNTIME_LIMITS_BOUNDS,
    });
    db.prepare(
      'INSERT INTO system_settings (id, created_at, updated_at, data) VALUES (1, 1, 1, ?)',
    ).run(JSON.stringify({ level: 'warn', clearLogsOnStartup: true }));
    assert.deepEqual(await service.getAgentRuntimeLimits(), AGENT_RUNTIME_LIMITS_DEFAULTS);
    db.close();
  });

  await it('persists runtime limits and preserves them through logging updates and reloads', async () => {
    const db = createTestDatabase();
    const repository = new SystemSettingsRepository(db);
    const service = new SystemSettingsService(repository);
    const runtimeLimits: AgentRuntimeLimits = {
      toolResultCharacters: 40_000,
      assignmentCharacters: 120_000,
      inlineInstructionsCharacters: 25_000,
      attachedFileBytes: 300 * 1024,
      attachedFilesTotalBytes: 2 * 1024 * 1024,
    };

    assert.deepEqual(await service.updateAgentRuntimeLimits(runtimeLimits), runtimeLimits);
    await service.updateLoggingSettings({
      level: 'debug',
      applicationLogEnabled: false,
      modelInferenceLogEnabled: true,
      clearLogsOnStartup: true,
    });

    const reloaded = new SystemSettingsService(repository);
    assert.deepEqual(await reloaded.getAgentRuntimeLimits(), runtimeLimits);
    assert.deepEqual(await reloaded.getLoggingSettings(), {
      level: 'debug',
      applicationLogEnabled: false,
      modelInferenceLogEnabled: true,
      clearLogsOnStartup: true,
    });
    db.close();
  });

  await it('preserves logging settings when runtime limits are updated', async () => {
    const db = createTestDatabase();
    const service = new SystemSettingsService(new SystemSettingsRepository(db));
    const loggingSettings = {
      level: 'trace' as const,
      applicationLogEnabled: false,
      modelInferenceLogEnabled: false,
      clearLogsOnStartup: true,
    };
    await service.updateLoggingSettings(loggingSettings);
    await service.updateAgentRuntimeLimits({ ...AGENT_RUNTIME_LIMITS_DEFAULTS });
    assert.deepEqual(await service.getLoggingSettings(), loggingSettings);
    db.close();
  });

  await it('atomically preserves sibling fields during concurrent settings updates', async () => {
    const db = createTestDatabase();
    const service = new SystemSettingsService(new SystemSettingsRepository(db));
    const loggingSettings = {
      level: 'warn' as const,
      applicationLogEnabled: false,
      modelInferenceLogEnabled: true,
      clearLogsOnStartup: true,
    };
    const runtimeLimits = {
      ...AGENT_RUNTIME_LIMITS_DEFAULTS,
      toolResultCharacters: 48_000,
    };

    await Promise.all([
      service.updateLoggingSettings(loggingSettings),
      service.updateAgentRuntimeLimits(runtimeLimits),
    ]);

    assert.deepEqual(await service.getLoggingSettings(), loggingSettings);
    assert.deepEqual(await service.getAgentRuntimeLimits(), runtimeLimits);
    db.close();
  });

  await it('accepts every hard bound without clamping', async () => {
    const minimums: AgentRuntimeLimits = {
      toolResultCharacters: AGENT_RUNTIME_LIMITS_BOUNDS.toolResultCharacters.min,
      assignmentCharacters: AGENT_RUNTIME_LIMITS_BOUNDS.assignmentCharacters.min,
      inlineInstructionsCharacters: AGENT_RUNTIME_LIMITS_BOUNDS.inlineInstructionsCharacters.min,
      attachedFileBytes: AGENT_RUNTIME_LIMITS_BOUNDS.attachedFileBytes.min,
      attachedFilesTotalBytes: AGENT_RUNTIME_LIMITS_BOUNDS.attachedFilesTotalBytes.min,
    };
    const maximums: AgentRuntimeLimits = {
      toolResultCharacters: AGENT_RUNTIME_LIMITS_BOUNDS.toolResultCharacters.max,
      assignmentCharacters: AGENT_RUNTIME_LIMITS_BOUNDS.assignmentCharacters.max,
      inlineInstructionsCharacters: AGENT_RUNTIME_LIMITS_BOUNDS.inlineInstructionsCharacters.max,
      attachedFileBytes: AGENT_RUNTIME_LIMITS_BOUNDS.attachedFileBytes.max,
      attachedFilesTotalBytes: AGENT_RUNTIME_LIMITS_BOUNDS.attachedFilesTotalBytes.max,
    };
    assert.equal(isAgentRuntimeLimits(minimums), true);
    assert.equal(isAgentRuntimeLimits(maximums), true);
    assert.deepEqual(validateAgentRuntimeLimits(maximums), maximums);
  });

  await it('strictly rejects malformed, non-integer, out-of-range, and inconsistent values', async () => {
    const valid = { ...AGENT_RUNTIME_LIMITS_DEFAULTS };
    const invalidValues: unknown[] = [
      null,
      [],
      { ...valid, toolResultCharacters: '32000' },
      { ...valid, toolResultCharacters: Number.NaN },
      { ...valid, assignmentCharacters: Number.POSITIVE_INFINITY },
      { ...valid, inlineInstructionsCharacters: 20_000.5 },
      { ...valid, attachedFileBytes: -1 },
      { ...valid, toolResultCharacters: AGENT_RUNTIME_LIMITS_BOUNDS.toolResultCharacters.min - 1 },
      { ...valid, assignmentCharacters: AGENT_RUNTIME_LIMITS_BOUNDS.assignmentCharacters.max + 1 },
      { ...valid, attachedFileBytes: AGENT_RUNTIME_LIMITS_BOUNDS.attachedFileBytes.min - 1 },
      {
        ...valid,
        attachedFilesTotalBytes: AGENT_RUNTIME_LIMITS_BOUNDS.attachedFilesTotalBytes.max + 1,
      },
      { ...valid, attachedFilesTotalBytes: valid.attachedFileBytes - 1 },
      { ...valid, extra: 1 },
      { toolResultCharacters: valid.toolResultCharacters },
    ];

    const db = createTestDatabase();
    const service = new SystemSettingsService(new SystemSettingsRepository(db));
    for (const value of invalidValues) {
      assert.equal(isAgentRuntimeLimits(value), false);
      assert.throws(
        () => validateAgentRuntimeLimits(value),
        (error: unknown) =>
          error instanceof AgentRuntimeLimitsValidationError &&
          error.code === 'INVALID_AGENT_RUNTIME_LIMITS',
      );
      await assert.rejects(
        () => service.updateAgentRuntimeLimits(value),
        (error: unknown) =>
          error instanceof AgentRuntimeSettingsError &&
          error.code === 'INVALID_AGENT_RUNTIME_LIMITS',
      );
    }
    db.close();
  });

  await it('rejects an invalid limits object present in persisted JSON', async () => {
    const db = createTestDatabase();
    db.prepare(
      'INSERT INTO system_settings (id, created_at, updated_at, data) VALUES (1, 1, 1, ?)',
    ).run(
      JSON.stringify({
        level: 'info',
        applicationLogEnabled: true,
        modelInferenceLogEnabled: true,
        clearLogsOnStartup: false,
        agentRuntimeLimits: { ...AGENT_RUNTIME_LIMITS_DEFAULTS, attachedFileBytes: '262144' },
      }),
    );
    assert.throws(
      () => new SystemSettingsRepository(db).get(),
      AgentRuntimeLimitsValidationError,
    );
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
