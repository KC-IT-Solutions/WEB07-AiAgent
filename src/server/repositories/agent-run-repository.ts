import type { Database } from 'better-sqlite3';
import type {
  AgentRunData,
  AgentRunErrorLogEntry,
  AgentRunEvent,
  AgentRunExecutionEvent,
  AgentRunRecord,
  AgentRunSafeError,
  AgentRunStatus,
} from '../agent-run-types.js';
import { safeExecutionText } from '../agent-execution-safety.js';

interface AgentRunRow {
  id: number;
  agent_id: number;
  project_id: number;
  triggered_by_run_id: number | null;
  previous_agent_id: number | null;
  chain_root_run_id: number | null;
  status: string;
  started_at: number;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
  data: string;
}

const RUN_STATUSES = new Set<AgentRunStatus>([
  'running',
  'paused',
  'done',
  'error',
  'cancelled',
]);
const EXECUTION_EVENT_TYPES = [
  'user_task',
  'reasoning',
  'assistant_message',
  'pre_run_tool_call',
  'pre_run_tool_result',
  'tool_call',
  'tool_result',
  'final_result',
  'inference_cancelled',
] as const;
type ExecutionEventType = (typeof EXECUTION_EVENT_TYPES)[number];

function parseSafeError(value: unknown): AgentRunSafeError | null {
  if (value === null) return null;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid Agent run error');
  }
  const error = value as Record<string, unknown>;
  if (
    Object.keys(error).some(
      (key) =>
        ![
          'stage',
          'code',
          'message',
          'toolName',
          'inputFile',
          'callIndex',
          'arguments',
          'errorCode',
          'errorName',
          'errorMessage',
          'actualCharacters',
          'limitCharacters',
          'actualBytes',
          'limitBytes',
        ].includes(key),
    ) ||
    typeof error.stage !== 'string' ||
    typeof error.code !== 'string' ||
    typeof error.message !== 'string' ||
    ['toolName', 'inputFile', 'arguments', 'errorCode', 'errorName', 'errorMessage'].some(
      (key) => error[key] !== undefined && typeof error[key] !== 'string',
    ) ||
    (error.callIndex !== undefined &&
      (!Number.isSafeInteger(error.callIndex) || Number(error.callIndex) <= 0)) ||
    ['actualCharacters', 'limitCharacters', 'actualBytes', 'limitBytes'].some(
      (key) =>
        error[key] !== undefined &&
        (!Number.isSafeInteger(error[key]) || Number(error[key]) < 0),
    )
  ) {
    throw new Error('Invalid Agent run error');
  }
  if (typeof error.arguments === 'string') JSON.parse(error.arguments);
  return {
    stage: error.stage,
    code: error.code,
    message: error.message,
    ...(typeof error.toolName === 'string' ? { toolName: error.toolName } : {}),
    ...(typeof error.inputFile === 'string' ? { inputFile: error.inputFile } : {}),
    ...(typeof error.callIndex === 'number' ? { callIndex: error.callIndex } : {}),
    ...(typeof error.arguments === 'string' ? { arguments: error.arguments } : {}),
    ...(typeof error.errorCode === 'string' ? { errorCode: error.errorCode } : {}),
    ...(typeof error.errorName === 'string' ? { errorName: error.errorName } : {}),
    ...(typeof error.errorMessage === 'string' ? { errorMessage: error.errorMessage } : {}),
    ...(typeof error.actualCharacters === 'number'
      ? { actualCharacters: error.actualCharacters }
      : {}),
    ...(typeof error.limitCharacters === 'number'
      ? { limitCharacters: error.limitCharacters }
      : {}),
    ...(typeof error.actualBytes === 'number' ? { actualBytes: error.actualBytes } : {}),
    ...(typeof error.limitBytes === 'number' ? { limitBytes: error.limitBytes } : {}),
  };
}

function parseData(raw: string): AgentRunData {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid Agent run data');
  }
  const data = parsed as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (key) => !['task', 'originalTask', 'finalResult', 'latestTotalTokens', 'safeError', 'pauseRequested'].includes(key),
    ) ||
    typeof data.task !== 'string' ||
    (data.originalTask !== undefined && typeof data.originalTask !== 'string') ||
    (data.finalResult !== null && typeof data.finalResult !== 'string') ||
    (data.latestTotalTokens !== undefined &&
      data.latestTotalTokens !== null &&
      (!Number.isSafeInteger(data.latestTotalTokens) || Number(data.latestTotalTokens) < 0)) ||
    typeof data.pauseRequested !== 'boolean'
  ) {
    throw new Error('Invalid Agent run data');
  }
  return {
    task: data.task,
    originalTask: data.originalTask ?? data.task,
    finalResult: data.finalResult,
    latestTotalTokens:
      data.latestTotalTokens !== undefined && data.latestTotalTokens !== null
        ? Number(data.latestTotalTokens)
        : null,
    safeError: parseSafeError(data.safeError),
    pauseRequested: data.pauseRequested,
  };
}

function parseEventData(raw: string): AgentRunEvent['data'] {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid Agent run event data');
  }
  const data = parsed as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (key) =>
        ![
          'toolName',
          'status',
          'nextAgentId',
          'triggeredRunId',
          'previousAgentId',
          'triggeredByRunId',
          'modelId',
          'reason',
          'targetAgentId',
          'targetRunId',
          'terminalTargetStatus',
        ].includes(key),
    ) ||
    (data.toolName !== undefined && typeof data.toolName !== 'string') ||
    (data.status !== undefined && typeof data.status !== 'string') ||
    [
      'nextAgentId',
      'triggeredRunId',
      'previousAgentId',
      'triggeredByRunId',
      'targetAgentId',
      'targetRunId',
    ].some(
      (key) => data[key] !== undefined && (!Number.isSafeInteger(data[key]) || Number(data[key]) <= 0),
    ) ||
    (data.modelId !== undefined && typeof data.modelId !== 'string') ||
    (data.reason !== undefined && typeof data.reason !== 'string') ||
    (data.terminalTargetStatus !== undefined &&
      !['running', 'paused', 'done', 'error', 'cancelled'].includes(
        String(data.terminalTargetStatus),
      ))
  ) {
    throw new Error('Invalid Agent run event data');
  }
  return {
    ...(typeof data.toolName === 'string' ? { toolName: data.toolName } : {}),
    ...(typeof data.status === 'string' ? { status: data.status } : {}),
    ...(typeof data.nextAgentId === 'number' ? { nextAgentId: data.nextAgentId } : {}),
    ...(typeof data.triggeredRunId === 'number' ? { triggeredRunId: data.triggeredRunId } : {}),
    ...(typeof data.previousAgentId === 'number' ? { previousAgentId: data.previousAgentId } : {}),
    ...(typeof data.triggeredByRunId === 'number'
      ? { triggeredByRunId: data.triggeredByRunId }
      : {}),
    ...(typeof data.modelId === 'string' ? { modelId: data.modelId } : {}),
    ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
    ...(typeof data.targetAgentId === 'number' ? { targetAgentId: data.targetAgentId } : {}),
    ...(typeof data.targetRunId === 'number' ? { targetRunId: data.targetRunId } : {}),
    ...(typeof data.terminalTargetStatus === 'string'
      ? { terminalTargetStatus: data.terminalTargetStatus as AgentRunEvent['data']['terminalTargetStatus'] }
      : {}),
  };
}

function parseExecutionEventData(
  eventType: ExecutionEventType,
  raw: string,
): AgentRunExecutionEvent['data'] {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid Agent execution event data');
  }
  const data = parsed as Record<string, unknown>;
  if (
    eventType === 'user_task' ||
    eventType === 'reasoning' ||
    eventType === 'assistant_message' ||
    eventType === 'final_result'
  ) {
    if (Object.keys(data).some((key) => key !== 'content') || typeof data.content !== 'string') {
      throw new Error('Invalid Agent execution event data');
    }
    return { content: data.content };
  }
  if (eventType === 'tool_call') {
    if (
      Object.keys(data).some((key) => !['toolCallId', 'toolName', 'arguments'].includes(key)) ||
      typeof data.toolCallId !== 'string' ||
      typeof data.toolName !== 'string' ||
      typeof data.arguments !== 'string'
    ) {
      throw new Error('Invalid Agent execution event data');
    }
    JSON.parse(data.arguments);
    return {
      toolCallId: data.toolCallId,
      toolName: data.toolName,
      arguments: data.arguments,
    };
  }
  if (eventType === 'pre_run_tool_call') {
    if (
      Object.keys(data).some(
        (key) => !['toolName', 'inputFile', 'callIndex', 'arguments'].includes(key),
      ) ||
      typeof data.toolName !== 'string' ||
      typeof data.inputFile !== 'string' ||
      !Number.isSafeInteger(data.callIndex) ||
      Number(data.callIndex) <= 0 ||
      typeof data.arguments !== 'string'
    ) {
      throw new Error('Invalid Agent execution event data');
    }
    JSON.parse(data.arguments);
    return {
      toolName: data.toolName,
      inputFile: data.inputFile,
      callIndex: Number(data.callIndex),
      arguments: data.arguments,
    };
  }
  if (eventType === 'pre_run_tool_result') {
    if (
      Object.keys(data).some(
        (key) => !['toolName', 'inputFile', 'callIndex', 'result'].includes(key),
      ) ||
      typeof data.toolName !== 'string' ||
      typeof data.inputFile !== 'string' ||
      !Number.isSafeInteger(data.callIndex) ||
      Number(data.callIndex) <= 0 ||
      typeof data.result !== 'string'
    ) {
      throw new Error('Invalid Agent execution event data');
    }
    JSON.parse(data.result);
    return {
      toolName: data.toolName,
      inputFile: data.inputFile,
      callIndex: Number(data.callIndex),
      result: data.result,
    };
  }
  if (eventType === 'inference_cancelled') {
    const allowed = new Set<string>(['reasoning', 'content', 'finishReason', 'totalTokens']);
    if (Object.keys(data).some((key) => !allowed.has(key))) {
      throw new Error('Invalid Agent execution event data');
    }
    if ((data.reasoning !== undefined && typeof data.reasoning !== 'string') ||
        (data.content !== undefined && typeof data.content !== 'string') ||
        (data.finishReason !== undefined && typeof data.finishReason !== 'string') ||
        (data.totalTokens !== undefined && (!Number.isSafeInteger(data.totalTokens) || Number(data.totalTokens) < 0))) {
      throw new Error('Invalid Agent execution event data');
    }
    return {
      ...(typeof data.reasoning === 'string' ? { reasoning: data.reasoning } : {}),
      ...(typeof data.content === 'string' ? { content: data.content } : {}),
      ...(typeof data.finishReason === 'string' ? { finishReason: data.finishReason } : {}),
      ...(typeof data.totalTokens === 'number' ? { totalTokens: data.totalTokens } : {}),
    };
  }
  if (
    Object.keys(data).some(
      (key) => !['toolCallId', 'toolName', 'result', 'status'].includes(key),
    ) ||
    typeof data.toolCallId !== 'string' ||
    typeof data.toolName !== 'string' ||
    typeof data.result !== 'string' ||
    (data.status !== 'completed' && data.status !== 'failed')
  ) {
    throw new Error('Invalid Agent execution event data');
  }
  JSON.parse(data.result);
  return {
    toolCallId: data.toolCallId,
    toolName: data.toolName,
    result: data.result,
    status: data.status,
  };
}

export class AgentRunRepository {
  constructor(private readonly db: Database) {}

  transaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }

  create(
    userId: number,
    projectId: number,
    agentId: number,
    task: string,
    chain: {
      originalTask: string;
      triggeredByRunId: number;
      previousAgentId: number;
      chainRootRunId: number;
    } | null = null,
  ): AgentRunRecord | null {
    const now = Math.floor(Date.now() / 1000);
    const data: AgentRunData = {
      task,
      originalTask: chain?.originalTask ?? task,
      finalResult: null,
      latestTotalTokens: null,
      safeError: null,
      pauseRequested: false,
    };
    const result = this.db
      .prepare(
         `INSERT INTO agent_runs
           (agent_id, project_id, triggered_by_run_id, previous_agent_id, chain_root_run_id,
            status, started_at, completed_at, created_at, updated_at, data)
         SELECT a.id, a.project_id, ?, ?, ?, 'running', ?, NULL, ?, ?, ?
         FROM agents a
         INNER JOIN projects p ON p.id = a.project_id
         WHERE p.user_id = ? AND a.project_id = ? AND a.id = ?`,
      )
      .run(
        chain?.triggeredByRunId ?? null,
        chain?.previousAgentId ?? null,
        chain?.chainRootRunId ?? null,
        now,
        now,
        now,
        JSON.stringify(data),
        userId,
        projectId,
        agentId,
      );
    if (result.changes === 0) return null;
    const id = Number(result.lastInsertRowid);
    this.addEvent(id, 'run_started', now);
    this.addEvent(id, 'user_task', now, { content: safeExecutionText(task) });
    return this.getById(userId, projectId, agentId, id);
  }

  getById(userId: number, projectId: number, agentId: number, runId: number): AgentRunRecord | null {
    return this.queryOne(
      `WHERE p.user_id = ? AND r.project_id = ? AND r.agent_id = ? AND r.id = ?`,
      userId,
      projectId,
      agentId,
      runId,
    );
  }

  getLatest(userId: number, projectId: number, agentId: number): AgentRunRecord | null {
    return this.queryOne(
      `WHERE p.user_id = ? AND r.project_id = ? AND r.agent_id = ? ORDER BY r.id DESC LIMIT 1`,
      userId,
      projectId,
      agentId,
    );
  }

  getActive(userId: number, projectId: number, agentId: number): AgentRunRecord | null {
    return this.queryOne(
      `WHERE p.user_id = ? AND r.project_id = ? AND r.agent_id = ?
       AND r.status IN ('running', 'paused') ORDER BY r.id DESC LIMIT 1`,
      userId,
      projectId,
      agentId,
    );
  }

  listEvents(
    userId: number,
    projectId: number,
    agentId: number,
    runId: number,
  ): AgentRunEvent[] | null {
    if (!this.getById(userId, projectId, agentId, runId)) return null;
    return (
      this.db
        .prepare(
          `SELECT id, run_id, event_type, created_at, data
           FROM agent_run_events
           WHERE run_id = ? AND event_type NOT IN (${EXECUTION_EVENT_TYPES.map(() => '?').join(', ')})
           ORDER BY id`,
         )
        .all(runId, ...EXECUTION_EVENT_TYPES) as Array<{
        id: number;
        run_id: number;
        event_type: string;
        created_at: number;
        data: string;
      }>
    ).map((row) => ({
      id: row.id,
      runId: row.run_id,
      eventType: row.event_type,
      data: parseEventData(row.data),
      createdAt: row.created_at,
    }));
  }

  listExecutionEvents(
    userId: number,
    projectId: number,
    agentId: number,
    runId: number,
  ): AgentRunExecutionEvent[] | null {
    if (!this.getById(userId, projectId, agentId, runId)) return null;
    const rows = this.db
      .prepare(
        `SELECT id, run_id, event_type, created_at, data
         FROM agent_run_events
         WHERE run_id = ? AND event_type IN (${EXECUTION_EVENT_TYPES.map(() => '?').join(', ')})
         ORDER BY id`,
      )
      .all(runId, ...EXECUTION_EVENT_TYPES) as Array<{
      id: number;
      run_id: number;
      event_type: ExecutionEventType;
      created_at: number;
      data: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      eventType: row.event_type,
      data: parseExecutionEventData(row.event_type, row.data),
      createdAt: row.created_at,
    })) as AgentRunExecutionEvent[];
  }

  listErrors(userId: number, projectId: number, agentId: number): AgentRunErrorLogEntry[] | null {
    const owned = this.db
      .prepare(
        `SELECT 1 FROM agents a INNER JOIN projects p ON p.id = a.project_id
         WHERE p.user_id = ? AND a.project_id = ? AND a.id = ?`,
      )
      .get(userId, projectId, agentId);
    if (!owned) return null;
    const rows = this.db
      .prepare(
        `SELECT r.id, r.completed_at, r.data
         FROM agent_runs r
         WHERE r.project_id = ? AND r.agent_id = ? AND r.status = 'error'
         ORDER BY r.id DESC`,
      )
      .all(projectId, agentId) as Array<{ id: number; completed_at: number | null; data: string }>;
    return rows.map((row) => {
      const safeError = parseData(row.data).safeError;
      if (!safeError) throw new Error('Failed Agent run has no safe error');
      return { runId: row.id, timestamp: row.completed_at ?? 0, ...safeError };
    });
  }

  deleteTerminal(userId: number, projectId: number, agentId: number): number | null {
    const owned = this.db
      .prepare(
        `SELECT 1 FROM agents a INNER JOIN projects p ON p.id = a.project_id
         WHERE p.user_id = ? AND a.project_id = ? AND a.id = ?`,
      )
      .get(userId, projectId, agentId);
    if (!owned) return null;
    return this.db
      .prepare(
        `DELETE FROM agent_runs
         WHERE project_id = ? AND agent_id = ?
           AND status IN ('done', 'error', 'cancelled')`,
      )
      .run(projectId, agentId).changes;
  }

  requestPause(runId: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db
      .prepare(
        `UPDATE agent_runs
         SET data = json_set(data, '$.pauseRequested', json('true')),
             updated_at = MAX(updated_at + 1, ?)
         WHERE id = ? AND status = 'running'
           AND json_extract(data, '$.pauseRequested') = 0`,
      )
      .run(now, runId);
    if (result.changes > 0) this.addEvent(runId, 'pause_requested', now);
    return result.changes > 0;
  }

  pauseAtCheckpoint(runId: number): AgentRunStatus | null {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db
      .prepare(
        `UPDATE agent_runs
         SET status = 'paused', data = json_set(data, '$.pauseRequested', json('false')),
             updated_at = MAX(updated_at + 1, ?)
         WHERE id = ? AND status = 'running'
           AND json_extract(data, '$.pauseRequested') = 1`,
      )
      .run(now, runId);
    if (result.changes > 0) this.addEvent(runId, 'paused', now);
    return this.getStatus(runId);
  }

  resume(runId: number): boolean {
    return this.transitionStatus(runId, 'paused', 'running', 'resumed', false);
  }

  cancel(runId: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db
      .prepare(
        `UPDATE agent_runs
         SET status = 'cancelled', completed_at = ?,
             data = json_set(data, '$.pauseRequested', json('false')),
             updated_at = MAX(updated_at + 1, ?)
         WHERE id = ? AND status IN ('running', 'paused')`,
      )
      .run(now, now, runId);
    if (result.changes > 0) {
      this.addEvent(runId, 'cancel_requested', now);
      this.addEvent(runId, 'cancelled', now);
    }
    return result.changes > 0;
  }

  complete(runId: number, finalResult: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db
      .prepare(
        `UPDATE agent_runs
         SET status = 'done', completed_at = ?,
             data = json_set(data, '$.finalResult', ?, '$.pauseRequested', json('false')),
             updated_at = MAX(updated_at + 1, ?)
         WHERE id = ? AND status = 'running'
           AND json_extract(data, '$.pauseRequested') = 0`,
      )
      .run(now, finalResult, now, runId);
    if (result.changes > 0) {
      this.addEvent(runId, 'final_result_received', now);
      this.addEvent(runId, 'run_completed', now);
    }
    return result.changes > 0;
  }

  fail(runId: number, safeError: AgentRunSafeError): boolean {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db
      .prepare(
        `UPDATE agent_runs
         SET status = 'error', completed_at = ?,
             data = json_set(data, '$.safeError', json(?), '$.pauseRequested', json('false')),
             updated_at = MAX(updated_at + 1, ?)
         WHERE id = ? AND status IN ('running', 'paused')`,
      )
      .run(now, JSON.stringify(safeError), now, runId);
    if (result.changes > 0) this.addEvent(runId, 'run_failed', now);
    return result.changes > 0;
  }

  updateLatestTotalTokens(runId: number, totalTokens: number): void {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `UPDATE agent_runs
         SET data = json_set(data, '$.latestTotalTokens', ?),
             updated_at = MAX(updated_at + 1, ?)
         WHERE id = ?`,
      )
      .run(totalTokens, now, runId);
  }

  addOperationalEvent(runId: number, eventType: string, data: AgentRunEvent['data'] = {}): void {
    this.addEvent(runId, eventType, Math.floor(Date.now() / 1000), data);
  }

  addExecutionEvent(
    runId: number,
    eventType: AgentRunExecutionEvent['eventType'],
    data: AgentRunExecutionEvent['data'],
  ): void {
    this.addEvent(runId, eventType, Math.floor(Date.now() / 1000), data);
  }

  normalizeInterruptedRuns(safeError: AgentRunSafeError): number {
    const rows = this.db
      .prepare("SELECT id FROM agent_runs WHERE status IN ('running', 'paused') ORDER BY id")
      .all() as Array<{ id: number }>;
    let changed = 0;
    for (const row of rows) {
      if (this.fail(row.id, safeError)) changed += 1;
    }
    return changed;
  }

  private transitionStatus(
    runId: number,
    from: AgentRunStatus,
    to: AgentRunStatus,
    eventType: string,
    terminal: boolean,
  ): boolean {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db
      .prepare(
        `UPDATE agent_runs SET status = ?, completed_at = ?, updated_at = MAX(updated_at + 1, ?)
         WHERE id = ? AND status = ?`,
      )
      .run(to, terminal ? now : null, now, runId, from);
    if (result.changes > 0) this.addEvent(runId, eventType, now);
    return result.changes > 0;
  }

  private getStatus(runId: number): AgentRunStatus | null {
    const row = this.db.prepare('SELECT status FROM agent_runs WHERE id = ?').get(runId) as
      | { status: string }
      | undefined;
    return row && RUN_STATUSES.has(row.status as AgentRunStatus)
      ? (row.status as AgentRunStatus)
      : null;
  }

  private addEvent(
    runId: number,
    eventType: string,
    createdAt: number,
    data: AgentRunEvent['data'] | AgentRunExecutionEvent['data'] = {},
  ): void {
    this.db
      .prepare(
        `INSERT INTO agent_run_events (run_id, event_type, created_at, data)
         VALUES (?, ?, ?, ?)`,
      )
      .run(runId, eventType, createdAt, JSON.stringify(data));
  }

  private queryOne(where: string, ...parameters: unknown[]): AgentRunRecord | null {
    const row = this.db
      .prepare(
        `SELECT r.id, r.agent_id, r.project_id, r.triggered_by_run_id,
                r.previous_agent_id, r.chain_root_run_id, r.status, r.started_at, r.completed_at,
                r.created_at, r.updated_at, r.data
         FROM agent_runs r
         INNER JOIN projects p ON p.id = r.project_id
         ${where}`,
      )
      .get(...parameters) as AgentRunRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: AgentRunRow): AgentRunRecord {
    if (!RUN_STATUSES.has(row.status as AgentRunStatus)) throw new Error('Invalid Agent run status');
    return {
      id: row.id,
      agentId: row.agent_id,
      projectId: row.project_id,
      triggeredByRunId: row.triggered_by_run_id,
      previousAgentId: row.previous_agent_id,
      chainRootRunId: row.chain_root_run_id,
      status: row.status as AgentRunStatus,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      data: parseData(row.data),
    };
  }
}
