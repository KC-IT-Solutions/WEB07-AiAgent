import type { AgentRun, AgentRunErrorLogEntry, AgentRunEvent, AgentRunExecutionEvent, AgentRunRecord, AgentRunSafeError } from '../agent-run-types.js';
import {
  safeExecutionJson,
  safeExecutionText,
  safeToolArgumentsJson,
} from '../agent-execution-safety.js';
import type { AgentRepository } from '../repositories/agent-repository.js';
import type { AgentRecord } from '../agent-types.js';
import type { AgentProjectFilesystemPermissions } from '../agent-types.js';
import type { AgentRunRepository } from '../repositories/agent-run-repository.js';
import type { ProjectFilesystemService } from './project-filesystem-service.js';
import { ProjectFilesystemError } from './project-filesystem-service.js';
import type { ModelConnectionService } from './model-connection-service.js';
import type { ModelConnectionInferenceQueue } from './model-connection-inference-queue.js';
import { SkillError, type SkillService } from './skill-service.js';
import type { ToolSettingsService } from './tool-settings-service.js';
import {
  InvalidToolArgumentsError,
  RecoverableToolError,
  RUN_AGENT_TOOL_NAME,
  type ToolSettings,
} from '../tool-types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import {
  createProjectFilesystemTools,
  type ProjectFilesystemTool,
} from '../tools/project-filesystem-tools.js';
import {
  ModelInferenceError,
  requestStreamedModelInference,
  type ModelInferenceMessage,
  type ModelInferenceResult,
  type ModelToolDefinition,
  type OpenAICompatibleTransport,
  type StreamedModelInferencePartialResult,
} from '../../services/model-inference.js';
import type { StructuredLogger } from '../logging/logger.js';
import type { LmStudioModelLifecycleService } from './lm-studio-model-lifecycle.js';
import { isAgentPromptFilePath } from '../agent-prompt-file.js';
import {
  DEFAULT_AGENT_RUNTIME_LIMITS_PROVIDER,
  type AgentRuntimeLimits,
  type AgentRuntimeLimitsProvider,
} from '../runtime-limits.js';

function formatLocalCalendarDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DEFAULT_AGENT_TIMEOUT_MINUTES = 30;
const DEFAULT_AGENT_TEMPERATURE = 0.8;
const DEFAULT_AGENT_TOP_P = 0.8;

export type AgentRunErrorCode =
  | 'INVALID_INPUT'
  | 'AGENT_NOT_FOUND'
  | 'RUN_NOT_FOUND'
  | 'ACTIVE_RUN_EXISTS'
  | 'INVALID_TRANSITION'
  | 'PERSISTENCE_FAILED';

export class AgentRunError extends Error {
  constructor(readonly code: AgentRunErrorCode) {
    super(code);
    this.name = 'AgentRunError';
  }
}

type ModelInferenceRequester = (
  baseUrl: string,
  timeoutMinutes: number,
  modelId: string,
  messages: ModelInferenceMessage[],
  tools?: ModelToolDefinition[],
  transport?: OpenAICompatibleTransport,
  signal?: AbortSignal,
  apiKey?: string,
  temperature?: number,
  topP?: number,
) => Promise<ModelInferenceResult | StreamedModelInferencePartialResult>;

interface ActiveExecution {
  controller: AbortController;
  wake: (() => void) | null;
  agentAncestry: ReadonlySet<number>;
  runtimeLimits: Readonly<AgentRuntimeLimits>;
}

class ExecutionStopped extends Error {}
class AgentModelNotAllowedError extends Error {}
class SkillLoadError extends Error {}
class SkillTooLargeError extends Error {}
class ToolResolutionError extends Error {}
class AttachedFileUnavailableError extends Error {}
class AssignmentTooLargeError extends Error {
  constructor(
    readonly actualCharacters?: number,
    readonly limitCharacters?: number,
  ) {
    super('Assignment too large');
  }
}
class InstructionTooLargeError extends Error {
  constructor(
    readonly actualCharacters: number,
    readonly limitCharacters: number,
  ) {
    super('Instructions too large');
  }
}
class AttachedFileTooLargeError extends Error {
  constructor(
    readonly inputFile?: string,
    readonly actualBytes?: number,
    readonly limitBytes?: number,
  ) {
    super('Attached file too large');
  }
}
class AttachedFilesTotalTooLargeError extends Error {
  constructor(
    readonly actualBytes: number,
    readonly limitBytes: number,
    readonly inputFile: string,
  ) {
    super('Attached files too large');
  }
}
class ToolResultTooLargeError extends Error {
  constructor(
    readonly toolName: string,
    readonly actualCharacters: number,
    readonly limitCharacters: number,
    readonly inputFile?: string,
    readonly callIndex?: number,
  ) {
    super('Tool result too large');
  }
}
type PreRunErrorCode =
  | 'PRE_RUN_INPUT_FILE_UNAVAILABLE'
  | 'PRE_RUN_INPUT_TOO_LARGE'
  | 'PRE_RUN_INPUT_FILE_OUTSIDE_PROJECT'
  | 'PRE_RUN_INPUT_INVALID_JSON'
  | 'PRE_RUN_INPUT_NOT_ARRAY'
  | 'PRE_RUN_INPUT_ITEM_NOT_OBJECT'
  | 'PRE_RUN_ARGUMENTS_INVALID'
  | 'PRE_RUN_TOOL_UNAVAILABLE'
  | 'PRE_RUN_TOOL_EXECUTION_FAILED';

const PRE_RUN_ERROR_MESSAGES: Record<PreRunErrorCode, string> = {
  PRE_RUN_INPUT_FILE_UNAVAILABLE: 'A configured pre-run input file could not be read.',
  PRE_RUN_INPUT_TOO_LARGE: 'A configured pre-run input file is too large.',
  PRE_RUN_INPUT_FILE_OUTSIDE_PROJECT: 'A configured pre-run input file is outside the Project.',
  PRE_RUN_INPUT_INVALID_JSON: 'A configured pre-run input file contains invalid JSON.',
  PRE_RUN_INPUT_NOT_ARRAY: 'A configured pre-run input file must contain a JSON array.',
  PRE_RUN_INPUT_ITEM_NOT_OBJECT: 'Every pre-run input entry must be a JSON object.',
  PRE_RUN_ARGUMENTS_INVALID: 'A pre-run input entry is invalid for its configured tool.',
  PRE_RUN_TOOL_UNAVAILABLE: 'A configured pre-run tool is unavailable.',
  PRE_RUN_TOOL_EXECUTION_FAILED: 'A configured pre-run tool invocation failed.',
};

interface PreRunErrorContext {
  toolName: string;
  inputFile: string;
  callIndex?: number;
  arguments?: string;
}

class PreRunInitializationError extends Error {
  readonly metadata: Omit<AgentRunSafeError, 'stage' | 'code' | 'message'>;

  constructor(
    readonly code: PreRunErrorCode,
    context: PreRunErrorContext,
    source?: unknown,
  ) {
    super(PRE_RUN_ERROR_MESSAGES[code]);
    this.name = 'PreRunInitializationError';
    const sourceRecord =
      typeof source === 'object' && source !== null ? (source as Record<string, unknown>) : null;
    const sourceError = source instanceof Error ? source : null;
    this.metadata = {
      toolName: safeExecutionText(context.toolName),
      inputFile: safeExecutionText(context.inputFile),
      ...(context.callIndex !== undefined ? { callIndex: context.callIndex } : {}),
      ...(context.arguments !== undefined ? { arguments: context.arguments } : {}),
      ...(typeof sourceRecord?.code === 'string'
        ? { errorCode: safeExecutionText(sourceRecord.code) }
        : { errorCode: code }),
      ...(typeof sourceRecord?.limitBytes === 'number'
        ? { limitBytes: sourceRecord.limitBytes }
        : {}),
      errorName: safeExecutionText(sourceError?.name ?? this.name),
      errorMessage: safeExecutionText(sourceError?.message ?? this.message),
    };
  }
}

interface EffectiveTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(argumentsValue: unknown, signal: AbortSignal): Promise<unknown>;
}

interface PreRunToolResult {
  toolName: string;
  inputFile: string;
  calls: Array<{ argumentsValue: Record<string, unknown>; serializedResult: string }>;
}

function serializeModelToolResult(
  value: unknown,
  context: { toolName: string; inputFile?: string; callIndex?: number },
  limitCharacters: number,
): string {
  const serialized = JSON.stringify(value) ?? 'null';
  if (serialized.length > limitCharacters) {
    throw new ToolResultTooLargeError(
      context.toolName,
      serialized.length,
      limitCharacters,
      context.inputFile,
      context.callIndex,
    );
  }
  return serialized;
}

function hasValidSchemaType(value: unknown, schemaValue: unknown): boolean {
  if (typeof schemaValue !== 'object' || schemaValue === null || Array.isArray(schemaValue)) {
    return true;
  }
  const schema = schemaValue as Record<string, unknown>;
  if (schema.type === 'string') return typeof value === 'string';
  if (schema.type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (schema.type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value);
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'array') {
    return (
      Array.isArray(value) &&
      (typeof schema.maxItems !== 'number' || value.length <= schema.maxItems) &&
      value.every((item) => hasValidSchemaType(item, schema.items))
    );
  }
  if (schema.type !== 'object') return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const properties =
    typeof schema.properties === 'object' && schema.properties !== null && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((field): field is string => typeof field === 'string')
    : [];
  return (
    required.every((field) => Object.prototype.hasOwnProperty.call(input, field)) &&
    (schema.additionalProperties !== false || Object.keys(input).every((field) => field in properties)) &&
    Object.entries(input).every(
      ([field, fieldValue]) => !(field in properties) || hasValidSchemaType(fieldValue, properties[field]),
    )
  );
}

function toolFailure(code: string, message: string): Record<string, unknown> {
  return { ok: false, error: { code, message } };
}

function toRun(record: AgentRunRecord): AgentRun {
  return {
    id: record.id,
    agentId: record.agentId,
    projectId: record.projectId,
    triggeredByRunId: record.triggeredByRunId,
    previousAgentId: record.previousAgentId,
    chainRootRunId: record.chainRootRunId,
    status: record.status,
    task: record.data.task,
    finalResult: record.data.finalResult,
    latestTotalTokens: record.data.latestTotalTokens,
    safeError: record.data.safeError,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function requireEffectiveAssignment(value: string, limitCharacters: number): string {
  const task = value.trim();
  if (task.length > limitCharacters) {
    throw new AssignmentTooLargeError(task.length, limitCharacters);
  }
  if (task.length === 0) {
    throw new AgentRunError('INVALID_INPUT');
  }
  return task;
}

export class AgentRunService {
  private readonly activeExecutions = new Map<number, ActiveExecution>();

  constructor(
    private readonly runs: AgentRunRepository,
    private readonly agents: AgentRepository,
    private readonly filesystem: Pick<
      ProjectFilesystemService,
      'listDirectory' | 'readFile' | 'writeFile' | 'createDirectory' | 'renameEntry' | 'deleteEntry'
    >,
    private readonly modelConnections: Pick<
      ModelConnectionService,
      'getConnectionForInference' | 'isModelVisible'
    >,
    private readonly inferenceQueue: ModelConnectionInferenceQueue,
    private readonly currentUserId: () => number,
    private readonly requestInference: ModelInferenceRequester = requestStreamedModelInference,
    private readonly skills?: Pick<SkillService, 'get'>,
    private readonly toolRegistry?: Pick<ToolRegistry, 'get' | 'execute'>,
    private readonly toolSettings?: Pick<ToolSettingsService, 'getSettings'>,
    private readonly logger?: Pick<StructuredLogger, 'model'>,
    private readonly modelLifecycle?: LmStudioModelLifecycleService,
    private readonly now: () => Date = () => new Date(),
    private readonly runtimeLimits: AgentRuntimeLimitsProvider = DEFAULT_AGENT_RUNTIME_LIMITS_PROVIDER,
  ) {}

  normalizeInterruptedRuns(): number {
    return this.runs.normalizeInterruptedRuns({
      stage: 'server_restart',
      code: 'RUN_INTERRUPTED_BY_SERVER_RESTART',
      message: 'The Agent run was interrupted by a server restart.',
    });
  }

  async start(projectId: number, agentId: number, ignoredClientInput?: unknown): Promise<AgentRun> {
    void ignoredClientInput;
    const userId = this.currentUserId();
    const agent = this.agents.get(userId, projectId, agentId);
    if (!agent) throw new AgentRunError('AGENT_NOT_FOUND');
    const runtimeLimits = Object.freeze({
      ...(await this.runtimeLimits.getAgentRuntimeLimits()),
    });
    let task: string;
    try {
      task = await this.resolveAssignment(projectId, agent, runtimeLimits);
    } catch (error) {
      if (
        agent.data.assignmentSource !== 'file' &&
        !(error instanceof AssignmentTooLargeError)
      ) {
        throw error;
      }
      let failed: AgentRunRecord | null;
      try {
        failed = this.runs.transaction(() => this.runs.create(userId, projectId, agentId, ''));
      } catch {
        if (this.runs.getActive(userId, projectId, agentId)) {
          throw new AgentRunError('ACTIVE_RUN_EXISTS');
        }
        throw new AgentRunError('PERSISTENCE_FAILED');
      }
      if (!failed) throw new AgentRunError('AGENT_NOT_FOUND');
      this.runs.fail(
        failed.id,
        this.toSafeError(
          agent.data.assignmentSource === 'file' ? 'assignment_file_load' : 'assignment_resolution',
          error,
          agent.data.assignmentSource === 'file' ? agent.data.assignmentFilePath : undefined,
        ),
      );
      const stored = this.runs.getById(userId, projectId, agentId, failed.id);
      if (!stored) throw new AgentRunError('PERSISTENCE_FAILED');
      return toRun(stored);
    }
    let created: AgentRunRecord | null;
    try {
      created = this.runs.transaction(() => this.runs.create(userId, projectId, agentId, task));
    } catch {
      if (this.runs.getActive(userId, projectId, agentId)) {
        throw new AgentRunError('ACTIVE_RUN_EXISTS');
      }
      throw new AgentRunError('PERSISTENCE_FAILED');
    }
    if (!created) throw new AgentRunError('AGENT_NOT_FOUND');

    void this.launch(userId, created, new Set([created.agentId]), runtimeLimits);
    return toRun(created);
  }

  private launch(
    userId: number,
    run: AgentRunRecord,
    agentAncestry: ReadonlySet<number>,
    runtimeLimits: Readonly<AgentRuntimeLimits>,
  ): Promise<void> {
    const execution: ActiveExecution = {
      controller: new AbortController(),
      wake: null,
      agentAncestry,
      runtimeLimits,
    };
    this.activeExecutions.set(run.id, execution);
    return this.execute(userId, run, execution)
      .catch(() => {
        this.runs.fail(run.id, {
          stage: 'internal_execution',
          code: 'AGENT_RUN_INTERNAL_ERROR',
          message: 'The Agent run failed unexpectedly.',
        });
      })
      .finally(() => {
        void this.attemptPostRunUnload(userId, run).catch(() => {});
        this.activeExecutions.delete(run.id);
      });
  }

  private async attemptPostRunUnload(
    userId: number,
    run: AgentRunRecord,
  ): Promise<void> {
    if (!this.modelLifecycle) return;

    const agent = this.agents.get(userId, run.projectId, run.agentId);
    if (!agent || !agent.data.unloadModelAfterRun) return;

    const connectionInfo = await this.modelConnections.getConnectionForInference(
      agent.data.modelConnectionId,
    );
    if (!connectionInfo) return;

    const result = await this.modelLifecycle.unloadModel(
      connectionInfo.connection.data.baseUrl,
      connectionInfo.apiKey,
      agent.data.modelId,
    );

    switch (result.status) {
      case 'completed':
        this.runs.addOperationalEvent(run.id, 'model_unload_completed', { modelId: agent.data.modelId });
        break;
      case 'skipped':
        this.runs.addOperationalEvent(
          run.id,
          'model_unload_skipped',
          { modelId: agent.data.modelId, reason: result.reason ?? 'unknown' },
        );
        break;
    }
  }

  latest(projectId: number, agentId: number): AgentRun | null {
    const record = this.runs.getLatest(this.currentUserId(), projectId, agentId);
    return record ? toRun(record) : null;
  }

  get(projectId: number, agentId: number, runId: number): AgentRun | null {
    const record = this.runs.getById(this.currentUserId(), projectId, agentId, runId);
    return record ? toRun(record) : null;
  }

  events(projectId: number, agentId: number, runId: number): AgentRunEvent[] | null {
    return this.runs.listEvents(this.currentUserId(), projectId, agentId, runId);
  }

  execution(
    projectId: number,
    agentId: number,
    runId: number,
  ): AgentRunExecutionEvent[] | null {
    return this.runs.listExecutionEvents(this.currentUserId(), projectId, agentId, runId);
  }

  errors(projectId: number, agentId: number): AgentRunErrorLogEntry[] | null {
    return this.runs.listErrors(this.currentUserId(), projectId, agentId);
  }

  clear(projectId: number, agentId: number): number {
    const userId = this.currentUserId();
    try {
      return this.runs.transaction(() => {
        if (!this.agents.get(userId, projectId, agentId)) {
          throw new AgentRunError('AGENT_NOT_FOUND');
        }
        if (this.runs.getActive(userId, projectId, agentId)) {
          throw new AgentRunError('ACTIVE_RUN_EXISTS');
        }
        const deleted = this.runs.deleteTerminal(userId, projectId, agentId);
        if (deleted === null) throw new AgentRunError('AGENT_NOT_FOUND');
        return deleted;
      });
    } catch (error) {
      if (error instanceof AgentRunError) throw error;
      throw new AgentRunError('PERSISTENCE_FAILED');
    }
  }

  pause(projectId: number, agentId: number, runId: number): AgentRun {
    const run = this.requireRun(projectId, agentId, runId);
    if (run.status !== 'running' || !this.runs.requestPause(runId)) {
      throw new AgentRunError('INVALID_TRANSITION');
    }
    return toRun(this.requireRun(projectId, agentId, runId));
  }

  resume(projectId: number, agentId: number, runId: number): AgentRun {
    const run = this.requireRun(projectId, agentId, runId);
    if (run.status !== 'paused' || !this.runs.resume(runId)) {
      throw new AgentRunError('INVALID_TRANSITION');
    }
    const execution = this.activeExecutions.get(runId);
    execution?.wake?.();
    if (execution) execution.wake = null;
    return toRun(this.requireRun(projectId, agentId, runId));
  }

  cancel(projectId: number, agentId: number, runId: number): AgentRun {
    const run = this.requireRun(projectId, agentId, runId);
    if ((run.status !== 'running' && run.status !== 'paused') || !this.runs.cancel(runId)) {
      throw new AgentRunError('INVALID_TRANSITION');
    }
    const execution = this.activeExecutions.get(runId);
    execution?.controller.abort(new DOMException('Agent run cancelled', 'AbortError'));
    execution?.wake?.();
    if (execution) execution.wake = null;
    return toRun(this.requireRun(projectId, agentId, runId));
  }

  private requireRun(projectId: number, agentId: number, runId: number): AgentRunRecord {
    const run = this.runs.getById(this.currentUserId(), projectId, agentId, runId);
    if (!run) throw new AgentRunError('RUN_NOT_FOUND');
    return run;
  }

  private async execute(
    userId: number,
    run: AgentRunRecord,
    execution: ActiveExecution,
  ): Promise<void> {
    let stage = 'configuration_load';
    let instructionInputFile: string | undefined;
    try {
      await this.checkpoint(userId, run, execution);
      const agent = this.agents.get(userId, run.projectId, run.agentId);
      if (!agent) throw new Error('Agent configuration is unavailable');
      this.runs.addOperationalEvent(run.id, 'configuration_loaded');

      stage = 'instruction_file_load';
      let instructions = '';
      if (agent.data.instructionSource === 'file') {
        instructionInputFile = agent.data.instructionFilePath;
        instructions = (await this.filesystem.readFile(run.projectId, agent.data.instructionFilePath)).content;
      } else if (agent.data.instructionSource === 'inline') {
        instructions = agent.data.instructions;
        if (instructions.length > execution.runtimeLimits.inlineInstructionsCharacters) {
          throw new InstructionTooLargeError(
            instructions.length,
            execution.runtimeLimits.inlineInstructionsCharacters,
          );
        }
      }
      this.runs.addOperationalEvent(run.id, 'instructions_loaded');
      await this.checkpoint(userId, run, execution);

      stage = 'skill_load';
      const skillSections: string[] = [];
      const requiredToolNames: string[] = [];
      const seenRequiredTools = new Set<string>();
      for (const skillId of [...agent.skillIds].sort((left, right) => left - right)) {
        let skill: Awaited<ReturnType<SkillService['get']>> | undefined;
        try {
          skill = await this.skills?.get(skillId);
        } catch (error) {
          if (error instanceof SkillError && error.code === 'CONTENT_TOO_LARGE') {
            throw new SkillTooLargeError();
          }
          throw new SkillLoadError();
        }
        if (!skill) throw new SkillLoadError();
        skillSections.push(`# Skill: ${skill.commandName}\n\n${skill.markdown}`);
        for (const toolName of skill.requiredTools) {
          if (!seenRequiredTools.has(toolName)) {
            seenRequiredTools.add(toolName);
            requiredToolNames.push(toolName);
          }
        }
      }
      this.runs.addOperationalEvent(run.id, 'skills_loaded');
      await this.checkpoint(userId, run, execution);

      stage = 'tool_resolution';
      const preRunToolNames = agent.toolConfigurations
        .filter((configuration) => configuration.preRunInputFile !== null)
        .map((configuration) => configuration.toolName);
      const effectiveTools = await this.resolveTools(
        [...agent.toolNames, ...preRunToolNames],
        requiredToolNames,
        run.projectId,
        agent.data.projectFilesystemPermissions,
        userId,
        run,
        agent,
        execution,
      );
      const preRunOnlyToolNames = new Set(
        preRunToolNames.filter(
          (toolName) => !agent.toolNames.includes(toolName) && !requiredToolNames.includes(toolName),
        ),
      );
      const modelTools = new Map(
        [...effectiveTools].filter(([toolName]) => !preRunOnlyToolNames.has(toolName)),
      );
      const definitions: ModelToolDefinition[] = [...modelTools.values()].map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
      this.runs.addOperationalEvent(run.id, 'tools_resolved');
      await this.checkpoint(userId, run, execution);

      stage = 'model_configuration';
      const resolved = await this.modelConnections.getConnectionForInference(
        agent.data.modelConnectionId,
      );
      if (!resolved || !resolved.connection.data.enabled) {
        throw new Error('Configured model connection is unavailable');
      }
      if (
        !(await this.modelConnections.isModelVisible(
          agent.data.modelConnectionId,
          agent.data.modelId,
        ))
      ) {
        throw new AgentModelNotAllowedError();
      }

      stage = 'attached_files_load';
      const attachedFiles: Array<{ path: string; content: string }> = [];
      let aggregateSize = 0;
      if (agent.data.attachedProjectFiles && agent.data.attachedProjectFiles.length > 0) {
        for (const filePath of agent.data.attachedProjectFiles) {
          let fileContent: Awaited<ReturnType<typeof this.filesystem.readFile>>;
          try {
            fileContent = await this.filesystem.readFile(run.projectId, filePath);
          } catch (error) {
            if (error instanceof ProjectFilesystemError) {
              if (error.code === 'PROJECT_FILE_TOO_LARGE') {
                throw new AttachedFileTooLargeError(filePath, undefined, error.limitBytes);
              }
              throw new AttachedFileUnavailableError();
            }
            throw error;
          }
          if (fileContent.size > execution.runtimeLimits.attachedFileBytes) {
            throw new AttachedFileTooLargeError(
              filePath,
              fileContent.size,
              execution.runtimeLimits.attachedFileBytes,
            );
          }
          if (aggregateSize + fileContent.size > execution.runtimeLimits.attachedFilesTotalBytes) {
            throw new AttachedFilesTotalTooLargeError(
              aggregateSize + fileContent.size,
              execution.runtimeLimits.attachedFilesTotalBytes,
              filePath,
            );
          }
          attachedFiles.push({
            path: filePath,
            content: fileContent.content,
          });
          aggregateSize += fileContent.size;
        }
      }
      this.runs.addOperationalEvent(run.id, 'attached_files_loaded');
      await this.checkpoint(userId, run, execution);

      stage = 'pre_run_initialization';
      const preRunResults = await this.executePreRunTools(
        userId,
        run,
        agent,
        effectiveTools,
        execution,
      );
      this.runs.addOperationalEvent(run.id, 'pre_run_completed');
      await this.checkpoint(userId, run, execution);

      const systemSections: string[] = instructions.length > 0 ? [instructions] : [];
      if (skillSections.length > 0) {
        systemSections.push(skillSections.join('\n\n'));
      }
      if (attachedFiles.length > 0) {
        systemSections.push(`Attached Project files:\n\n${JSON.stringify(attachedFiles)}`);
      }
      systemSections.push(`Current date: ${formatLocalCalendarDate(this.now())}`);
      const mergedSystemContent = systemSections.join('\n\n');
      const userContent = this.composeInitialUserContent(run.data.task, preRunResults);
      const modelMessages: ModelInferenceMessage[] = [
        { role: 'system', content: mergedSystemContent },
        { role: 'user', content: userContent },
      ];
      const seenToolCallIds = new Set<string>();
      while (true) {
        await this.checkpoint(userId, run, execution);
        stage = 'connection_queue';
        const release = await this.acquireModelSlot(
          userId,
          run,
          agent.data.modelConnectionId,
          execution,
        );
        let result: ModelInferenceResult | StreamedModelInferencePartialResult;
        try {
          stage = 'provider_request';
          this.runs.addOperationalEvent(run.id, 'model_request_started');
          await this.logger?.model('info', 'agent_model_request', {
            agentId: agent.id,
            runId: run.id,
            projectId: run.projectId,
            modelConnectionId: agent.data.modelConnectionId,
            modelId: agent.data.modelId,
            messageCount: modelMessages.length,
            toolCount: definitions.length,
          });
          result = await this.requestInference(
            resolved.connection.data.baseUrl,
            agent.data.timeoutMinutes ?? DEFAULT_AGENT_TIMEOUT_MINUTES,
            agent.data.modelId,
            modelMessages,
            definitions,
            undefined,
            execution.controller.signal,
            resolved.apiKey,
            agent.data.temperature ?? DEFAULT_AGENT_TEMPERATURE,
            agent.data.topP ?? DEFAULT_AGENT_TOP_P,
          );
          await this.logger?.model('info', 'agent_model_response', {
            agentId: agent.id,
            runId: run.id,
            projectId: run.projectId,
            finishReason: result.finishReason ?? null,
            totalTokens: result.usage?.totalTokens ?? null,
          });
          if (result.usage !== undefined && result.usage.totalTokens !== undefined) {
            this.runs.updateLatestTotalTokens(run.id, result.usage.totalTokens);
          }
        } finally {
          release();
        }

        if (result.type === 'cancelled') {
          if (result.reasoningContent?.trim()) {
            this.runs.addExecutionEvent(run.id, 'reasoning', {
              content: safeExecutionText(result.reasoningContent),
            });
          }
          if (result.content?.trim()) {
            this.runs.addExecutionEvent(run.id, 'assistant_message', {
              content: safeExecutionText(result.content),
            });
          }
          const cancelledData: Record<string, unknown> = {};
          if (result.reasoningContent) {
            cancelledData.reasoning = safeExecutionText(result.reasoningContent);
          }
          if (result.content) {
            cancelledData.content = safeExecutionText(result.content);
          }
          if (result.finishReason) {
            cancelledData.finishReason = result.finishReason;
          }
          if (result.usage?.totalTokens !== undefined) {
            cancelledData.totalTokens = result.usage.totalTokens;
          }
          this.runs.addExecutionEvent(run.id, 'inference_cancelled', cancelledData);
          return;
        }

        await this.checkpoint(userId, run, execution);

        const assistantMessage = result.assistantMessage;
        if (assistantMessage?.reasoning_content) {
          this.runs.addExecutionEvent(run.id, 'reasoning', {
            content: safeExecutionText(assistantMessage.reasoning_content),
          });
        }

        if (result.type === 'message') {
          this.runs.addExecutionEvent(run.id, 'final_result', {
            content: safeExecutionText(result.content),
          });
          await this.checkpoint(userId, run, execution);
          if (agent.data.saveResultToFile) {
            stage = 'result_file_write';
            this.runs.addOperationalEvent(run.id, 'result_file_write_started');
            const directorySegments = agent.data.resultDirectory.split('/').filter(Boolean);
            let directory = '';
            for (const segment of directorySegments) {
              await this.checkpoint(userId, run, execution);
              directory = directory ? `${directory}/${segment}` : segment;
              try {
                await this.filesystem.createDirectory(run.projectId, { path: directory });
              } catch (error) {
                if (
                  !(error instanceof ProjectFilesystemError) ||
                  error.code !== 'PROJECT_FILE_CONFLICT'
                ) {
                  throw error;
                }
              }
            }
            await this.checkpoint(userId, run, execution);
            const resultPath = agent.data.resultDirectory
              ? `${agent.data.resultDirectory}/${agent.data.resultFilename}`
              : agent.data.resultFilename;
            await this.filesystem.writeFile(
              run.projectId,
              {
                path: resultPath,
                content: result.content,
              },
              execution.controller.signal,
            );
            this.runs.addOperationalEvent(run.id, 'result_file_written');
            await this.checkpoint(userId, run, execution);
          }
          while (!this.runs.complete(run.id, result.content)) {
            await this.checkpoint(userId, run, execution);
          }
          await this.triggerNextAgent(userId, run, agent, result.content, execution.agentAncestry);
          return;
        }

        if (result.assistantMessage.content) {
          this.runs.addExecutionEvent(run.id, 'assistant_message', {
            content: safeExecutionText(result.assistantMessage.content),
          });
        }

        modelMessages.push({
          role: 'assistant',
          content: result.assistantMessage.content,
          tool_calls: result.calls,
        });
        for (const call of result.calls) {
          await this.checkpoint(userId, run, execution);
          this.runs.addExecutionEvent(run.id, 'tool_call', {
            toolCallId: safeExecutionText(call.id),
            toolName: safeExecutionText(call.function.name),
            arguments: safeToolArgumentsJson(call.function.arguments),
          });
          this.runs.addOperationalEvent(run.id, 'tool_call_started', {
            toolName: call.function.name,
            status: 'started',
          });
          let toolResult: unknown;
          let failed = false;
          const tool = modelTools.get(call.function.name);
          let argumentsValue: unknown;
          try {
            argumentsValue = JSON.parse(call.function.arguments) as unknown;
          } catch {
            failed = true;
            toolResult = toolFailure(
              'INVALID_TOOL_ARGUMENTS',
              'The tool arguments were invalid.',
            );
          }
          if (!failed && seenToolCallIds.has(call.id)) {
            failed = true;
            toolResult = toolFailure('INVALID_TOOL_CALL', 'The tool call was invalid.');
          } else {
            seenToolCallIds.add(call.id);
          }
          if (!failed && !tool) {
            failed = true;
            toolResult = toolFailure('TOOL_NOT_AVAILABLE', 'The requested tool is not available.');
          }
          if (!failed && tool && !hasValidSchemaType(argumentsValue, tool.inputSchema)) {
            failed = true;
            toolResult = toolFailure(
              'INVALID_TOOL_ARGUMENTS',
              'The tool arguments were invalid.',
            );
          }
          if (!failed && tool) {
            try {
              stage = 'tool_execution_internal';
              toolResult = await tool.execute(argumentsValue, execution.controller.signal);
              if (
                call.function.name === RUN_AGENT_TOOL_NAME &&
                typeof toolResult === 'object' &&
                toolResult !== null &&
                !Array.isArray(toolResult) &&
                (toolResult as Record<string, unknown>).status === 'Error'
              ) {
                failed = true;
              }
            } catch (error) {
              if (execution.controller.signal.aborted) throw new ExecutionStopped();
              if (error instanceof InvalidToolArgumentsError) {
                failed = true;
                toolResult = toolFailure(
                  'INVALID_TOOL_ARGUMENTS',
                  'The tool arguments were invalid.',
                );
              } else if (error instanceof RecoverableToolError) {
                failed = true;
                toolResult = {
                  ok: false,
                  error: { code: error.code, message: error.safeMessage, ...error.metadata },
                };
              } else if (
                error instanceof ProjectFilesystemError &&
                error.code !== 'PROJECT_FILESYSTEM_FAILED'
              ) {
                failed = true;
                toolResult = toolFailure(error.code, 'The Project filesystem operation failed.');
              } else {
                throw error;
              }
            }
          }
          this.runs.addExecutionEvent(run.id, 'tool_result', {
            toolCallId: safeExecutionText(call.id),
            toolName: safeExecutionText(call.function.name),
            result: safeExecutionJson(toolResult),
            status: failed ? 'failed' : 'completed',
          });
          stage = 'tool_result_validation';
          let serializedResult: string;
          try {
            serializedResult = serializeModelToolResult(toolResult, {
              toolName: call.function.name,
            }, execution.runtimeLimits.toolResultCharacters);
          } catch (error) {
            this.runs.addOperationalEvent(run.id, 'tool_call_failed', {
              toolName: call.function.name,
              status: 'result_too_large',
            });
            throw error;
          }
          this.runs.addOperationalEvent(
            run.id,
            failed ? 'tool_call_failed' : 'tool_call_completed',
            { toolName: call.function.name, status: failed ? 'failed' : 'completed' },
          );
          modelMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: serializedResult,
          });
          await this.checkpoint(userId, run, execution);
        }
        await this.checkpoint(userId, run, execution);
      }
    } catch (error) {
      if (error instanceof ExecutionStopped || execution.controller.signal.aborted) return;
      this.runs.fail(
        run.id,
        this.toSafeError(
          stage,
          error,
          stage === 'instruction_file_load' ? instructionInputFile : undefined,
        ),
      );
    }
  }

  private async triggerNextAgent(
    userId: number,
    run: AgentRunRecord,
    agent: AgentRecord,
    finalResult: string,
    agentAncestry: ReadonlySet<number>,
  ): Promise<void> {
    const nextAgentId = agent.nextAgentId;
    if (!agent.data.triggerNextAgent || nextAgentId === null) return;

    this.runs.addOperationalEvent(run.id, 'next_agent_trigger_started', {
      nextAgentId,
      status: 'started',
    });
    if (agentAncestry.has(nextAgentId)) {
      this.runs.addOperationalEvent(run.id, 'next_agent_trigger_skipped', {
        nextAgentId,
        status: 'cycle_detected',
      });
      return;
    }

    const nextAgent = this.agents.get(userId, run.projectId, nextAgentId);
    if (!nextAgent) {
      this.runs.addOperationalEvent(run.id, 'next_agent_trigger_failed', {
        nextAgentId,
        status: 'target_missing',
      });
      return;
    }
    const runtimeLimits = Object.freeze({
      ...(await this.runtimeLimits.getAgentRuntimeLimits()),
    });
    let assignment: string;
    try {
      assignment = await this.resolveAssignment(run.projectId, nextAgent, runtimeLimits);
    } catch (error) {
      const assignmentTooLarge =
        error instanceof AssignmentTooLargeError ||
        (error instanceof ProjectFilesystemError && error.code === 'PROJECT_FILE_TOO_LARGE');
      if (assignmentTooLarge) {
        try {
          const failedRun = this.runs.transaction(() =>
            this.runs.create(userId, run.projectId, nextAgentId, '', {
              originalTask: run.data.originalTask,
              triggeredByRunId: run.id,
              previousAgentId: agent.id,
              chainRootRunId: run.chainRootRunId ?? run.id,
            }),
          );
          if (failedRun) {
            this.runs.fail(
              failedRun.id,
              this.toSafeError(
                nextAgent.data.assignmentSource === 'file'
                  ? 'assignment_file_load'
                  : 'assignment_resolution',
                error,
                nextAgent.data.assignmentSource === 'file'
                  ? nextAgent.data.assignmentFilePath
                  : undefined,
              ),
            );
          }
        } catch {
          // The source run remains complete even if the target error cannot be persisted.
        }
      }
      this.runs.addOperationalEvent(run.id, 'next_agent_trigger_failed', {
        nextAgentId,
        status: assignmentTooLarge ? 'assignment_too_large' : 'assignment_missing',
      });
      return;
    }
    if (this.runs.getActive(userId, run.projectId, nextAgentId)) {
      this.runs.addOperationalEvent(run.id, 'next_agent_trigger_skipped', {
        nextAgentId,
        status: 'active_run_exists',
      });
      return;
    }

    let handoffTask: string;
    try {
      handoffTask = requireEffectiveAssignment(
        this.buildHandoffTask(
          assignment,
          run.data.originalTask,
          agent.id,
          agent.data.name,
          finalResult,
        ),
        runtimeLimits.assignmentCharacters,
      );
    } catch (error) {
      if (error instanceof AssignmentTooLargeError) {
        try {
          const failedRun = this.runs.transaction(() =>
            this.runs.create(userId, run.projectId, nextAgentId, '', {
              originalTask: run.data.originalTask,
              triggeredByRunId: run.id,
              previousAgentId: agent.id,
              chainRootRunId: run.chainRootRunId ?? run.id,
            }),
          );
          if (failedRun) {
            this.runs.fail(failedRun.id, this.toSafeError('assignment_resolution', error));
          }
        } catch {
          // The source run remains complete even if the target error cannot be persisted.
        }
      }
      this.runs.addOperationalEvent(run.id, 'next_agent_trigger_failed', {
        nextAgentId,
        status: 'assignment_too_large',
      });
      return;
    }
    let triggeredRun: AgentRunRecord;
    try {
      const created = this.runs.transaction(() =>
        this.runs.create(userId, run.projectId, nextAgentId, handoffTask, {
          originalTask: run.data.originalTask,
          triggeredByRunId: run.id,
          previousAgentId: agent.id,
          chainRootRunId: run.chainRootRunId ?? run.id,
        }),
      );
      if (!created) {
        this.runs.addOperationalEvent(run.id, 'next_agent_trigger_failed', {
          nextAgentId,
          status: 'target_missing',
        });
        return;
      }
      triggeredRun = created;
    } catch {
      const active = this.runs.getActive(userId, run.projectId, nextAgentId);
      this.runs.addOperationalEvent(run.id, active ? 'next_agent_trigger_skipped' : 'next_agent_trigger_failed', {
        nextAgentId,
        status: active ? 'active_run_exists' : 'persistence_failed',
      });
      return;
    }
    this.runs.addOperationalEvent(run.id, 'next_agent_run_started', {
      nextAgentId,
      triggeredRunId: triggeredRun.id,
      status: 'started',
    });
    this.runs.addOperationalEvent(triggeredRun.id, 'triggered_by_agent', {
      previousAgentId: agent.id,
      triggeredByRunId: run.id,
      status: 'started',
    });
    void this.launch(
      userId,
      triggeredRun,
      new Set([...agentAncestry, nextAgentId]),
      runtimeLimits,
    );
  }

  private async runConfiguredAgent(
    userId: number,
    callerRun: AgentRunRecord,
    callerAgent: AgentRecord,
    execution: ActiveExecution,
    signal?: AbortSignal,
  ): Promise<{ status: 'Done' | 'Error' }> {
    const targetAgentId = callerAgent.toolConfigurations.find(
      (configuration) => configuration.toolName === RUN_AGENT_TOOL_NAME,
    )?.targetAgentId;
    if (
      targetAgentId == null ||
      targetAgentId === callerAgent.id ||
      execution.agentAncestry.has(targetAgentId)
    ) {
      return { status: 'Error' };
    }

    const targetAgent = this.agents.get(userId, callerRun.projectId, targetAgentId);
    if (!targetAgent || this.runs.getActive(userId, callerRun.projectId, targetAgentId)) {
      return { status: 'Error' };
    }
    const runtimeLimits = Object.freeze({
      ...(await this.runtimeLimits.getAgentRuntimeLimits()),
    });

    let assignment: string;
    try {
      assignment = await this.resolveAssignment(callerRun.projectId, targetAgent, runtimeLimits);
    } catch (error) {
      if (
        targetAgent.data.assignmentSource === 'file' ||
        error instanceof AssignmentTooLargeError
      ) {
        try {
          const failedRun = this.runs.transaction(() =>
            this.runs.create(userId, callerRun.projectId, targetAgentId, '', {
              originalTask: callerRun.data.originalTask,
              triggeredByRunId: callerRun.id,
              previousAgentId: callerAgent.id,
              chainRootRunId: callerRun.chainRootRunId ?? callerRun.id,
            }),
          );
          if (failedRun) {
            this.runs.fail(
              failedRun.id,
              this.toSafeError(
                targetAgent.data.assignmentSource === 'file'
                  ? 'assignment_file_load'
                  : 'assignment_resolution',
                error,
                targetAgent.data.assignmentSource === 'file'
                  ? targetAgent.data.assignmentFilePath
                  : undefined,
              ),
            );
          }
        } catch {
          // The model-visible result remains intentionally sanitized.
        }
      }
      return { status: 'Error' };
    }
    signal?.throwIfAborted();

    let targetRun: AgentRunRecord;
    try {
      const created = this.runs.transaction(() =>
        this.runs.create(userId, callerRun.projectId, targetAgentId, assignment, {
          originalTask: callerRun.data.originalTask,
          triggeredByRunId: callerRun.id,
          previousAgentId: callerAgent.id,
          chainRootRunId: callerRun.chainRootRunId ?? callerRun.id,
        }),
      );
      if (!created) return { status: 'Error' };
      targetRun = created;
    } catch {
      return { status: 'Error' };
    }

    this.runs.addOperationalEvent(callerRun.id, 'agent_runner_target_started', {
      targetAgentId,
      targetRunId: targetRun.id,
      status: 'started',
    });
    this.runs.addOperationalEvent(targetRun.id, 'triggered_by_agent_runner', {
      previousAgentId: callerAgent.id,
      triggeredByRunId: callerRun.id,
      status: 'started',
    });

    const launched = this.launch(
      userId,
      targetRun,
      new Set([...execution.agentAncestry, targetAgentId]),
      runtimeLimits,
    );
    try {
      await this.waitForTarget(launched, signal);
      const terminal = this.runs.getById(
        userId,
        callerRun.projectId,
        targetAgentId,
        targetRun.id,
      );
      if (!terminal || terminal.status === 'running' || terminal.status === 'paused') {
        return { status: 'Error' };
      }
      this.runs.addOperationalEvent(callerRun.id, 'agent_runner_target_completed', {
        targetAgentId,
        targetRunId: targetRun.id,
        terminalTargetStatus: terminal.status,
        status: terminal.status === 'done' ? 'completed' : 'failed',
      });
      return { status: terminal.status === 'done' ? 'Done' : 'Error' };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { status: 'Error' };
    }
  }

  private async waitForTarget(completion: Promise<void>, signal?: AbortSignal): Promise<void> {
    if (!signal) {
      await completion;
      return;
    }
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => signal.removeEventListener('abort', abort);
      const abort = (): void => {
        cleanup();
        reject(signal.reason);
      };
      signal.addEventListener('abort', abort, { once: true });
      void completion.then(
        () => {
          cleanup();
          resolve();
        },
        (error: unknown) => {
          cleanup();
          reject(error);
        },
      );
    });
  }

  private async resolveAssignment(
    projectId: number,
    agent: AgentRecord,
    runtimeLimits: Readonly<AgentRuntimeLimits>,
  ): Promise<string> {
    if (agent.data.assignmentSource === 'inline') {
      return requireEffectiveAssignment(agent.data.assignment, runtimeLimits.assignmentCharacters);
    }
    if (!isAgentPromptFilePath(agent.data.assignmentFilePath)) {
      throw new Error('Invalid configured assignment file');
    }
    const file = await this.filesystem.readFile(projectId, agent.data.assignmentFilePath);
    return requireEffectiveAssignment(file.content, runtimeLimits.assignmentCharacters);
  }

  private buildHandoffTask(
    assignment: string,
    originalTask: string,
    previousAgentId: number,
    previousAgentName: string,
    finalResult: string,
  ): string {
    return [
      '# Agent chain handoff',
      '',
      'You are continuing work from another Agent in the same Project.',
      '',
      '## Your assigned task',
      assignment,
      '',
      '## Chain original task',
      originalTask,
      '',
      '## Previous Agent',
      `Name: ${previousAgentName}`,
      `ID: ${previousAgentId}`,
      '',
      '## Previous Agent final result',
      finalResult,
    ].join('\n');
  }

  private async resolveTools(
    explicitToolNames: readonly string[],
    requiredToolNames: readonly string[],
    projectId: number,
    permissions?: AgentProjectFilesystemPermissions,
    userId?: number,
    run?: AgentRunRecord,
    agent?: AgentRecord,
    execution?: ActiveExecution,
  ): Promise<Map<string, EffectiveTool>> {
    const effective = new Map<string, EffectiveTool>();
    const required = new Set(requiredToolNames);
    for (const toolName of [...explicitToolNames, ...requiredToolNames]) {
      if (effective.has(toolName)) continue;
      const tool = this.toolRegistry?.get(toolName);
      if (!tool) {
        if (required.has(toolName)) throw new ToolResolutionError();
        continue;
      }
      let settings: ToolSettings;
      try {
        if (!this.toolSettings) throw new Error('Tool settings unavailable');
        settings = await this.toolSettings.getSettings(toolName);
      } catch {
        throw new ToolResolutionError();
      }
      effective.set(toolName, {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: async (argumentsValue, signal) => {
          if (!this.toolRegistry) throw new ToolResolutionError();
          return this.toolRegistry.execute(
            toolName,
            argumentsValue,
            settings,
            signal,
            userId !== undefined && run && agent && execution
              ? {
                  runConfiguredAgent: (runnerSignal) =>
                    this.runConfiguredAgent(userId, run, agent, execution, runnerSignal),
                }
              : undefined,
          );
        },
      });
    }

    const permissionsToApply = permissions ?? {
      list: true,
      read: true,
      write: false,
      createDirectory: false,
      rename: false,
      delete: false,
    };

    for (const tool of createProjectFilesystemTools(this.filesystem, projectId)) {
      const permissionKey = this.toPermissionKey(tool.name);
      if (!permissionKey) continue;
      if (!permissionsToApply[permissionKey]) continue;
      effective.set(tool.name, this.toEffectiveProjectTool(tool));
    }

    return effective;
  }

  private async executePreRunTools(
    userId: number,
    run: AgentRunRecord,
    agent: AgentRecord,
    effectiveTools: ReadonlyMap<string, EffectiveTool>,
    execution: ActiveExecution,
  ): Promise<PreRunToolResult[]> {
    const configured = agent.toolConfigurations
      .filter(
        (configuration): configuration is typeof configuration & { preRunInputFile: string } =>
          configuration.preRunInputFile !== null,
      )
      .sort((left, right) => left.toolName.localeCompare(right.toolName));
    const results: PreRunToolResult[] = [];
    for (const configuration of configured) {
      await this.checkpoint(userId, run, execution);
      const tool = effectiveTools.get(configuration.toolName);
      const context: PreRunErrorContext = {
        toolName: configuration.toolName,
        inputFile: configuration.preRunInputFile,
      };
      if (!tool) throw new PreRunInitializationError('PRE_RUN_TOOL_UNAVAILABLE', context);
      let content: string;
      try {
        content = (await this.filesystem.readFile(run.projectId, configuration.preRunInputFile)).content;
      } catch (error) {
        if (error instanceof ProjectFilesystemError && error.code === 'PROJECT_PATH_ESCAPE') {
          throw new PreRunInitializationError(
            'PRE_RUN_INPUT_FILE_OUTSIDE_PROJECT',
            context,
            error,
          );
        }
        if (error instanceof ProjectFilesystemError && error.code === 'PROJECT_FILE_TOO_LARGE') {
          throw new PreRunInitializationError('PRE_RUN_INPUT_TOO_LARGE', context, error);
        }
        throw new PreRunInitializationError('PRE_RUN_INPUT_FILE_UNAVAILABLE', context, error);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(content) as unknown;
      } catch (error) {
        throw new PreRunInitializationError('PRE_RUN_INPUT_INVALID_JSON', context, error);
      }
      if (!Array.isArray(parsed)) {
        throw new PreRunInitializationError('PRE_RUN_INPUT_NOT_ARRAY', context);
      }
      const argumentsList = parsed.map((item, index): Record<string, unknown> => {
        const callContext = {
          ...context,
          callIndex: index + 1,
          arguments: safeExecutionJson(item),
        };
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          throw new PreRunInitializationError('PRE_RUN_INPUT_ITEM_NOT_OBJECT', callContext);
        }
        if (!hasValidSchemaType(item, tool.inputSchema)) {
          throw new PreRunInitializationError('PRE_RUN_ARGUMENTS_INVALID', callContext);
        }
        return item as Record<string, unknown>;
      });
      const calls: PreRunToolResult['calls'] = [];
      for (const [index, argumentsValue] of argumentsList.entries()) {
        await this.checkpoint(userId, run, execution);
        const callIndex = index + 1;
        const safeArguments = safeExecutionJson(argumentsValue);
        this.runs.addOperationalEvent(run.id, 'pre_run_tool_call_started', {
          toolName: configuration.toolName,
          status: 'started',
        });
        this.runs.addExecutionEvent(run.id, 'pre_run_tool_call', {
          toolName: safeExecutionText(configuration.toolName),
          inputFile: safeExecutionText(configuration.preRunInputFile),
          callIndex,
          arguments: safeArguments,
        });
        let result: unknown;
        try {
          result = await tool.execute(argumentsValue, execution.controller.signal);
        } catch (error) {
          if (execution.controller.signal.aborted) throw new ExecutionStopped();
          if (error instanceof InvalidToolArgumentsError) {
            throw new PreRunInitializationError(
              'PRE_RUN_ARGUMENTS_INVALID',
              { ...context, callIndex, arguments: safeArguments },
              error,
            );
          }
          throw new PreRunInitializationError(
            'PRE_RUN_TOOL_EXECUTION_FAILED',
            { ...context, callIndex, arguments: safeArguments },
            error,
          );
        }
        this.runs.addExecutionEvent(run.id, 'pre_run_tool_result', {
          toolName: safeExecutionText(configuration.toolName),
          inputFile: safeExecutionText(configuration.preRunInputFile),
          callIndex,
          result: safeExecutionJson(result),
        });
        let serializedResult: string;
        try {
          serializedResult = serializeModelToolResult(result, {
            toolName: configuration.toolName,
            inputFile: configuration.preRunInputFile,
            callIndex,
          }, execution.runtimeLimits.toolResultCharacters);
        } catch (error) {
          this.runs.addOperationalEvent(run.id, 'pre_run_tool_call_failed', {
            toolName: configuration.toolName,
            status: 'result_too_large',
          });
          throw error;
        }
        calls.push({ argumentsValue, serializedResult });
        this.runs.addOperationalEvent(run.id, 'pre_run_tool_call_completed', {
          toolName: configuration.toolName,
          status: 'completed',
        });
      }
      results.push({
        toolName: configuration.toolName,
        inputFile: configuration.preRunInputFile,
        calls,
      });
    }
    return results;
  }

  private composeInitialUserContent(task: string, results: readonly PreRunToolResult[]): string {
    const populated = results.filter((tool) => tool.calls.length > 0);
    if (populated.length === 0) return task;
    const sections = populated.map((tool) => {
      const calls = tool.calls.map((call, index) =>
        [
          `Call ${index + 1}`,
          'Arguments:',
          JSON.stringify(call.argumentsValue),
          '',
          'Result:',
          call.serializedResult,
        ].join('\n'),
      );
      return [`Tool: ${tool.toolName}`, `Input file: ${tool.inputFile}`, '', ...calls].join('\n');
    });
    return [
      'Tool-provided user information:',
      '',
      sections.join('\n\n'),
      '',
      'Agent task:',
      '',
      task,
    ].join('\n');
  }

  private toPermissionKey(toolName: string): (keyof AgentProjectFilesystemPermissions) | null {
    const mapping: Record<string, keyof AgentProjectFilesystemPermissions> = {
      project_list_directory: 'list',
      project_read_file: 'read',
      project_write_file: 'write',
      project_create_directory: 'createDirectory',
      project_rename: 'rename',
      project_delete: 'delete',
    };
    return (toolName as keyof typeof mapping) in mapping ? mapping[toolName] : null;
  }

  private toEffectiveProjectTool(tool: ProjectFilesystemTool): EffectiveTool {
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: async (argumentsValue, signal) => {
        signal.throwIfAborted();
        return tool.execute(argumentsValue);
      },
    };
  }

  private async acquireModelSlot(
    userId: number,
    run: AgentRunRecord,
    connectionId: number,
    execution: ActiveExecution,
  ): Promise<() => void> {
    while (true) {
      await this.checkpoint(userId, run, execution);
      this.runs.addOperationalEvent(run.id, 'model_queue_wait_started');
      const release = await this.inferenceQueue.acquire(connectionId, execution.controller.signal);
      const status = this.runs.pauseAtCheckpoint(run.id);
      if (status === 'running') return release;
      release();
      await this.checkpoint(userId, run, execution);
    }
  }

  private async checkpoint(
    userId: number,
    run: AgentRunRecord,
    execution: ActiveExecution,
  ): Promise<void> {
    const status = this.runs.pauseAtCheckpoint(run.id);
    if (status === null || status === 'done' || status === 'error' || status === 'cancelled') {
      throw new ExecutionStopped();
    }
    if (status !== 'paused') return;
    await new Promise<void>((resolve) => {
      execution.wake = resolve;
      const current = this.runs.getById(userId, run.projectId, run.agentId, run.id);
      if (current?.status !== 'paused') {
        execution.wake = null;
        resolve();
      }
    });
    const current = this.runs.getById(userId, run.projectId, run.agentId, run.id);
    if (!current || current.status !== 'running') throw new ExecutionStopped();
  }

  private toSafeError(
    stage: string,
    error: unknown,
    inputFile?: string,
  ): AgentRunSafeError {
    if (error instanceof ToolResultTooLargeError) {
      return {
        stage,
        code: 'TOOL_RESULT_TOO_LARGE',
        message: 'The tool result exceeded the maximum size allowed for model context.',
        toolName: safeExecutionText(error.toolName),
        ...(error.inputFile !== undefined
          ? { inputFile: safeExecutionText(error.inputFile) }
          : {}),
        ...(error.callIndex !== undefined ? { callIndex: error.callIndex } : {}),
        actualCharacters: error.actualCharacters,
        limitCharacters: error.limitCharacters,
      };
    }
    if (stage === 'pre_run_initialization') {
      const code =
        error instanceof PreRunInitializationError ? error.code : 'PRE_RUN_TOOL_EXECUTION_FAILED';
      return {
        stage,
        code,
        message: PRE_RUN_ERROR_MESSAGES[code],
        ...(error instanceof PreRunInitializationError ? error.metadata : {}),
      };
    }
    if (
      stage === 'instruction_file_load' &&
      (error instanceof InstructionTooLargeError ||
        (error instanceof ProjectFilesystemError && error.code === 'PROJECT_FILE_TOO_LARGE'))
    ) {
      return {
        stage,
        code: 'INSTRUCTION_TOO_LARGE',
        message: 'The configured Agent instructions are too large.',
        ...(inputFile ? { inputFile: safeExecutionText(inputFile) } : {}),
        ...(error instanceof InstructionTooLargeError
          ? {
              actualCharacters: error.actualCharacters,
              limitCharacters: error.limitCharacters,
            }
          : error instanceof ProjectFilesystemError && error.limitBytes !== undefined
            ? { limitBytes: error.limitBytes }
            : {}),
      };
    }
    if (stage === 'instruction_file_load' && error instanceof ProjectFilesystemError) {
      return {
        stage,
        code: 'INSTRUCTION_FILE_UNAVAILABLE',
        message: 'The configured instruction file could not be loaded.',
      };
    }
    if (stage === 'assignment_file_load') {
      if (
        error instanceof AssignmentTooLargeError ||
        (error instanceof ProjectFilesystemError && error.code === 'PROJECT_FILE_TOO_LARGE')
      ) {
        return {
          stage,
          code: 'ASSIGNMENT_TOO_LARGE',
          message: 'The configured Agent assignment is too large.',
          ...(inputFile ? { inputFile: safeExecutionText(inputFile) } : {}),
          ...(error instanceof AssignmentTooLargeError && error.actualCharacters !== undefined
            ? { actualCharacters: error.actualCharacters }
            : {}),
          ...(error instanceof AssignmentTooLargeError && error.limitCharacters !== undefined
            ? { limitCharacters: error.limitCharacters }
            : {}),
          ...(error instanceof ProjectFilesystemError && error.limitBytes !== undefined
            ? { limitBytes: error.limitBytes }
            : {}),
        };
      }
      return {
        stage,
        code: 'ASSIGNMENT_FILE_UNAVAILABLE',
        message: 'The configured task file could not be loaded.',
      };
    }
    if (stage === 'assignment_resolution' && error instanceof AssignmentTooLargeError) {
      return {
        stage,
        code: 'ASSIGNMENT_TOO_LARGE',
        message: 'The configured Agent assignment is too large.',
        actualCharacters: error.actualCharacters,
        limitCharacters: error.limitCharacters,
      };
    }
    if (stage === 'attached_files_load') {
      if (error instanceof AttachedFileUnavailableError) {
        return {
          stage,
          code: 'ATTACHED_FILE_UNAVAILABLE',
          message: 'One or more configured attached Project files could not be loaded.',
        };
      }
      if (error instanceof AttachedFileTooLargeError) {
        return {
          stage,
          code: 'ATTACHED_FILE_TOO_LARGE',
          message: 'A configured attached Project file is too large.',
          ...(error.inputFile ? { inputFile: safeExecutionText(error.inputFile) } : {}),
          ...(error.actualBytes !== undefined ? { actualBytes: error.actualBytes } : {}),
          ...(error.limitBytes !== undefined ? { limitBytes: error.limitBytes } : {}),
        };
      }
      if (error instanceof AttachedFilesTotalTooLargeError) {
        return {
          stage,
          code: 'ATTACHED_FILES_TOO_LARGE',
          message: 'The configured attached Project files are too large in total.',
          inputFile: safeExecutionText(error.inputFile),
          actualBytes: error.actualBytes,
          limitBytes: error.limitBytes,
        };
      }
    }
    if (stage === 'result_file_write') {
      return {
        stage,
        code: 'RESULT_FILE_WRITE_FAILED',
        message: 'The Agent final result could not be saved to the Project file.',
      };
    }
    if (error instanceof ModelInferenceError) {
      const messages: Record<ModelInferenceError['code'], string> = {
        MODEL_SERVER_UNREACHABLE: 'The model provider could not be reached.',
        MODEL_SERVER_TIMEOUT: 'The model provider request timed out.',
        MODEL_SERVER_RESPONSE_ERROR: 'The model provider request failed.',
        MODEL_SERVER_INVALID_RESPONSE: 'The model provider returned an invalid response.',
      };
      return { stage, code: error.code, message: messages[error.code] };
    }
    if (stage === 'skill_load' || error instanceof SkillLoadError) {
      if (error instanceof SkillTooLargeError) {
        return {
          stage: 'skill_load',
          code: 'SKILL_TOO_LARGE',
          message: 'A selected Skill is too large.',
        };
      }
      return {
        stage: 'skill_load',
        code: 'SKILL_UNAVAILABLE',
        message: 'A selected Skill could not be loaded.',
      };
    }
    if (stage === 'tool_resolution' || error instanceof ToolResolutionError) {
      return {
        stage: 'tool_resolution',
        code: 'TOOL_RESOLUTION_FAILED',
        message: 'The Agent tools could not be resolved.',
      };
    }
    if (stage === 'provider_request') {
      return {
        stage,
        code: 'PROVIDER_REQUEST_FAILED',
        message: 'The model provider request failed.',
      };
    }
    if (stage === 'tool_execution_internal') {
      return {
        stage,
        code: 'TOOL_EXECUTION_INTERNAL_ERROR',
        message: 'The Agent tool could not be executed.',
      };
    }
    if (stage === 'model_configuration') {
      if (error instanceof AgentModelNotAllowedError) {
        return {
          stage,
          code: 'MODEL_NOT_ALLOWED',
          message: 'The configured model is not allowed for this connection.',
        };
      }
      return {
        stage,
        code: 'INVALID_MODEL_CONFIGURATION',
        message: 'The configured model connection is unavailable.',
      };
    }
    return {
      stage,
      code: 'AGENT_RUN_FAILED',
      message: 'The Agent run failed.',
    };
  }
}
