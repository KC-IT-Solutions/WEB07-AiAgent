export interface ModelConnectionData {
  name: string;
  baseUrl: string;
  timeoutMinutes: number;
  modelId: string | null;
  enabled: boolean;
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
  data: ModelConnectionData;
}

export interface CreateModelConnectionInput {
  name: string;
  baseUrl: string;
  timeoutMinutes: number;
  modelId: string | null;
  enabled: boolean;
}
