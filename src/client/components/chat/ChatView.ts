import { createAssistantMarkdown } from './MarkdownRenderer.js';

const MAX_MESSAGE_LENGTH = 4000;
const MAX_STREAM_LINE_LENGTH = 1_000_000;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const CHAT_SCROLL_POSITION_TOLERANCE = 1;
export const CHAT_NEAR_BOTTOM_THRESHOLD = 96;

interface ChatScrollContainer {
  readonly scrollHeight: number;
  readonly scrollTop: number;
  readonly clientHeight: number;
}

export function isChatNearBottom(container: ChatScrollContainer): boolean {
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  return distanceFromBottom <= CHAT_NEAR_BOTTOM_THRESHOLD;
}

interface ChatScroller {
  updateContent(update: () => void, forceScroll?: boolean): void;
}

function createChatScroller(
  messageArea: HTMLElement,
  scrollAnchor: HTMLElement,
  isCurrentView: () => boolean,
): ChatScroller {
  let pendingFrame: number | null = null;
  let pendingForce = false;
  let pendingLayoutSettle = false;
  let scrollTopBeforeUpdate = 0;

  const runScheduledScroll = (settleLayout: boolean): void => {
    pendingFrame = null;
    const force = pendingForce;
    pendingForce = false;
    const contentChangedWhilePending = pendingLayoutSettle;
    pendingLayoutSettle = false;
    if (
      !messageArea.isConnected ||
      !isCurrentView() ||
      (!force &&
        Math.abs(messageArea.scrollTop - scrollTopBeforeUpdate) > CHAT_SCROLL_POSITION_TOLERANCE &&
        !isChatNearBottom(messageArea))
    ) {
      return;
    }

    scrollAnchor.scrollIntoView({ block: 'end', behavior: 'auto' });
    if (!settleLayout || contentChangedWhilePending) {
      scrollTopBeforeUpdate = messageArea.scrollTop;
      pendingFrame = requestAnimationFrame(() => runScheduledScroll(true));
    }
  };

  const scheduleScrollToAnchor = (forceScroll: boolean, previousScrollTop: number): void => {
    pendingForce ||= forceScroll;
    if (pendingFrame !== null) {
      return;
    }

    scrollTopBeforeUpdate = previousScrollTop;
    pendingFrame = requestAnimationFrame(() => runScheduledScroll(false));
  };

  return {
    updateContent(update, forceScroll = false): void {
      const shouldFollow = forceScroll || isChatNearBottom(messageArea);
      const previousScrollTop = messageArea.scrollTop;
      update();
      if (shouldFollow) {
        pendingLayoutSettle = true;
        scheduleScrollToAnchor(forceScroll, previousScrollTop);
      }
    },
  };
}

export interface ChatViewChat {
  id: number;
  data: {
    title: string;
    modelConnectionId: number | null;
    modelId: string | null;
  };
}

interface SavedModelConnection {
  id: number;
  data: {
    name: string;
    modelId: string | null;
    enabled: boolean;
  };
}

type UpdateModelSelection = (
  modelConnectionId: number | null,
  modelId: string | null,
) => Promise<boolean>;

type IsActiveChat = (chatId: number) => boolean;
type CreateNewChat = () => Promise<boolean>;

export function getChatCommand(text: string): 'clear' | 'new' | null {
  const trimmed = text.trim();
  if (trimmed === '/clear') {
    return 'clear';
  }
  if (trimmed === '/new') {
    return 'new';
  }
  return null;
}

export function isSlashCommand(text: string): boolean {
  return text.trim().startsWith('/');
}

export interface ChatCommandResult {
  type: 'command_result';
  command: string;
  message: string;
}

export function parseChatCommandResult(value: unknown): ChatCommandResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const result = value as Record<string, unknown>;
  if (
    result.type !== 'command_result' ||
    typeof result.command !== 'string' ||
    typeof result.message !== 'string' ||
    result.message.trim().length === 0
  ) {
    return null;
  }
  return { type: 'command_result', command: result.command, message: result.message };
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface ContentChatEvent {
  content: string;
  createdAt: number;
}

export type PersistedChatMessage =
  | (ContentChatEvent & { type: 'user' })
  | (ContentChatEvent & { type: 'assistant' })
  | (ContentChatEvent & { type: 'reasoning' })
  | {
      type: 'tool_call';
      toolCallId: string;
      toolName: string;
      arguments: JsonValue;
      createdAt: number;
    }
  | {
      type: 'tool_result';
      toolCallId: string;
      toolName: string;
      result: JsonValue;
      success: boolean;
      createdAt: number;
    };

interface ChatVisibilitySettings {
  showReasoning: boolean;
  showToolCalls: boolean;
}

export function getToolFailureMessage(result: JsonValue): string {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    return 'The tool could not complete the request.';
  }
  const error = result.error;
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return 'The tool could not complete the request.';
  }
  const message = error.message;
  return typeof message === 'string' && message.trim().length > 0
    ? message.trim().slice(0, 300)
    : 'The tool could not complete the request.';
}

type StreamedChatMessage = Exclude<PersistedChatMessage, { type: 'user' }>;

export type InferenceStreamEvent =
  | {
      type: StreamedChatMessage['type'];
      sequence: number;
      inferenceId: string;
      event: StreamedChatMessage;
      final: boolean;
    }
  | { type: 'error'; sequence: number; inferenceId: string; error: string }
  | { type: 'done'; sequence: number; inferenceId: string };

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value as Record<string, unknown>).every(isJsonValue)
  );
}

export function parseChatHistory(value: unknown): PersistedChatMessage[] | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const messages = (value as Record<string, unknown>).messages;
  if (!Array.isArray(messages)) {
    return null;
  }

  const parsedMessages: PersistedChatMessage[] = [];
  for (const message of messages) {
    if (typeof message !== 'object' || message === null || Array.isArray(message)) {
      return null;
    }

    const candidate = message as Record<string, unknown>;
    if (!Number.isInteger(candidate.createdAt) || Number(candidate.createdAt) < 0) {
      return null;
    }
    const createdAt = Number(candidate.createdAt);
    if (
      (candidate.type === 'user' ||
        candidate.type === 'assistant' ||
        candidate.type === 'reasoning') &&
      typeof candidate.content === 'string' &&
      candidate.content.trim().length > 0
    ) {
      parsedMessages.push({ type: candidate.type, content: candidate.content, createdAt });
      continue;
    }
    if (
      candidate.type === 'tool_call' &&
      typeof candidate.toolCallId === 'string' &&
      candidate.toolCallId.length > 0 &&
      typeof candidate.toolName === 'string' &&
      candidate.toolName.length > 0 &&
      isJsonValue(candidate.arguments)
    ) {
      parsedMessages.push({
        type: 'tool_call',
        toolCallId: candidate.toolCallId,
        toolName: candidate.toolName,
        arguments: candidate.arguments,
        createdAt,
      });
      continue;
    }
    if (
      candidate.type === 'tool_result' &&
      typeof candidate.toolCallId === 'string' &&
      candidate.toolCallId.length > 0 &&
      typeof candidate.toolName === 'string' &&
      candidate.toolName.length > 0 &&
      isJsonValue(candidate.result) &&
      typeof candidate.success === 'boolean'
    ) {
      parsedMessages.push({
        type: 'tool_result',
        toolCallId: candidate.toolCallId,
        toolName: candidate.toolName,
        result: candidate.result,
        success: candidate.success,
        createdAt,
      });
      continue;
    }
    return null;
  }

  return parsedMessages;
}

export function parseInferenceStreamEvent(value: unknown): InferenceStreamEvent | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(candidate.sequence) ||
    Number(candidate.sequence) <= 0 ||
    typeof candidate.inferenceId !== 'string' ||
    candidate.inferenceId.length === 0
  ) {
    return null;
  }
  const sequence = Number(candidate.sequence);
  const inferenceId = candidate.inferenceId;

  if (candidate.type === 'done' && Object.keys(candidate).length === 3) {
    return { type: 'done', sequence, inferenceId };
  }
  if (
    candidate.type === 'error' &&
    Object.keys(candidate).length === 4 &&
    typeof candidate.error === 'string' &&
    candidate.error.trim().length > 0
  ) {
    return { type: 'error', sequence, inferenceId, error: candidate.error };
  }
  if (
    (candidate.type === 'assistant' ||
      candidate.type === 'reasoning' ||
      candidate.type === 'tool_call' ||
      candidate.type === 'tool_result') &&
    Object.keys(candidate).length === 5 &&
    typeof candidate.final === 'boolean'
  ) {
    const messages = parseChatHistory({ messages: [candidate.event] });
    const event = messages?.[0];
    if (!event || event.type === 'user' || event.type !== candidate.type) {
      return null;
    }
    if (candidate.final && event.type !== 'assistant') {
      return null;
    }
    return { type: event.type, sequence, inferenceId, event, final: candidate.final };
  }
  return null;
}

function isSavedModelConnection(value: unknown): value is SavedModelConnection {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const connection = value as Record<string, unknown>;
  if (
    typeof connection.id !== 'number' ||
    !Number.isInteger(connection.id) ||
    connection.id <= 0 ||
    typeof connection.data !== 'object' ||
    connection.data === null ||
    Array.isArray(connection.data)
  ) {
    return false;
  }

  const data = connection.data as Record<string, unknown>;
  return (
    typeof data.name === 'string' &&
    data.name.trim().length > 0 &&
    (data.modelId === null ||
      (typeof data.modelId === 'string' && data.modelId.trim().length > 0)) &&
    typeof data.enabled === 'boolean'
  );
}

function createSelectOption(value: string, text: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  return option;
}

function createSelectPlaceholder(text: string): HTMLOptionElement {
  const option = createSelectOption('', text);
  option.disabled = true;
  option.selected = true;
  return option;
}

interface EffectiveModel {
  id: string;
  description: string | null;
}

function parseEffectiveModels(value: unknown): EffectiveModel[] | null {
  if (!Array.isArray(value)) return null;
  const models: EffectiveModel[] = [];
  for (const model of value) {
    if (
      typeof model !== 'object' ||
      model === null ||
      Array.isArray(model) ||
      typeof (model as Record<string, unknown>).id !== 'string' ||
      ((model as Record<string, unknown>).description !== null &&
        typeof (model as Record<string, unknown>).description !== 'string')
    ) {
      return null;
    }
    models.push({
      id: (model as { id: string }).id,
      description: (model as { description: string | null }).description,
    });
  }
  return models;
}

function createModelControls(
  activeChat: ChatViewChat | undefined,
  updateModelSelection: UpdateModelSelection | undefined,
): HTMLElement {
  const controls = document.createElement('div');
  controls.className = 'chat-model-controls';

  const connectionGroup = document.createElement('div');
  connectionGroup.className = 'chat-model-control chat-model-connection-control';
  const connectionSelect = document.createElement('select');
  connectionSelect.id = 'chat-model-connection';
  connectionSelect.setAttribute('aria-label', 'Model connection');
  connectionSelect.disabled = true;
  connectionSelect.appendChild(createSelectPlaceholder('Select connection'));
  connectionGroup.appendChild(connectionSelect);

  const modelGroup = document.createElement('div');
  modelGroup.className = 'chat-model-control chat-model-select-control';
  const modelSelect = document.createElement('select');
  modelSelect.id = 'chat-model';
  modelSelect.setAttribute('aria-label', 'Model');
  modelSelect.disabled = true;
  modelSelect.appendChild(createSelectPlaceholder('Select model'));
  modelGroup.appendChild(modelSelect);
  const modelDescription = document.createElement('p');
  modelDescription.className = 'chat-model-description';

  const status = document.createElement('p');
  status.className = 'chat-model-status';
  status.setAttribute('role', 'status');
  status.textContent = activeChat ? '' : 'Select a saved chat to choose a model.';

  controls.appendChild(connectionGroup);
  controls.appendChild(modelGroup);
  controls.appendChild(modelDescription);
  controls.appendChild(status);

  let enabledConnections: SavedModelConnection[] = [];
  let modelRequestId = 0;

  const setModelOptions = (models: EffectiveModel[], selectedModelId: string | null): void => {
    modelSelect.replaceChildren();
    modelDescription.textContent = '';
    const modelIds = models.map((model) => model.id);

    const selectedUnavailable =
      selectedModelId !== null && !modelIds.includes(selectedModelId);

    if (modelIds.length === 0) {
      if (selectedUnavailable) {
        const unavailable = createSelectOption(
          selectedModelId,
          `${selectedModelId} (hidden or unavailable)`,
        );
        unavailable.disabled = true;
        modelSelect.appendChild(unavailable);
        modelSelect.value = selectedModelId;
      } else {
        modelSelect.appendChild(createSelectPlaceholder('Select model'));
      }
      modelSelect.disabled = true;
      return;
    }

    modelSelect.appendChild(createSelectPlaceholder('Select model'));
    if (selectedUnavailable) {
      const unavailable = createSelectOption(
        selectedModelId,
        `${selectedModelId} (hidden or unavailable)`,
      );
      unavailable.disabled = true;
      modelSelect.appendChild(unavailable);
    }
    for (const model of models) {
      const option = createSelectOption(model.id, model.id);
      if (model.description) option.dataset.description = model.description;
      modelSelect.appendChild(option);
    }
    modelSelect.value = selectedModelId ?? '';
    modelDescription.textContent = modelSelect.selectedOptions[0]?.dataset.description ?? '';
    modelSelect.disabled = false;
  };

  const loadModels = async (
    connection: SavedModelConnection,
    selectedModelId: string | null,
  ): Promise<void> => {
    const requestId = ++modelRequestId;
    modelSelect.replaceChildren(createSelectOption('', 'Loading models...'));
    modelSelect.disabled = true;
    status.setAttribute('role', 'status');
    status.textContent = 'Loading models...';

    try {
      const response = await fetch(`/api/model-connections/${connection.id}/models`);
      if (!response.ok) {
        throw new Error('Failed to discover models');
      }

      const payload: unknown = await response.json();
      if (
        typeof payload !== 'object' ||
        payload === null ||
        Array.isArray(payload) ||
        !Array.isArray((payload as Record<string, unknown>).models)
      ) {
        throw new Error('Invalid models response');
      }

      const models = parseEffectiveModels((payload as Record<string, unknown>).models);
      if (!models) throw new Error('Invalid models response');
      const modelIds = models.map((model) => model.id);

      if (requestId !== modelRequestId || connectionSelect.value !== String(connection.id)) {
        return;
      }

      setModelOptions(models, selectedModelId);
      status.textContent =
        selectedModelId && !modelIds.includes(selectedModelId)
          ? 'Selected model is hidden or unavailable.'
          : models.length === 0
            ? 'No models available for this connection.'
            : '';
    } catch {
      if (requestId !== modelRequestId) {
        return;
      }

      modelSelect.replaceChildren(createSelectOption('', 'Models unavailable'));
      modelSelect.disabled = true;
      status.setAttribute('role', 'alert');
      status.textContent = 'Failed to load models.';
    }
  };

  const persistSelection = async (
    modelConnectionId: number | null,
    modelId: string | null,
  ): Promise<void> => {
    if (!activeChat || !updateModelSelection) {
      return;
    }

    connectionSelect.disabled = true;
    modelSelect.disabled = true;
    status.textContent = 'Saving model selection...';

    const saved = await updateModelSelection(modelConnectionId, modelId);
    status.textContent = saved ? 'Model selection saved.' : 'Failed to save model selection.';
    status.setAttribute('role', saved ? 'status' : 'alert');
    connectionSelect.disabled = false;
    modelSelect.disabled = modelSelect.options.length === 0 || modelSelect.value === '';
  };

  connectionSelect.addEventListener('change', () => {
    const connectionId = Number(connectionSelect.value);
    const connection = enabledConnections.find((item) => item.id === connectionId);

    if (!connection) {
      modelRequestId += 1;
      setModelOptions([], null);
      void persistSelection(null, null);
      return;
    }

    modelSelect.replaceChildren(createSelectOption('', 'Loading models...'));
    modelSelect.disabled = true;
    void persistSelection(connection.id, null).then(() => loadModels(connection, null));
  });

  modelSelect.addEventListener('change', () => {
    const connectionId = Number(connectionSelect.value);
    const modelId = modelSelect.value || null;
    modelDescription.textContent = modelSelect.selectedOptions[0]?.dataset.description ?? '';
    void persistSelection(
      Number.isInteger(connectionId) && connectionId > 0 ? connectionId : null,
      modelId,
    );
  });

  const loadConnections = async (): Promise<void> => {
    try {
      const response = await fetch('/api/model-connections');
      if (!response.ok) {
        throw new Error('Failed to load model connections');
      }

      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error('Invalid model connections response');
      }

      enabledConnections = payload
        .filter(isSavedModelConnection)
        .filter((item) => item.data.enabled);

      if (!activeChat) {
        return;
      }

      connectionSelect.replaceChildren(createSelectPlaceholder('Select connection'));
      for (const connection of enabledConnections) {
        connectionSelect.appendChild(
          createSelectOption(String(connection.id), connection.data.name),
        );
      }

      const selectedConnection = enabledConnections.find(
        (connection) => connection.id === activeChat.data.modelConnectionId,
      );

      if (selectedConnection) {
        connectionSelect.value = String(selectedConnection.id);
      } else if (activeChat.data.modelConnectionId !== null) {
        const unavailable = createSelectOption(
          String(activeChat.data.modelConnectionId),
          'Selected connection unavailable',
        );
        unavailable.disabled = true;
        connectionSelect.appendChild(unavailable);
        connectionSelect.value = unavailable.value;
      }

      connectionSelect.disabled = enabledConnections.length === 0;
      status.textContent =
        enabledConnections.length === 0 ? 'No enabled connections available.' : '';

      if (selectedConnection) {
        await loadModels(selectedConnection, activeChat.data.modelId);
      } else {
        setModelOptions([], null);
      }
    } catch {
      connectionSelect.replaceChildren(createSelectOption('', 'Connections unavailable'));
      modelSelect.replaceChildren(createSelectOption('', 'No models available'));
      status.setAttribute('role', 'alert');
      status.textContent = 'Failed to load model connections.';
    }
  };

  void loadConnections();
  return controls;
}

function createMessageElement(
  text: string,
  role: 'user' | 'assistant' | 'command' | 'error',
): HTMLElement {
  const messageDiv = document.createElement('div');

  if (role === 'user') {
    messageDiv.className = 'chat-user-message';
  } else if (role === 'assistant') {
    messageDiv.className = 'chat-assistant-message';
  } else if (role === 'command') {
    messageDiv.className = 'chat-command-result';
  } else {
    messageDiv.className = 'chat-error-message';
  }

  if (role === 'assistant') {
    messageDiv.appendChild(createAssistantMarkdown(text));
  } else {
    const messageText = document.createElement('span');
    messageText.textContent = text;
    messageDiv.appendChild(messageText);
  }
  return messageDiv;
}

async function sendCommandToApi(chatId: number, text: string): Promise<ChatCommandResult | null> {
  try {
    const response = await fetch(`/api/chats/${chatId}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    return response.ok ? parseChatCommandResult(await response.json()) : null;
  } catch {
    return null;
  }
}

function createActivityElement(event: Exclude<PersistedChatMessage, { type: 'user' | 'assistant' }>): HTMLElement {
  const activity = document.createElement('section');
  activity.className = 'chat-activity-event chat-activity-sand';
  if (event.type === 'reasoning') {
    activity.classList.add('chat-reasoning-event');
    const heading = document.createElement('strong');
    heading.textContent = 'Reasoning';
    const content = document.createElement('p');
    content.textContent = event.content;
    activity.appendChild(heading);
    activity.appendChild(content);
    return activity;
  }

  activity.classList.add(event.type === 'tool_call' ? 'chat-tool-call-event' : 'chat-tool-result-event');
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = `${event.type === 'tool_call' ? 'Tool' : 'Tool result'}: ${event.toolName}`;
  const content = document.createElement('pre');
  content.textContent = JSON.stringify(
    event.type === 'tool_call' ? event.arguments : event.result,
    null,
    2,
  );
  details.appendChild(summary);
  details.appendChild(content);
  activity.appendChild(details);
  if (event.type === 'tool_result' && !event.success) {
    const failure = document.createElement('p');
    failure.textContent = `Failed: ${getToolFailureMessage(event.result)}`;
    activity.appendChild(failure);
  }
  return activity;
}

function waitForLazySettle(
  messageArea: HTMLElement,
  initialRestoreState: { pending: boolean },
): Promise<void> {
  return new Promise<void>((resolve) => {
    const check = (): void => {
      if (!messageArea.isConnected) {
        initialRestoreState.pending = false;
        resolve();
        return;
      }

      const remainingShells = messageArea.querySelectorAll('.chat-lazy-event[aria-busy="true"]');

      if (remainingShells.length === 0) {
        initialRestoreState.pending = false;
        resolve();
        return;
      }

      const areaRect = messageArea.getBoundingClientRect();
      let hasObservablePending = false;
      for (const shell of remainingShells) {
        const rect = shell.getBoundingClientRect();
        if (rect.bottom >= areaRect.top - 800 && rect.top <= areaRect.bottom + 800) {
          hasObservablePending = true;
          break;
        }
      }

      if (!hasObservablePending) {
        initialRestoreState.pending = false;
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };

    requestAnimationFrame(check);
  });
}

function createEventRenderer(
  messageArea: HTMLElement,
  scroller: ChatScroller,
  visibility: ChatVisibilitySettings,
  initialRestoreState: { pending: boolean },
): (event: PersistedChatMessage, deferMarkdown?: boolean) => HTMLElement | null {
  const pendingMarkdown = new WeakMap<Element, string>();
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const content = pendingMarkdown.get(entry.target);
              if (content === undefined) continue;
              const duringRestore = initialRestoreState.pending;
              scroller.updateContent(() => {
                entry.target.replaceChildren(createAssistantMarkdown(content));
                entry.target.classList.remove('chat-lazy-event');
                entry.target.removeAttribute('aria-busy');
                pendingMarkdown.delete(entry.target);
                observer?.unobserve(entry.target);
              }, duringRestore);
            }
          },
          { root: messageArea, rootMargin: '800px 0px' },
        );

  return (event, deferMarkdown = false) => {
    if (event.type === 'reasoning' && !visibility.showReasoning) return null;
    if ((event.type === 'tool_call' || event.type === 'tool_result') && !visibility.showToolCalls) {
      return null;
    }
    if (event.type === 'user') return createMessageElement(event.content, 'user');
    if (event.type !== 'assistant') return createActivityElement(event);
    if (!deferMarkdown || !observer) return createMessageElement(event.content, 'assistant');

    const shell = document.createElement('div');
    shell.className = 'chat-assistant-message chat-lazy-event';
    shell.setAttribute('aria-busy', 'true');
    pendingMarkdown.set(shell, event.content);
    observer.observe(shell);
    return shell;
  };
}

function createMessageArea(): { messageArea: HTMLElement; scrollAnchor: HTMLElement } {
  const messageArea = document.createElement('div');
  messageArea.className = 'chat-message-area';
  messageArea.setAttribute('data-testid', 'message-area');
  const scrollAnchor = document.createElement('div');
  scrollAnchor.className = 'chat-scroll-anchor';
  scrollAnchor.setAttribute('data-testid', 'chat-scroll-anchor');
  scrollAnchor.setAttribute('aria-hidden', 'true');
  messageArea.appendChild(scrollAnchor);
  return { messageArea, scrollAnchor };
}

function createToolbarButton(
  label: string,
  className: string,
  pathData: string[],
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `chat-toolbar-icon-button ${className}`;
  button.setAttribute('aria-label', label);
  button.title = label;

  const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');

  for (const data of pathData) {
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', data);
    icon.appendChild(path);
  }

  button.appendChild(icon);
  return button;
}

async function sendToApi(
  chatId: number,
  text: string,
  signal: AbortSignal,
  onEvent: (event: InferenceStreamEvent) => void,
): Promise<boolean> {
  try {
    const response = await fetch(`/api/chats/${chatId}/inference/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: text }),
      signal,
    });

    if (
      !response.ok ||
      !response.body ||
      !response.headers.get('content-type')?.startsWith('application/x-ndjson')
    ) {
      return false;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sequence = 0;
    let inferenceId: string | null = null;
    let terminal = false;
    let finalAssistantReceived = false;

    const processLine = (line: string): void => {
      if (line.length === 0 || line.length > MAX_STREAM_LINE_LENGTH || terminal) {
        throw new Error('Invalid inference stream');
      }
      const parsedJson: unknown = JSON.parse(line) as unknown;
      const event = parseInferenceStreamEvent(parsedJson);
      if (
        !event ||
        event.sequence !== sequence + 1 ||
        (inferenceId !== null && event.inferenceId !== inferenceId) ||
        (event.type === 'done' && !finalAssistantReceived) ||
        (finalAssistantReceived && event.type !== 'done')
      ) {
        throw new Error('Invalid inference stream');
      }
      sequence = event.sequence;
      inferenceId = event.inferenceId;
      finalAssistantReceived =
        event.type === 'assistant' && event.final ? true : finalAssistantReceived;
      terminal = event.type === 'done' || event.type === 'error';
      onEvent(event);
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > MAX_STREAM_LINE_LENGTH && !buffer.includes('\n')) {
        throw new Error('Invalid inference stream');
      }
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        processLine(line);
      }
      if (done) break;
    }
    if (buffer.length > 0) {
      processLine(buffer);
    }
    return terminal;
  } catch {
    return false;
  }
}

function createInputArea(
  messageArea: HTMLElement,
  scrollAnchor: HTMLElement,
  scroller: ChatScroller,
  activeChat: ChatViewChat | undefined,
  updateModelSelection: UpdateModelSelection | undefined,
  isActiveChat: IsActiveChat | undefined,
  historyLoading: boolean,
  createNewChat: CreateNewChat | undefined,
  renderEvent: (event: PersistedChatMessage, deferMarkdown?: boolean) => HTMLElement | null,
): HTMLElement {
  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'chat-input-wrapper';

  const messageRow = document.createElement('div');
  messageRow.className = 'chat-composer-message-row';

  const toolbarRow = document.createElement('div');
  toolbarRow.className = 'chat-composer-toolbar';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'chat-message-input';
  input.placeholder = activeChat ? 'Type a message...' : 'Select a saved chat to send a message.';
  input.setAttribute('data-testid', 'message-input');
  input.maxLength = MAX_MESSAGE_LENGTH;
  input.disabled = !activeChat || historyLoading;

  const attachButton = createToolbarButton(
    'Attach file',
    'chat-placeholder-button chat-attach-button',
    [
      'M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
    ],
  );
  attachButton.setAttribute('data-testid', 'attach-button');

  const exportButton = createToolbarButton(
    'Export chat',
    'chat-placeholder-button chat-export-button',
    ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  );
  exportButton.setAttribute('data-testid', 'export-button');

  const sendButton = createToolbarButton('Send message', 'chat-send-button', [
    'm22 2-7 20-4-9-9-4Z',
    'M22 2 11 13',
  ]);
  sendButton.setAttribute('data-testid', 'send-button');
  sendButton.disabled = !activeChat || historyLoading;

  let inferenceInProgress = false;

  const sendMessage = async (): Promise<void> => {
    const text = input.value.trim();

    if (!activeChat || inferenceInProgress || text.length === 0) {
      return;
    }

    inferenceInProgress = true;
    input.disabled = true;
    sendButton.disabled = true;
    input.value = '';

    if (isSlashCommand(text)) {
      try {
        const result = await sendCommandToApi(activeChat.id, text);
        if (!result) {
          scroller.updateContent(
            () =>
              scrollAnchor.before(createMessageElement('Unable to run chat command.', 'error')),
            true,
          );
        } else if (result.command === 'clear') {
          if (!isActiveChat || isActiveChat(activeChat.id)) {
            messageArea.replaceChildren(scrollAnchor);
          }
        } else if (result.command === 'new') {
          if (!createNewChat || !(await createNewChat())) {
            scroller.updateContent(
              () =>
                scrollAnchor.before(createMessageElement('Unable to create a new chat.', 'error')),
              true,
            );
          }
        } else {
          scroller.updateContent(
            () => {
              scrollAnchor.before(createMessageElement(text, 'user'));
              scrollAnchor.before(createMessageElement(result.message, 'command'));
            },
            true,
          );
        }
      } catch {
        if (getChatCommand(text) === 'new') {
          scroller.updateContent(
            () =>
              scrollAnchor.before(createMessageElement('Unable to create a new chat.', 'error')),
            true,
          );
        } else {
          scroller.updateContent(
            () =>
              scrollAnchor.before(createMessageElement('Unable to run chat command.', 'error')),
            true,
          );
        }
      } finally {
        inferenceInProgress = false;
        if (!isActiveChat || isActiveChat(activeChat.id)) {
          input.disabled = false;
          sendButton.disabled = false;
        }
      }
      return;
    }

    const userMessage = createMessageElement(text, 'user');

    const waitingMessage = document.createElement('div');
    waitingMessage.className = 'chat-thinking-indicator';
    waitingMessage.setAttribute('role', 'status');
    waitingMessage.setAttribute('aria-label', 'Thinking');
    for (let dotIndex = 0; dotIndex < 3; dotIndex += 1) {
      const dot = document.createElement('span');
      dot.className = 'chat-thinking-dot';
      dot.textContent = '.';
      dot.setAttribute('aria-hidden', 'true');
      waitingMessage.appendChild(dot);
    }
    scroller.updateContent(
      () => {
        scrollAnchor.before(userMessage);
        scrollAnchor.before(waitingMessage);
      },
      true,
    );

    const controller = new AbortController();
    const isCurrentChat = (): boolean => !isActiveChat || isActiveChat(activeChat.id);
    const viewObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            if (!messageArea.isConnected || !isCurrentChat()) {
              controller.abort();
            }
          });
    viewObserver?.observe(document.body, { childList: true, subtree: true });
    let streamError = false;

    try {
      const completed = await sendToApi(activeChat.id, text, controller.signal, (streamEvent) => {
        if (!isCurrentChat()) {
          controller.abort();
          return;
        }
        if (streamEvent.type === 'error') {
          streamError = true;
          scroller.updateContent(() => waitingMessage.remove());
          return;
        }
        if (streamEvent.type === 'done') {
          scroller.updateContent(() => waitingMessage.remove());
          return;
        }
        const element = renderEvent(streamEvent.event);
        scroller.updateContent(() => {
          if (element) waitingMessage.before(element);
          if (streamEvent.final) waitingMessage.remove();
        });
      });

      if (isCurrentChat() && !controller.signal.aborted && (!completed || streamError)) {
        const errorMessage = createMessageElement(
          'Unable to get a response. Check the chat model configuration and try again.',
          'error',
        );
        scroller.updateContent(() => scrollAnchor.before(errorMessage));
      }
    } finally {
      viewObserver?.disconnect();
      scroller.updateContent(() => waitingMessage.remove());
      inferenceInProgress = false;
      if (isCurrentChat()) {
        input.disabled = false;
        sendButton.disabled = false;
      }
    }
  };

  sendButton.addEventListener('click', () => {
    void sendMessage();
  });

  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void sendMessage();
    }
  });

  messageRow.appendChild(input);
  toolbarRow.appendChild(attachButton);
  toolbarRow.appendChild(createModelControls(activeChat, updateModelSelection));
  toolbarRow.appendChild(exportButton);
  toolbarRow.appendChild(sendButton);
  inputWrapper.appendChild(messageRow);
  inputWrapper.appendChild(toolbarRow);

  return inputWrapper;
}

async function loadChatHistory(
  activeChat: ChatViewChat,
  messageArea: HTMLElement,
  scrollAnchor: HTMLElement,
  scroller: ChatScroller,
  inputArea: HTMLElement,
  isActiveChat: IsActiveChat | undefined,
  visibility: ChatVisibilitySettings,
  renderEvent: (event: PersistedChatMessage, deferMarkdown?: boolean) => HTMLElement | null,
  initialRestoreState: { pending: boolean },
): Promise<void> {
  const historyStatus = document.createElement('p');
  historyStatus.className = 'chat-history-status';
  historyStatus.setAttribute('role', 'status');
  historyStatus.textContent = 'Loading chat history...';
  scrollAnchor.before(historyStatus);

  try {
    const [response, settingsResponse] = await Promise.all([
      fetch(`/api/chats/${activeChat.id}/messages`),
      fetch('/api/settings/chat'),
    ]);
    if (!response.ok || !settingsResponse.ok) {
      throw new Error('Failed to load chat history');
    }

    const messages = parseChatHistory(await response.json());
    if (messages === null) {
      throw new Error('Invalid chat history response');
    }
    const settingsValue: unknown = await settingsResponse.json();
    if (
      typeof settingsValue !== 'object' ||
      settingsValue === null ||
      Array.isArray(settingsValue) ||
      typeof (settingsValue as Record<string, unknown>).showReasoning !== 'boolean' ||
      typeof (settingsValue as Record<string, unknown>).showToolCalls !== 'boolean'
    ) {
      throw new Error('Invalid Chat settings response');
    }
    visibility.showReasoning = (settingsValue as Record<string, unknown>).showReasoning as boolean;
    visibility.showToolCalls = (settingsValue as Record<string, unknown>).showToolCalls as boolean;

    if (isActiveChat && !isActiveChat(activeChat.id)) {
      return;
    }

    initialRestoreState.pending = true;
    scroller.updateContent(
      () =>
        messageArea.replaceChildren(
          ...messages.flatMap((event) => {
            const element = renderEvent(event, true);
            return element ? [element] : [];
          }),
          scrollAnchor,
        ),
      true,
    );
    await waitForLazySettle(messageArea, initialRestoreState);
  } catch {
    if (isActiveChat && !isActiveChat(activeChat.id)) {
      return;
    }

    historyStatus.setAttribute('role', 'alert');
    historyStatus.textContent = 'Failed to load chat history.';
  } finally {
    if (!isActiveChat || isActiveChat(activeChat.id)) {
      const input = inputArea.querySelector<HTMLInputElement>('[data-testid="message-input"]');
      const sendButton = inputArea.querySelector<HTMLButtonElement>('[data-testid="send-button"]');
      if (input) {
        input.disabled = false;
      }
      if (sendButton) {
        sendButton.disabled = false;
      }
    }
  }
}

export function createChatView(
  activeChat?: ChatViewChat,
  updateModelSelection?: UpdateModelSelection,
  isActiveChat?: IsActiveChat,
  createNewChat?: CreateNewChat,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'chat-view-container';

  const { messageArea, scrollAnchor } = createMessageArea();
  const scroller = createChatScroller(
    messageArea,
    scrollAnchor,
    () => !activeChat || !isActiveChat || isActiveChat(activeChat.id),
  );
  const visibility: ChatVisibilitySettings = { showReasoning: false, showToolCalls: false };
  const initialRestoreState = { pending: false };
  const renderEvent = createEventRenderer(messageArea, scroller, visibility, initialRestoreState);

  const inputArea = createInputArea(
    messageArea,
    scrollAnchor,
    scroller,
    activeChat,
    updateModelSelection,
    isActiveChat,
    activeChat !== undefined,
    createNewChat,
    renderEvent,
  );

  container.appendChild(messageArea);
  container.appendChild(inputArea);

  if (activeChat) {
    void loadChatHistory(
      activeChat,
      messageArea,
      scrollAnchor,
      scroller,
      inputArea,
      isActiveChat,
      visibility,
      renderEvent,
      initialRestoreState,
    );
  }

  return container;
}
