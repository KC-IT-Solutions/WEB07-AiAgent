export const MAX_MODEL_DESCRIPTION_LENGTH = 500;

export type ModelDescriptions = Record<string, string>;

export interface ModelConnectionData {
  name: string;
  baseUrl: string;
  timeoutMinutes: number;
  modelId: string | null;
  enabled: boolean;
  filterConfigured: boolean;
  visibleModelIds: string[];
  modelDescriptions: ModelDescriptions;
}

export interface ModelConnectionRow {
  id: number;
  user_id: number;
  created_at: number;
  updated_at: number;
  data: string;
}

export interface ModelConnection {
  id: number;
  userId: number;
  createdAt: number;
  updatedAt: number;
  hasApiKey: boolean;
  data: ModelConnectionData;
}

export interface CreateModelConnectionInput {
  name: string;
  baseUrl: string;
  timeoutMinutes: number;
  modelId: string | null;
  enabled: boolean;
  apiKey?: string;
}

export interface ModelVisibilityConfiguration {
  connectionId: number;
  filterConfigured: boolean;
  visibleModelIds: string[];
}

export interface ModelVisibilityEditor extends ModelVisibilityConfiguration {
  discoveredModels: string[];
  modelDescriptions: ModelDescriptions;
}

export interface ModelDescriptionConfiguration {
  connectionId: number;
  modelDescriptions: ModelDescriptions;
}

export interface EffectiveModel {
  id: string;
  description: string | null;
}
