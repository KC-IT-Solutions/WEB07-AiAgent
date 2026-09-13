import { createConfirmationModal } from '../ConfirmationModal.js';

type ToolSafeSearch = 'strict' | 'moderate' | 'off';

interface DuckDuckGoToolSettings {
  enabledForChat: boolean;
  pageSize: number;
  safeSearch: ToolSafeSearch;
  requestDelayMs: number;
  cooldownAfter202Ms: number;
}

interface VisitWebsiteToolSettings {
  enabledForChat: boolean;
  contentLimit: number;
  maxLinks: number;
  maxImages: number;
}

interface FredDataToolSettings {
  enabledForChat: boolean;
}

interface YahooFinanceDataToolSettings {
  enabledForChat: boolean;
}

type ToolMetadata = (
  | {
      name: 'duckduckgo_search';
      displayName: string;
      description: string;
      settings: DuckDuckGoToolSettings;
    }
  | {
      name: 'visit_website';
      displayName: string;
      description: string;
      settings: VisitWebsiteToolSettings;
    }
  | {
      name: 'fred_data';
      displayName: string;
      description: string;
      settings: FredDataToolSettings;
    }
  | {
      name: 'yahoo_finance_data';
      displayName: string;
      description: string;
      settings: YahooFinanceDataToolSettings;
    }
  | {
      name: 'run_agent';
      displayName: string;
      description: string;
      settings: FredDataToolSettings;
      agentOnly: true;
    }
) & { agentOnly?: boolean };

interface ToolMetadataBase {
  name: string;
  displayName: string;
  description: string;
  agentOnly?: boolean;
}

function isToolMetadata(value: unknown): value is ToolMetadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const tool = value as Record<string, unknown>;
  if (
    typeof tool.name !== 'string' ||
    typeof tool.displayName !== 'string' ||
    typeof tool.description !== 'string' ||
    (tool.agentOnly !== undefined && typeof tool.agentOnly !== 'boolean') ||
    typeof tool.settings !== 'object' ||
    tool.settings === null ||
    Array.isArray(tool.settings)
  ) {
    return false;
  }
  const metadata = tool as unknown as ToolMetadataBase & { settings: Record<string, unknown> };
  const settings = metadata.settings;
  if (typeof settings.enabledForChat !== 'boolean') return false;
  if (metadata.name === 'duckduckgo_search') {
    return (
      typeof settings.pageSize === 'number' &&
      Number.isInteger(settings.pageSize) &&
      settings.pageSize >= 1 &&
      settings.pageSize <= 10 &&
      typeof settings.requestDelayMs === 'number' &&
      Number.isInteger(settings.requestDelayMs) &&
      settings.requestDelayMs >= 0 &&
      typeof settings.cooldownAfter202Ms === 'number' &&
      Number.isInteger(settings.cooldownAfter202Ms) &&
      settings.cooldownAfter202Ms >= 0 &&
      (settings.safeSearch === 'strict' ||
        settings.safeSearch === 'moderate' ||
        settings.safeSearch === 'off')
    );
  }
  if (metadata.name === 'fred_data') {
    return true;
  }
  if (metadata.name === 'yahoo_finance_data') {
    return true;
  }
  if (metadata.name === 'run_agent') {
    return metadata.agentOnly === true && settings.enabledForChat === false;
  }
  return (
    metadata.name === 'visit_website' &&
    typeof settings.contentLimit === 'number' &&
    Number.isInteger(settings.contentLimit) &&
    settings.contentLimit >= 200 &&
    settings.contentLimit <= 10_000 &&
    typeof settings.maxLinks === 'number' &&
    Number.isInteger(settings.maxLinks) &&
    settings.maxLinks >= 0 &&
    settings.maxLinks <= 40 &&
    typeof settings.maxImages === 'number' &&
    Number.isInteger(settings.maxImages) &&
    settings.maxImages >= 0 &&
    settings.maxImages <= 20
  );
}

function createFormLabel(text: string, htmlFor: string): HTMLLabelElement {
  const label = document.createElement('label');
  label.textContent = text;
  label.htmlFor = htmlFor;
  return label;
}

function createFormGroup(label: HTMLElement, input: HTMLElement): HTMLElement {
  const group = document.createElement('div');
  group.className = 'settings-form-group';
  group.appendChild(label);
  group.appendChild(input);
  return group;
}

export function createToolsView(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'settings-view-container';

  const toolsCard = document.createElement('section');
  toolsCard.className = 'settings-card';
  const toolsTitle = document.createElement('h2');
  toolsTitle.textContent = 'Tools';
  const toolsDescription = document.createElement('p');
  toolsDescription.textContent = 'Configure available tools.';
  const toolsList = document.createElement('div');
  toolsList.className = 'settings-tools-list';
  const toolsStatus = document.createElement('p');
  toolsStatus.className = 'settings-saved-status';
  toolsStatus.textContent = 'Loading tools...';
  toolsCard.appendChild(toolsTitle);
  toolsCard.appendChild(toolsDescription);
  toolsCard.appendChild(toolsList);
  toolsCard.appendChild(toolsStatus);
  container.appendChild(toolsCard);

  const openToolSettings = (tool: ToolMetadata, trigger: HTMLElement): void => {
    let saveSucceeded = false;
    const fields = document.createElement('div');
    fields.className = 'tool-settings-form';

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.id = 'tool-enabled-for-chat';
    enabled.checked = tool.settings.enabledForChat;
    const enabledRow = document.createElement('div');
    enabledRow.className = 'tool-settings-checkbox';
    enabledRow.appendChild(enabled);
    enabledRow.appendChild(createFormLabel('Enabled for Chat', enabled.id));

    const error = document.createElement('p');
    error.className = 'tool-settings-error';
    error.setAttribute('role', 'alert');
    fields.appendChild(enabledRow);

    const numberField = (
      id: string,
      label: string,
      value: number,
      min: number,
      max?: number,
    ): HTMLInputElement => {
      const input = document.createElement('input');
      input.type = 'number';
      input.id = id;
      input.className = 'settings-input';
      input.min = String(min);
      if (max !== undefined) input.max = String(max);
      input.step = '1';
      input.value = String(value);
      fields.appendChild(createFormGroup(createFormLabel(label, id), input));
      return input;
    };

    let pageSize: HTMLInputElement | null = null;
    let safeSearch: HTMLSelectElement | null = null;
    let requestDelayMs: HTMLInputElement | null = null;
    let cooldownAfter202Ms: HTMLInputElement | null = null;
    let contentLimit: HTMLInputElement | null = null;
    let maxLinks: HTMLInputElement | null = null;
    let maxImages: HTMLInputElement | null = null;
    if (tool.name === 'duckduckgo_search') {
      pageSize = numberField(
        'tool-results-per-search',
        'Results per search',
        tool.settings.pageSize,
        1,
        10,
      );
      requestDelayMs = numberField(
        'tool-request-delay-ms',
        'Request delay (ms)',
        tool.settings.requestDelayMs,
        0,
      );
      cooldownAfter202Ms = numberField(
        'tool-cooldown-after-202-ms',
        'Cooldown after HTTP 202 (ms)',
        tool.settings.cooldownAfter202Ms,
        0,
      );
      safeSearch = document.createElement('select');
      safeSearch.id = 'tool-safe-search';
      safeSearch.className = 'settings-input';
      for (const value of ['strict', 'moderate', 'off'] as const) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value[0].toUpperCase() + value.slice(1);
        safeSearch.appendChild(option);
      }
      safeSearch.value = tool.settings.safeSearch;
      fields.appendChild(
        createFormGroup(createFormLabel('Safe Search', safeSearch.id), safeSearch),
      );
    } else if (tool.name === 'visit_website') {
      contentLimit = numberField(
        'tool-content-limit',
        'Content limit',
        tool.settings.contentLimit,
        200,
        10_000,
      );
      maxLinks = numberField('tool-max-links', 'Max links', tool.settings.maxLinks, 0, 40);
      maxImages = numberField('tool-max-images', 'Max images', tool.settings.maxImages, 0, 20);
    }
    fields.appendChild(error);

    const modal = createConfirmationModal({
      title: `${tool.displayName} settings`,
      message: 'Configure how this tool is available to Chat.',
      content: fields,
      confirmLabel: 'Save',
      cancelLabel: 'Cancel',
      returnFocusTo: trigger,
      onConfirm: async () => {
        saveSucceeded = false;
let updatedSettings: DuckDuckGoToolSettings | VisitWebsiteToolSettings | FredDataToolSettings | YahooFinanceDataToolSettings;
        if (tool.name === 'duckduckgo_search') {
          const parsedPageSize = Number(pageSize?.value);
          const parsedRequestDelayMs = Number(requestDelayMs?.value);
          const parsedCooldownAfter202Ms = Number(cooldownAfter202Ms?.value);
          if (!Number.isInteger(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 10) {
            error.textContent = 'Results per search must be an integer from 1 to 10.';
            return;
          }
          if (
            requestDelayMs?.value.trim() === '' ||
            !Number.isSafeInteger(parsedRequestDelayMs) ||
            parsedRequestDelayMs < 0
          ) {
            error.textContent = 'Request delay must be an integer of 0 ms or more.';
            return;
          }
          if (
            cooldownAfter202Ms?.value.trim() === '' ||
            !Number.isSafeInteger(parsedCooldownAfter202Ms) ||
            parsedCooldownAfter202Ms < 0
          ) {
            error.textContent = 'HTTP 202 cooldown must be an integer of 0 ms or more.';
            return;
          }
          const selectedSafeSearch = safeSearch?.value;
          if (
            selectedSafeSearch !== 'strict' &&
            selectedSafeSearch !== 'moderate' &&
            selectedSafeSearch !== 'off'
          ) {
            error.textContent = 'Choose a valid Safe Search setting.';
            return;
          }
          updatedSettings = {
            enabledForChat: enabled.checked,
            pageSize: parsedPageSize,
            safeSearch: selectedSafeSearch,
            requestDelayMs: parsedRequestDelayMs,
            cooldownAfter202Ms: parsedCooldownAfter202Ms,
          };
        } else if (tool.name === 'visit_website') {
          const parsedContentLimit = Number(contentLimit?.value);
          const parsedMaxLinks = Number(maxLinks?.value);
          const parsedMaxImages = Number(maxImages?.value);
          if (
            !Number.isInteger(parsedContentLimit) ||
            parsedContentLimit < 200 ||
            parsedContentLimit > 10_000
          ) {
            error.textContent = 'Content limit must be an integer from 200 to 10000.';
            return;
          }
          if (!Number.isInteger(parsedMaxLinks) || parsedMaxLinks < 0 || parsedMaxLinks > 40) {
            error.textContent = 'Max links must be an integer from 0 to 40.';
            return;
          }
          if (!Number.isInteger(parsedMaxImages) || parsedMaxImages < 0 || parsedMaxImages > 20) {
            error.textContent = 'Max images must be an integer from 0 to 20.';
            return;
          }
          updatedSettings = {
            enabledForChat: enabled.checked,
            contentLimit: parsedContentLimit,
            maxLinks: parsedMaxLinks,
            maxImages: parsedMaxImages,
          };
        } else {
          updatedSettings = {
            enabledForChat: enabled.checked,
          };
        }
        try {
          const response = await fetch(`/api/tools/${tool.name}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedSettings),
          });
          if (!response.ok) {
            throw new Error('Failed to save tool settings');
          }
          if (tool.name === 'duckduckgo_search' && 'pageSize' in updatedSettings) {
            tool.settings = updatedSettings;
          } else if (tool.name === 'visit_website' && 'contentLimit' in updatedSettings) {
            tool.settings = updatedSettings;
          } else if (tool.name === 'fred_data' || tool.name === 'yahoo_finance_data') {
            tool.settings = updatedSettings;
          }
          trigger.textContent = `${tool.displayName} - ${enabled.checked ? 'Enabled for Chat' : 'Disabled for Chat'}`;
          saveSucceeded = true;
        } catch {
          error.textContent = 'Failed to save tool settings.';
        }
      },
      canCloseAfterConfirm: () => saveSucceeded,
      onCancel: () => undefined,
    });
    container.appendChild(modal);
  };

  const loadTools = async (): Promise<void> => {
    try {
      const response = await fetch('/api/tools');
      if (!response.ok) {
        throw new Error('Failed to load tools');
      }
      const payload: unknown = await response.json();
      if (!Array.isArray(payload) || !payload.every(isToolMetadata)) {
        throw new Error('Invalid tools response');
      }
      toolsList.replaceChildren();
      const configurableTools = payload.filter((tool) => !tool.agentOnly);
      for (const tool of configurableTools) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'settings-tool-button';
        button.textContent = `${tool.displayName} - ${tool.settings.enabledForChat ? 'Enabled for Chat' : 'Disabled for Chat'}`;
        button.addEventListener('click', () => openToolSettings(tool, button));
        toolsList.appendChild(button);
      }
      toolsStatus.textContent = configurableTools.length === 0 ? 'No tools available.' : '';
    } catch {
      toolsStatus.textContent = 'Failed to load tools.';
      toolsStatus.className = 'settings-saved-status settings-saved-status-error';
    }
  };

  void loadTools();
  return container;
}
