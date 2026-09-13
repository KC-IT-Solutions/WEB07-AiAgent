export interface ChatSettingsData {
  defaultModelConnectionId: number | null;
  defaultModelId: string | null;
  showReasoning: boolean;
  showToolCalls: boolean;
}

export type ChatModelDefaults = Pick<
  ChatSettingsData,
  'defaultModelConnectionId' | 'defaultModelId'
>;

export interface ChatSettingsRecord {
  id: number;
  userId: number;
  createdAt: number;
  updatedAt: number;
  data: ChatSettingsData;
}
