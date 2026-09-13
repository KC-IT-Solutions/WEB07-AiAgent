import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/server/database.js';
import { ProjectRepository } from '../../src/server/repositories/project-repository.js';
import { AgentRepository } from '../../src/server/repositories/agent-repository.js';
import { AgentRunRepository } from '../../src/server/repositories/agent-run-repository.js';
import { AGENT_RUNTIME_LIMITS_DEFAULTS } from '../../src/server/runtime-limits.js';

const defaultPermissions = {
  list: true,
  read: true,
  write: false,
  createDirectory: false,
  rename: false,
  delete: false,
} as const;

const agentData = {
  name: 'Runner',
  description: '',
  instructionSource: 'inline' as const,
  instructions: 'Be concise.',
  assignmentSource: 'inline' as const,
  assignment: 'Complete the saved assignment.',
  assignmentFilePath: '',
  instructionFilePath: '',
  modelConnectionId: 1,
  modelId: 'model-a',
  allowModelSelection: false,
  triggerNextAgent: false,
  saveResultToFile: false,
  resultDirectory: '',
  resultFilename: '',
  projectFilesystemPermissions: defaultPermissions,
};

function setup() {
  const db = createTestDatabase();
  const projects = new ProjectRepository(db);
  const agents = new AgentRepository(db);
  const runs = new AgentRunRepository(db);
  const project = projects.create(1, { name: 'Project', description: '' });
  const agent = agents.create(project.id, agentData);
  return { db, projects, agents, runs, project, agent };
}

await describe('AgentRunRepository', () => {
  it('migrates relational run/event tables, ownership foreign keys, and active/latest indexes', () => {
    const { db, project, agent, runs } = setup();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'agent_run%'")
      .all() as Array<{ name: string }>;
    assert.deepEqual(
      tables.map((row) => row.name).sort(),
      ['agent_run_events', 'agent_runs'],
    );
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_agent_run%'")
      .all() as Array<{ name: string }>;
    assert.deepEqual(
      indexes.map((row) => row.name).sort(),
      ['idx_agent_run_events_run', 'idx_agent_runs_latest', 'idx_agent_runs_one_active'],
    );
    assert.throws(() =>
      db
        .prepare(
          `INSERT INTO agent_runs
             (agent_id, project_id, status, started_at, created_at, updated_at, data)
           VALUES (?, ?, 'running', 1, 1, 1, ?)`,
        )
        .run(agent.id, project.id + 1, '{}'),
    );
    const run = runs.create(1, project.id, agent.id, 'First task');
    assert.ok(run);
    assert.deepEqual(
      {
        triggeredByRunId: run.triggeredByRunId,
        previousAgentId: run.previousAgentId,
        chainRootRunId: run.chainRootRunId,
        originalTask: run.data.originalTask,
      },
      { triggeredByRunId: null, previousAgentId: null, chainRootRunId: null, originalTask: 'First task' },
    );
    assert.throws(() => runs.create(1, project.id, agent.id, 'Concurrent task'));
    assert.equal(runs.create(2, project.id, agent.id, 'Forbidden'), null);
    db.close();
  });

  it('persists relational chain provenance and preserves the root task', () => {
    const { db, project, agents, agent, runs } = setup();
    const next = agents.create(project.id, { ...agentData, name: 'Next' });
    const root = runs.create(1, project.id, agent.id, 'Original task');
    assert.ok(root);
    assert.equal(runs.complete(root.id, 'Root result'), true);
    const child = runs.create(1, project.id, next.id, 'Structured handoff', {
      originalTask: 'Original task',
      triggeredByRunId: root.id,
      previousAgentId: agent.id,
      chainRootRunId: root.id,
    });
    assert.ok(child);
    assert.deepEqual(
      {
        triggeredByRunId: child.triggeredByRunId,
        previousAgentId: child.previousAgentId,
        chainRootRunId: child.chainRootRunId,
        originalTask: child.data.originalTask,
      },
      {
        triggeredByRunId: root.id,
        previousAgentId: agent.id,
        chainRootRunId: root.id,
        originalTask: 'Original task',
      },
    );
    assert.throws(() => runs.create(1, project.id, next.id, 'Duplicate active child'));
    db.close();
  });

  it('persists deterministic latest/active runs, final results, safe errors, and operational events', () => {
    const { db, project, agent, runs } = setup();
    const first = runs.create(1, project.id, agent.id, 'First');
    assert.ok(first);
    assert.equal(runs.getActive(1, project.id, agent.id)?.id, first.id);
    assert.equal(runs.complete(first.id, 'Final answer'), true);
    assert.equal(runs.getById(1, project.id, agent.id, first.id)?.data.finalResult, 'Final answer');
    const second = runs.create(1, project.id, agent.id, 'Second');
    assert.ok(second);
    const safeError = {
      stage: 'provider_request',
      code: 'MODEL_SERVER_TIMEOUT',
      message: 'The model provider request timed out.',
      actualCharacters: 47_832,
      limitCharacters: AGENT_RUNTIME_LIMITS_DEFAULTS.toolResultCharacters,
      actualBytes: 1_468_002,
      limitBytes: 1_048_576,
    };
    assert.equal(runs.fail(second.id, safeError), true);
    assert.equal(runs.getLatest(1, project.id, agent.id)?.id, second.id);
    assert.equal(runs.getActive(1, project.id, agent.id), null);
    assert.deepEqual(runs.listErrors(1, project.id, agent.id), [
      { runId: second.id, timestamp: runs.getLatest(1, project.id, agent.id)?.completedAt, ...safeError },
    ]);
    assert.deepEqual(
      runs.listEvents(1, project.id, agent.id, first.id)?.map((event) => event.eventType),
      ['run_started', 'final_result_received', 'run_completed'],
    );
    assert.deepEqual(
      runs.listExecutionEvents(1, project.id, agent.id, first.id)?.map((event) => event.eventType),
      ['user_task'],
    );
    assert.equal(runs.listExecutionEvents(2, project.id, agent.id, first.id), null);
    const stored = (
      db.prepare('SELECT data FROM agent_runs WHERE id = ?').get(second.id) as { data: string }
    ).data;
    for (const forbidden of ['reasoning', 'reasoning_content', 'chainOfThought', 'apiKey']) {
      assert.ok(!stored.includes(forbidden));
    }
    db.close();
  });

  it('persists typed pre-run execution events and sanitized error metadata without tool-call IDs', () => {
    const { db, project, agent, runs } = setup();
    const run = runs.create(1, project.id, agent.id, 'Pre-run');
    assert.ok(run);
    runs.addExecutionEvent(run.id, 'pre_run_tool_call', {
      toolName: 'fred_data',
      inputFile: 'inputs/fred.json',
      callIndex: 1,
      arguments: '{"seriesId":"ICSA"}',
    });
    runs.addExecutionEvent(run.id, 'pre_run_tool_result', {
      toolName: 'fred_data',
      inputFile: 'inputs/fred.json',
      callIndex: 1,
      result: '{"observations":[]}',
    });
    const execution = runs.listExecutionEvents(1, project.id, agent.id, run.id)!;
    assert.deepEqual(
      execution.slice(1).map((event) => ({ eventType: event.eventType, data: event.data })),
      [
        {
          eventType: 'pre_run_tool_call',
          data: {
            toolName: 'fred_data',
            inputFile: 'inputs/fred.json',
            callIndex: 1,
            arguments: '{"seriesId":"ICSA"}',
          },
        },
        {
          eventType: 'pre_run_tool_result',
          data: {
            toolName: 'fred_data',
            inputFile: 'inputs/fred.json',
            callIndex: 1,
            result: '{"observations":[]}',
          },
        },
      ],
    );
    const serialized = JSON.stringify(execution);
    assert.equal(serialized.includes('toolCallId'), false);
    assert.equal(serialized.includes('tool_call_id'), false);
    db.close();
  });

  it('cascades Agent run history and run events without affecting other Agents', () => {
    const { db, project, agents, agent, runs } = setup();
    const other = agents.create(project.id, { ...agentData, name: 'Other' });
    const run = runs.create(1, project.id, agent.id, 'Delete me');
    const otherRun = runs.create(1, project.id, other.id, 'Keep me');
    assert.ok(run && otherRun);
    assert.equal(agents.delete(1, project.id, agent.id), true);
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM agent_runs WHERE agent_id = ?').get(agent.id) as { count: number }).count,
      0,
    );
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM agent_run_events WHERE run_id = ?').get(run.id) as { count: number }).count,
      0,
    );
    assert.ok(runs.getById(1, project.id, other.id, otherRun.id));
    db.prepare('DELETE FROM agent_runs WHERE id = ?').run(otherRun.id);
    assert.equal(
      (db.prepare('SELECT COUNT(*) count FROM agent_run_events WHERE run_id = ?').get(otherRun.id) as { count: number }).count,
      0,
    );
    db.close();
  });

  it('normalizes orphaned active runs to sanitized errors', () => {
    const { db, project, agent, runs } = setup();
    const run = runs.create(1, project.id, agent.id, 'Interrupted');
    assert.ok(run);
    assert.equal(
      runs.normalizeInterruptedRuns({
        stage: 'server_restart',
        code: 'RUN_INTERRUPTED_BY_SERVER_RESTART',
        message: 'The Agent run was interrupted by a server restart.',
      }),
      1,
    );
    assert.equal(runs.getLatest(1, project.id, agent.id)?.status, 'error');
    assert.equal(runs.fail(run.id, { stage: 'late', code: 'LATE', message: 'Late' }), false);
    db.close();
  });

  it('deletes only owned terminal runs and cascades their events', () => {
    const { db, project, agents, agent, runs } = setup();
    const otherAgent = agents.create(project.id, { ...agentData, name: 'Other' });
    const done = runs.create(1, project.id, agent.id, 'Done');
    assert.ok(done);
    runs.addOperationalEvent(done.id, 'configuration_loaded');
    assert.equal(runs.complete(done.id, 'Result'), true);
    const failed = runs.create(1, project.id, agent.id, 'Failed');
    assert.ok(failed);
    assert.equal(
      runs.fail(failed.id, { stage: 'provider', code: 'FAILED', message: 'Failed safely' }),
      true,
    );
    const cancelled = runs.create(1, project.id, agent.id, 'Cancelled');
    assert.ok(cancelled);
    assert.equal(runs.cancel(cancelled.id), true);
    const active = runs.create(1, project.id, agent.id, 'Keep active');
    const other = runs.create(1, project.id, otherAgent.id, 'Keep other');
    assert.ok(active && other);
    assert.equal(runs.complete(other.id, 'Other result'), true);
    const terminalIds = [done.id, failed.id, cancelled.id];

    assert.equal(runs.deleteTerminal(2, project.id, agent.id), null);
    assert.equal(runs.deleteTerminal(1, project.id, otherAgent.id + 10_000), null);
    assert.equal(runs.deleteTerminal(1, project.id, agent.id), 3);
    assert.deepEqual(
      db
        .prepare('SELECT id FROM agent_runs WHERE agent_id = ? ORDER BY id')
        .all(agent.id) as Array<{ id: number }>,
      [{ id: active.id }],
    );
    assert.equal(
      (
        db
          .prepare(
            `SELECT COUNT(*) count FROM agent_run_events
             WHERE run_id IN (?, ?, ?)`,
          )
          .get(...terminalIds) as { count: number }
      ).count,
      0,
    );
    assert.ok(runs.getById(1, project.id, agent.id, active.id));
    assert.ok(runs.getById(1, project.id, otherAgent.id, other.id));
    assert.equal(runs.deleteTerminal(1, project.id, agent.id), 0);
    db.close();
  });
});
