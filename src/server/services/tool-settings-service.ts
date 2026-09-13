import type { ToolSettingsRepository } from '../repositories/tool-settings-repository.js';
import {
  DEFAULT_DUCKDUCKGO_SETTINGS,
  DEFAULT_FRED_DATA_SETTINGS,
  DEFAULT_VISIT_WEBSITE_SETTINGS,
  DEFAULT_YAHOO_FINANCE_DATA_SETTINGS,
  DUCKDUCKGO_TOOL_NAME,
  FRED_DATA_TOOL_NAME,
  RUN_AGENT_TOOL_NAME,
  VISIT_WEBSITE_TOOL_NAME,
  YAHOO_FINANCE_DATA_TOOL_NAME,
  parseDuckDuckGoSettings,
  parseFredDataSettings,
  parseVisitWebsiteSettings,
  parseYahooFinanceDataSettings,
  type ToolSettings,
  type ToolMetadata,
} from '../tool-types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';

const SERVER_USER_ID = 1;

export class ToolSettingsError extends Error {
  constructor(readonly code: 'UNKNOWN_TOOL' | 'INVALID_SETTINGS') {
    super(code);
    this.name = 'ToolSettingsError';
  }
}

export class ToolSettingsService {
  constructor(
    private readonly repository: ToolSettingsRepository,
    private readonly registry: ToolRegistry,
  ) {}

  async listTools(): Promise<ToolMetadata[]> {
    return Promise.all(
      this.registry.list().map(async (tool) => ({
        name: tool.name,
        displayName: tool.displayName,
        description: tool.description,
        inputSchema: tool.inputSchema,
        settings: await this.getSettings(tool.name),
        ...(tool.agentOnly ? { agentOnly: true } : {}),
      })),
    );
  }

  async getSettings(toolName: string): Promise<ToolSettings> {
    this.requireRegistered(toolName);
    const saved = await this.repository.get(SERVER_USER_ID, toolName);
    if (saved) {
      return saved.data;
    }
    if (toolName === RUN_AGENT_TOOL_NAME) {
      return { enabledForChat: false };
    }
    return toolName === DUCKDUCKGO_TOOL_NAME
      ? { ...DEFAULT_DUCKDUCKGO_SETTINGS }
      : toolName === VISIT_WEBSITE_TOOL_NAME
        ? { ...DEFAULT_VISIT_WEBSITE_SETTINGS }
        : toolName === FRED_DATA_TOOL_NAME
          ? { ...DEFAULT_FRED_DATA_SETTINGS }
          : { ...DEFAULT_YAHOO_FINANCE_DATA_SETTINGS };
  }

  async updateSettings(toolName: string, value: unknown): Promise<ToolSettings> {
    this.requireRegistered(toolName);
    const settings =
      toolName === DUCKDUCKGO_TOOL_NAME
        ? parseDuckDuckGoSettings(value)
        : toolName === VISIT_WEBSITE_TOOL_NAME
          ? parseVisitWebsiteSettings(value)
          : toolName === FRED_DATA_TOOL_NAME
            ? parseFredDataSettings(value)
            : toolName === YAHOO_FINANCE_DATA_TOOL_NAME
              ? parseYahooFinanceDataSettings(value)
              : null;
    if (!settings) {
      throw new ToolSettingsError('INVALID_SETTINGS');
    }
    return (await this.repository.upsert(SERVER_USER_ID, toolName, settings)).data;
  }

  async listEnabledForChat(): Promise<Array<{ name: string; settings: ToolSettings }>> {
    const tools = await this.listTools();
    return tools
      .filter((tool) => !tool.agentOnly && tool.settings.enabledForChat)
      .map((tool) => ({ name: tool.name, settings: tool.settings }));
  }

  private requireRegistered(toolName: string): void {
    if (
      (toolName !== DUCKDUCKGO_TOOL_NAME &&
        toolName !== VISIT_WEBSITE_TOOL_NAME &&
        toolName !== FRED_DATA_TOOL_NAME &&
        toolName !== YAHOO_FINANCE_DATA_TOOL_NAME &&
        toolName !== RUN_AGENT_TOOL_NAME) ||
      !this.registry.get(toolName)
    ) {
      throw new ToolSettingsError('UNKNOWN_TOOL');
    }
  }
}
