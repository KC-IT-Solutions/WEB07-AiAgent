import { createAssistantMarkdown } from './MarkdownRenderer.js';

const MAX_MESSAGE_LENGTH = 4000;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

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

function createModelControls(
  activeChat: ChatViewChat | undefined,
  updateModelSelection: UpdateModelSelection | undefined,
): HTMLElement {
  const controls = document.createElement('div');
  controls.className = 'chat-model-controls';

  const connectionGroup = document.createElement('div');
  connectionGroup.className = 'chat-model-control chat-model-connection-control';
  const connectionLabel = document.createElement('label');
  connectionLabel.htmlFor = 'chat-model-connection';
  connectionLabel.textContent = 'Model connection';
  const connectionSelect = document.createElement('select');
  connectionSelect.id = 'chat-model-connection';
  connectionSelect.disabled = true;
  connectionSelect.appendChild(
    createSelectOption('', activeChat ? 'Loading connections...' : 'No active chat'),
  );
  connectionGroup.appendChild(connectionLabel);
  connectionGroup.appendChild(connectionSelect);

  const modelGroup = document.createElement('div');
  modelGroup.className = 'chat-model-control chat-model-select-control';
  const modelLabel = document.createElement('label');
  modelLabel.htmlFor = 'chat-model';
  modelLabel.textContent = 'Model';
  const modelSelect = document.createElement('select');
  modelSelect.id = 'chat-model';
  modelSelect.disabled = true;
  modelSelect.appendChild(
    createSelectOption('', activeChat ? 'No models available' : 'No active chat'),
  );
  modelGroup.appendChild(modelLabel);
  modelGroup.appendChild(modelSelect);

  const status = document.createElement('p');
  status.className = 'chat-model-status';
  status.setAttribute('role', 'status');
  status.textContent = activeChat ? '' : 'Select a saved chat to choose a model.';

  controls.appendChild(connectionGroup);
  controls.appendChild(modelGroup);
  controls.appendChild(status);

  let enabledConnections: SavedModelConnection[] = [];
  let modelRequestId = 0;

  const setModelOptions = (modelIds: string[], selectedModelId: string | null): void => {
    modelSelect.replaceChildren();

    if (modelIds.length === 0) {
      modelSelect.appendChild(createSelectOption('', 'No models available'));
      modelSelect.disabled = true;
      return;
    }

    modelSelect.appendChild(createSelectOption('', 'Select model'));
    for (const modelId of modelIds) {
      modelSelect.appendChild(createSelectOption(modelId, modelId));
    }
    modelSelect.value =
      selectedModelId && modelIds.includes(selectedModelId) ? selectedModelId : '';
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

      const models = (payload as { models: unknown[] }).models.filter(
        (model): model is string => typeof model === 'string' && model.trim().length > 0,
      );

      if (requestId !== modelRequestId || connectionSelect.value !== String(connection.id)) {
        return;
      }

      setModelOptions(models, selectedModelId);
      status.textContent = models.length === 0 ? 'No models available for this connection.' : '';
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

      connectionSelect.replaceChildren(createSelectOption('', 'Select connection'));
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

function createMessageElement(text: string, role: 'user' | 'assistant' | 'error'): HTMLElement {
  const messageDiv = document.createElement('div');

  if (role === 'user') {
    messageDiv.className = 'chat-user-message';
  } else if (role === 'assistant') {
    messageDiv.className = 'chat-assistant-message';
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

function createMessageArea(): HTMLElement {
  const messageArea = document.createElement('div');
  messageArea.className = 'chat-message-area';
  messageArea.setAttribute('data-testid', 'message-area');
  return messageArea;
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

async function sendToApi(chatId: number, text: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/chats/${chatId}/inference`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: text }),
    });

    if (!response.ok) {
      return null;
    }

    const data: unknown = await response.json();

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const message = (data as Record<string, unknown>).message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function createInputArea(
  messageArea: HTMLElement,
  activeChat: ChatViewChat | undefined,
  updateModelSelection: UpdateModelSelection | undefined,
  isActiveChat: IsActiveChat | undefined,
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
  input.disabled = !activeChat;

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
  sendButton.disabled = !activeChat;

  let inferenceInProgress = false;

  const sendMessage = async (): Promise<void> => {
    const text = input.value.trim();

    if (!activeChat || inferenceInProgress || text.length === 0) {
      return;
    }

    inferenceInProgress = true;
    input.disabled = true;
    sendButton.disabled = true;

    const userMessage = createMessageElement(text, 'user');
    messageArea.appendChild(userMessage);
    input.value = '';

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
    messageArea.appendChild(waitingMessage);

    try {
      const reply = await sendToApi(activeChat.id, text);

      if (isActiveChat && !isActiveChat(activeChat.id)) {
        return;
      }

      if (reply !== null) {
        const assistantMessage = createMessageElement(reply, 'assistant');
        messageArea.appendChild(assistantMessage);
      } else {
        const errorMessage = createMessageElement(
          'Unable to get a response. Check the chat model configuration and try again.',
          'error',
        );
        messageArea.appendChild(errorMessage);
      }
    } finally {
      waitingMessage.remove();
      inferenceInProgress = false;
      input.disabled = false;
      sendButton.disabled = false;
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

export function createChatView(
  activeChat?: ChatViewChat,
  updateModelSelection?: UpdateModelSelection,
  isActiveChat?: IsActiveChat,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'chat-view-container';

  const messageArea = createMessageArea();

  const inputArea = createInputArea(messageArea, activeChat, updateModelSelection, isActiveChat);

  container.appendChild(messageArea);
  container.appendChild(inputArea);

  return container;
}
