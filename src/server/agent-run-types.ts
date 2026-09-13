export type AgentRunStatus = 'running' | 'paused' | 'done' | 'error' | 'cancelled';

export interface AgentRunSafeError {
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

export interface AgentRunData {
  task: string;
  originalTask: string;
  finalResult: string | null;
  latestTotalTokens: number | null;
  safeError: AgentRunSafeError | null;
  pauseRequested: boolean;
}

export interface AgentRunRecord {
  id: number;
  agentId: number;
  projectId: number;
  triggeredByRunId: number | null;
  previousAgentId: number | null;
  chainRootRunId: number | null;
  status: AgentRunStatus;
  startedAt: number;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  data: AgentRunData;
}

export interface AgentRun {
  id: number;
  agentId: number;
  projectId: number;
  triggeredByRunId: number | null;
  previousAgentId: number | null;
  chainRootRunId: number | null;
  status: AgentRunStatus;
  task: string;
  finalResult: string | null;
  latestTotalTokens: number | null;
  safeError: AgentRunSafeError | null;
  startedAt: number;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AgentRunEvent {
  id: number;
  runId: number;
  eventType: string;
  data: {
    toolName?: string;
    status?: string;
    nextAgentId?: number;
    triggeredRunId?: number;
    previousAgentId?: number;
    triggeredByRunId?: number;
    targetAgentId?: number;
    targetRunId?: number;
    terminalTargetStatus?: AgentRunStatus;
    modelId?: string;
    reason?: string;
  };
  createdAt: number;
}

export type AgentRunExecutionEvent =
  | AgentRunExecutionContentEvent<'user_task'>
  | AgentRunExecutionContentEvent<'reasoning'>
  | AgentRunExecutionContentEvent<'assistant_message'>
  | AgentRunExecutionPreRunToolCallEvent
  | AgentRunExecutionPreRunToolResultEvent
  | AgentRunExecutionToolCallEvent
  | AgentRunExecutionToolResultEvent
  | AgentRunExecutionContentEvent<'final_result'>
  | AgentRunExecutionCancelledInferenceEvent;

interface AgentRunExecutionCancelledInferenceEvent {
  id: number;
  runId: number;
  eventType: 'inference_cancelled';
  data: {
    reasoning?: string;
    content?: string;
    finishReason?: string;
    totalTokens?: number;
  };
  createdAt: number;
}

interface AgentRunExecutionBase<T extends string, D> {
  id: number;
  runId: number;
  eventType: T;
  data: D;
  createdAt: number;
}

type AgentRunExecutionContentEvent<T extends string> = AgentRunExecutionBase<
  T,
  { content: string }
>;

type AgentRunExecutionToolCallEvent = AgentRunExecutionBase<
  'tool_call',
  { toolCallId: string; toolName: string; arguments: string }
>;

type AgentRunExecutionPreRunToolCallEvent = AgentRunExecutionBase<
  'pre_run_tool_call',
  { toolName: string; inputFile: string; callIndex: number; arguments: string }
>;

type AgentRunExecutionPreRunToolResultEvent = AgentRunExecutionBase<
  'pre_run_tool_result',
  { toolName: string; inputFile: string; callIndex: number; result: string }
>;

type AgentRunExecutionToolResultEvent = AgentRunExecutionBase<
  'tool_result',
  {
    toolCallId: string;
    toolName: string;
    result: string;
    status: 'completed' | 'failed';
  }
>;

export interface AgentRunErrorLogEntry extends AgentRunSafeError {
  timestamp: number;
  runId: number;
}
