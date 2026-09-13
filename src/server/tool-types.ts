export const DUCKDUCKGO_TOOL_NAME = 'duckduckgo_search';
export const VISIT_WEBSITE_TOOL_NAME = 'visit_website';
export const FRED_DATA_TOOL_NAME = 'fred_data';
export const YAHOO_FINANCE_DATA_TOOL_NAME = 'yahoo_finance_data';
export const RUN_AGENT_TOOL_NAME = 'run_agent';

export class InvalidToolArgumentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidToolArgumentsError';
  }
}

export type RecoverableToolErrorCode =
  | 'WEB_SEARCH_FAILED'
  | 'SEARCH_RESPONSE_UNUSABLE'
  | 'WEBSITE_FETCH_FAILED'
  | 'FRED_DATA_FAILED'
  | 'YAHOO_FINANCE_DATA_FAILED';
export interface RecoverableToolErrorMetadata {
  status?: number;
  reason?: 'timeout' | 'network' | 'unreadable';
}

export class RecoverableToolError extends Error {
  constructor(
    readonly code: RecoverableToolErrorCode,
    readonly safeMessage: string,
    readonly metadata?: RecoverableToolErrorMetadata,
  ) {
    super(safeMessage);
    this.name = 'RecoverableToolError';
  }
}

export type SafeSearch = 'strict' | 'moderate' | 'off';

export interface DuckDuckGoSettings {
  enabledForChat: boolean;
  pageSize: number;
  safeSearch: SafeSearch;
  requestDelayMs: number;
  cooldownAfter202Ms: number;
}

export interface VisitWebsiteSettings {
  enabledForChat: boolean;
  contentLimit: number;
  maxLinks: number;
  maxImages: number;
}

export interface FredDataSettings {
  enabledForChat: boolean;
}

export interface YahooFinanceDataSettings {
  enabledForChat: boolean;
}

export type ToolSettings = DuckDuckGoSettings | VisitWebsiteSettings | FredDataSettings | YahooFinanceDataSettings;

export interface ToolSettingsRecord {
  id: number;
  userId: number;
  toolName: string;
  createdAt: number;
  updatedAt: number;
  data: ToolSettings;
}

export interface ToolMetadata {
  name: string;
  displayName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  settings: ToolSettings;
  agentOnly?: boolean;
}

export interface ToolExecutionContext {
  runConfiguredAgent?: (signal?: AbortSignal) => Promise<{ status: 'Done' | 'Error' }>;
}

export interface RegisteredTool {
  name: string;
  displayName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  agentOnly?: boolean;
  execute(
    argumentsValue: unknown,
    settings: ToolSettings,
    signal?: AbortSignal,
    context?: ToolExecutionContext,
  ): Promise<unknown>;
}

export const DEFAULT_DUCKDUCKGO_SETTINGS: DuckDuckGoSettings = {
  enabledForChat: false,
  pageSize: 5,
  safeSearch: 'moderate',
  requestDelayMs: 1500,
  cooldownAfter202Ms: 8000,
};

export const DEFAULT_VISIT_WEBSITE_SETTINGS: VisitWebsiteSettings = {
  enabledForChat: false,
  contentLimit: 2000,
  maxLinks: 10,
  maxImages: 5,
};

export const DEFAULT_FRED_DATA_SETTINGS: FredDataSettings = {
  enabledForChat: false,
};

export const DEFAULT_YAHOO_FINANCE_DATA_SETTINGS: YahooFinanceDataSettings = {
  enabledForChat: false,
};

export function parseDuckDuckGoSettings(value: unknown): DuckDuckGoSettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const settings = value as Record<string, unknown>;
  const allowedKeys = new Set([
    'enabledForChat',
    'pageSize',
    'safeSearch',
    'requestDelayMs',
    'cooldownAfter202Ms',
  ]);
  const requestDelayMs =
    settings.requestDelayMs === undefined
      ? DEFAULT_DUCKDUCKGO_SETTINGS.requestDelayMs
      : settings.requestDelayMs;
  const cooldownAfter202Ms =
    settings.cooldownAfter202Ms === undefined
      ? DEFAULT_DUCKDUCKGO_SETTINGS.cooldownAfter202Ms
      : settings.cooldownAfter202Ms;
  if (
    Object.keys(settings).some((key) => !allowedKeys.has(key)) ||
    typeof settings.enabledForChat !== 'boolean' ||
    typeof settings.pageSize !== 'number' ||
    !Number.isInteger(settings.pageSize) ||
    settings.pageSize < 1 ||
    settings.pageSize > 10 ||
    typeof requestDelayMs !== 'number' ||
    !Number.isSafeInteger(requestDelayMs) ||
    requestDelayMs < 0 ||
    typeof cooldownAfter202Ms !== 'number' ||
    !Number.isSafeInteger(cooldownAfter202Ms) ||
    cooldownAfter202Ms < 0 ||
    (settings.safeSearch !== 'strict' &&
      settings.safeSearch !== 'moderate' &&
      settings.safeSearch !== 'off')
  ) {
    return null;
  }

  return {
    enabledForChat: settings.enabledForChat,
    pageSize: settings.pageSize,
    safeSearch: settings.safeSearch,
    requestDelayMs,
    cooldownAfter202Ms,
  };
}

export function parseVisitWebsiteSettings(value: unknown): VisitWebsiteSettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const settings = value as Record<string, unknown>;
  const allowedKeys = new Set(['enabledForChat', 'contentLimit', 'maxLinks', 'maxImages']);
  if (
    Object.keys(settings).some((key) => !allowedKeys.has(key)) ||
    typeof settings.enabledForChat !== 'boolean' ||
    typeof settings.contentLimit !== 'number' ||
    !Number.isInteger(settings.contentLimit) ||
    settings.contentLimit < 200 ||
    settings.contentLimit > 10_000 ||
    typeof settings.maxLinks !== 'number' ||
    !Number.isInteger(settings.maxLinks) ||
    settings.maxLinks < 0 ||
    settings.maxLinks > 40 ||
    typeof settings.maxImages !== 'number' ||
    !Number.isInteger(settings.maxImages) ||
    settings.maxImages < 0 ||
    settings.maxImages > 20
  ) {
    return null;
  }

  return {
    enabledForChat: settings.enabledForChat,
    contentLimit: settings.contentLimit,
    maxLinks: settings.maxLinks,
    maxImages: settings.maxImages,
  };
}

export function parseFredDataSettings(value: unknown): FredDataSettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const settings = value as Record<string, unknown>;
  const allowedKeys = new Set(['enabledForChat']);
  if (
    Object.keys(settings).some((key) => !allowedKeys.has(key)) ||
    typeof settings.enabledForChat !== 'boolean'
  ) {
    return null;
  }

  return {
    enabledForChat: settings.enabledForChat,
  };
}

export function parseYahooFinanceDataSettings(value: unknown): YahooFinanceDataSettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const settings = value as Record<string, unknown>;
  const allowedKeys = new Set(['enabledForChat']);
  if (
    Object.keys(settings).some((key) => !allowedKeys.has(key)) ||
    typeof settings.enabledForChat !== 'boolean'
  ) {
    return null;
  }

  return {
    enabledForChat: settings.enabledForChat,
  };
}
