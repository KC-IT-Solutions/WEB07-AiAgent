export interface ChatData {
  title: string;
  modelConnectionId: number | null;
  modelId: string | null;
}

export interface Chat {
  id: number;
  userId: number;
  createdAt: number;
  updatedAt: number;
  data: ChatData;
}

export interface CreateChatInput {
  title: string;
  modelConnectionId: number | null;
  modelId: string | null;
}

export interface UpdateChatInput {
  title?: string;
  modelConnectionId?: number | null;
  modelId?: string | null;
}
