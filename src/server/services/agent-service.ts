import type {
  Agent,
  AgentData,
  AgentInput,
  AgentRecord,
  AgentToolConfiguration,
} from '../agent-types.js';
import type { AgentRepository } from '../repositories/agent-repository.js';
import type { ProjectRepository } from '../repositories/project-repository.js';
import type { ModelConnectionService } from './model-connection-service.js';
import type { SkillService } from './skill-service.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { AgentRunRepository } from '../repositories/agent-run-repository.js';
import type { AgentProjectFilesystemPermissions } from '../agent-types.js';
import { isAgentPromptFilePath } from '../agent-prompt-file.js';
import { RUN_AGENT_TOOL_NAME } from '../tool-types.js';
import {
  DEFAULT_AGENT_RUNTIME_LIMITS_PROVIDER,
  type AgentRuntimeLimits,
  type AgentRuntimeLimitsProvider,
} from '../runtime-limits.js';

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_RESULT_PATH_LENGTH = 2_048;

export const DEFAULT_AGENT_TIMEOUT_MINUTES = 30;
export const DEFAULT_AGENT_TEMPERATURE = 0.8;
export const DEFAULT_AGENT_TOP_P = 0.8;

type AgentErrorCode =
  | 'INVALID_INPUT'
  | 'PROJECT_NOT_FOUND'
  | 'INVALID_MODEL_CONNECTION'
  | 'MODEL_NOT_ALLOWED'
  | 'INVALID_SKILL'
  | 'INVALID_NEXT_AGENT'
  | 'AGENT_CHAIN_CYCLE'
  | 'UNKNOWN_TOOL'
  | 'INVALID_AGENT_RUNNER_TARGET'
  | 'ACTIVE_RUN_EXISTS'
  | 'PERSISTENCE_FAILED';

export class AgentError extends Error {
  constructor(readonly code: AgentErrorCode) {
    super(code);
    this.name = 'AgentError';
  }
}

export type AgentServiceConstructor = new (
  repository: AgentRepository,
  projectRepository: ProjectRepository,
  modelConnections: Pick<
    ModelConnectionService,
    'getConnectionById' | 'isModelVisible'
  >,
  skills: Pick<SkillService, 'listAvailable'>,
  tools: Pick<ToolRegistry, 'get'>,
  currentUserId: () => number,
  runs?: Pick<AgentRunRepository, 'getActive'>,
  runtimeLimits?: AgentRuntimeLimitsProvider,
) => AgentService;

function parseProjectFilesystemPermissions(value: unknown): AgentProjectFilesystemPermissions {
  if (value === undefined || value === null) {
    return { list: true, read: true, write: false, createDirectory: false, rename: false, delete: false };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AgentError('INVALID_INPUT');
  }
  const input = value as Record<string, unknown>;
  const requiredKeys: (keyof AgentProjectFilesystemPermissions)[] = [
    'list',
    'read',
    'write',
    'createDirectory',
    'rename',
    'delete',
  ];
  for (const key of requiredKeys) {
    if (!(key in input) || typeof input[key] !== 'boolean') {
      throw new AgentError('INVALID_INPUT');
    }
  }
  return {
    list: Boolean(input.list),
    read: Boolean(input.read),
    write: Boolean(input.write),
    createDirectory: Boolean(input.createDirectory),
    rename: Boolean(input.rename),
    delete: Boolean(input.delete),
  };
}

function requireText(value: unknown, maxLength: number, allowEmpty: boolean): string {
  if (typeof value !== 'string') {
    throw new AgentError('INVALID_INPUT');
  }
  const text = value.trim();
  if ((!allowEmpty && text.length === 0) || text.length > maxLength) {
    throw new AgentError('INVALID_INPUT');
  }
  return text;
}

function createCopyName(sourceName: string, existingNames: ReadonlySet<string>): string {
  for (let copyNumber = 1; ; copyNumber += 1) {
    const suffix = copyNumber === 1 ? ' copy' : ` copy ${copyNumber}`;
    const base = sourceName.slice(0, MAX_NAME_LENGTH - suffix.length).trimEnd();
    const candidate = requireText(`${base}${suffix}`, MAX_NAME_LENGTH, false);
    if (!existingNames.has(candidate)) return candidate;
  }
}

function requireModelId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 500) {
    throw new AgentError('INVALID_INPUT');
  }
  return value;
}

function parseUniquePositiveIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new AgentError('INVALID_INPUT');
  }
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const item of value) {
    if (!Number.isSafeInteger(item) || Number(item) <= 0 || seen.has(Number(item))) {
      throw new AgentError('INVALID_INPUT');
    }
    seen.add(Number(item));
    ids.push(Number(item));
  }
  return ids.sort((left, right) => left - right);
}

function parseOrder(value: unknown): number[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(value, 'agentIds')
  ) {
    throw new AgentError('INVALID_INPUT');
  }
  const agentIds = (value as Record<string, unknown>).agentIds;
  if (!Array.isArray(agentIds)) throw new AgentError('INVALID_INPUT');
  const seen = new Set<number>();
  return agentIds.map((agentId) => {
    if (!Number.isSafeInteger(agentId) || Number(agentId) <= 0 || seen.has(Number(agentId))) {
      throw new AgentError('INVALID_INPUT');
    }
    seen.add(Number(agentId));
    return Number(agentId);
  });
}

function parseUniqueToolNames(value: unknown, registry: Pick<ToolRegistry, 'get'>): string[] {
  if (!Array.isArray(value)) {
    throw new AgentError('INVALID_INPUT');
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || seen.has(item)) {
      throw new AgentError('INVALID_INPUT');
    }
    if (!registry.get(item)) {
      throw new AgentError('UNKNOWN_TOOL');
    }
    seen.add(item);
    names.push(item);
  }
  return names.sort((left, right) => left.localeCompare(right));
}

function parsePreRunInputFile(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AgentError('INVALID_INPUT');
  const path = value.trim();
  if (
    path.length === 0 ||
    path.length > MAX_RESULT_PATH_LENGTH ||
    path.includes('\0') ||
    path.includes('\\') ||
    path.includes(':') ||
    path.startsWith('/') ||
    /%(?:2e|2f|5c)/i.test(path) ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') ||
    !path.toLowerCase().endsWith('.json')
  ) {
    throw new AgentError('INVALID_INPUT');
  }
  return path;
}

function parseToolConfigurations(
  value: unknown,
  toolNames: readonly string[],
  registry: Pick<ToolRegistry, 'get'>,
): AgentToolConfiguration[] {
  if (value === undefined) {
    return toolNames.map((toolName) => ({ toolName, preRunInputFile: null }));
  }
  if (!Array.isArray(value)) {
    throw new AgentError('INVALID_INPUT');
  }
  const configurations = value.map((item): AgentToolConfiguration => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new AgentError('INVALID_INPUT');
    }
    const input = item as Record<string, unknown>;
    if (
      Object.keys(input).some(
        (key) => key !== 'toolName' && key !== 'preRunInputFile' && key !== 'targetAgentId',
      ) ||
      typeof input.toolName !== 'string' ||
      input.toolName.length === 0
    ) {
      throw new AgentError('INVALID_INPUT');
    }
    if (!registry.get(input.toolName)) {
      throw new AgentError('UNKNOWN_TOOL');
    }
    if (input.toolName !== RUN_AGENT_TOOL_NAME && input.targetAgentId !== undefined) {
      throw new AgentError('INVALID_INPUT');
    }
    const targetAgentId = input.targetAgentId;
    if (
      targetAgentId !== undefined &&
      targetAgentId !== null &&
      (!Number.isSafeInteger(targetAgentId) || Number(targetAgentId) <= 0)
    ) {
      throw new AgentError('INVALID_INPUT');
    }
    return {
      toolName: input.toolName,
      preRunInputFile: parsePreRunInputFile(input.preRunInputFile),
      ...(input.toolName === RUN_AGENT_TOOL_NAME
        ? { targetAgentId: targetAgentId == null ? null : Number(targetAgentId) }
        : {}),
    };
  });
  if (new Set(configurations.map((item) => item.toolName)).size !== configurations.length) {
    throw new AgentError('INVALID_INPUT');
  }
  return configurations.sort((left, right) => left.toolName.localeCompare(right.toolName));
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'boolean') throw new AgentError('INVALID_INPUT');
  return value;
}

function parseOptionalString(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > MAX_RESULT_PATH_LENGTH) {
    throw new AgentError('INVALID_INPUT');
  }
  return value.trim();
}

function validateResultDestination(directory: string, filename: string): void {
  if (
    directory.includes('\0') ||
    directory.includes('\\') ||
    directory.includes(':') ||
    directory.startsWith('/') ||
    /^[a-zA-Z]:/.test(directory) ||
    /%(?:2e|2f|5c)/i.test(directory)
  ) {
    throw new AgentError('INVALID_INPUT');
  }
  if (directory !== '') {
    const segments = directory.split('/');
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
      throw new AgentError('INVALID_INPUT');
    }
  }
  if (
    filename.length === 0 ||
    filename === '.' ||
    filename === '..' ||
    filename.includes('\0') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes(':') ||
    /%(?:2e|2f|5c)/i.test(filename)
  ) {
    throw new AgentError('INVALID_INPUT');
  }
}

function parsePromptSource(value: unknown): 'inline' | 'file' {
  if (value === undefined) return 'inline';
  if (value !== 'inline' && value !== 'file') throw new AgentError('INVALID_INPUT');
  return value;
}

function parseInstructionSource(value: unknown): AgentData['instructionSource'] {
  if (value === undefined) return 'none';
  if (value !== 'inline' && value !== 'file' && value !== 'none') {
    throw new AgentError('INVALID_INPUT');
  }
  return value;
}

function parsePromptFilePath(value: unknown, required: boolean): string {
  const path = parseOptionalString(value);
  if ((required && path.length === 0) || (path.length > 0 && !isAgentPromptFilePath(path))) {
    throw new AgentError('INVALID_INPUT');
  }
  return path;
}

function parseAttachedProjectFiles(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new AgentError('INVALID_INPUT');
  }
  return value.map((item) => {
    if (typeof item !== 'string') {
      throw new AgentError('INVALID_INPUT');
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) {
      throw new AgentError('INVALID_INPUT');
    }
    return trimmed;
  });
}

function parseTimeoutMinutes(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AgentError('INVALID_INPUT');
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AgentError('INVALID_INPUT');
  }
  return value;
}

function parseInferenceParam(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AgentError('INVALID_INPUT');
  }
  if (value < 0 || value > 1) {
    throw new AgentError('INVALID_INPUT');
  }
  return value;
}

function parseInput(
  value: unknown,
  registry: Pick<ToolRegistry, 'get'>,
  runtimeLimits: AgentRuntimeLimits,
): AgentInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AgentError('INVALID_INPUT');
  }
  const input = value as Record<string, unknown>;
  const required = [
    'name',
    'description',
    'instructions',
    'assignment',
    'modelConnectionId',
    'modelId',
    'skillIds',
    'toolNames',
  ];
  const allowed = new Set([
    ...required,
    'allowModelSelection',
    'triggerNextAgent',
    'nextAgentId',
    'saveResultToFile',
    'resultDirectory',
    'resultFilename',
    'instructionSource',
    'instructionFilePath',
    'assignmentSource',
    'assignmentFilePath',
    'projectFilesystemPermissions',
    'attachedProjectFiles',
    'timeoutMinutes',
    'temperature',
    'topP',
    'unloadModelAfterRun',
    'toolConfigurations',
  ]);
  const fields = Object.keys(input);
  if (required.some((field) => !fields.includes(field)) || fields.some((field) => !allowed.has(field))) {
    throw new AgentError('INVALID_INPUT');
  }
  if (!Number.isSafeInteger(input.modelConnectionId) || Number(input.modelConnectionId) <= 0) {
    throw new AgentError('INVALID_INPUT');
  }
  const triggerNextAgent = parseBoolean(input.triggerNextAgent, false);
  const saveResultToFile = parseBoolean(input.saveResultToFile, false);
  const instructionSource = parseInstructionSource(input.instructionSource);
  const instructions = requireText(
    input.instructions,
    runtimeLimits.inlineInstructionsCharacters,
    true,
  );
  const instructionFilePath =
    instructionSource === 'file'
      ? parsePromptFilePath(input.instructionFilePath, true)
      : parseOptionalString(input.instructionFilePath);
  const assignmentSource = parsePromptSource(input.assignmentSource);
  const assignmentFilePath = parsePromptFilePath(
    input.assignmentFilePath,
    assignmentSource === 'file',
  );
  const resultDirectory = parseOptionalString(input.resultDirectory);
  const resultFilename = parseOptionalString(input.resultFilename);
  if (
    triggerNextAgent &&
    (!Number.isSafeInteger(input.nextAgentId) || Number(input.nextAgentId) <= 0)
  ) {
    throw new AgentError('INVALID_INPUT');
  }
  if (saveResultToFile) validateResultDestination(resultDirectory, resultFilename);
  const toolNames = parseUniqueToolNames(input.toolNames, registry);
  return {
    name: requireText(input.name, MAX_NAME_LENGTH, false),
    description: requireText(input.description, MAX_DESCRIPTION_LENGTH, true),
    instructionSource,
    instructions,
    instructionFilePath,
    assignmentSource,
    assignment: requireText(input.assignment, runtimeLimits.assignmentCharacters, true),
    assignmentFilePath,
    modelConnectionId: Number(input.modelConnectionId),
    modelId: requireModelId(input.modelId),
    allowModelSelection: parseBoolean(input.allowModelSelection, false),
    triggerNextAgent,
    nextAgentId: triggerNextAgent ? Number(input.nextAgentId) : null,
    saveResultToFile,
    resultDirectory: saveResultToFile ? resultDirectory : '',
    resultFilename: saveResultToFile ? resultFilename : '',
    skillIds: parseUniquePositiveIds(input.skillIds),
    toolNames,
    toolConfigurations: parseToolConfigurations(input.toolConfigurations, toolNames, registry),
    projectFilesystemPermissions: parseProjectFilesystemPermissions(input.projectFilesystemPermissions),
    attachedProjectFiles: parseAttachedProjectFiles(input.attachedProjectFiles),
    timeoutMinutes: parseTimeoutMinutes(input.timeoutMinutes),
    temperature: parseInferenceParam(input.temperature),
    topP: parseInferenceParam(input.topP),
    unloadModelAfterRun: parseBoolean(input.unloadModelAfterRun, false),
  };
}

function toAgent(record: AgentRecord): Agent {
  return {
    id: record.id,
    projectId: record.projectId,
    sortOrder: record.sortOrder,
    nextAgentId: record.nextAgentId,
    ...record.data,
    skillIds: [...record.skillIds],
    toolNames: [...record.toolNames],
    toolConfigurations: record.toolConfigurations.map((configuration) => ({ ...configuration })),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class AgentService {
  constructor(
    private readonly repository: AgentRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly modelConnections: Pick<
      ModelConnectionService,
      'getConnectionById' | 'isModelVisible'
    >,
    private readonly skills: Pick<SkillService, 'listAvailable'>,
    private readonly tools: Pick<ToolRegistry, 'get'>,
    private readonly currentUserId: () => number,
    private readonly runs?: Pick<AgentRunRepository, 'getActive'>,
    private readonly runtimeLimits: AgentRuntimeLimitsProvider = DEFAULT_AGENT_RUNTIME_LIMITS_PROVIDER,
  ) {}

  async list(projectId: number): Promise<Agent[] | null> {
    const userId = this.currentUserId();
    if (!this.projectRepository.getById(userId, projectId)) {
      return null;
    }
    return this.repository.list(userId, projectId).map(toAgent);
  }

  async get(projectId: number, agentId: number): Promise<Agent | null> {
    const record = this.repository.get(this.currentUserId(), projectId, agentId);
    return record ? toAgent(record) : null;
  }

  async create(projectId: number, value: unknown): Promise<Agent | null> {
    const input = parseInput(value, this.tools, await this.runtimeLimits.getAgentRuntimeLimits());
    const userId = this.currentUserId();
    if (!this.projectRepository.getById(userId, projectId)) {
      return null;
    }
    await this.validateReferences(userId, projectId, null, input);
    try {
      const created = this.repository.transaction(() => {
        const record = this.repository.create(projectId, this.toData(input), input.nextAgentId);
        this.repository.replaceSkills(record.id, input.skillIds);
        this.repository.replaceTools(record.id, input.toolNames, input.toolConfigurations);
        return this.repository.get(userId, projectId, record.id);
      });
      if (!created) {
        throw new AgentError('PERSISTENCE_FAILED');
      }
      return toAgent(created);
    } catch (error) {
      if (error instanceof AgentError) {
        throw error;
      }
      throw new AgentError('PERSISTENCE_FAILED');
    }
  }

  async copy(projectId: number, agentId: number): Promise<Agent | null> {
    const userId = this.currentUserId();
    try {
      const copied = this.repository.transaction(() => {
        const source = this.repository.get(userId, projectId, agentId);
        if (!source) return null;
        const projectAgents = this.repository.list(userId, projectId);
        const name = createCopyName(
          source.data.name,
          new Set(projectAgents.map((agent) => agent.data.name)),
        );
        const record = this.repository.createAfter(source.projectId, source.sortOrder, {
          ...source.data,
          name,
          triggerNextAgent: false,
        });
        this.repository.replaceSkills(record.id, source.skillIds);
        this.repository.replaceTools(record.id, source.toolNames, source.toolConfigurations);
        return this.repository.get(userId, projectId, record.id);
      });
      if (!copied) return null;
      return toAgent(copied);
    } catch {
      throw new AgentError('PERSISTENCE_FAILED');
    }
  }

  async update(projectId: number, agentId: number, value: unknown): Promise<Agent | null> {
    const input = parseInput(value, this.tools, await this.runtimeLimits.getAgentRuntimeLimits());
    const userId = this.currentUserId();
    if (!this.repository.get(userId, projectId, agentId)) {
      return null;
    }
    await this.validateReferences(userId, projectId, agentId, input);
    try {
      const updated = this.repository.transaction(() => {
        const record = this.repository.update(
          userId,
          projectId,
          agentId,
          this.toData(input),
          input.nextAgentId,
        );
        if (!record) {
          return null;
        }
        this.repository.replaceSkills(agentId, input.skillIds);
        this.repository.replaceTools(agentId, input.toolNames, input.toolConfigurations);
        return this.repository.get(userId, projectId, agentId);
      });
      return updated ? toAgent(updated) : null;
    } catch {
      throw new AgentError('PERSISTENCE_FAILED');
    }
  }

  async reorder(projectId: number, value: unknown): Promise<Agent[] | null> {
    const agentIds = parseOrder(value);
    const userId = this.currentUserId();
    if (!this.projectRepository.getById(userId, projectId)) return null;
    try {
      if (!this.repository.reorder(userId, projectId, agentIds)) {
        throw new AgentError('INVALID_INPUT');
      }
      return this.repository.list(userId, projectId).map(toAgent);
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError('PERSISTENCE_FAILED');
    }
  }

  async delete(projectId: number, agentId: number): Promise<boolean> {
    const userId = this.currentUserId();
    if (!this.repository.get(userId, projectId, agentId)) return false;
    if (this.runs?.getActive(userId, projectId, agentId)) {
      throw new AgentError('ACTIVE_RUN_EXISTS');
    }
    try {
      return this.repository.transaction(() => {
        this.repository.deactivateIncomingReferences(projectId, agentId);
        return this.repository.delete(userId, projectId, agentId);
      });
    } catch {
      throw new AgentError('PERSISTENCE_FAILED');
    }
  }

  private async validateReferences(
    userId: number,
    projectId: number,
    agentId: number | null,
    input: AgentInput,
  ): Promise<void> {
    const connection = await this.modelConnections.getConnectionById(input.modelConnectionId);
    if (!connection || !connection.data.enabled) {
      throw new AgentError('INVALID_MODEL_CONNECTION');
    }
    if (!(await this.modelConnections.isModelVisible(input.modelConnectionId, input.modelId))) {
      throw new AgentError('MODEL_NOT_ALLOWED');
    }
    const availableSkillIds = new Set((await this.skills.listAvailable()).map((skill) => skill.id));
    if (input.skillIds.some((skillId) => !availableSkillIds.has(skillId))) {
      throw new AgentError('INVALID_SKILL');
    }
    if (input.nextAgentId !== null) {
      if (input.nextAgentId === agentId) throw new AgentError('INVALID_NEXT_AGENT');
      if (!this.repository.get(userId, projectId, input.nextAgentId)) {
        throw new AgentError('INVALID_NEXT_AGENT');
      }
      if (agentId !== null) this.validateNoCycle(userId, projectId, agentId, input.nextAgentId);
    }
    const runnerConfiguration = input.toolConfigurations.find(
      (configuration) => configuration.toolName === RUN_AGENT_TOOL_NAME,
    );
    const runnerTargetId = runnerConfiguration?.targetAgentId ?? null;
    const runnerEnabled = input.toolNames.includes(RUN_AGENT_TOOL_NAME);
    if (agentId !== null && runnerTargetId === agentId) {
      throw new AgentError('INVALID_AGENT_RUNNER_TARGET');
    }
    if (
      runnerEnabled &&
      (runnerTargetId === null || !this.repository.get(userId, projectId, runnerTargetId))
    ) {
      throw new AgentError('INVALID_AGENT_RUNNER_TARGET');
    }
  }

  private validateNoCycle(
    userId: number,
    projectId: number,
    agentId: number,
    nextAgentId: number,
  ): void {
    const visited = new Set<number>([agentId]);
    let currentId: number | null = nextAgentId;
    while (currentId !== null) {
      if (visited.has(currentId)) throw new AgentError('AGENT_CHAIN_CYCLE');
      visited.add(currentId);
      const current = this.repository.get(userId, projectId, currentId);
      if (!current) throw new AgentError('INVALID_NEXT_AGENT');
      currentId = current.data.triggerNextAgent ? current.nextAgentId : null;
    }
  }

  private toData(input: AgentInput): AgentData {
    return {
      name: input.name,
      description: input.description,
      instructionSource: input.instructionSource,
      instructions: input.instructions,
      instructionFilePath: input.instructionFilePath,
      assignmentSource: input.assignmentSource,
      assignment: input.assignment,
      assignmentFilePath: input.assignmentFilePath,
      modelConnectionId: input.modelConnectionId,
      modelId: input.modelId,
      allowModelSelection: input.allowModelSelection,
      triggerNextAgent: input.triggerNextAgent,
      saveResultToFile: input.saveResultToFile,
      resultDirectory: input.resultDirectory,
      resultFilename: input.resultFilename,
      projectFilesystemPermissions: input.projectFilesystemPermissions,
      attachedProjectFiles: input.attachedProjectFiles,
      timeoutMinutes: input.timeoutMinutes,
      temperature: input.temperature,
      topP: input.topP,
      unloadModelAfterRun: input.unloadModelAfterRun,
    };
  }
}
