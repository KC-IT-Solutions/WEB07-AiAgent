export interface AgentData {
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
  saveResultToFile: boolean;
  resultDirectory: string;
  resultFilename: string;
  projectFilesystemPermissions: AgentProjectFilesystemPermissions;
  attachedProjectFiles?: string[];
  timeoutMinutes?: number;
  temperature?: number;
  topP?: number;
  unloadModelAfterRun?: boolean;
}

export interface AgentRecord {
  id: number;
  projectId: number;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  data: AgentData;
  nextAgentId: number | null;
  skillIds: number[];
  toolNames: string[];
  toolConfigurations: AgentToolConfiguration[];
}

export interface Agent extends AgentData {
  id: number;
  projectId: number;
  sortOrder: number;
  nextAgentId: number | null;
  skillIds: number[];
  toolNames: string[];
  toolConfigurations: AgentToolConfiguration[];
  createdAt: number;
  updatedAt: number;
}

export interface AgentInput extends AgentData {
  nextAgentId: number | null;
  skillIds: number[];
  toolNames: string[];
  toolConfigurations: AgentToolConfiguration[];
}

export interface AgentToolConfiguration {
  toolName: string;
  preRunInputFile: string | null;
  targetAgentId?: number | null;
}

export interface AgentProjectFilesystemPermissions {
  list: boolean;
  read: boolean;
  write: boolean;
  createDirectory: boolean;
  rename: boolean;
  delete: boolean;
}
