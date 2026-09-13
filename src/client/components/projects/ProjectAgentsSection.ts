import { createConfirmationModal } from '../ConfirmationModal.js';
import {
  createProjectBrowseButton,
  createProjectPathPicker,
  getProjectPathPickerParent,
} from './ProjectPathPicker.js';

interface ClientAgent {
  id: number;
  projectId: number;
  sortOrder: number;
  name: string;
  description: string;
  instructionSource: 'inline' | 'file' | 'none';
  instructions: string;
  instructionFilePath: string;
  assignmentSource: 'inline' | 'file';
  assignment: string;
  assignmentFilePath: string;
  modelConnectionId: number;
  modelId: string;
  allowModelSelection: boolean;
  triggerNextAgent: boolean;
  nextAgentId: number | null;
  saveResultToFile: boolean;
  resultDirectory: string;
  resultFilename: string;
  projectFilesystemPermissions: ClientProjectFilesystemPermissions;
  attachedProjectFiles?: string[];
  timeoutMinutes?: number;
  temperature?: number;
  topP?: number;
  unloadModelAfterRun: boolean;
  skillIds: number[];
  toolNames: string[];
  toolConfigurations: ClientAgentToolConfiguration[];
  createdAt: number;
  updatedAt: number;
}

interface ClientAgentToolConfiguration {
  toolName: string;
  preRunInputFile: string | null;
  targetAgentId?: number | null;
}

interface ClientProjectFilesystemPermissions {
  list: boolean;
  read: boolean;
  write: boolean;
  createDirectory: boolean;
  rename: boolean;
  delete: boolean;
}

interface AgentConnection {
  id: number;
  name: string;
}

interface EffectiveModel {
  id: string;
  description: string | null;
}

interface AgentSkill {
  id: number;
  commandName: string;
  name: string;
}

interface AgentTool {
  name: string;
  displayName: string;
}

export type AgentRunStatus = 'running' | 'paused' | 'done' | 'error' | 'cancelled';

interface ClientAgentRun {
  id: number;
  agentId: number;
  projectId: number;
  status: AgentRunStatus;
  task: string;
  finalResult: string | null;
  latestTotalTokens: number | null;
  safeError: ClientAgentSafeError | null;
  startedAt: number;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface ClientAgentRunEvent {
  id: number;
  runId: number;
  eventType: string;
  data: { toolName?: string; status?: string };
  createdAt: number;
}

type ClientAgentExecutionEvent =
  | ClientAgentExecutionContentEvent
  | ClientAgentExecutionPreRunToolCallEvent
  | ClientAgentExecutionPreRunToolResultEvent
  | ClientAgentExecutionToolCallEvent
  | ClientAgentExecutionToolResultEvent
  | ClientAgentExecutionCancelledEvent;

interface ClientAgentExecutionBase {
  id: number;
  runId: number;
  createdAt: number;
}

type ClientAgentExecutionContentType =
  | 'user_task'
  | 'reasoning'
  | 'assistant_message'
  | 'final_result';

type ClientAgentExecutionContentEvent = {
  [T in ClientAgentExecutionContentType]: ClientAgentExecutionBase & {
    eventType: T;
    data: { content: string };
  };
}[ClientAgentExecutionContentType];

interface ClientAgentExecutionToolCallEvent extends ClientAgentExecutionBase {
  eventType: 'tool_call';
  data: { toolCallId: string; toolName: string; arguments: string };
}

interface ClientAgentExecutionToolResultEvent extends ClientAgentExecutionBase {
  eventType: 'tool_result';
  data: {
    toolCallId: string;
    toolName: string;
    result: string;
    status: 'completed' | 'failed';
  };
}

interface ClientAgentExecutionPreRunToolCallEvent extends ClientAgentExecutionBase {
  eventType: 'pre_run_tool_call';
  data: { toolName: string; inputFile: string; callIndex: number; arguments: string };
}

interface ClientAgentExecutionPreRunToolResultEvent extends ClientAgentExecutionBase {
  eventType: 'pre_run_tool_result';
  data: { toolName: string; inputFile: string; callIndex: number; result: string };
}

interface ClientAgentExecutionCancelledData {
  finishReason?: string;
  totalTokens?: number;
}

interface ClientAgentExecutionCancelledEvent extends ClientAgentExecutionBase {
  eventType: 'inference_cancelled';
  data: ClientAgentExecutionCancelledData;
}

interface ClientAgentSafeError {
  stage: string;
  code: string;
  message: string;
  toolName?: string;
  inputFile?: string;
  callIndex?: number;
  arguments?: string;
  errorCode?: string;
  errorName?: string;
  errorMessage?: string;
  actualCharacters?: number;
  limitCharacters?: number;
  actualBytes?: number;
  limitBytes?: number;
}

interface ClientAgentError extends ClientAgentSafeError {
  timestamp: number;
  runId: number;
}

const DEFAULT_AGENT_TIMEOUT_MINUTES = 30;
const DEFAULT_AGENT_TEMPERATURE = 0.8;
const DEFAULT_AGENT_TOP_P = 0.8;
const AGENT_RUNNER_TOOL_NAME = 'run_agent';

function parseAgentTimeout(value: string): number {
  const num = Number(value.replace(',', '.'));
  if (!Number.isFinite(num) || !Number.isSafeInteger(num) || num <= 0) return DEFAULT_AGENT_TIMEOUT_MINUTES;
  return num;
}

function parseInferenceNumber(value: string): number {
  const num = Number(value.replace(',', '.'));
  if (!Number.isFinite(num) || num < 0 || num > 1) return DEFAULT_AGENT_TEMPERATURE;
  return num;
}

function formatGroupedInteger(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatCharacterSize(value: number): string {
  return `${formatGroupedInteger(value)} characters`;
}

function formatByteSize(value: number): string {
  if (value < 1024) return `${formatGroupedInteger(value)} B`;
  const unit = value < 1024 * 1024 ? 'KiB' : 'MiB';
  const divisor = unit === 'KiB' ? 1024 : 1024 * 1024;
  return `${(value / divisor).toFixed(1)} ${unit} (${formatGroupedInteger(value)} bytes)`;
}

let agentEditorId = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

function parseIdArray(value: unknown): number[] | null {
  return Array.isArray(value) &&
    value.every((item) => Number.isSafeInteger(item) && Number(item) > 0)
    ? value.map(Number)
    : null;
}

function parseToolConfigurations(
  value: unknown,
  toolNames: readonly string[],
): ClientAgentToolConfiguration[] | null {
  if (value === undefined) {
    return toolNames.map((toolName) => ({ toolName, preRunInputFile: null }));
  }
  if (!Array.isArray(value)) return null;
  const configurations = value.flatMap((item): ClientAgentToolConfiguration[] => {
    if (
      !isRecord(item) ||
      Object.keys(item).some(
        (key) => key !== 'toolName' && key !== 'preRunInputFile' && key !== 'targetAgentId',
      ) ||
      typeof item.toolName !== 'string' ||
      item.toolName.length === 0 ||
      (item.preRunInputFile !== null && typeof item.preRunInputFile !== 'string') ||
      (item.targetAgentId !== undefined &&
        item.targetAgentId !== null &&
        (!Number.isSafeInteger(item.targetAgentId) || Number(item.targetAgentId) <= 0))
    ) {
      return [];
    }
    return [{
      toolName: item.toolName,
      preRunInputFile: item.preRunInputFile,
      ...(item.targetAgentId !== undefined
        ? { targetAgentId: item.targetAgentId === null ? null : Number(item.targetAgentId) }
        : {}),
    }];
  });
  return configurations.length === value.length &&
    new Set(configurations.map((item) => item.toolName)).size === configurations.length
    ? configurations
    : null;
}

function parseProjectFilesystemPermissions(value: unknown): ClientProjectFilesystemPermissions | null {
  if (!isRecord(value)) return null;
  const requiredKeys = [
    'list',
    'read',
    'write',
    'createDirectory',
    'rename',
    'delete',
  ] as const;
  for (const key of requiredKeys) {
    if (!(key in value) || typeof value[key] !== 'boolean') return null;
  }
  return {
    list: Boolean(value.list),
    read: Boolean(value.read),
    write: Boolean(value.write),
    createDirectory: Boolean(value.createDirectory),
    rename: Boolean(value.rename),
    delete: Boolean(value.delete),
  };
}

function parseAgent(value: unknown, projectId: number): ClientAgent | null {
  if (!isRecord(value)) return null;
  const skillIds = parseIdArray(value.skillIds);
  const toolNames = parseStringArray(value.toolNames);
  const toolConfigurations = toolNames
    ? parseToolConfigurations(value.toolConfigurations, toolNames)
    : null;
  const permissions = parseProjectFilesystemPermissions(value.projectFilesystemPermissions);
  const attachedProjectFiles = parseStringArray(value.attachedProjectFiles) ?? [];
  const assignmentSource = value.assignmentSource ?? 'inline';
  const assignmentFilePath = value.assignmentFilePath ?? '';
  if (
    !Number.isSafeInteger(value.id) ||
    Number(value.id) <= 0 ||
    value.projectId !== projectId ||
    !Number.isSafeInteger(value.sortOrder) ||
    Number(value.sortOrder) < 0 ||
    typeof value.name !== 'string' ||
    value.name.length === 0 ||
    typeof value.description !== 'string' ||
    (value.instructionSource !== 'inline' &&
      value.instructionSource !== 'file' &&
      value.instructionSource !== 'none') ||
    typeof value.instructions !== 'string' ||
    typeof value.instructionFilePath !== 'string' ||
    (assignmentSource !== 'inline' && assignmentSource !== 'file') ||
    typeof value.assignment !== 'string' ||
    typeof assignmentFilePath !== 'string' ||
    !Number.isSafeInteger(value.modelConnectionId) ||
    Number(value.modelConnectionId) <= 0 ||
    typeof value.modelId !== 'string' ||
    value.modelId.length === 0 ||
    typeof value.allowModelSelection !== 'boolean' ||
    typeof value.triggerNextAgent !== 'boolean' ||
    (value.nextAgentId !== null &&
      (!Number.isSafeInteger(value.nextAgentId) || Number(value.nextAgentId) <= 0)) ||
    typeof value.saveResultToFile !== 'boolean' ||
    typeof value.resultDirectory !== 'string' ||
    typeof value.resultFilename !== 'string' ||
    !skillIds ||
    !toolNames ||
    !toolConfigurations ||
    !permissions ||
    !Number.isInteger(value.createdAt) ||
    !Number.isInteger(value.updatedAt)
  ) {
    return null;
  }
  return {
    id: Number(value.id),
    projectId,
    sortOrder: Number(value.sortOrder),
    name: value.name,
    description: value.description,
    instructionSource: value.instructionSource,
    instructions: value.instructions,
    instructionFilePath: value.instructionFilePath,
    assignmentSource,
    assignment: value.assignment,
    assignmentFilePath,
    modelConnectionId: Number(value.modelConnectionId),
    modelId: value.modelId,
    allowModelSelection: value.allowModelSelection,
    triggerNextAgent: value.triggerNextAgent,
    nextAgentId: value.nextAgentId === null ? null : Number(value.nextAgentId),
    saveResultToFile: value.saveResultToFile,
    resultDirectory: value.resultDirectory,
    resultFilename: value.resultFilename,
    projectFilesystemPermissions: permissions,
    attachedProjectFiles,
    skillIds,
    toolNames,
    toolConfigurations,
    createdAt: Number(value.createdAt),
    updatedAt: Number(value.updatedAt),
    ...(typeof value.timeoutMinutes === 'number' && Number.isFinite(value.timeoutMinutes) ? { timeoutMinutes: value.timeoutMinutes } : {}),
    ...(typeof value.temperature === 'number' && Number.isFinite(value.temperature) ? { temperature: value.temperature } : {}),
    ...(typeof value.topP === 'number' && Number.isFinite(value.topP) ? { topP: value.topP } : {}),
    unloadModelAfterRun: typeof value.unloadModelAfterRun === 'boolean' ? value.unloadModelAfterRun : false,
  };
}

function parseAgents(value: unknown, projectId: number): ClientAgent[] | null {
  if (!Array.isArray(value)) return null;
  const agents = value.map((item) => parseAgent(item, projectId));
  return agents.every((agent): agent is ClientAgent => agent !== null) ? agents : null;
}

function parseRun(value: unknown, projectId: number, agentId: number): ClientAgentRun | null {
  if (!isRecord(value)) return null;
  const statuses: AgentRunStatus[] = ['running', 'paused', 'done', 'error', 'cancelled'];
  const safeError = value.safeError;
  if (
    !Number.isSafeInteger(value.id) ||
    Number(value.id) <= 0 ||
    value.projectId !== projectId ||
    value.agentId !== agentId ||
    !statuses.includes(value.status as AgentRunStatus) ||
    typeof value.task !== 'string' ||
    (value.finalResult !== null && typeof value.finalResult !== 'string') ||
    (value.latestTotalTokens !== undefined &&
      value.latestTotalTokens !== null &&
      (!Number.isSafeInteger(value.latestTotalTokens) || Number(value.latestTotalTokens) < 0)) ||
    (safeError !== null &&
      (!isRecord(safeError) ||
        typeof safeError.stage !== 'string' ||
        typeof safeError.code !== 'string' ||
        typeof safeError.message !== 'string')) ||
    !Number.isInteger(value.startedAt) ||
    (value.completedAt !== undefined &&
      value.completedAt !== null &&
      !Number.isInteger(value.completedAt)) ||
    !Number.isInteger(value.createdAt) ||
    !Number.isInteger(value.updatedAt)
  ) {
    return null;
  }
  return {
    id: Number(value.id),
    agentId,
    projectId,
    status: value.status as AgentRunStatus,
    task: value.task,
    finalResult: value.finalResult,
    latestTotalTokens:
      value.latestTotalTokens !== undefined && value.latestTotalTokens !== null
        ? Number(value.latestTotalTokens)
        : null,
    safeError: safeError as ClientAgentRun['safeError'],
    startedAt: Number(value.startedAt),
    completedAt:
      value.completedAt === undefined || value.completedAt === null
        ? null
        : Number(value.completedAt),
    createdAt: Number(value.createdAt),
    updatedAt: Number(value.updatedAt),
  };
}

function formatEventType(value: string): string {
  return value
    .split('_')
    .map((part, index) => (index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
}

function formatTokenCount(totalTokens: number): string {
  if (totalTokens < 1000) return String(totalTokens);
  if (totalTokens < 1_000_000) return `${(totalTokens / 1_000).toFixed(1)}k`;
  return `${(totalTokens / 1_000_000).toFixed(1)}m`;
}

export function formatAgentCompletedAt(completedAt: number): string | null {
  const date = new Date(completedAt * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function getAgentCompletionTimestamp(
  status: AgentRunStatus | undefined,
  completedAt: number | null | undefined,
): string | null {
  if (
    completedAt === undefined ||
    completedAt === null ||
    (status !== 'done' && status !== 'error' && status !== 'cancelled')
  ) {
    return null;
  }
  return formatAgentCompletedAt(completedAt);
}

function parseExecutionEvents(value: unknown, runId: number): ClientAgentExecutionEvent[] | null {
  if (!Array.isArray(value)) return null;
  const events = value.flatMap((item): ClientAgentExecutionEvent[] => {
    if (
      !isRecord(item) ||
      !Number.isSafeInteger(item.id) ||
      item.runId !== runId ||
      !Number.isInteger(item.createdAt) ||
      !isRecord(item.data)
    ) {
      return [];
    }
    const base = { id: Number(item.id), runId, createdAt: Number(item.createdAt) };
    if (
      item.eventType === 'user_task' ||
      item.eventType === 'reasoning' ||
      item.eventType === 'assistant_message' ||
      item.eventType === 'final_result'
    ) {
      return typeof item.data.content === 'string'
        ? [{ ...base, eventType: item.eventType, data: { content: item.data.content } }]
        : [];
    }
    if (item.eventType === 'tool_call') {
      if (
        typeof item.data.toolCallId !== 'string' ||
        typeof item.data.toolName !== 'string' ||
        typeof item.data.arguments !== 'string'
      ) {
        return [];
      }
      try {
        JSON.parse(item.data.arguments);
      } catch {
        return [];
      }
      return [
        {
          ...base,
          eventType: 'tool_call',
          data: {
            toolCallId: item.data.toolCallId,
            toolName: item.data.toolName,
            arguments: item.data.arguments,
          },
        },
      ];
    }
    if (item.eventType === 'pre_run_tool_call') {
      if (
        typeof item.data.toolName !== 'string' ||
        typeof item.data.inputFile !== 'string' ||
        !Number.isSafeInteger(item.data.callIndex) ||
        Number(item.data.callIndex) <= 0 ||
        typeof item.data.arguments !== 'string'
      ) {
        return [];
      }
      try {
        JSON.parse(item.data.arguments);
      } catch {
        return [];
      }
      return [{
        ...base,
        eventType: 'pre_run_tool_call',
        data: {
          toolName: item.data.toolName,
          inputFile: item.data.inputFile,
          callIndex: Number(item.data.callIndex),
          arguments: item.data.arguments,
        },
      }];
    }
    if (item.eventType === 'pre_run_tool_result') {
      if (
        typeof item.data.toolName !== 'string' ||
        typeof item.data.inputFile !== 'string' ||
        !Number.isSafeInteger(item.data.callIndex) ||
        Number(item.data.callIndex) <= 0 ||
        typeof item.data.result !== 'string'
      ) {
        return [];
      }
      try {
        JSON.parse(item.data.result);
      } catch {
        return [];
      }
      return [{
        ...base,
        eventType: 'pre_run_tool_result',
        data: {
          toolName: item.data.toolName,
          inputFile: item.data.inputFile,
          callIndex: Number(item.data.callIndex),
          result: item.data.result,
        },
      }];
    }
    if (item.eventType === 'inference_cancelled') {
      const data = { finishReason: undefined as string | undefined, totalTokens: undefined as number | undefined };
      if (typeof item.data.finishReason === 'string') data.finishReason = item.data.finishReason;
      if (Number.isSafeInteger(item.data.totalTokens) && Number(item.data.totalTokens) >= 0) {
        data.totalTokens = Number(item.data.totalTokens);
      }
      return [
        { ...base, eventType: 'inference_cancelled', data },
      ];
    }
    if (
      item.eventType !== 'tool_result' ||
      typeof item.data.toolCallId !== 'string' ||
      typeof item.data.toolName !== 'string' ||
      typeof item.data.result !== 'string' ||
      (item.data.status !== 'completed' && item.data.status !== 'failed')
    ) {
      return [];
    }
    try {
      JSON.parse(item.data.result);
    } catch {
      return [];
    }
    return [
      {
        ...base,
        eventType: 'tool_result',
        data: {
          toolCallId: item.data.toolCallId,
          toolName: item.data.toolName,
          result: item.data.result,
          status: item.data.status,
        },
      },
    ];
  });
  return events.length === value.length ? events : null;
}

function createField(
  id: string,
  labelText: string,
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  helpText?: string,
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'settings-form-group';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  control.id = id;
  control.className = 'settings-input';
  group.append(label, control);
  if (helpText) {
    const help = document.createElement('small');
    help.className = 'projects-field-help';
    help.textContent = helpText;
    group.appendChild(help);
  }
  return group;
}

function createProjectPathField(
  id: string,
  labelText: string,
  input: HTMLInputElement,
  browseButton: HTMLButtonElement,
  helpText: string,
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'settings-form-group';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  input.id = id;
  input.className = 'settings-input';
  const row = document.createElement('div');
  row.className = 'project-path-input-row';
  row.append(input, browseButton);
  const help = document.createElement('small');
  help.className = 'projects-field-help';
  help.textContent = helpText;
  group.append(label, row, help);
  return group;
}

function createChecklist(
  legendText: string,
  items: ReadonlyArray<{ key: string; label: string; action?: HTMLElement }>,
  selected: ReadonlySet<string>,
  idPrefix: string,
): { element: HTMLFieldSetElement; inputs: Map<string, HTMLInputElement> } {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'project-agent-checklist';
  const legend = document.createElement('legend');
  legend.textContent = legendText;
  fieldset.appendChild(legend);
  const inputs = new Map<string, HTMLInputElement>();
  if (items.length === 0) {
    const empty = document.createElement('small');
    empty.className = 'projects-field-help';
    empty.textContent = `No ${legendText.toLowerCase()} available.`;
    fieldset.appendChild(empty);
  }
  for (const item of items) {
    const row = document.createElement(item.action ? 'div' : 'label');
    row.className = 'project-agent-check-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `${idPrefix}-${item.key}`;
    input.checked = selected.has(item.key);
    const text = document.createElement('span');
    text.textContent = item.label;
    if (item.action) {
      const label = document.createElement('label');
      label.htmlFor = input.id;
      label.append(input, text);
      row.append(label, item.action);
    } else {
      row.append(input, text);
    }
    fieldset.appendChild(row);
    inputs.set(item.key, input);
  }
  return { element: fieldset, inputs };
}

function createAgentRunnerSettingsModal(
  agents: readonly ClientAgent[],
  currentAgentId: number | undefined,
  selectedTargetAgentId: number | null,
  id: number,
  returnFocusTo: HTMLButtonElement,
  onSave: (targetAgentId: number | null) => void,
): HTMLElement {
  let settingsSaved = false;
  const content = document.createElement('div');
  content.className = 'project-agent-runner-settings';
  const targetSelect = document.createElement('select');
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = 'Select an agent';
  targetSelect.appendChild(emptyOption);
  const availableTargets = agents.filter((candidate) => candidate.id !== currentAgentId);
  for (const candidate of availableTargets) {
    const option = document.createElement('option');
    option.value = String(candidate.id);
    option.textContent = candidate.name;
    targetSelect.appendChild(option);
  }
  if (
    selectedTargetAgentId !== null &&
    !availableTargets.some((candidate) => candidate.id === selectedTargetAgentId)
  ) {
    const unavailableOption = document.createElement('option');
    unavailableOption.value = String(selectedTargetAgentId);
    unavailableOption.textContent = `Agent #${selectedTargetAgentId} (unavailable)`;
    unavailableOption.disabled = true;
    targetSelect.appendChild(unavailableOption);
  }
  targetSelect.value = selectedTargetAgentId === null ? '' : String(selectedTargetAgentId);
  content.appendChild(createField(`agent-runner-target-${id}`, 'Target agent', targetSelect));
  const settingsModal = createConfirmationModal({
    title: 'Agent Runner settings',
    message: 'Choose the Agent that this Agent may run.',
    content,
    confirmLabel: 'Save',
    cancelLabel: 'Cancel',
    returnFocusTo,
    canCloseAfterConfirm: () => settingsSaved,
    onConfirm: () => {
      onSave(targetSelect.value === '' ? null : Number(targetSelect.value));
      settingsSaved = true;
    },
  });
  settingsModal.classList.add('project-agent-runner-settings-backdrop');
  return settingsModal;
}

function createPermissionChecklist(
  legendText: string,
  items: ReadonlyArray<{ key: keyof ClientProjectFilesystemPermissions; label: string }>,
  selected: ReadonlySet<keyof ClientProjectFilesystemPermissions>,
  idPrefix: string,
): { element: HTMLFieldSetElement; inputs: Map<keyof ClientProjectFilesystemPermissions, HTMLInputElement> } {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'project-agent-permission-checklist';
  const legend = document.createElement('legend');
  legend.textContent = legendText;
  fieldset.appendChild(legend);
  const inputs = new Map<keyof ClientProjectFilesystemPermissions, HTMLInputElement>();
  for (const item of items) {
    const row = document.createElement('label');
    row.className = 'project-agent-permission-check-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `${idPrefix}-${item.key}`;
    input.checked = selected.has(item.key);
    const text = document.createElement('span');
    text.textContent = item.label;
    row.append(input, text);
    fieldset.appendChild(row);
    inputs.set(item.key, input);
  }
  return { element: fieldset, inputs };
}

function createConditionalSettings(
  checkbox: HTMLInputElement,
  labelText: string,
  helpText: string,
  controls: HTMLElement,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'project-agent-conditional-settings';
  const header = document.createElement('div');
  header.className = 'project-agent-permission';
  const label = document.createElement('label');
  label.htmlFor = checkbox.id;
  label.textContent = labelText;
  const help = document.createElement('small');
  help.className = 'projects-field-help';
  help.textContent = helpText;
  header.append(checkbox, label, help);
  section.append(header, controls);
  return section;
}

export function createProjectAgentsSection(projectId: number): HTMLElement {
  const section = document.createElement('section');
  section.className = 'project-agents';
  const header = document.createElement('div');
  header.className = 'project-agents-header';
  const heading = document.createElement('h3');
  heading.textContent = 'Agents';
  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.className = 'settings-save-button';
  createButton.textContent = '+ New agent';
  createButton.disabled = true;
  header.append(heading, createButton);
  const status = document.createElement('p');
  status.className = 'settings-saved-status';
  status.setAttribute('role', 'status');
  status.textContent = 'Loading agents...';
  const list = document.createElement('ul');
  list.className = 'project-agents-list';
  list.setAttribute('aria-label', 'Project agents');
  section.append(header, status, list);

  let agents: ClientAgent[] = [];
  const latestRuns = new Map<number, ClientAgentRun | null>();
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let removalObserver: MutationObserver | undefined;
  let draggedAgentId: number | null = null;
  let reorderInFlight = false;
  let openAgentActionsId: number | null = null;

  function setStatus(message: string, isError = false): void {
    status.hidden = message.length === 0;
    status.textContent = message;
    status.classList.toggle('settings-saved-status-error', isError);
    status.setAttribute('role', isError ? 'alert' : 'status');
  }

  function render(): void {
    list.replaceChildren();
    if (agents.length === 0) {
      setStatus('No agents yet.');
      return;
    }
    setStatus('');
    for (const agent of agents) {
      const run = latestRuns.get(agent.id) ?? null;
      const runStatus = run?.status ?? 'idle';
      const active = runStatus === 'running' || runStatus === 'paused';
      const item = document.createElement('li');
      item.className = 'project-agent-row';
      item.dataset.agentId = String(agent.id);
      const info = document.createElement('div');
      info.className = 'project-agent-info';
      const dragHandle = document.createElement('button');
      dragHandle.type = 'button';
      dragHandle.className = 'project-agent-drag-handle';
      dragHandle.draggable = !reorderInFlight;
      dragHandle.disabled = reorderInFlight;
      dragHandle.setAttribute('aria-label', `Reorder ${agent.name}`);
      dragHandle.title = 'Drag to reorder';
      const dragIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      dragIcon.setAttribute('viewBox', '0 0 16 20');
      dragIcon.setAttribute('aria-hidden', 'true');
      dragIcon.setAttribute('focusable', 'false');
      for (const [cx, cy] of [
        [5, 4],
        [11, 4],
        [5, 10],
        [11, 10],
        [5, 16],
        [11, 16],
      ]) {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', String(cx));
        dot.setAttribute('cy', String(cy));
        dot.setAttribute('r', '1.5');
        dragIcon.appendChild(dot);
      }
      dragHandle.appendChild(dragIcon);
      dragHandle.addEventListener('dragstart', (event) => {
        draggedAgentId = agent.id;
        item.classList.add('project-agent-row-dragging');
        event.dataTransfer?.setData('application/x-project-agent-id', String(agent.id));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      dragHandle.addEventListener('dragend', () => {
        draggedAgentId = null;
        clearDropIndicators();
      });
      dragHandle.addEventListener('keydown', (event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        const index = agents.findIndex((candidate) => candidate.id === agent.id);
        const targetIndex = event.key === 'ArrowUp' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= agents.length) return;
        void moveAgent(agent.id, agents[targetIndex].id, event.key === 'ArrowDown');
      });
      const details = document.createElement('div');
      details.className = 'project-agent-details';
      const agentHeader = document.createElement('div');
      agentHeader.className = 'project-agent-heading';
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'project-agent-open';
      const name = document.createElement('strong');
      name.textContent = agent.name;
      const description = document.createElement('span');
      description.textContent = agent.description || 'No description.';
      const summary = document.createElement('small');
      summary.textContent = `${agent.modelId} - ${agent.skillIds.length} Skills`;
      openButton.append(name, description, summary);
      openButton.addEventListener('click', () => void openEditor(agent));
      const statusRegion = document.createElement('div');
      statusRegion.className = 'project-agent-status-region';
      if (runStatus === 'error' && run) {
        const errorStatus = document.createElement('button');
        errorStatus.type = 'button';
        errorStatus.className = 'project-agent-status-badge project-agent-status-error';
        errorStatus.textContent = 'ERROR';
        errorStatus.setAttribute('aria-label', 'View Agent error details');
        errorStatus.addEventListener('click', () => openError(run, errorStatus));
        agentHeader.appendChild(openButton);
        statusRegion.appendChild(errorStatus);
      } else {
        const statusBadge = document.createElement('span');
        statusBadge.className = `project-agent-status-badge project-agent-status-${runStatus}`;
        statusBadge.textContent = runStatus.toUpperCase();
        agentHeader.appendChild(openButton);
        statusRegion.appendChild(statusBadge);
      }
      if (run && run.latestTotalTokens !== null) {
        const tokensBadge = document.createElement('span');
        tokensBadge.className = 'project-agent-status-badge project-agent-tokens';
        tokensBadge.textContent = `TOKENS ${formatTokenCount(run.latestTotalTokens)}`;
        statusRegion.appendChild(tokensBadge);
      }
      const completionTimestamp = getAgentCompletionTimestamp(run?.status, run?.completedAt);
      if (completionTimestamp && run?.completedAt !== null && run?.completedAt !== undefined) {
        const completedTime = document.createElement('time');
        completedTime.className = 'project-agent-completed-at';
        completedTime.dateTime = new Date(run.completedAt * 1000).toISOString();
        completedTime.textContent = completionTimestamp;
        statusRegion.appendChild(completedTime);
      }
      details.appendChild(agentHeader);
      info.append(dragHandle, details);
      const actions = document.createElement('div');
      actions.className = 'project-agent-actions';
      const addAction = (
        label: string,
        action: (button: HTMLButtonElement) => void,
      ): HTMLButtonElement => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'project-agent-run-button';
        button.textContent = label;
        button.addEventListener('click', () => action(button));
        actions.appendChild(button);
        return button;
      };
      if (!active) {
        const startButton = addAction('Start', (button) => void startAgent(agent, button));
        startButton.disabled =
          agent.assignmentSource === 'file'
            ? agent.assignmentFilePath.trim().length === 0
            : agent.assignment.trim().length === 0;
        if (startButton.disabled) {
          startButton.title = 'Add a Task / Assignment in Agent settings before starting.';
        }
      }
      if (active && run) {
        if (run.status === 'running') {
          addAction('Pause', () => void performRunAction(agent, run, 'pause'));
        }
        if (run.status === 'paused') {
          addAction('Resume', () => void performRunAction(agent, run, 'resume'));
        }
        addAction('Cancel', () => void performRunAction(agent, run, 'cancel'));
      }
      const overflowActions = document.createElement('div');
      overflowActions.className = 'project-agent-overflow';
      overflowActions.addEventListener('click', (event) => event.stopPropagation());
      const overflowButton = document.createElement('button');
      overflowButton.type = 'button';
      overflowButton.className = 'project-agent-actions-trigger';
      overflowButton.textContent = '\u2026';
      overflowButton.setAttribute('aria-label', 'Agent actions');
      overflowButton.setAttribute('aria-haspopup', 'menu');
      overflowButton.setAttribute(
        'aria-expanded',
        String(openAgentActionsId === agent.id),
      );
      overflowButton.setAttribute('data-agent-actions-id', String(agent.id));
      overflowButton.addEventListener('click', () => {
        openAgentActionsId = openAgentActionsId === agent.id ? null : agent.id;
        render();
        if (openAgentActionsId === agent.id) {
          overflowActions.querySelector<HTMLButtonElement>('.project-agent-actions-menu-button')?.focus();
        }
      });
      overflowActions.appendChild(overflowButton);
      if (openAgentActionsId === agent.id) {
        const menu = document.createElement('div');
        menu.className = 'project-agent-actions-menu';
        menu.setAttribute('role', 'menu');

        const copyMenuItem = document.createElement('button');
        copyMenuItem.type = 'button';
        copyMenuItem.className = 'project-agent-actions-menu-button';
        copyMenuItem.textContent = 'Copy agent';
        copyMenuItem.setAttribute('role', 'menuitem');
        copyMenuItem.addEventListener('click', () => {
          openAgentActionsId = null;
          render();
          void copyAgent(agent);
        });

        const executionMenuItem = document.createElement('button');
        executionMenuItem.type = 'button';
        executionMenuItem.className = 'project-agent-actions-menu-button';
        executionMenuItem.textContent = 'Execution';
        executionMenuItem.setAttribute('role', 'menuitem');
        executionMenuItem.disabled = run === null;
        executionMenuItem.addEventListener('click', () => {
          openAgentActionsId = null;
          void openExecution(agent, run, overflowButton);
        });

        const runLogMenuItem = document.createElement('button');
        runLogMenuItem.type = 'button';
        runLogMenuItem.className = 'project-agent-actions-menu-button';
        runLogMenuItem.textContent = 'Run log';
        runLogMenuItem.setAttribute('role', 'menuitem');
        runLogMenuItem.disabled = run === null;
        runLogMenuItem.addEventListener('click', () => {
          openAgentActionsId = null;
          void openRunLog(agent, run, overflowButton);
        });

        const errorLogMenuItem = document.createElement('button');
        errorLogMenuItem.type = 'button';
        errorLogMenuItem.className = 'project-agent-actions-menu-button';
        errorLogMenuItem.textContent = 'Error log';
        errorLogMenuItem.setAttribute('role', 'menuitem');
        errorLogMenuItem.addEventListener('click', () => {
          openAgentActionsId = null;
          void openErrorLog(agent, overflowButton);
        });

        menu.append(copyMenuItem, executionMenuItem, runLogMenuItem, errorLogMenuItem);
        overflowActions.appendChild(menu);
      }
      actions.appendChild(overflowActions);
      item.addEventListener('dragover', (event) => {
        if (draggedAgentId === null || draggedAgentId === agent.id || reorderInFlight) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        clearDropIndicators();
        const after = event.clientY >= item.getBoundingClientRect().top + item.offsetHeight / 2;
        item.classList.add(
          after ? 'project-agent-row-drop-after' : 'project-agent-row-drop-before',
        );
      });
      item.addEventListener('drop', (event) => {
        if (draggedAgentId === null || draggedAgentId === agent.id || reorderInFlight) return;
        event.preventDefault();
        const after = item.classList.contains('project-agent-row-drop-after');
        const movedAgentId = draggedAgentId;
        draggedAgentId = null;
        clearDropIndicators();
        void moveAgent(movedAgentId, agent.id, after);
      });
      item.append(info, statusRegion, actions);
      list.appendChild(item);
    }
  }

  function clearDropIndicators(): void {
    for (const item of list.querySelectorAll('.project-agent-row')) {
      item.classList.remove(
        'project-agent-row-dragging',
        'project-agent-row-drop-before',
        'project-agent-row-drop-after',
      );
    }
  }

  async function moveAgent(agentId: number, targetAgentId: number, after: boolean): Promise<void> {
    if (reorderInFlight) return;
    const previous = [...agents];
    const moved = agents.find((agent) => agent.id === agentId);
    if (!moved) return;
    const reordered = agents.filter((agent) => agent.id !== agentId);
    const targetIndex = reordered.findIndex((agent) => agent.id === targetAgentId);
    if (targetIndex < 0) return;
    reordered.splice(targetIndex + (after ? 1 : 0), 0, moved);
    if (reordered.every((agent, index) => agent.id === agents[index]?.id)) return;
    agents = reordered;
    reorderInFlight = true;
    render();
    try {
      const response = await fetch(`/api/projects/${projectId}/agents/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentIds: reordered.map((agent) => agent.id) }),
      });
      const persisted = response.ok ? parseAgents(await response.json(), projectId) : null;
      if (!persisted) throw new Error('Failed to persist Agent order');
      agents = persisted;
      reorderInFlight = false;
      render();
    } catch {
      reorderInFlight = false;
      try {
        await loadAgents();
      } catch {
        agents = previous;
        render();
      }
      setStatus('Failed to reorder Agents. The saved order was restored.', true);
    }
  }

  async function loadLatestRuns(): Promise<void> {
    const loaded = await Promise.all(
      agents.map(async (agent) => {
        const response = await fetch(`/api/projects/${projectId}/agents/${agent.id}/runs/latest`);
        if (!response.ok) throw new Error('Failed to load Agent status');
        const value = (await response.json()) as unknown;
        const run = value === null ? null : parseRun(value, projectId, agent.id);
        if (value !== null && !run) throw new Error('Invalid Agent run response');
        return [agent.id, run] as const;
      }),
    );
    latestRuns.clear();
    for (const [agentId, run] of loaded) latestRuns.set(agentId, run);
  }

  async function loadAgents(): Promise<void> {
    const response = await fetch(`/api/projects/${projectId}/agents`);
    const loaded = response.ok ? parseAgents(await response.json(), projectId) : null;
    if (!loaded) throw new Error('Invalid agents response');
    agents = loaded;
    await loadLatestRuns();
    render();
  }

  function schedulePoll(): void {
    if (section.isConnected && !removalObserver) {
      removalObserver = new MutationObserver(() => {
        if (section.isConnected) return;
        if (pollTimer !== undefined) clearTimeout(pollTimer);
        pollTimer = undefined;
        removalObserver?.disconnect();
        removalObserver = undefined;
      });
      removalObserver.observe(document.body, { childList: true, subtree: true });
    }
    if (pollTimer !== undefined) return;
    pollTimer = setTimeout(async () => {
      pollTimer = undefined;
      if (!section.isConnected) return;
      try {
        await loadLatestRuns();
        if (draggedAgentId === null) render();
      } catch {
        setStatus('Failed to refresh Agent status.', true);
      }
      if (section.isConnected) schedulePoll();
    }, 1500);
  }

  async function loadEditorOptions(): Promise<{
    connections: AgentConnection[];
    skills: AgentSkill[];
    tools: AgentTool[];
  }> {
    const [connectionResponse, skillResponse, toolResponse] = await Promise.all([
      fetch('/api/model-connections'),
      fetch('/api/skills'),
      fetch('/api/tools'),
    ]);
    const connectionValues = connectionResponse.ok ? ((await connectionResponse.json()) as unknown) : null;
    const skillValues = skillResponse.ok ? ((await skillResponse.json()) as unknown) : null;
    const toolValues = toolResponse.ok ? ((await toolResponse.json()) as unknown) : null;
    if (!Array.isArray(connectionValues) || !Array.isArray(skillValues) || !Array.isArray(toolValues)) {
      throw new Error('Invalid Agent options');
    }
    const connections = connectionValues.flatMap((value): AgentConnection[] => {
      if (!isRecord(value) || !Number.isSafeInteger(value.id) || !isRecord(value.data) || typeof value.data.name !== 'string') return [];
      return [{ id: Number(value.id), name: value.data.name }];
    });
    const skills = skillValues.flatMap((value): AgentSkill[] => {
      if (!isRecord(value) || !Number.isSafeInteger(value.id) || typeof value.name !== 'string' || typeof value.commandName !== 'string') return [];
      return [{ id: Number(value.id), name: value.name, commandName: value.commandName }];
    });
    const tools = toolValues.flatMap((value): AgentTool[] => {
      if (!isRecord(value) || typeof value.name !== 'string' || typeof value.displayName !== 'string') return [];
      return [{ name: value.name, displayName: value.displayName }];
    });
    return { connections, skills, tools };
  }

  function populateModels(
    select: HTMLSelectElement,
    models: readonly EffectiveModel[],
    selected: string,
    description?: HTMLElement,
  ): void {
    select.replaceChildren();
    const discoveredModels = new Set(models.map((model) => model.id));
    const values = [...new Set([selected, ...models.map((model) => model.id)].filter((model) => model.length > 0))];
    for (const model of values) {
      const option = document.createElement('option');
      option.value = model;
      const unavailable = model === selected && !discoveredModels.has(model);
      option.textContent = unavailable ? `${model} (hidden or unavailable)` : model;
      option.disabled = unavailable;
      const modelDescription = models.find((item) => item.id === model)?.description;
      if (modelDescription) option.dataset.description = modelDescription;
      select.appendChild(option);
    }
    select.value = selected || values[0] || '';
    select.disabled = models.length === 0;
    if (description) description.textContent = select.selectedOptions[0]?.dataset.description ?? '';
  }

  async function loadModels(
    connectionId: number,
    select: HTMLSelectElement,
    selected = '',
    description?: HTMLElement,
  ): Promise<void> {
    select.disabled = true;
    const response = await fetch(`/api/model-connections/${connectionId}/models`);
    const value = response.ok ? ((await response.json()) as unknown) : null;
    if (!isRecord(value) || !Array.isArray(value.models)) {
      populateModels(select, [], selected, description);
      throw new Error('Model discovery failed');
    }
    const models = value.models.flatMap((model): EffectiveModel[] => {
      if (
        !isRecord(model) ||
        typeof model.id !== 'string' ||
        (model.description !== null && typeof model.description !== 'string')
      ) {
        return [];
      }
      return [{ id: model.id, description: model.description }];
    });
    if (models.length !== value.models.length) {
      populateModels(select, [], selected, description);
      throw new Error('Model discovery failed');
    }
    populateModels(select, models, selected, description);
  }

  function appendReadModal(
    title: string,
    content: HTMLElement,
    returnFocusTo?: HTMLElement,
  ): HTMLElement {
    const modal = createConfirmationModal({
      title,
      message: '',
      content,
      confirmLabel: 'Close',
      destructive: false,
      returnFocusTo,
      onConfirm: () => undefined,
      canCloseAfterConfirm: () => true,
    });
    modal.classList.add('project-agent-run-modal-backdrop');
    section.appendChild(modal);
    return modal;
  }

  function renderExecution(
    content: HTMLElement,
    events: readonly ClientAgentExecutionEvent[],
  ): void {
    content.replaceChildren();
    if (events.length === 0) {
      content.textContent = 'Execution has not started yet.';
      return;
    }
    const labels: Record<ClientAgentExecutionEvent['eventType'], string> = {
      user_task: 'User task',
      reasoning: 'Provider reasoning',
      assistant_message: 'Assistant',
      tool_call: 'Tool call',
      tool_result: 'Tool result',
      pre_run_tool_call: 'Pre-run tool call',
      pre_run_tool_result: 'Pre-run tool result',
      final_result: 'Final result',
      inference_cancelled: 'Inference cancelled',
    };
    for (const event of events) {
      const entry = document.createElement('article');
      entry.className = `project-agent-execution-event project-agent-execution-${event.eventType.replace(/_/g, '-')}`;
      const header = document.createElement('header');
      const label = document.createElement('strong');
      label.textContent = labels[event.eventType];
      const time = document.createElement('time');
      time.dateTime = new Date(event.createdAt * 1000).toISOString();
      time.textContent = new Date(event.createdAt * 1000).toLocaleTimeString();
      header.append(label, time);
      entry.appendChild(header);
      if (event.eventType === 'inference_cancelled') {
        const statusText = document.createElement('p');
        statusText.className = 'project-agent-execution-status';
        statusText.textContent = 'Inference cancelled';
        entry.appendChild(statusText);
      } else if (
        event.eventType === 'user_task' ||
        event.eventType === 'reasoning' ||
        event.eventType === 'assistant_message' ||
        event.eventType === 'final_result'
      ) {
        const text = document.createElement('p');
        text.textContent = event.data.content;
        entry.appendChild(text);
      } else {
        const tool = document.createElement('strong');
        tool.textContent = `Tool: ${event.data.toolName}`;
        if (
          event.eventType === 'pre_run_tool_call' ||
          event.eventType === 'pre_run_tool_result'
        ) {
          const metadata = document.createElement('span');
          metadata.textContent = `Input file: ${event.data.inputFile}, Call ${event.data.callIndex}`;
          entry.append(tool, metadata);
        } else {
          entry.appendChild(tool);
        }
        const fieldLabel = document.createElement('span');
        const isCall = event.eventType === 'tool_call' || event.eventType === 'pre_run_tool_call';
        fieldLabel.textContent = isCall ? 'Arguments:' : 'Result:';
        const structured = document.createElement('pre');
        const json = isCall ? event.data.arguments : event.data.result;
        structured.textContent = JSON.stringify(JSON.parse(json) as unknown, null, 2);
        entry.append(fieldLabel, structured);
      }
      content.appendChild(entry);
    }
  }

  function openExecution(
    agent: ClientAgent,
    run: ClientAgentRun | null,
    returnFocusTo: HTMLElement,
  ): void {
    if (!run) return;
    const content = document.createElement('div');
    content.className = 'project-agent-execution';
    content.setAttribute('aria-live', 'polite');
    content.textContent = 'Loading execution...';
    const modal = appendReadModal('Execution', content, returnFocusTo);
    modal.classList.add('project-agent-execution-modal-backdrop');

    const refresh = async (): Promise<void> => {
      if (!modal.isConnected) return;
      try {
        const response = await fetch(
          `/api/projects/${projectId}/agents/${agent.id}/runs/${run.id}/execution`,
        );
        const events = response.ok
          ? parseExecutionEvents((await response.json()) as unknown, run.id)
          : null;
        if (!events) throw new Error('Invalid Agent execution');
        renderExecution(content, events);
      } catch {
        content.textContent = 'Failed to load the Agent execution.';
      }
      const current = latestRuns.get(agent.id);
      if (
        modal.isConnected &&
        current?.id === run.id &&
        (current.status === 'running' || current.status === 'paused')
      ) {
        setTimeout(() => void refresh(), 1500);
      }
    };
    void refresh();
  }

  function openError(run: ClientAgentRun, returnFocusTo: HTMLElement): void {
    if (!run.safeError) return;
    const details = document.createElement('dl');
    details.className = 'project-agent-run-details';
    for (const [label, value] of [
      ['Run', `#${run.id}`],
      ['Stage', run.safeError.stage],
      ['Code', run.safeError.code],
      ['Error', run.safeError.message],
    ]) {
      const term = document.createElement('dt');
      term.textContent = label;
      const description = document.createElement('dd');
      description.textContent = value;
      details.append(term, description);
    }
    appendReadModal('Agent error', details, returnFocusTo);
  }

  async function openRunLog(
    agent: ClientAgent,
    run: ClientAgentRun | null,
    returnFocusTo: HTMLElement,
  ): Promise<void> {
    if (!run) return;
    try {
      const response = await fetch(
        `/api/projects/${projectId}/agents/${agent.id}/runs/${run.id}/events`,
      );
      const values = response.ok ? ((await response.json()) as unknown) : null;
      if (!Array.isArray(values)) throw new Error('Invalid Agent run log');
      const events = values.flatMap((value): ClientAgentRunEvent[] => {
        const data = isRecord(value) && isRecord(value.data) ? value.data : null;
        if (
          !isRecord(value) ||
          !Number.isSafeInteger(value.id) ||
          value.runId !== run.id ||
          typeof value.eventType !== 'string' ||
          !data ||
          (data.toolName !== undefined && typeof data.toolName !== 'string') ||
          (data.status !== undefined && typeof data.status !== 'string') ||
          !Number.isInteger(value.createdAt)
        ) {
          return [];
        }
        return [
          {
            id: Number(value.id),
            runId: run.id,
            eventType: value.eventType,
            data: {
              ...(typeof data.toolName === 'string' ? { toolName: data.toolName } : {}),
              ...(typeof data.status === 'string' ? { status: data.status } : {}),
            },
            createdAt: Number(value.createdAt),
          },
        ];
      });
      if (events.length !== values.length) throw new Error('Invalid Agent run log');
      const content = document.createElement('ol');
      content.className = 'project-agent-run-log';
      for (const event of events) {
        const item = document.createElement('li');
        const time = document.createElement('time');
        time.dateTime = new Date(event.createdAt * 1000).toISOString();
        time.textContent = new Date(event.createdAt * 1000).toLocaleTimeString();
        const text = document.createElement('span');
        text.textContent = `${formatEventType(event.eventType)}${event.data.toolName ? `: ${event.data.toolName}` : ''}`;
        item.append(time, text);
        content.appendChild(item);
      }
      appendReadModal('Run log', content, returnFocusTo);
    } catch {
      setStatus('Failed to load the Agent run log.', true);
    }
  }

  async function openErrorLog(agent: ClientAgent, returnFocusTo: HTMLElement): Promise<void> {
    try {
      const response = await fetch(`/api/projects/${projectId}/agents/${agent.id}/errors`);
      const values = response.ok ? ((await response.json()) as unknown) : null;
      if (!Array.isArray(values)) throw new Error('Invalid Agent error log');
      const errors = values.flatMap((value): ClientAgentError[] => {
        if (
          !isRecord(value) ||
          !Number.isInteger(value.timestamp) ||
          !Number.isSafeInteger(value.runId) ||
          typeof value.stage !== 'string' ||
          typeof value.code !== 'string' ||
          typeof value.message !== 'string'
        ) {
          return [];
        }
        return [
          {
            timestamp: Number(value.timestamp),
            runId: Number(value.runId),
            stage: value.stage,
            code: value.code,
            message: value.message,
            ...(typeof value.toolName === 'string' ? { toolName: value.toolName } : {}),
            ...(typeof value.inputFile === 'string' ? { inputFile: value.inputFile } : {}),
            ...(Number.isSafeInteger(value.callIndex) && Number(value.callIndex) > 0
              ? { callIndex: Number(value.callIndex) }
              : {}),
            ...(typeof value.arguments === 'string' ? { arguments: value.arguments } : {}),
            ...(typeof value.errorCode === 'string' ? { errorCode: value.errorCode } : {}),
            ...(typeof value.errorName === 'string' ? { errorName: value.errorName } : {}),
            ...(typeof value.errorMessage === 'string'
              ? { errorMessage: value.errorMessage }
              : {}),
            ...(Number.isSafeInteger(value.actualCharacters) &&
            Number(value.actualCharacters) >= 0
              ? { actualCharacters: Number(value.actualCharacters) }
              : {}),
            ...(Number.isSafeInteger(value.limitCharacters) && Number(value.limitCharacters) >= 0
              ? { limitCharacters: Number(value.limitCharacters) }
              : {}),
            ...(Number.isSafeInteger(value.actualBytes) && Number(value.actualBytes) >= 0
              ? { actualBytes: Number(value.actualBytes) }
              : {}),
            ...(Number.isSafeInteger(value.limitBytes) && Number(value.limitBytes) >= 0
              ? { limitBytes: Number(value.limitBytes) }
              : {}),
          },
        ];
      });
      if (errors.length !== values.length) throw new Error('Invalid Agent error log');
      const content = document.createElement('div');
      content.className = 'project-agent-error-log';
      if (errors.length === 0) content.textContent = 'No errors.';
      for (const error of errors) {
        const entry = document.createElement('article');
        const timestamp = document.createElement('time');
        timestamp.dateTime = new Date(error.timestamp * 1000).toISOString();
        timestamp.textContent = new Date(error.timestamp * 1000).toLocaleString();
        const runLabel = document.createElement('strong');
        runLabel.textContent = `Run #${error.runId}`;
        const stage = document.createElement('code');
        stage.textContent = error.stage;
        const message = document.createElement('p');
        message.textContent = error.message;
        entry.append(timestamp, runLabel, stage, message);
        const sizeDiagnostics: Array<[string, string]> = [];
        if (error.actualCharacters !== undefined) {
          sizeDiagnostics.push(['Actual size', formatCharacterSize(error.actualCharacters)]);
        }
        if (error.limitCharacters !== undefined) {
          sizeDiagnostics.push(['Limit', formatCharacterSize(error.limitCharacters)]);
        }
        if (
          error.actualCharacters !== undefined &&
          error.limitCharacters !== undefined &&
          error.actualCharacters > error.limitCharacters
        ) {
          sizeDiagnostics.push([
            'Exceeded by',
            formatCharacterSize(error.actualCharacters - error.limitCharacters),
          ]);
        }
        if (error.actualBytes !== undefined) {
          sizeDiagnostics.push(['Actual size', formatByteSize(error.actualBytes)]);
        }
        if (error.limitBytes !== undefined) {
          sizeDiagnostics.push(['Limit', formatByteSize(error.limitBytes)]);
        }
        if (
          error.actualBytes !== undefined &&
          error.limitBytes !== undefined &&
          error.actualBytes > error.limitBytes
        ) {
          sizeDiagnostics.push([
            'Exceeded by',
            formatByteSize(error.actualBytes - error.limitBytes),
          ]);
        }
        const diagnostics: Array<[string, string | number]> = [
          ['Tool', error.toolName],
          ['Input file', error.inputFile],
          ['Call', error.callIndex],
          ['Error code', error.errorCode],
          ['Error name', error.errorName],
          ['Error message', error.errorMessage],
          ['Arguments', error.arguments],
        ].filter((item): item is [string, string | number] => item[1] !== undefined);
        diagnostics.push(...sizeDiagnostics);
        if (diagnostics.length > 0) {
          const details = document.createElement('dl');
          for (const [label, value] of diagnostics) {
            const term = document.createElement('dt');
            term.textContent = label;
            const description = document.createElement('dd');
            description.textContent = String(value);
            details.append(term, description);
          }
          entry.appendChild(details);
        }
        content.appendChild(entry);
      }
      appendReadModal('Error log', content, returnFocusTo);
    } catch {
      setStatus('Failed to load the Agent error log.', true);
    }
  }

  async function startAgent(agent: ClientAgent, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const response = await fetch(`/api/projects/${projectId}/agents/${agent.id}/runs`, {
        method: 'POST',
      });
      const run = response.ok ? parseRun(await response.json(), projectId, agent.id) : null;
      if (!run) throw new Error('Failed to start Agent');
      latestRuns.set(agent.id, run);
      render();
    } catch {
      render();
      setStatus('Failed to start Agent. It may already have an active run.', true);
    }
  }

  async function copyAgent(agent: ClientAgent): Promise<void> {
    try {
      const response = await fetch(`/api/projects/${projectId}/agents/${agent.id}/copy`, {
        method: 'POST',
      });
      const copied = response.ok ? parseAgent(await response.json(), projectId) : null;
      if (!copied) throw new Error('Copy failed');
      await loadAgents();
      setStatus('Agent copied.');
    } catch {
      setStatus('Failed to copy Agent.', true);
    }
  }

  async function performRunAction(
    agent: ClientAgent,
    run: ClientAgentRun,
    action: 'pause' | 'resume' | 'cancel',
  ): Promise<void> {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/agents/${agent.id}/runs/${run.id}/${action}`,
        { method: 'POST' },
      );
      const updated = response.ok ? parseRun(await response.json(), projectId, agent.id) : null;
      if (!updated) throw new Error('Agent lifecycle action failed');
      latestRuns.set(agent.id, updated);
      render();
    } catch {
      setStatus(`Failed to ${action} Agent run.`, true);
    }
  }

  async function openEditor(agent?: ClientAgent): Promise<void> {
    let options;
    try {
      options = await loadEditorOptions();
    } catch {
      setStatus('Failed to load Agent settings.', true);
      return;
    }
    const id = ++agentEditorId;
    const form = document.createElement('form');
    form.className = 'project-agent-editor';
    form.addEventListener('submit', (event) => event.preventDefault());
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.required = true;
    nameInput.maxLength = 120;
    nameInput.value = agent?.name ?? '';
    const descriptionInput = document.createElement('textarea');
    descriptionInput.rows = 3;
    descriptionInput.maxLength = 2000;
    descriptionInput.value = agent?.description ?? '';
    const instructionsInput = document.createElement('textarea');
    instructionsInput.rows = 8;
    instructionsInput.value = agent?.instructions ?? '';
    instructionsInput.placeholder = 'Describe how this Agent should behave.';
    const assignmentInput = document.createElement('textarea');
    assignmentInput.rows = 6;
    assignmentInput.value = agent?.assignment ?? '';
    assignmentInput.placeholder = 'Describe what this Agent should do when started.';
    const instructionSource = agent?.instructionSource ?? 'none';
    const instructionSourceFieldset = document.createElement('fieldset');
    instructionSourceFieldset.className = 'project-agent-instruction-source';
    const instructionSourceLegend = document.createElement('legend');
    instructionSourceLegend.textContent = 'Instructions';
    const inlineSource = document.createElement('input');
    inlineSource.type = 'radio';
    inlineSource.name = `agent-instruction-source-${id}`;
    inlineSource.id = `agent-instruction-source-inline-${id}`;
    inlineSource.value = 'inline';
    inlineSource.checked = instructionSource === 'inline';
    const inlineSourceLabel = document.createElement('label');
    inlineSourceLabel.htmlFor = inlineSource.id;
    inlineSourceLabel.textContent = 'Write instructions';
    const fileSource = document.createElement('input');
    fileSource.type = 'radio';
    fileSource.name = inlineSource.name;
    fileSource.id = `agent-instruction-source-file-${id}`;
    fileSource.value = 'file';
    fileSource.checked = instructionSource === 'file';
    const fileSourceLabel = document.createElement('label');
    fileSourceLabel.htmlFor = fileSource.id;
    fileSourceLabel.textContent = 'Use Project file';
    const noneSource = document.createElement('input');
    noneSource.type = 'radio';
    noneSource.name = inlineSource.name;
    noneSource.id = `agent-instruction-source-none-${id}`;
    noneSource.value = 'none';
    noneSource.checked = instructionSource === 'none';
    const noneSourceLabel = document.createElement('label');
    noneSourceLabel.htmlFor = noneSource.id;
    noneSourceLabel.textContent = 'Not in use';
    const inlineSourceRow = document.createElement('div');
    inlineSourceRow.className = 'project-agent-source-option';
    inlineSourceRow.append(inlineSource, inlineSourceLabel);
    const fileSourceRow = document.createElement('div');
    fileSourceRow.className = 'project-agent-source-option';
    fileSourceRow.append(fileSource, fileSourceLabel);
    const noneSourceRow = document.createElement('div');
    noneSourceRow.className = 'project-agent-source-option';
    noneSourceRow.append(noneSource, noneSourceLabel);
    instructionSourceFieldset.append(
      instructionSourceLegend,
      inlineSourceRow,
      fileSourceRow,
      noneSourceRow,
    );
    const inlineInstructionsField = createField(
      `agent-instructions-${id}`,
      'Inline instructions',
      instructionsInput,
    );
    const instructionFilePath = document.createElement('input');
    instructionFilePath.type = 'text';
    instructionFilePath.maxLength = 2048;
    instructionFilePath.placeholder = 'docs/agent-instructions.md';
    instructionFilePath.value = agent?.instructionFilePath ?? '';
    const instructionBrowseButton = createProjectBrowseButton('file');
    const instructionFileField = createProjectPathField(
      `agent-instruction-file-${id}`,
      'Instruction file',
      instructionFilePath,
      instructionBrowseButton,
      'Project-relative .md or .txt file. The current file content will be used at run time.',
    );
    instructionBrowseButton.addEventListener('click', () => {
      document.body.appendChild(
        createProjectPathPicker({
          projectId,
          mode: 'file',
          allowedExtensions: ['.md', '.txt'],
          initialPath: getProjectPathPickerParent(instructionFilePath.value.trim()),
          returnFocusTo: instructionBrowseButton,
          onSelect: (path) => {
            instructionFilePath.value = path;
          },
        }),
      );
    });
    const assignmentSource = agent?.assignmentSource ?? 'inline';
    const assignmentSourceFieldset = document.createElement('fieldset');
    assignmentSourceFieldset.className = 'project-agent-instruction-source';
    const assignmentSourceLegend = document.createElement('legend');
    assignmentSourceLegend.textContent = 'Task source';
    const assignmentInlineSource = document.createElement('input');
    assignmentInlineSource.type = 'radio';
    assignmentInlineSource.name = `agent-assignment-source-${id}`;
    assignmentInlineSource.id = `agent-assignment-source-inline-${id}`;
    assignmentInlineSource.value = 'inline';
    assignmentInlineSource.checked = assignmentSource === 'inline';
    const assignmentInlineSourceLabel = document.createElement('label');
    assignmentInlineSourceLabel.htmlFor = assignmentInlineSource.id;
    assignmentInlineSourceLabel.textContent = 'Write task';
    const assignmentFileSource = document.createElement('input');
    assignmentFileSource.type = 'radio';
    assignmentFileSource.name = assignmentInlineSource.name;
    assignmentFileSource.id = `agent-assignment-source-file-${id}`;
    assignmentFileSource.value = 'file';
    assignmentFileSource.checked = assignmentSource === 'file';
    const assignmentFileSourceLabel = document.createElement('label');
    assignmentFileSourceLabel.htmlFor = assignmentFileSource.id;
    assignmentFileSourceLabel.textContent = 'Use Project file';
    const assignmentInlineSourceRow = document.createElement('div');
    assignmentInlineSourceRow.className = 'project-agent-source-option';
    assignmentInlineSourceRow.append(assignmentInlineSource, assignmentInlineSourceLabel);
    const assignmentFileSourceRow = document.createElement('div');
    assignmentFileSourceRow.className = 'project-agent-source-option';
    assignmentFileSourceRow.append(assignmentFileSource, assignmentFileSourceLabel);
    assignmentSourceFieldset.append(
      assignmentSourceLegend,
      assignmentInlineSourceRow,
      assignmentFileSourceRow,
    );
    const assignmentField = createField(
      `agent-assignment-${id}`,
      'Task / Assignment',
      assignmentInput,
      'What this Agent should do when started.',
    );
    const assignmentFilePath = document.createElement('input');
    assignmentFilePath.type = 'text';
    assignmentFilePath.maxLength = 2048;
    assignmentFilePath.placeholder = 'tasks/agent-task.md';
    assignmentFilePath.value = agent?.assignmentFilePath ?? '';
    const assignmentBrowseButton = createProjectBrowseButton('file');
    const assignmentFileField = createProjectPathField(
      `agent-assignment-file-${id}`,
      'Task file',
      assignmentFilePath,
      assignmentBrowseButton,
      'Project-relative .md or .txt file. The current file content will be used at run time.',
    );
    assignmentBrowseButton.addEventListener('click', () => {
      document.body.appendChild(
        createProjectPathPicker({
          projectId,
          mode: 'file',
          allowedExtensions: ['.md', '.txt'],
          initialPath: getProjectPathPickerParent(assignmentFilePath.value.trim()),
          returnFocusTo: assignmentBrowseButton,
          onSelect: (path) => {
            assignmentFilePath.value = path;
          },
        }),
      );
    });
    const connectionSelect = document.createElement('select');
    connectionSelect.required = true;
    for (const connection of options.connections) {
      const option = document.createElement('option');
      option.value = String(connection.id);
      option.textContent = connection.name;
      connectionSelect.appendChild(option);
    }
    connectionSelect.value = String(agent?.modelConnectionId ?? options.connections[0]?.id ?? '');
    const modelSelect = document.createElement('select');
    modelSelect.required = true;
    populateModels(modelSelect, [], agent?.modelId ?? '');
    const modelDescription = document.createElement('p');
    modelDescription.className = 'projects-field-help project-agent-model-description';
    const allowModelSelection = document.createElement('input');
    allowModelSelection.type = 'checkbox';
    allowModelSelection.id = `agent-allow-model-${id}`;
    allowModelSelection.checked = agent?.allowModelSelection ?? false;
    const triggerNextAgent = document.createElement('input');
    triggerNextAgent.type = 'checkbox';
    triggerNextAgent.id = `agent-trigger-next-${id}`;
    triggerNextAgent.checked = agent?.triggerNextAgent ?? false;
    const nextAgentControls = document.createElement('div');
    nextAgentControls.id = `agent-next-controls-${id}`;
    nextAgentControls.className = 'project-agent-nested-settings';
    const nextAgentSelect = document.createElement('select');
    const emptyNextAgentOption = document.createElement('option');
    emptyNextAgentOption.value = '';
    emptyNextAgentOption.textContent = 'Select an agent';
    nextAgentSelect.appendChild(emptyNextAgentOption);
    for (const candidate of agents.filter((candidate) => candidate.id !== agent?.id)) {
      const option = document.createElement('option');
      option.value = String(candidate.id);
      option.textContent = candidate.name;
      nextAgentSelect.appendChild(option);
    }
    nextAgentSelect.value = String(agent?.nextAgentId ?? '');
    nextAgentControls.appendChild(
      createField(`agent-next-${id}`, 'Next agent', nextAgentSelect),
    );
    const saveResultToFile = document.createElement('input');
    saveResultToFile.type = 'checkbox';
    saveResultToFile.id = `agent-save-result-${id}`;
    saveResultToFile.checked = agent?.saveResultToFile ?? false;
    const resultControls = document.createElement('div');
    resultControls.id = `agent-result-controls-${id}`;
    resultControls.className = 'project-agent-nested-settings';
    const resultDirectory = document.createElement('input');
    resultDirectory.type = 'text';
    resultDirectory.maxLength = 2048;
    resultDirectory.placeholder = 'reports/daily';
    resultDirectory.value = agent?.resultDirectory ?? '';
    const resultDirectoryBrowseButton = createProjectBrowseButton('directory');
    resultDirectoryBrowseButton.addEventListener('click', () => {
      document.body.appendChild(
        createProjectPathPicker({
          projectId,
          mode: 'directory',
          initialPath: resultDirectory.value.trim(),
          returnFocusTo: resultDirectoryBrowseButton,
          onSelect: (path) => {
            resultDirectory.value = path;
          },
        }),
      );
    });
    const resultFilename = document.createElement('input');
    resultFilename.type = 'text';
    resultFilename.maxLength = 2048;
    resultFilename.placeholder = 'result.md';
    resultFilename.value = agent?.resultFilename ?? '';
    resultControls.append(
      createProjectPathField(
        `agent-result-directory-${id}`,
        'Directory',
        resultDirectory,
        resultDirectoryBrowseButton,
        'Relative to the Project root. Leave empty for the Project root.',
      ),
      createField(`agent-result-filename-${id}`, 'Filename', resultFilename),
    );

    function updateConditionalSettings(): void {
      nextAgentControls.hidden = !triggerNextAgent.checked;
      nextAgentSelect.required = triggerNextAgent.checked;
      triggerNextAgent.setAttribute('aria-controls', nextAgentControls.id);
      triggerNextAgent.setAttribute('aria-expanded', String(triggerNextAgent.checked));
      resultControls.hidden = !saveResultToFile.checked;
      resultFilename.required = saveResultToFile.checked;
      saveResultToFile.setAttribute('aria-controls', resultControls.id);
      saveResultToFile.setAttribute('aria-expanded', String(saveResultToFile.checked));
    }

    function updateInstructionSource(): void {
      inlineInstructionsField.hidden = !inlineSource.checked;
      instructionFileField.hidden = !fileSource.checked;
      instructionFilePath.required = fileSource.checked;
    }

    function updateAssignmentSource(): void {
      const usesFile = assignmentFileSource.checked;
      assignmentField.hidden = usesFile;
      assignmentFileField.hidden = !usesFile;
      assignmentFilePath.required = usesFile;
    }

    const nameLabel = createField(`agent-name-${id}`, 'Name', nameInput);
    const descriptionLabel = createField(`agent-description-${id}`, 'Description', descriptionInput, 'Optional');

    /* ── Tab panels ── */
    const generalPanel = document.createElement('div');
    generalPanel.className = 'project-agent-tab-panel';
    generalPanel.id = `agent-tab-panel-general-${id}`;
    generalPanel.setAttribute('role', 'tabpanel');
    generalPanel.setAttribute('aria-labelledby', `agent-tab-general-${id}`);
    generalPanel.append(nameLabel, descriptionLabel);

    const promptPanel = document.createElement('div');
    promptPanel.className = 'project-agent-tab-panel';
    promptPanel.id = `agent-tab-panel-prompt-${id}`;
    promptPanel.setAttribute('role', 'tabpanel');
    promptPanel.setAttribute('aria-labelledby', `agent-tab-prompt-${id}`);
    promptPanel.hidden = true;
    promptPanel.append(
      instructionSourceFieldset,
      inlineInstructionsField,
      instructionFileField,
      assignmentSourceFieldset,
      assignmentField,
      assignmentFileField,
    );

    const modelPanel = document.createElement('div');
    modelPanel.className = 'project-agent-tab-panel';
    modelPanel.id = `agent-tab-panel-model-${id}`;
    modelPanel.setAttribute('role', 'tabpanel');
    modelPanel.setAttribute('aria-labelledby', `agent-tab-model-${id}`);
    modelPanel.hidden = true;

    const contextPanel = document.createElement('div');
    contextPanel.className = 'project-agent-tab-panel';
    contextPanel.id = `agent-tab-panel-context-${id}`;
    contextPanel.setAttribute('role', 'tabpanel');
    contextPanel.setAttribute('aria-labelledby', `agent-tab-context-${id}`);
    contextPanel.hidden = true;

    const toolsSkillsPanel = document.createElement('div');
    toolsSkillsPanel.className = 'project-agent-tab-panel';
    toolsSkillsPanel.id = `agent-tab-panel-tools-skills-${id}`;
    toolsSkillsPanel.setAttribute('role', 'tabpanel');
    toolsSkillsPanel.setAttribute('aria-labelledby', `agent-tab-tools-skills-${id}`);
    toolsSkillsPanel.hidden = true;

    const runtimePanel = document.createElement('div');
    runtimePanel.className = 'project-agent-tab-panel';
    runtimePanel.id = `agent-tab-panel-runtime-${id}`;
    runtimePanel.setAttribute('role', 'tabpanel');
    runtimePanel.setAttribute('aria-labelledby', `agent-tab-runtime-${id}`);
    runtimePanel.hidden = true;

    let attachedProjectFiles = [...(agent?.attachedProjectFiles ?? [])];
    const attachedFilesSection = document.createElement('section');
    attachedFilesSection.className = 'project-agent-attached-files';
    const attachedHeading = document.createElement('h3');
    attachedHeading.textContent = 'Attached project files';
    const attachedDescription = document.createElement('p');
    attachedDescription.textContent = 'Attach Project files to provide context for this Agent.';
    attachedFilesSection.append(attachedHeading, attachedDescription);

    
    const attachedFilesList = document.createElement('div');
    attachedFilesList.className = 'project-agent-attached-files-list';

    function renderAttachedFiles(): void {
      attachedFilesList.replaceChildren();

      if (attachedProjectFiles.length === 0) {
        const emptyMessage = document.createElement('small');
        emptyMessage.className = 'projects-field-help';
        emptyMessage.textContent = 'No files attached.';
        attachedFilesList.appendChild(emptyMessage);
        return;
      }

      for (const filePath of attachedProjectFiles) {
        const fileEntry = document.createElement('div');
        fileEntry.className = 'project-agent-attached-file-entry';

        const fileLabel = document.createElement('span');
        fileLabel.className = 'project-agent-attached-file-label';
        fileLabel.textContent = filePath;

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'project-agent-remove-file-button';
        removeButton.setAttribute('aria-label', `Remove ${filePath}`);
        removeButton.textContent = 'Remove';

        removeButton.addEventListener('click', () => {
          attachedProjectFiles = attachedProjectFiles.filter(
            (candidate) => candidate !== filePath,
          );
          renderAttachedFiles();
        });

        fileEntry.append(fileLabel, removeButton);
        attachedFilesList.appendChild(fileEntry);
      }
    }
    renderAttachedFiles();
    attachedFilesSection.appendChild(attachedFilesList);

    const addFileButton = document.createElement('button');
    addFileButton.type = 'button';
    addFileButton.className = 'project-agent-add-file-button';
    addFileButton.textContent = '+ Add file';
    addFileButton.addEventListener('click', () => {
      document.body.appendChild(
        createProjectPathPicker({
          projectId,
          mode: 'file',
          allowedExtensions: [],
          initialPath: '',
          returnFocusTo: addFileButton,
          onSelect: (path) => {
            if (!attachedProjectFiles.includes(path)) {
              attachedProjectFiles = [...attachedProjectFiles, path];
              renderAttachedFiles();
            }
          },
        }),
      );
    });
    attachedFilesSection.appendChild(addFileButton);

    contextPanel.appendChild(attachedFilesSection);

    const connectionLabel = createField(`agent-connection-${id}`, 'Model connection', connectionSelect);
    const modelLabel = createField(`agent-model-${id}`, 'Model', modelSelect);
    modelPanel.append(connectionLabel, modelLabel, modelDescription);
    const permission = document.createElement('div');
    permission.className = 'project-agent-permission';
    const permissionLabel = document.createElement('label');
    permissionLabel.htmlFor = allowModelSelection.id;
    permissionLabel.textContent = 'Allow agent to choose model';
    const permissionHelp = document.createElement('small');
    permissionHelp.className = 'projects-field-help';
    permissionHelp.textContent = 'Allows this Agent to choose another approved model during execution.';
    permission.append(allowModelSelection, permissionLabel, permissionHelp);
    modelPanel.appendChild(permission);

    const unloadCheckbox = document.createElement('input');
    unloadCheckbox.type = 'checkbox';
    unloadCheckbox.id = `agent-unload-model-${id}`;
    unloadCheckbox.checked = agent?.unloadModelAfterRun ?? false;
    const unloadPermission = document.createElement('div');
    unloadPermission.className = 'project-agent-permission';
    const unloadLabel = document.createElement('label');
    unloadLabel.htmlFor = unloadCheckbox.id;
    unloadLabel.textContent = 'Unload model after Agent run';
    const unloadHelp = document.createElement('small');
    unloadHelp.className = 'projects-field-help';
    unloadHelp.textContent = 'Unload the model from LM Studio when this Agent run finishes.';
    unloadPermission.append(unloadCheckbox, unloadLabel, unloadHelp);
    modelPanel.appendChild(unloadPermission);

    /* ── Inference settings ── */
    const inferenceSettingsSection = document.createElement('section');
    inferenceSettingsSection.className = 'project-agent-inference-settings';
    const inferenceHeading = document.createElement('h3');
    inferenceHeading.textContent = 'Inference settings';
    inferenceSettingsSection.appendChild(inferenceHeading);

    const timeoutInput = document.createElement('input');
    timeoutInput.type = 'number';
    timeoutInput.min = '1';
    timeoutInput.step = '1';
    timeoutInput.value = String(agent?.timeoutMinutes ?? DEFAULT_AGENT_TIMEOUT_MINUTES);
    const timeoutField = createField(`agent-timeout-${id}`, 'Connection timeout', timeoutInput, 'Timeout in minutes for provider requests.');

    const temperatureInput = document.createElement('input');
    temperatureInput.type = 'number';
    temperatureInput.min = '0';
    temperatureInput.max = '1';
    temperatureInput.step = '0.01';
    temperatureInput.value = agent?.temperature !== undefined ? String(agent.temperature) : String(DEFAULT_AGENT_TEMPERATURE);
    const temperatureField = createField(`agent-temperature-${id}`, 'Temperature', temperatureInput, 'Controls randomness. 0 is deterministic, 1 is creative.');

    const topPInput = document.createElement('input');
    topPInput.type = 'number';
    topPInput.min = '0';
    topPInput.max = '1';
    topPInput.step = '0.01';
    topPInput.value = agent?.topP !== undefined ? String(agent.topP) : String(DEFAULT_AGENT_TOP_P);
    const topPField = createField(`agent-top-p-${id}`, 'Top P', topPInput, 'Nucleus sampling cutoff.');

    inferenceSettingsSection.append(timeoutField, temperatureField, topPField);
    modelPanel.appendChild(inferenceSettingsSection);

    const filesystemPermissionsSection = document.createElement('section');
    filesystemPermissionsSection.className = 'project-agent-filesystem-permissions';
    const filesystemHeading = document.createElement('h3');
    filesystemHeading.textContent = 'Project file permissions';
    const filesystemDescription = document.createElement('p');
    filesystemDescription.textContent = 'Controls which Project files this Agent can access.';
    filesystemPermissionsSection.append(filesystemHeading, filesystemDescription);

    const permissionCheckboxes: { key: keyof ClientProjectFilesystemPermissions; label: string }[] = [
      { key: 'list', label: 'List directories' },
      { key: 'read', label: 'Read files' },
      { key: 'write', label: 'Write files' },
      { key: 'createDirectory', label: 'Create directories' },
      { key: 'rename', label: 'Rename / move' },
      { key: 'delete', label: 'Delete' },
    ];

    const permissionChecklist = createPermissionChecklist(
      'Project file permissions',
      permissionCheckboxes.map((item) => ({ key: item.key as keyof ClientProjectFilesystemPermissions, label: item.label })),
      new Set(Object.entries(agent?.projectFilesystemPermissions ?? {}).filter(([, value]) => value).map(([key]) => key as keyof ClientProjectFilesystemPermissions)),
      `agent-filesystem-permission-${id}`,
    );

    permissionChecklist.element.classList.add('project-agent-permission-checklist');
    filesystemPermissionsSection.appendChild(permissionChecklist.element);
    toolsSkillsPanel.appendChild(filesystemPermissionsSection);

    const skillChecklist = createChecklist(
      'Skills',
      options.skills.map((skill) => ({ key: String(skill.id), label: `${skill.name} (/${skill.commandName})` })),
      new Set((agent?.skillIds ?? []).map(String)),
      `agent-skill-${id}`,
    );
    let runnerTargetAgentId =
      agent?.toolConfigurations.find(
        (configuration) => configuration.toolName === AGENT_RUNNER_TOOL_NAME,
      )?.targetAgentId ?? null;
    const runnerSettingsButton = document.createElement('button');
    runnerSettingsButton.type = 'button';
    runnerSettingsButton.className = 'project-agent-tool-settings-button';
    runnerSettingsButton.textContent = '...';
    runnerSettingsButton.setAttribute('aria-label', 'Configure Agent Runner');
    runnerSettingsButton.setAttribute('aria-haspopup', 'dialog');

    function openAgentRunnerSettings(): void {
      document.body.appendChild(
        createAgentRunnerSettingsModal(
          agents,
          agent?.id,
          runnerTargetAgentId,
          id,
          runnerSettingsButton,
          (targetAgentId) => {
            runnerTargetAgentId = targetAgentId;
          },
        ),
      );
    }
    runnerSettingsButton.addEventListener('click', openAgentRunnerSettings);
    const toolChecklist = createChecklist(
      'Model tool access',
      options.tools.map((tool) => ({
        key: tool.name,
        label: `${tool.displayName}: Allow model to use this tool`,
        ...(tool.name === AGENT_RUNNER_TOOL_NAME ? { action: runnerSettingsButton } : {}),
      })),
      new Set(agent?.toolNames ?? []),
      `agent-tool-${id}`,
    );
    const preRunFiles = new Map<string, HTMLInputElement>();
    const preRunSettings = document.createElement('section');
    preRunSettings.className = 'project-agent-pre-run-settings';
    const preRunHeading = document.createElement('h3');
    preRunHeading.textContent = 'Tool pre-run input files';
    const preRunHelp = document.createElement('p');
    preRunHelp.className = 'projects-field-help';
    preRunHelp.textContent = 'Each file contains an ordered JSON array of argument objects for that tool. Every entry runs once before the first model request, and returned information is added to the user context before the Agent task.';
    preRunSettings.append(preRunHeading, preRunHelp);
    const savedPreRunFiles = new Map(
      (agent?.toolConfigurations ?? []).map((configuration) => [
        configuration.toolName,
        configuration.preRunInputFile,
      ]),
    );
    for (const tool of options.tools) {
      const controls = document.createElement('div');
      controls.className = 'project-agent-pre-run-tool';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 2048;
      input.placeholder = 'None';
      input.value = savedPreRunFiles.get(tool.name) ?? '';
      const browseButton = createProjectBrowseButton('file');
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'settings-test-button';
      clearButton.textContent = 'None';
      clearButton.setAttribute('aria-label', `Clear pre-run input file for ${tool.displayName}`);
      const pathRow = document.createElement('div');
      pathRow.className = 'project-path-input-row';
      pathRow.append(input, browseButton, clearButton);
      const label = document.createElement('label');
      input.id = `agent-tool-pre-run-${id}-${tool.name}`;
      input.className = 'settings-input';
      label.htmlFor = input.id;
      label.textContent = `${tool.displayName}: Pre-run input file`;
      controls.append(label, pathRow);
      browseButton.addEventListener('click', () => {
        document.body.appendChild(
          createProjectPathPicker({
            projectId,
            mode: 'file',
            allowedExtensions: ['.json'],
            initialPath: getProjectPathPickerParent(input.value.trim()),
            returnFocusTo: browseButton,
            onSelect: (path) => {
              input.value = path;
            },
          }),
        );
      });
      clearButton.addEventListener('click', () => {
        input.value = '';
      });
      preRunFiles.set(tool.name, input);
      preRunSettings.appendChild(controls);
    }
    toolsSkillsPanel.append(skillChecklist.element, toolChecklist.element, preRunSettings);
    runtimePanel.append(
      createConditionalSettings(
        triggerNextAgent,
        'Trigger another agent after successful completion',
        'Starts one other Agent only after this Agent reaches a normal final result.',
        nextAgentControls,
      ),
      createConditionalSettings(
        saveResultToFile,
        'Save final result to Project file',
        "Saves this Agent's completed final response to a file inside this Project.",
        resultControls,
      ),
    );
    triggerNextAgent.addEventListener('change', updateConditionalSettings);
    saveResultToFile.addEventListener('change', updateConditionalSettings);
    inlineSource.addEventListener('change', updateInstructionSource);
    fileSource.addEventListener('change', updateInstructionSource);
    noneSource.addEventListener('change', updateInstructionSource);
    assignmentInlineSource.addEventListener('change', updateAssignmentSource);
    assignmentFileSource.addEventListener('change', updateAssignmentSource);
    updateConditionalSettings();
    updateInstructionSource();
    updateAssignmentSource();
    const editorError = document.createElement('p');
    editorError.className = 'settings-saved-status settings-saved-status-error';
    editorError.setAttribute('role', 'alert');
    form.appendChild(editorError);

    let advancedPanel: HTMLDivElement | null = null;
    if (agent) {
      advancedPanel = document.createElement('div');
      advancedPanel.className = 'project-agent-tab-panel';
      advancedPanel.id = `agent-tab-panel-advanced-${id}`;
      advancedPanel.setAttribute('role', 'tabpanel');
      advancedPanel.setAttribute('aria-labelledby', `agent-tab-advanced-${id}`);

      const logsSection = document.createElement('section');
      logsSection.className = 'project-agent-logs-section';
      const logsHeading = document.createElement('h3');
      logsHeading.textContent = 'Logs';
      const logsDescription = document.createElement('p');
      logsDescription.textContent = "Clear this Agent's completed run history and error logs.";
      const clearLogsButton = document.createElement('button');
      clearLogsButton.type = 'button';
      clearLogsButton.className = 'project-agent-clear-logs-button';
      clearLogsButton.textContent = 'Clear logs';
      const runStatus = latestRuns.get(agent.id)?.status;
      const activeRun = runStatus === 'running' || runStatus === 'paused';
      clearLogsButton.disabled = activeRun;
      logsSection.append(logsHeading, logsDescription, clearLogsButton);
      if (activeRun) {
        const activeRunHelp = document.createElement('p');
        activeRunHelp.id = `agent-clear-logs-help-${id}`;
        activeRunHelp.className = 'projects-field-help';
        activeRunHelp.textContent = 'Stop or cancel the active run before clearing logs.';
        clearLogsButton.setAttribute('aria-describedby', activeRunHelp.id);
        logsSection.appendChild(activeRunHelp);
      }
      clearLogsButton.addEventListener('click', () => requestClearLogs(agent, clearLogsButton));
      advancedPanel.appendChild(logsSection);

      const dangerZone = document.createElement('section');
      dangerZone.className = 'project-agent-danger-zone';
      const dangerHeading = document.createElement('h3');
      dangerHeading.textContent = 'Danger zone';
      const dangerDescription = document.createElement('p');
      dangerDescription.textContent = 'Deleting this Agent also removes its run history.';
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'settings-delete-button project-agent-delete-button';
      deleteButton.textContent = 'Delete agent';
      const deleteBlocked = runStatus === 'running' || runStatus === 'paused';
      deleteButton.disabled = deleteBlocked;
      dangerZone.append(dangerHeading, dangerDescription, deleteButton);
      if (deleteBlocked) {
        const activeRunHelp = document.createElement('p');
        activeRunHelp.id = `agent-delete-help-${id}`;
        activeRunHelp.className = 'projects-field-help';
        activeRunHelp.textContent = 'Stop or cancel the active run before deleting this Agent.';
        deleteButton.setAttribute('aria-describedby', activeRunHelp.id);
        dangerZone.appendChild(activeRunHelp);
      }
      deleteButton.addEventListener('click', () => {
        requestDelete(agent, deleteButton, () => modal.remove());
      });
      advancedPanel.appendChild(dangerZone);
    }

    connectionSelect.addEventListener('change', () => {
      editorError.textContent = '';
      void loadModels(Number(connectionSelect.value), modelSelect, '', modelDescription).catch(() => {
        editorError.textContent = 'Failed to load models for this connection.';
      });
    });
    modelSelect.addEventListener('change', () => {
      modelDescription.textContent = modelSelect.selectedOptions[0]?.dataset.description ?? '';
    });
    const selectedConnectionId = Number(connectionSelect.value);
    if (selectedConnectionId > 0) {
      void loadModels(
        selectedConnectionId,
        modelSelect,
        agent?.modelId ?? '',
        modelDescription,
      ).catch(() => {
        if (!agent?.modelId) editorError.textContent = 'Failed to load models for this connection.';
      });
    }

    /* ── Tab bar and panels assembly ── */
    const tabDefinitions: Array<{ label: string; panel: HTMLDivElement }> = [
      { label: 'General', panel: generalPanel },
      { label: 'Prompt', panel: promptPanel },
      { label: 'Model', panel: modelPanel },
      { label: 'Context', panel: contextPanel },
      { label: 'Tools & Skills', panel: toolsSkillsPanel },
      { label: 'Runtime', panel: runtimePanel },
    ];
    if (advancedPanel) {
      tabDefinitions.push({ label: 'Advanced', panel: advancedPanel });
    }

    const tabList = document.createElement('div');
    tabList.className = 'project-agent-tabs';
    tabList.setAttribute('role', 'tablist');

    const tabButtons: HTMLButtonElement[] = [];
    for (const def of tabDefinitions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'project-agent-tab';
      button.textContent = def.label;
      button.id = `agent-tab-${def.label.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-')}-${id}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', def.panel.id);
      tabButtons.push(button);
      tabList.appendChild(button);
    }

    function activateTab(index: number): void {
      for (let i = 0; i < tabButtons.length; i++) {
        const isActive = i === index;
        tabButtons[i].setAttribute('aria-selected', String(isActive));
        tabButtons[i].tabIndex = isActive ? 0 : -1;
        tabDefinitions[i].panel.hidden = !isActive;
      }
    }

    activateTab(0);

    for (let i = 0; i < tabButtons.length; i++) {
      tabButtons[i].addEventListener('click', () => activateTab(i));
    }

    tabList.addEventListener('keydown', (event) => {
      const currentIndex = tabButtons.indexOf(document.activeElement as HTMLButtonElement);
      if (currentIndex < 0) return;
      let nextIndex: number | undefined;
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          nextIndex = (currentIndex + 1) % tabButtons.length;
          break;
        case 'ArrowLeft':
          event.preventDefault();
          nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
          break;
        case 'Home':
          event.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          event.preventDefault();
          nextIndex = tabButtons.length - 1;
          break;
        default:
          return;
      }
      if (nextIndex !== undefined && nextIndex !== currentIndex) {
        tabButtons[nextIndex].focus();
        activateTab(nextIndex);
      }
    });

    const tabContent = document.createElement('div');
    tabContent.className = 'project-agent-tab-content';
    tabContent.append(
      generalPanel,
      promptPanel,
      modelPanel,
      contextPanel,
      toolsSkillsPanel,
      runtimePanel,
    );
    if (advancedPanel) tabContent.appendChild(advancedPanel);

    form.append(tabList, tabContent, editorError);

    let saved = false;
    const modal = createConfirmationModal({
      title: agent ? 'Edit agent' : 'New agent',
      message: '',
      content: form,
      confirmLabel: 'Save',
      cancelLabel: 'Cancel',
      returnFocusTo: agent ? undefined : createButton,
      canCloseAfterConfirm: () => saved,
      onCancel: () => undefined,
      onConfirm: async () => {
        editorError.textContent = '';
        if (!form.checkValidity()) {
          const invalidEl = form.querySelector<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>(
            'textarea:invalid, input[required]:invalid, select:invalid',
          );
          if (invalidEl) {
            const panel = invalidEl.closest<HTMLDivElement>('.project-agent-tab-panel');
            if (panel && panel.hidden) {
              const idx = tabDefinitions.findIndex((d) => d.panel === panel);
              if (idx >= 0) activateTab(idx);
            }
          }
        }
        if (!form.reportValidity()) return;
        const runnerEnabled = toolChecklist.inputs.get(AGENT_RUNNER_TOOL_NAME)?.checked ?? false;
        const runnerTargetAvailable = agents.some(
          (candidate) => candidate.id === runnerTargetAgentId && candidate.id !== agent?.id,
        );
        if (runnerEnabled && !runnerTargetAvailable) {
          activateTab(tabDefinitions.findIndex((definition) => definition.panel === toolsSkillsPanel));
          editorError.textContent = 'Choose a valid target Agent in Agent Runner settings.';
          runnerSettingsButton.focus();
          return;
        }
        const payload = {
          name: nameInput.value.trim(),
          description: descriptionInput.value.trim(),
          instructionSource: inlineSource.checked ? 'inline' : fileSource.checked ? 'file' : 'none',
          instructions: instructionsInput.value.trim(),
          instructionFilePath: instructionFilePath.value.trim(),
          assignmentSource: assignmentFileSource.checked ? 'file' : 'inline',
          assignment: assignmentInput.value.trim(),
          assignmentFilePath: assignmentFilePath.value.trim(),
          attachedProjectFiles: [...attachedProjectFiles],
          modelConnectionId: Number(connectionSelect.value),
          modelId: modelSelect.value,
          allowModelSelection: allowModelSelection.checked,
          unloadModelAfterRun: unloadCheckbox.checked,
          triggerNextAgent: triggerNextAgent.checked,
          nextAgentId: triggerNextAgent.checked ? Number(nextAgentSelect.value) : null,
          saveResultToFile: saveResultToFile.checked,
          resultDirectory: resultDirectory.value.trim(),
          resultFilename: resultFilename.value.trim(),
          projectFilesystemPermissions: {
            list: permissionChecklist.inputs.get('list')!.checked,
            read: permissionChecklist.inputs.get('read')!.checked,
            write: permissionChecklist.inputs.get('write')!.checked,
            createDirectory: permissionChecklist.inputs.get('createDirectory')!.checked,
            rename: permissionChecklist.inputs.get('rename')!.checked,
            delete: permissionChecklist.inputs.get('delete')!.checked,
          },
          skillIds: [...skillChecklist.inputs].filter(([, input]) => input.checked).map(([key]) => Number(key)),
          toolNames: [...toolChecklist.inputs].filter(([, input]) => input.checked).map(([key]) => key),
          toolConfigurations: [...toolChecklist.inputs]
            .filter(
              ([toolName, input]) =>
                input.checked ||
                preRunFiles.get(toolName)!.value.trim().length > 0 ||
                (toolName === AGENT_RUNNER_TOOL_NAME && runnerTargetAgentId !== null),
            )
            .map(([toolName]) => ({
              toolName,
              preRunInputFile: preRunFiles.get(toolName)!.value.trim() || null,
              ...(toolName === AGENT_RUNNER_TOOL_NAME ? { targetAgentId: runnerTargetAgentId } : {}),
            })),
          timeoutMinutes: parseAgentTimeout(timeoutInput.value),
          temperature: parseInferenceNumber(temperatureInput.value),
          topP: parseInferenceNumber(topPInput.value),
        };
        try {
          const response = await fetch(
            agent
              ? `/api/projects/${projectId}/agents/${agent.id}`
              : `/api/projects/${projectId}/agents`,
            {
              method: agent ? 'PUT' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            },
          );
          if (!response.ok || !parseAgent(await response.json(), projectId)) throw new Error('Save failed');
          await loadAgents();
          saved = true;
        } catch {
          editorError.textContent = 'Failed to save Agent. Check the fields and try again.';
        }
      },
    });
    modal.classList.add('project-agent-modal-backdrop');
    section.appendChild(modal);
  }

  function requestDelete(
    agent: ClientAgent,
    returnFocusTo: HTMLButtonElement,
    onDeleted: () => void,
  ): void {
    let deleted = false;
    const deleteError = document.createElement('p');
    deleteError.className = 'settings-saved-status settings-saved-status-error';
    deleteError.setAttribute('role', 'alert');
    const modal = createConfirmationModal({
      title: 'Delete agent?',
      message: `"${agent.name}" will be permanently deleted. Project files will not be changed.`,
      content: deleteError,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
      returnFocusTo,
      canCloseAfterConfirm: () => deleted,
      onCancel: () => undefined,
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/projects/${projectId}/agents/${agent.id}`, { method: 'DELETE' });
          if (!response.ok) throw new Error('Delete failed');
          await loadAgents();
          deleted = true;
          onDeleted();
        } catch {
          deleteError.textContent = 'Failed to delete Agent. Stop any active run and try again.';
        }
      },
    });
    section.appendChild(modal);
  }

  function requestClearLogs(agent: ClientAgent, returnFocusTo: HTMLButtonElement): void {
    let cleared = false;
    const clearError = document.createElement('p');
    clearError.className = 'settings-saved-status settings-saved-status-error';
    clearError.setAttribute('role', 'alert');
    const modal = createConfirmationModal({
      title: 'Clear Agent logs?',
      message: 'This permanently removes completed run history and error logs for this Agent.',
      content: clearError,
      confirmLabel: 'Clear logs',
      cancelLabel: 'Cancel',
      destructive: true,
      returnFocusTo,
      canCloseAfterConfirm: () => cleared,
      onCancel: () => undefined,
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/projects/${projectId}/agents/${agent.id}/runs`, {
            method: 'DELETE',
          });
          if (!response.ok) throw new Error('Clear logs failed');
          await loadLatestRuns();
          render();
          setStatus('Agent logs cleared.');
          cleared = true;
        } catch {
          clearError.textContent = 'Failed to clear Agent logs. Stop any active run and try again.';
        }
      },
    });
    section.appendChild(modal);
  }

  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || openAgentActionsId === null) return;
    const closedAgentId = openAgentActionsId;
    openAgentActionsId = null;
    render();
    list.querySelector<HTMLButtonElement>(`[data-agent-actions-id="${closedAgentId}"]`)?.focus();
  });

  document.addEventListener('click', (event: MouseEvent) => {
    if (openAgentActionsId === null) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.project-agent-overflow')) return;
    openAgentActionsId = null;
    render();
  });

  createButton.addEventListener('click', () => void openEditor());
  void loadAgents()
    .then(() => {
      createButton.disabled = false;
      schedulePoll();
    })
    .catch(() => setStatus('Failed to load agents.', true));
  return section;
}
