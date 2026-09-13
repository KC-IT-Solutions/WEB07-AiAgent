import type { Database } from 'better-sqlite3';
import type {
  AgentData,
  AgentRecord,
  AgentProjectFilesystemPermissions,
  AgentToolConfiguration,
} from '../agent-types.js';

interface AgentRow {
  id: number;
  project_id: number;
  next_agent_id: number | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  data: string;
}

function parseAgentData(raw: string): AgentData {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid agent data');
  }
  const data = parsed as Record<string, unknown>;
  const fields = Object.keys(data);
  const required = [
    'name',
    'description',
    'instructions',
    'modelConnectionId',
    'modelId',
    'allowModelSelection',
  ];
  const allowed = new Set([
    ...required,
    'instructionSource',
    'instructionFilePath',
    'assignmentSource',
    'assignment',
    'assignmentFilePath',
    'triggerNextAgent',
    'saveResultToFile',
    'resultDirectory',
    'resultFilename',
    'projectFilesystemPermissions',
    'attachedProjectFiles',
    'timeoutMinutes',
    'temperature',
    'topP',
    'unloadModelAfterRun',
  ]);
  if (
    required.some((field) => !fields.includes(field)) ||
    fields.some((field) => !allowed.has(field)) ||
    typeof data.name !== 'string' ||
    data.name.trim().length === 0 ||
    typeof data.description !== 'string' ||
    typeof data.instructions !== 'string' ||
    (data.instructionSource !== undefined &&
      data.instructionSource !== 'inline' &&
      data.instructionSource !== 'file' &&
      data.instructionSource !== 'none') ||
    (data.instructionFilePath !== undefined && typeof data.instructionFilePath !== 'string') ||
    (data.assignmentSource !== undefined &&
      data.assignmentSource !== 'inline' &&
      data.assignmentSource !== 'file') ||
    (data.assignment !== undefined && typeof data.assignment !== 'string') ||
    (data.assignmentFilePath !== undefined && typeof data.assignmentFilePath !== 'string') ||
    !Number.isSafeInteger(data.modelConnectionId) ||
    Number(data.modelConnectionId) <= 0 ||
    typeof data.modelId !== 'string' ||
    data.modelId.trim().length === 0 ||
    typeof data.allowModelSelection !== 'boolean' ||
    (data.triggerNextAgent !== undefined && typeof data.triggerNextAgent !== 'boolean') ||
    (data.saveResultToFile !== undefined && typeof data.saveResultToFile !== 'boolean') ||
    (data.resultDirectory !== undefined && typeof data.resultDirectory !== 'string') ||
    (data.resultFilename !== undefined && typeof data.resultFilename !== 'string') ||
    (data.attachedProjectFiles !== undefined &&
      (
        data.attachedProjectFiles === null ||
        typeof data.attachedProjectFiles !== 'object' ||
        !Array.isArray(data.attachedProjectFiles) ||
        data.attachedProjectFiles.some((item) => typeof item !== 'string')
      )) ||
    (data.projectFilesystemPermissions !== undefined &&
      (
        data.projectFilesystemPermissions === null ||
        typeof data.projectFilesystemPermissions !== 'object' ||
        Array.isArray(data.projectFilesystemPermissions) ||
        !('list' in data.projectFilesystemPermissions) ||
        !('read' in data.projectFilesystemPermissions) ||
        !('write' in data.projectFilesystemPermissions) ||
        !('createDirectory' in data.projectFilesystemPermissions) ||
        !('rename' in data.projectFilesystemPermissions) ||
        !('delete' in data.projectFilesystemPermissions) ||
        typeof data.projectFilesystemPermissions.list !== 'boolean' ||
        typeof data.projectFilesystemPermissions.read !== 'boolean' ||
        typeof data.projectFilesystemPermissions.write !== 'boolean' ||
        typeof data.projectFilesystemPermissions.createDirectory !== 'boolean' ||
        typeof data.projectFilesystemPermissions.rename !== 'boolean' ||
        typeof data.projectFilesystemPermissions.delete !== 'boolean'
      )) ||
    (data.timeoutMinutes !== undefined &&
      (typeof data.timeoutMinutes !== 'number' || !Number.isFinite(data.timeoutMinutes))) ||
    (data.temperature !== undefined &&
      (typeof data.temperature !== 'number' || !Number.isFinite(data.temperature))) ||
    (data.topP !== undefined &&
      (typeof data.topP !== 'number' || !Number.isFinite(data.topP))) ||
    (data.unloadModelAfterRun !== undefined && typeof data.unloadModelAfterRun !== 'boolean')
  ) {
    throw new Error('Invalid agent data');
  }
  return {
    name: data.name,
    description: data.description,
    instructionSource: data.instructionSource ?? 'inline',
    instructions: data.instructions,
    instructionFilePath: data.instructionFilePath ?? '',
    assignmentSource: data.assignmentSource ?? 'inline',
    assignment: data.assignment ?? '',
    assignmentFilePath: data.assignmentFilePath ?? '',
    modelConnectionId: Number(data.modelConnectionId),
    modelId: data.modelId,
    allowModelSelection: data.allowModelSelection,
    triggerNextAgent: data.triggerNextAgent ?? false,
    saveResultToFile: data.saveResultToFile ?? false,
    resultDirectory: data.resultDirectory ?? '',
    resultFilename: data.resultFilename ?? '',
    projectFilesystemPermissions: (data.projectFilesystemPermissions ?? {
      list: true,
      read: true,
      write: false,
      createDirectory: false,
      rename: false,
      delete: false,
    }) as AgentProjectFilesystemPermissions,
    attachedProjectFiles: (data.attachedProjectFiles ?? []) as string[],
    ...(data.timeoutMinutes !== undefined && { timeoutMinutes: data.timeoutMinutes }),
    ...(data.temperature !== undefined && { temperature: data.temperature }),
    ...(data.topP !== undefined && { topP: data.topP }),
    unloadModelAfterRun: data.unloadModelAfterRun ?? false,
  } as AgentData;
}

export class AgentRepository {
  constructor(private readonly db: Database) {}

  transaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }

  create(projectId: number, data: AgentData, nextAgentId: number | null = null): AgentRecord {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db
      .prepare(
        `INSERT INTO agents
           (project_id, next_agent_id, sort_order, created_at, updated_at, data)
         SELECT ?, ?, COALESCE(MAX(sort_order) + 1, 0), ?, ?, ?
         FROM agents
         WHERE project_id = ?`,
      )
      .run(projectId, nextAgentId, now, now, JSON.stringify(data), projectId);
    return {
      id: Number(result.lastInsertRowid),
      projectId,
      sortOrder: this.getSortOrder(Number(result.lastInsertRowid)),
      createdAt: now,
      updatedAt: now,
      data,
      nextAgentId,
      skillIds: [],
      toolNames: [],
      toolConfigurations: [],
    };
  }

  createAfter(projectId: number, sortOrder: number, data: AgentData): AgentRecord {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `UPDATE agents
         SET sort_order = sort_order + 1, updated_at = MAX(updated_at + 1, ?)
         WHERE project_id = ? AND sort_order > ?`,
      )
      .run(now, projectId, sortOrder);
    const result = this.db
      .prepare(
        `INSERT INTO agents
           (project_id, next_agent_id, sort_order, created_at, updated_at, data)
         VALUES (?, NULL, ?, ?, ?, ?)`,
      )
      .run(projectId, sortOrder + 1, now, now, JSON.stringify(data));
    return {
      id: Number(result.lastInsertRowid),
      projectId,
      sortOrder: sortOrder + 1,
      createdAt: now,
      updatedAt: now,
      data,
      nextAgentId: null,
      skillIds: [],
      toolNames: [],
      toolConfigurations: [],
    };
  }

  list(userId: number, projectId: number): AgentRecord[] {
    const rows = this.db
      .prepare(
        `SELECT a.id, a.project_id, a.next_agent_id, a.sort_order,
                a.created_at, a.updated_at, a.data
         FROM agents a
         INNER JOIN projects p ON p.id = a.project_id
         WHERE p.user_id = ? AND a.project_id = ?
         ORDER BY a.sort_order, a.id`,
      )
      .all(userId, projectId) as AgentRow[];
    return rows.map((row) => this.mapRow(row));
  }

  get(userId: number, projectId: number, agentId: number): AgentRecord | null {
    const row = this.db
      .prepare(
        `SELECT a.id, a.project_id, a.next_agent_id, a.sort_order,
                a.created_at, a.updated_at, a.data
         FROM agents a
         INNER JOIN projects p ON p.id = a.project_id
         WHERE p.user_id = ? AND a.project_id = ? AND a.id = ?`,
      )
      .get(userId, projectId, agentId) as AgentRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  update(
    userId: number,
    projectId: number,
    agentId: number,
    data: AgentData,
    nextAgentId: number | null = null,
  ): AgentRecord | null {
    const existing = this.get(userId, projectId, agentId);
    if (!existing) {
      return null;
    }
    const updatedAt = Math.max(Math.floor(Date.now() / 1000), existing.updatedAt + 1);
    const result = this.db
      .prepare(
        `UPDATE agents
         SET data = ?, next_agent_id = ?, updated_at = ?
         WHERE id = ? AND project_id = ?
           AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND user_id = ?)`,
      )
      .run(JSON.stringify(data), nextAgentId, updatedAt, agentId, projectId, projectId, userId);
    return result.changes === 0 ? null : this.get(userId, projectId, agentId);
  }

  replaceSkills(agentId: number, skillIds: readonly number[]): void {
    this.db.prepare('DELETE FROM agent_skills WHERE agent_id = ?').run(agentId);
    const insert = this.db.prepare(
      `INSERT INTO agent_skills
         (agent_id, skill_id, created_at, updated_at, data)
       VALUES (?, ?, ?, ?, '{}')`,
    );
    const now = Math.floor(Date.now() / 1000);
    for (const skillId of skillIds) {
      insert.run(agentId, skillId, now, now);
    }
  }

  replaceTools(
    agentId: number,
    toolNames: readonly string[],
    configurations: readonly AgentToolConfiguration[] = [],
  ): void {
    this.db.prepare('DELETE FROM agent_tools WHERE agent_id = ?').run(agentId);
    const insert = this.db.prepare(
      `INSERT INTO agent_tools
         (agent_id, tool_name, created_at, updated_at, data)
         VALUES (?, ?, ?, ?, ?)`,
    );
    const now = Math.floor(Date.now() / 1000);
    const enabledToolNames = new Set(toolNames);
    const configurationsByName = new Map(
      configurations.map((configuration) => [configuration.toolName, configuration]),
    );
    const persistedToolNames = new Set([...toolNames, ...configurationsByName.keys()]);
    for (const toolName of [...persistedToolNames].sort((left, right) => left.localeCompare(right))) {
      const configured = configurationsByName.get(toolName);
      insert.run(
        agentId,
        toolName,
        now,
        now,
        JSON.stringify({
          preRunInputFile: configured?.preRunInputFile ?? null,
          modelEnabled: enabledToolNames.has(toolName),
          ...(configured?.targetAgentId !== undefined
            ? { targetAgentId: configured.targetAgentId }
            : {}),
        }),
      );
    }
  }

  delete(userId: number, projectId: number, agentId: number): boolean {
    return (
      this.db
        .prepare(
          `DELETE FROM agents
           WHERE id = ? AND project_id = ?
             AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND user_id = ?)`,
        )
        .run(agentId, projectId, projectId, userId).changes > 0
    );
  }

  reorder(userId: number, projectId: number, agentIds: readonly number[]): boolean {
    return this.transaction(() => {
      const currentIds = this.list(userId, projectId).map((agent) => agent.id);
      if (
        currentIds.length !== agentIds.length ||
        currentIds.some((agentId) => !agentIds.includes(agentId))
      ) {
        return false;
      }
      const now = Math.floor(Date.now() / 1000);
      const update = this.db.prepare(
        `UPDATE agents
         SET sort_order = ?, updated_at = MAX(updated_at + 1, ?)
         WHERE id = ? AND project_id = ?`,
      );
      for (const [sortOrder, agentId] of agentIds.entries()) {
        if (update.run(sortOrder, now, agentId, projectId).changes !== 1) {
          throw new Error('Failed to reorder Agent');
        }
      }
      return true;
    });
  }

  deactivateIncomingReferences(projectId: number, agentId: number): void {
    const rows = this.db
      .prepare('SELECT id, data FROM agents WHERE project_id = ? AND next_agent_id = ?')
      .all(projectId, agentId) as Array<{ id: number; data: string }>;
    const update = this.db.prepare(
      'UPDATE agents SET next_agent_id = NULL, data = ?, updated_at = MAX(updated_at + 1, ?) WHERE id = ?',
    );
    const now = Math.floor(Date.now() / 1000);
    for (const row of rows) {
      const data = parseAgentData(row.data);
      update.run(JSON.stringify({ ...data, triggerNextAgent: false }), now, row.id);
    }
  }

  private mapRow(row: AgentRow): AgentRecord {
    const skillIds = this.db
      .prepare('SELECT skill_id FROM agent_skills WHERE agent_id = ? ORDER BY skill_id')
      .all(row.id) as Array<{ skill_id: number }>;
    const tools = this.db
      .prepare('SELECT tool_name, data FROM agent_tools WHERE agent_id = ? ORDER BY tool_name')
      .all(row.id) as Array<{ tool_name: string; data: string }>;
    const parsedTools = tools.map((item) => {
      const parsed = JSON.parse(item.data) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Invalid Agent tool data');
      }
      const data = parsed as Record<string, unknown>;
      if (
        Object.keys(data).some(
          (key) => key !== 'preRunInputFile' && key !== 'modelEnabled' && key !== 'targetAgentId',
        ) ||
        (data.preRunInputFile !== undefined &&
          data.preRunInputFile !== null &&
          typeof data.preRunInputFile !== 'string') ||
        (data.modelEnabled !== undefined && typeof data.modelEnabled !== 'boolean') ||
        (data.targetAgentId !== undefined &&
          data.targetAgentId !== null &&
          (!Number.isSafeInteger(data.targetAgentId) || Number(data.targetAgentId) <= 0))
      ) {
        throw new Error('Invalid Agent tool data');
      }
      return {
        toolName: item.tool_name,
        preRunInputFile:
          typeof data.preRunInputFile === 'string' ? data.preRunInputFile : null,
        modelEnabled: data.modelEnabled ?? true,
        ...(data.targetAgentId !== undefined
          ? { targetAgentId: data.targetAgentId === null ? null : Number(data.targetAgentId) }
          : {}),
      };
    });
    return {
      id: row.id,
      projectId: row.project_id,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      data: parseAgentData(row.data),
      nextAgentId: row.next_agent_id,
      skillIds: skillIds.map((item) => item.skill_id),
      toolNames: parsedTools.filter((item) => item.modelEnabled).map((item) => item.toolName),
      toolConfigurations: parsedTools.map(({ toolName, preRunInputFile, targetAgentId }) => ({
        toolName,
        preRunInputFile,
        ...(targetAgentId !== undefined ? { targetAgentId } : {}),
      })),
    };
  }

  private getSortOrder(agentId: number): number {
    const row = this.db.prepare('SELECT sort_order FROM agents WHERE id = ?').get(agentId) as
      | { sort_order: number }
      | undefined;
    if (!row) throw new Error('Failed to load Agent order');
    return row.sort_order;
  }
}
