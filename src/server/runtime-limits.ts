export interface AgentRuntimeLimits {
  toolResultCharacters: number;
  assignmentCharacters: number;
  inlineInstructionsCharacters: number;
  attachedFileBytes: number;
  attachedFilesTotalBytes: number;
}

export interface AgentRuntimeLimitsProvider {
  getAgentRuntimeLimits(): Promise<AgentRuntimeLimits>;
}

export type AgentRuntimeLimitBounds = Readonly<{
  [Key in keyof AgentRuntimeLimits]: Readonly<{ min: number; max: number }>;
}>;

export interface AgentRuntimeLimitsConfiguration {
  limits: AgentRuntimeLimits;
  defaults: AgentRuntimeLimits;
  bounds: AgentRuntimeLimitBounds;
}

export const AGENT_RUNTIME_LIMITS_DEFAULTS: Readonly<AgentRuntimeLimits> = Object.freeze({
  toolResultCharacters: 32_000,
  assignmentCharacters: 100_000,
  inlineInstructionsCharacters: 20_000,
  attachedFileBytes: 256 * 1024,
  attachedFilesTotalBytes: 1024 * 1024,
});

export const AGENT_RUNTIME_LIMITS_BOUNDS: AgentRuntimeLimitBounds = Object.freeze({
  toolResultCharacters: Object.freeze({ min: 1_000, max: 1_000_000 }),
  assignmentCharacters: Object.freeze({ min: 1_000, max: 1_000_000 }),
  inlineInstructionsCharacters: Object.freeze({ min: 1_000, max: 1_000_000 }),
  attachedFileBytes: Object.freeze({ min: 1024, max: 1024 * 1024 }),
  attachedFilesTotalBytes: Object.freeze({ min: 1024, max: 8 * 1024 * 1024 }),
});

export const DEFAULT_AGENT_RUNTIME_LIMITS_PROVIDER: AgentRuntimeLimitsProvider = Object.freeze({
  getAgentRuntimeLimits: async () => ({ ...AGENT_RUNTIME_LIMITS_DEFAULTS }),
});

const AGENT_RUNTIME_LIMIT_KEYS: ReadonlyArray<keyof AgentRuntimeLimits> = [
  'toolResultCharacters',
  'assignmentCharacters',
  'inlineInstructionsCharacters',
  'attachedFileBytes',
  'attachedFilesTotalBytes',
];

export class AgentRuntimeLimitsValidationError extends Error {
  readonly code = 'INVALID_AGENT_RUNTIME_LIMITS';

  constructor() {
    super('INVALID_AGENT_RUNTIME_LIMITS');
    this.name = 'AgentRuntimeLimitsValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isAgentRuntimeLimits(value: unknown): value is AgentRuntimeLimits {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (
    keys.length !== AGENT_RUNTIME_LIMIT_KEYS.length ||
    !keys.every((key) => AGENT_RUNTIME_LIMIT_KEYS.some((expectedKey) => expectedKey === key))
  ) {
    return false;
  }

  const toolResultCharacters = value.toolResultCharacters;
  const assignmentCharacters = value.assignmentCharacters;
  const inlineInstructionsCharacters = value.inlineInstructionsCharacters;
  const attachedFileBytes = value.attachedFileBytes;
  const attachedFilesTotalBytes = value.attachedFilesTotalBytes;
  const isBoundedInteger = (
    field: unknown,
    bounds: Readonly<{ min: number; max: number }>,
  ): field is number =>
    typeof field === 'number' &&
    Number.isFinite(field) &&
    Number.isSafeInteger(field) &&
    field >= bounds.min &&
    field <= bounds.max;

  return (
    isBoundedInteger(toolResultCharacters, AGENT_RUNTIME_LIMITS_BOUNDS.toolResultCharacters) &&
    isBoundedInteger(assignmentCharacters, AGENT_RUNTIME_LIMITS_BOUNDS.assignmentCharacters) &&
    isBoundedInteger(
      inlineInstructionsCharacters,
      AGENT_RUNTIME_LIMITS_BOUNDS.inlineInstructionsCharacters,
    ) &&
    isBoundedInteger(attachedFileBytes, AGENT_RUNTIME_LIMITS_BOUNDS.attachedFileBytes) &&
    isBoundedInteger(
      attachedFilesTotalBytes,
      AGENT_RUNTIME_LIMITS_BOUNDS.attachedFilesTotalBytes,
    ) &&
    attachedFilesTotalBytes >= attachedFileBytes
  );
}

export function validateAgentRuntimeLimits(value: unknown): AgentRuntimeLimits {
  if (!isAgentRuntimeLimits(value)) {
    throw new AgentRuntimeLimitsValidationError();
  }
  return value;
}
