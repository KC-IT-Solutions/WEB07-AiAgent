import { createConfirmationModal } from '../ConfirmationModal.js';

const DEFAULT_TIMEOUT_MINUTES = 30;
const NEW_CONNECTION_VALUE = 'new';

interface ConnectionState {
  name: string;
  baseUrl: string;
  apiKey: string;
  timeoutMinutes: number;
}

interface SavedConnectionData {
  name: string;
  baseUrl: string;
  timeoutMinutes: number;
  modelId: string | null;
  enabled: boolean;
}

interface SavedConnection {
  id: number;
  hasApiKey?: boolean;
  data: SavedConnectionData;
}

const connectionState: ConnectionState = {
  name: '',
  baseUrl: '',
  apiKey: '',
  timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
};

function createFormLabel(text: string, htmlFor: string): HTMLElement {
  const label = document.createElement('label');
  label.textContent = text;
  label.setAttribute('for', htmlFor);
  return label;
}

function createFormInput(
  type: string,
  id: string,
  placeholder: string,
  value: string,
): HTMLElement {
  const input = document.createElement('input');
  input.type = type;
  input.id = id;
  input.className = 'settings-input';
  input.placeholder = placeholder;
  input.value = value;
  return input;
}

function createFormNumberInput(
  id: string,
  placeholder: string,
  value: number,
  min: number,
): HTMLElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.id = id;
  input.className = 'settings-input';
  input.placeholder = placeholder;
  input.value = String(value);
  input.min = String(min);
  input.step = '1';
  return input;
}

function createFormGroup(label: HTMLElement, input: HTMLElement): HTMLElement {
  const group = document.createElement('div');
  group.className = 'settings-form-group';
  group.appendChild(label);
  group.appendChild(input);
  return group;
}

function isFormValid(form: HTMLElement): boolean {
  const nameInput = form.querySelector('#settings-name') as HTMLInputElement | null;
  const baseUrlInput = form.querySelector('#settings-base-url') as HTMLInputElement | null;

  if (!nameInput || !nameInput.value.trim()) {
    return false;
  }

  if (!baseUrlInput || !baseUrlInput.value.trim()) {
    return false;
  }

  return true;
}

function isSavedConnection(value: unknown): value is SavedConnection {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { id?: unknown; hasApiKey?: unknown; data?: unknown };
  if (typeof candidate.id !== 'number') {
    return false;
  }

  if (candidate.hasApiKey !== undefined && typeof candidate.hasApiKey !== 'boolean') {
    return false;
  }

  if (typeof candidate.data !== 'object' || candidate.data === null) {
    return false;
  }

  const data = candidate.data as Record<string, unknown>;
  return (
    typeof data.name === 'string' &&
    typeof data.baseUrl === 'string' &&
    typeof data.timeoutMinutes === 'number' &&
    (data.modelId === null || typeof data.modelId === 'string') &&
    typeof data.enabled === 'boolean'
  );
}

function createNoModelsPlaceholderOption(): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = '';
  option.textContent = 'No models available';
  option.disabled = true;
  option.selected = true;
  return option;
}

function clearModelOptions(modelSelect: HTMLSelectElement): void {
  while (modelSelect.options.length > 0) {
    modelSelect.remove(0);
  }
}

function updateTestButtonState(form: HTMLElement): void {
  const testButton = form.querySelector('#settings-test-button') as HTMLButtonElement | null;
  if (testButton) {
    testButton.disabled = !isFormValid(form);
  }
}

function createSettingsForm(
  onSave: () => Promise<void>,
  onTest: () => Promise<void>,
  onDelete: () => void,
): HTMLElement {
  const form = document.createElement('form');
  form.className = 'settings-form';
  form.id = 'settings-form';

  form.addEventListener('submit', (event: Event) => {
    event.preventDefault();

    const nameInput = document.getElementById('settings-name') as HTMLInputElement;
    const baseUrlInput = document.getElementById('settings-base-url') as HTMLInputElement;
    const apiKeyInput = document.getElementById('settings-api-key') as HTMLInputElement;
    const timeoutInput = document.getElementById('settings-timeout') as HTMLInputElement;

    connectionState.name = nameInput ? nameInput.value.trim() : '';
    connectionState.baseUrl = baseUrlInput ? baseUrlInput.value.trim() : '';
    connectionState.apiKey = apiKeyInput ? apiKeyInput.value : '';

    const parsedTimeout = timeoutInput ? parseInt(timeoutInput.value, 10) : DEFAULT_TIMEOUT_MINUTES;
    connectionState.timeoutMinutes = isNaN(parsedTimeout) || parsedTimeout <= 0
      ? DEFAULT_TIMEOUT_MINUTES
      : parsedTimeout;

    void onSave();
  });

  const nameLabel = createFormLabel('Connection name', 'settings-name');
  const nameInput = createFormInput(
    'text',
    'settings-name',
    'My connection',
    connectionState.name,
  );

  const baseUrlLabel = createFormLabel('Base URL', 'settings-base-url');
  const baseUrlInput = createFormInput(
    'url',
    'settings-base-url',
    'http://127.0.0.1:1234',
    connectionState.baseUrl,
  );

  const apiKeyLabel = createFormLabel('API key (optional)', 'settings-api-key');
  const apiKeyInput = createFormInput(
    'password',
    'settings-api-key',
    '',
    '',
  );

  const timeoutLabel = createFormLabel('Timeout (minutes)', 'settings-timeout');
  const timeoutInput = createFormNumberInput(
    'settings-timeout',
    String(DEFAULT_TIMEOUT_MINUTES),
    DEFAULT_TIMEOUT_MINUTES,
    1,
  );

  const modelLabel = createFormLabel('Model', 'settings-model');
  const modelSelect = document.createElement('select');
  modelSelect.id = 'settings-model';
  modelSelect.className = 'settings-input';
  modelSelect.disabled = true;

  const modelPlaceholder = document.createElement('option');
  modelPlaceholder.value = '';
  modelPlaceholder.textContent = 'No models available';
  modelPlaceholder.disabled = true;
  modelPlaceholder.selected = true;
  modelSelect.appendChild(modelPlaceholder);

  const enabledCheckbox = document.createElement('input');
  enabledCheckbox.type = 'checkbox';
  enabledCheckbox.id = 'settings-enabled';
  enabledCheckbox.checked = true;

  const enabledLabel = document.createElement('label');
  enabledLabel.setAttribute('for', 'settings-enabled');
  enabledLabel.textContent = 'Enabled';
  enabledLabel.style.display = 'flex';
  enabledLabel.style.alignItems = 'center';
  enabledLabel.style.gap = '0.5rem';
  enabledLabel.style.marginTop = '0.5rem';
  enabledLabel.appendChild(enabledCheckbox);

  const testButton = document.createElement('button');
  testButton.type = 'button';
  testButton.className = 'settings-test-button';
  testButton.textContent = 'Test connection';
  testButton.id = 'settings-test-button';
  testButton.disabled = true;

  testButton.addEventListener('click', () => {
    void onTest();
  });

  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.className = 'settings-save-button';
  saveButton.textContent = 'Save';
  saveButton.id = 'settings-save-button';

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'settings-delete-button';
  deleteButton.textContent = 'Delete';
  deleteButton.id = 'settings-delete-button';
  deleteButton.disabled = true;

  deleteButton.addEventListener('click', () => {
    void onDelete();
  });

  const buttonRow = document.createElement('div');
  buttonRow.className = 'settings-button-row';
  buttonRow.appendChild(testButton);
  buttonRow.appendChild(saveButton);
  buttonRow.appendChild(deleteButton);

  const statusMessage = document.createElement('div');
  statusMessage.className = 'settings-test-status';
  statusMessage.id = 'settings-test-status';
  buttonRow.appendChild(statusMessage);

  nameInput.addEventListener('input', () => {
    updateTestButtonState(form);
  });
  baseUrlInput.addEventListener('input', () => {
    updateTestButtonState(form);
  });

  form.appendChild(createFormGroup(nameLabel, nameInput));
  form.appendChild(createFormGroup(baseUrlLabel, baseUrlInput));
  form.appendChild(createFormGroup(apiKeyLabel, apiKeyInput));
  form.appendChild(createFormGroup(timeoutLabel, timeoutInput));
  form.appendChild(createFormGroup(modelLabel, modelSelect));
  form.appendChild(enabledLabel);
  form.appendChild(buttonRow);

  return form;
}

export function createSettingsView(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'settings-view-container';
  let savedConnections: SavedConnection[] = [];

  const headerCard = document.createElement('div');
  headerCard.className = 'settings-card';

  const title = document.createElement('h2');
  title.textContent = 'Model Connection Settings';
  headerCard.appendChild(title);

  const description = document.createElement('p');
  description.textContent = 'Configure an OpenAI-compatible connection.';
  headerCard.appendChild(description);

  container.appendChild(headerCard);

  const chatCard = document.createElement('section');
  chatCard.className = 'settings-card';
  const chatTitle = document.createElement('h2');
  chatTitle.textContent = 'Chat';
  const chatDescription = document.createElement('p');
  chatDescription.textContent = 'Choose the model selection copied into newly created chats.';
  const chatForm = document.createElement('form');
  chatForm.className = 'settings-form';
  const defaultConnectionSelect = document.createElement('select');
  defaultConnectionSelect.id = 'settings-chat-default-connection';
  defaultConnectionSelect.className = 'settings-input';
  const defaultModelSelect = document.createElement('select');
  defaultModelSelect.id = 'settings-chat-default-model';
  defaultModelSelect.className = 'settings-input';
  defaultModelSelect.disabled = true;
  const showReasoningInput = document.createElement('input');
  showReasoningInput.type = 'checkbox';
  showReasoningInput.id = 'settings-chat-show-reasoning';
  const showReasoningRow = document.createElement('div');
  showReasoningRow.className = 'settings-checkbox-row';
  showReasoningRow.appendChild(showReasoningInput);
  showReasoningRow.appendChild(createFormLabel('Show model reasoning', showReasoningInput.id));
  const showToolCallsInput = document.createElement('input');
  showToolCallsInput.type = 'checkbox';
  showToolCallsInput.id = 'settings-chat-show-tool-calls';
  const showToolCallsRow = document.createElement('div');
  showToolCallsRow.className = 'settings-checkbox-row';
  showToolCallsRow.appendChild(showToolCallsInput);
  showToolCallsRow.appendChild(createFormLabel('Show tool calls', showToolCallsInput.id));
  const createPlaceholder = (text: string): HTMLOptionElement => {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = text;
    return option;
  };
  defaultConnectionSelect.appendChild(createPlaceholder('Select connection'));
  defaultModelSelect.appendChild(createPlaceholder('Select model'));
  const chatSaveButton = document.createElement('button');
  chatSaveButton.type = 'submit';
  chatSaveButton.className = 'settings-save-button';
  chatSaveButton.textContent = 'Save';
  chatSaveButton.disabled = true;
  const chatStatus = document.createElement('p');
  chatStatus.className = 'settings-saved-status';
  chatStatus.textContent = 'Loading Chat settings...';
  chatForm.appendChild(
    createFormGroup(
      createFormLabel('Default model connection', defaultConnectionSelect.id),
      defaultConnectionSelect,
    ),
  );
  chatForm.appendChild(showReasoningRow);
  chatForm.appendChild(showToolCallsRow);
  chatForm.appendChild(
    createFormGroup(createFormLabel('Default model', defaultModelSelect.id), defaultModelSelect),
  );
  chatForm.appendChild(chatSaveButton);
  chatForm.appendChild(chatStatus);
  chatCard.appendChild(chatTitle);
  chatCard.appendChild(chatDescription);
  chatCard.appendChild(chatForm);
  container.appendChild(chatCard);

  let defaultModelRequestId = 0;
  const loadDefaultModels = async (
    connectionId: number,
    selectedModelId: string | null,
  ): Promise<void> => {
    const requestId = ++defaultModelRequestId;
    defaultModelSelect.replaceChildren(createPlaceholder('Loading models...'));
    defaultModelSelect.disabled = true;
    try {
      const response = await fetch(`/api/model-connections/${connectionId}/models`);
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
      if (requestId !== defaultModelRequestId) {
        return;
      }
      const models = (payload as { models: unknown[] }).models.flatMap((model): string[] => {
        if (
          typeof model !== 'object' ||
          model === null ||
          Array.isArray(model) ||
          typeof (model as Record<string, unknown>).id !== 'string'
        ) {
          return [];
        }
        return [(model as { id: string }).id];
      });
      defaultModelSelect.replaceChildren(createPlaceholder('Select model'));
      for (const model of models) {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        defaultModelSelect.appendChild(option);
      }
      defaultModelSelect.value = selectedModelId && models.includes(selectedModelId)
        ? selectedModelId
        : '';
      defaultModelSelect.disabled = false;
    } catch {
      if (requestId === defaultModelRequestId) {
        defaultModelSelect.replaceChildren(createPlaceholder('Select model'));
        defaultModelSelect.disabled = true;
        chatStatus.textContent = 'Failed to load models.';
        chatStatus.className = 'settings-saved-status settings-saved-status-error';
      }
    }
  };

  defaultConnectionSelect.addEventListener('change', () => {
    defaultModelRequestId += 1;
    defaultModelSelect.replaceChildren(createPlaceholder('Select model'));
    const connectionId = Number(defaultConnectionSelect.value);
    if (!Number.isInteger(connectionId) || connectionId <= 0) {
      defaultModelSelect.disabled = true;
      return;
    }
    void loadDefaultModels(connectionId, null);
  });

  chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const connectionId = Number(defaultConnectionSelect.value);
    const defaultModelConnectionId =
      Number.isInteger(connectionId) && connectionId > 0 ? connectionId : null;
    const defaultModelId = defaultModelConnectionId ? defaultModelSelect.value || null : null;
    chatSaveButton.disabled = true;
    chatStatus.textContent = 'Saving Chat settings...';
    void (async () => {
      try {
        const response = await fetch('/api/settings/chat', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            defaultModelConnectionId,
            defaultModelId,
            showReasoning: showReasoningInput.checked,
            showToolCalls: showToolCallsInput.checked,
          }),
        });
        if (!response.ok) {
          throw new Error('Failed to save Chat settings');
        }
        chatStatus.textContent = 'Chat settings saved.';
        chatStatus.className = 'settings-saved-status';
      } catch {
        chatStatus.textContent = 'Failed to save Chat settings.';
        chatStatus.className = 'settings-saved-status settings-saved-status-error';
      } finally {
        chatSaveButton.disabled = false;
      }
    })();
  });

  const loadChatSettings = async (): Promise<void> => {
    try {
      const response = await fetch('/api/settings/chat');
      if (!response.ok) {
        throw new Error('Failed to load Chat settings');
      }
      const payload: unknown = await response.json();
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new Error('Invalid Chat settings response');
      }
      const settings = payload as Record<string, unknown>;
      const connectionId = settings.defaultModelConnectionId;
      const modelId = settings.defaultModelId;
      const showReasoning = settings.showReasoning;
      const showToolCalls = settings.showToolCalls;
      if (
        (connectionId !== null && (!Number.isInteger(connectionId) || Number(connectionId) <= 0)) ||
        (modelId !== null && (typeof modelId !== 'string' || modelId.trim().length === 0)) ||
        typeof showReasoning !== 'boolean' ||
        typeof showToolCalls !== 'boolean'
      ) {
        throw new Error('Invalid Chat settings response');
      }
      defaultConnectionSelect.replaceChildren(createPlaceholder('Select connection'));
      for (const connection of savedConnections.filter((item) => item.data.enabled)) {
        const option = document.createElement('option');
        option.value = String(connection.id);
        option.textContent = connection.data.name;
        defaultConnectionSelect.appendChild(option);
      }
      const selectedConnection = savedConnections.find(
        (item) => item.data.enabled && item.id === connectionId,
      );
      defaultConnectionSelect.value = selectedConnection ? String(selectedConnection.id) : '';
      showReasoningInput.checked = showReasoning;
      showToolCallsInput.checked = showToolCalls;
      if (selectedConnection) {
        await loadDefaultModels(
          selectedConnection.id,
          typeof modelId === 'string' ? modelId.trim() : null,
        );
      }
      chatStatus.textContent = '';
      chatSaveButton.disabled = false;
    } catch {
      chatStatus.textContent = 'Failed to load Chat settings.';
      chatStatus.className = 'settings-saved-status settings-saved-status-error';
    }
  };

  const savedConnectionsCard = document.createElement('div');
  savedConnectionsCard.className = 'settings-card';

  const savedTitle = document.createElement('h2');
  savedTitle.textContent = 'Saved connections';
  savedConnectionsCard.appendChild(savedTitle);

  const savedDescription = document.createElement('p');
  savedDescription.textContent = 'Select a saved connection to load it into the form.';
  savedConnectionsCard.appendChild(savedDescription);

  const savedLabel = createFormLabel('Saved connection', 'settings-saved-connections');
  const savedSelect = document.createElement('select');
  savedSelect.id = 'settings-saved-connections';
  savedSelect.className = 'settings-input';

  const newConnectionOption = document.createElement('option');
  newConnectionOption.value = NEW_CONNECTION_VALUE;
  newConnectionOption.textContent = 'New connection';
  newConnectionOption.selected = true;
  savedSelect.appendChild(newConnectionOption);

  const savedStatus = document.createElement('div');
  savedStatus.className = 'settings-saved-status';
  savedStatus.id = 'settings-saved-status';
  savedStatus.textContent = 'Loading saved connections...';

  savedConnectionsCard.appendChild(createFormGroup(savedLabel, savedSelect));
  savedConnectionsCard.appendChild(savedStatus);
  container.appendChild(savedConnectionsCard);

  const formCard = document.createElement('div');
  formCard.className = 'settings-card';

  const saveCallback = async (): Promise<void> => {
    const saveButton = document.getElementById('settings-save-button') as HTMLButtonElement | null;
    const nameInput = document.getElementById('settings-name') as HTMLInputElement | null;
    const baseUrlInput = document.getElementById('settings-base-url') as HTMLInputElement | null;
    const apiKeyInput = document.getElementById('settings-api-key') as HTMLInputElement | null;
    const timeoutInput = document.getElementById('settings-timeout') as HTMLInputElement | null;
    const modelSelect = document.getElementById('settings-model') as HTMLSelectElement | null;
    const enabledCheckbox = document.getElementById('settings-enabled') as HTMLInputElement | null;
    const statusMessage = document.getElementById('settings-test-status');

    if (!saveButton || !nameInput || !baseUrlInput) {
      return;
    }

    const showSaveError = (): void => {
      saveButton.textContent = 'Save';
      saveButton.disabled = false;
      if (statusMessage) {
        statusMessage.textContent = 'Failed to save connection';
        statusMessage.className = 'settings-test-status settings-test-status-error';
      }
    };

    const name = nameInput.value.trim();
    const baseUrl = baseUrlInput.value.trim();
    const apiKey = apiKeyInput?.value ?? '';
    const parsedTimeout = timeoutInput ? parseInt(timeoutInput.value, 10) : DEFAULT_TIMEOUT_MINUTES;
    const timeoutMinutes = isNaN(parsedTimeout) || parsedTimeout <= 0
      ? DEFAULT_TIMEOUT_MINUTES
      : parsedTimeout;
    const modelId = modelSelect && modelSelect.value ? modelSelect.value : null;
    const enabled = enabledCheckbox ? enabledCheckbox.checked : true;

    const savedSelect = document.getElementById('settings-saved-connections') as HTMLSelectElement | null;
    const selectedValue = savedSelect ? savedSelect.value : NEW_CONNECTION_VALUE;
    const selectedId = selectedValue === NEW_CONNECTION_VALUE ? null : parseInt(selectedValue, 10);
    const isUpdate = selectedId !== null && !isNaN(selectedId) && selectedId > 0;

    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    try {
      const response = await fetch(
        isUpdate ? `/api/model-connections/${selectedId}` : '/api/model-connections',
        {
          method: isUpdate ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, baseUrl, apiKey, timeoutMinutes, modelId, enabled }),
        },
      );

      if (response.ok) {
        if (!isUpdate) {
          let payload: unknown;
          try {
            payload = await response.json();
          } catch {
            showSaveError();
            return;
          }

          if (!isSavedConnection(payload) || !savedSelect) {
            showSaveError();
            return;
          }

          const createdConnection = payload;
          savedConnections.push(createdConnection);
          let savedOption = Array.from(savedSelect.options).find(
            (option) => option.value === String(createdConnection.id),
          );
          if (!savedOption) {
            savedOption = document.createElement('option');
            savedOption.value = String(createdConnection.id);
            savedSelect.appendChild(savedOption);
          }
          savedOption.textContent = `${createdConnection.data.name} - ${createdConnection.data.baseUrl}`;
          savedSelect.value = String(createdConnection.id);

          const deleteButton = document.getElementById('settings-delete-button') as HTMLButtonElement | null;
          if (deleteButton) {
            deleteButton.disabled = false;
          }
          setSavedConnectionsStatus(
            `${savedConnections.length} saved connection(s) available`,
            false,
          );
        } else if (savedSelect) {
          const savedEntry = savedConnections.find((item) => item.id === selectedId);
          if (savedEntry) {
            savedEntry.data.name = name;
            savedEntry.data.baseUrl = baseUrl;
            savedEntry.data.timeoutMinutes = timeoutMinutes;
            savedEntry.data.modelId = modelId;
            savedEntry.data.enabled = enabled;
            savedEntry.hasApiKey = savedEntry.hasApiKey === true || apiKey.trim().length > 0;
          }

          const savedOption = Array.from(savedSelect.options).find(
            (option) => option.value === String(selectedId),
          );
          if (savedOption) {
            savedOption.textContent = `${name} - ${baseUrl}`;
          }
        }
        if (apiKeyInput) {
          apiKeyInput.value = '';
        }
        connectionState.apiKey = '';
        saveButton.textContent = 'Saved';
        if (statusMessage) {
          statusMessage.textContent = isUpdate
            ? 'Connection updated successfully'
            : 'Connection saved successfully';
          statusMessage.className = 'settings-test-status settings-test-status-success';
        }
        setTimeout(() => {
          if (saveButton) {
            saveButton.textContent = 'Save';
            saveButton.disabled = false;
          }
          if (statusMessage) {
            statusMessage.textContent = '';
            statusMessage.className = 'settings-test-status';
          }
        }, 2000);
      } else {
        showSaveError();
      }
    } catch {
      saveButton.textContent = 'Save';
      saveButton.disabled = false;
      if (statusMessage) {
        statusMessage.textContent = 'Failed to reach the server';
        statusMessage.className = 'settings-test-status settings-test-status-error';
      }
    }
  };

  const testCallback = async (): Promise<void> => {
    const testButton = document.getElementById('settings-test-button') as HTMLButtonElement | null;
    const baseUrlInput = document.getElementById('settings-base-url') as HTMLInputElement | null;
    const apiKeyInput = document.getElementById('settings-api-key') as HTMLInputElement | null;
    const timeoutInput = document.getElementById('settings-timeout') as HTMLInputElement | null;
    const modelSelect = document.getElementById('settings-model') as HTMLSelectElement | null;
    const savedSelect = document.getElementById(
      'settings-saved-connections',
    ) as HTMLSelectElement | null;
    const statusMessage = document.getElementById('settings-test-status');

    if (!testButton || !baseUrlInput) {
      return;
    }

    const baseUrl = baseUrlInput.value.trim();
    const apiKey = apiKeyInput ? apiKeyInput.value : '';
    const parsedTimeout = timeoutInput ? parseInt(timeoutInput.value, 10) : DEFAULT_TIMEOUT_MINUTES;
    const timeoutMinutes = isNaN(parsedTimeout) || parsedTimeout <= 0
      ? DEFAULT_TIMEOUT_MINUTES
      : parsedTimeout;
    const selectedConnectionId = savedSelect ? Number(savedSelect.value) : NaN;
    const connectionId = Number.isSafeInteger(selectedConnectionId) && selectedConnectionId > 0
      ? selectedConnectionId
      : undefined;

    testButton.disabled = true;
    testButton.textContent = 'Testing...';
    if (statusMessage) {
      statusMessage.textContent = '';
      statusMessage.className = 'settings-test-status';
    }

    try {
      const response = await fetch('/api/model-connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey, timeoutMinutes, connectionId }),
      });

      const data = await response.json();

      if (data.connected) {
        if (modelSelect) {
          while (modelSelect.options.length > 0) {
            modelSelect.remove(0);
          }

          if (data.models && data.models.length > 0) {
            for (const modelId of data.models) {
              const option = document.createElement('option');
              option.value = modelId;
              option.textContent = modelId;
              modelSelect.appendChild(option);
            }
            modelSelect.disabled = false;
          } else {
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'No models available';
            placeholder.disabled = true;
            placeholder.selected = true;
            modelSelect.appendChild(placeholder);
            modelSelect.disabled = true;
          }
        }

        if (statusMessage) {
          statusMessage.textContent = data.models && data.models.length > 0
            ? `Connected. ${data.models.length} model(s) available.`
            : 'Connected. No models available.';
          statusMessage.className = 'settings-test-status settings-test-status-success';
        }
      } else {
        if (modelSelect) {
          while (modelSelect.options.length > 0) {
            modelSelect.remove(0);
          }
          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = 'No models available';
          placeholder.disabled = true;
          placeholder.selected = true;
          modelSelect.appendChild(placeholder);
          modelSelect.disabled = true;
        }

        if (statusMessage) {
          statusMessage.textContent = data.error || 'Connection failed';
          statusMessage.className = 'settings-test-status settings-test-status-error';
        }
      }
    } catch {
      if (modelSelect) {
        while (modelSelect.options.length > 0) {
          modelSelect.remove(0);
        }
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'No models available';
        placeholder.disabled = true;
        placeholder.selected = true;
        modelSelect.appendChild(placeholder);
        modelSelect.disabled = true;
      }

      if (statusMessage) {
        statusMessage.textContent = 'Failed to reach the server';
        statusMessage.className = 'settings-test-status settings-test-status-error';
      }
    } finally {
      testButton.disabled = false;
      testButton.textContent = 'Test connection';
    }
  };

  const deleteConnection = async (
    selectedId: number,
    deleteButton: HTMLButtonElement,
  ): Promise<void> => {
    const statusMessage = document.getElementById('settings-test-status');

    deleteButton.disabled = true;
    deleteButton.textContent = 'Deleting...';

    try {
      const response = await fetch(`/api/model-connections/${selectedId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        deleteButton.disabled = false;
        deleteButton.textContent = 'Delete';
        if (statusMessage) {
          statusMessage.textContent = 'Failed to delete connection';
          statusMessage.className = 'settings-test-status settings-test-status-error';
        }
        return;
      }

      savedConnections = savedConnections.filter((connection) => connection.id !== selectedId);
      const deletedOption = Array.from(savedSelect.options).find(
        (option) => option.value === String(selectedId),
      );
      deletedOption?.remove();

      savedSelect.value = NEW_CONNECTION_VALUE;
      resetFormToNewConnection();
      deleteButton.textContent = 'Delete';
      setSavedConnectionsStatus(
        savedConnections.length === 0
          ? 'No saved connections yet'
          : `${savedConnections.length} saved connection(s) available`,
        false,
      );
      if (statusMessage) {
        statusMessage.textContent = 'Connection deleted successfully';
        statusMessage.className = 'settings-test-status settings-test-status-success';
      }
    } catch {
      deleteButton.disabled = false;
      deleteButton.textContent = 'Delete';
      if (statusMessage) {
        statusMessage.textContent = 'Failed to reach the server';
        statusMessage.className = 'settings-test-status settings-test-status-error';
      }
    }
  };

  const requestDeleteConnection = (): void => {
    const deleteButton = document.getElementById('settings-delete-button') as HTMLButtonElement | null;
    const selectedId = Number(savedSelect.value);
    const connection = savedConnections.find((item) => item.id === selectedId);

    if (
      savedSelect.value === NEW_CONNECTION_VALUE ||
      !Number.isInteger(selectedId) ||
      selectedId <= 0 ||
      !deleteButton ||
      !connection
    ) {
      return;
    }

    const modal = createConfirmationModal({
      title: 'Delete connection?',
      message: `"${connection.data.name}" will be permanently deleted.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
      returnFocusTo: deleteButton,
      onConfirm: () => deleteConnection(selectedId, deleteButton),
      onCancel: () => undefined,
    });
    container.appendChild(modal);
  };

  const form = createSettingsForm(saveCallback, testCallback, requestDeleteConnection);
  formCard.appendChild(form);
  container.appendChild(formCard);

  const setSavedConnectionsStatus = (message: string, isError: boolean): void => {
    savedStatus.textContent = message;
    savedStatus.className = isError
      ? 'settings-saved-status settings-saved-status-error'
      : 'settings-saved-status';
  };

  const resetFormToNewConnection = (): void => {
    const nameInput = document.getElementById('settings-name') as HTMLInputElement | null;
    const baseUrlInput = document.getElementById('settings-base-url') as HTMLInputElement | null;
    const apiKeyInput = document.getElementById('settings-api-key') as HTMLInputElement | null;
    const timeoutInput = document.getElementById('settings-timeout') as HTMLInputElement | null;
    const modelSelect = document.getElementById('settings-model') as HTMLSelectElement | null;
    const enabledCheckbox = document.getElementById('settings-enabled') as HTMLInputElement | null;

    if (nameInput) {
      nameInput.value = '';
    }
    if (baseUrlInput) {
      baseUrlInput.value = '';
    }
    if (apiKeyInput) {
      apiKeyInput.value = '';
    }
    if (timeoutInput) {
      timeoutInput.value = String(DEFAULT_TIMEOUT_MINUTES);
    }
    if (enabledCheckbox) {
      enabledCheckbox.checked = true;
    }
    if (modelSelect) {
      clearModelOptions(modelSelect);
      modelSelect.appendChild(createNoModelsPlaceholderOption());
      modelSelect.disabled = true;
    }

    connectionState.name = '';
    connectionState.baseUrl = '';
    connectionState.apiKey = '';
    connectionState.timeoutMinutes = DEFAULT_TIMEOUT_MINUTES;

    updateTestButtonState(form);
  };

  const populateFormFromConnection = (connection: SavedConnection): void => {
    const nameInput = document.getElementById('settings-name') as HTMLInputElement | null;
    const baseUrlInput = document.getElementById('settings-base-url') as HTMLInputElement | null;
    const apiKeyInput = document.getElementById('settings-api-key') as HTMLInputElement | null;
    const timeoutInput = document.getElementById('settings-timeout') as HTMLInputElement | null;
    const modelSelect = document.getElementById('settings-model') as HTMLSelectElement | null;
    const enabledCheckbox = document.getElementById('settings-enabled') as HTMLInputElement | null;

    const data = connection.data;

    if (nameInput) {
      nameInput.value = data.name;
    }
    if (baseUrlInput) {
      baseUrlInput.value = data.baseUrl;
    }
    if (apiKeyInput) {
      apiKeyInput.value = '';
    }
    connectionState.apiKey = '';
    if (timeoutInput) {
      timeoutInput.value = String(data.timeoutMinutes);
    }
    if (enabledCheckbox) {
      enabledCheckbox.checked = data.enabled;
    }
    if (modelSelect) {
      clearModelOptions(modelSelect);
      if (data.modelId) {
        const option = document.createElement('option');
        option.value = data.modelId;
        option.textContent = data.modelId;
        modelSelect.appendChild(option);
        modelSelect.disabled = false;
      } else {
        modelSelect.appendChild(createNoModelsPlaceholderOption());
        modelSelect.disabled = true;
      }
    }

    updateTestButtonState(form);
  };

  const loadSavedConnections = async (): Promise<void> => {
    setSavedConnectionsStatus('Loading saved connections...', false);
    try {
      const response = await fetch('/api/model-connections');
      if (!response.ok) {
        throw new Error('Failed to load saved connections');
      }

      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error('Unexpected saved connections response');
      }

      savedConnections = payload.filter(isSavedConnection);

      for (const connection of savedConnections) {
        const option = document.createElement('option');
        option.value = String(connection.id);
        option.textContent = `${connection.data.name} - ${connection.data.baseUrl}`;
        savedSelect.appendChild(option);
      }

      if (savedConnections.length === 0) {
        setSavedConnectionsStatus('No saved connections yet', false);
      } else {
        setSavedConnectionsStatus(
          `${savedConnections.length} saved connection(s) available`,
          false,
        );
      }
      await loadChatSettings();
    } catch {
      setSavedConnectionsStatus('Failed to load saved connections', true);
    }
  };

  savedSelect.addEventListener('change', () => {
    const deleteButton = document.getElementById('settings-delete-button') as HTMLButtonElement | null;

    if (savedSelect.value === NEW_CONNECTION_VALUE) {
      if (deleteButton) {
        deleteButton.disabled = true;
      }
      resetFormToNewConnection();
      return;
    }

    const connectionId = parseInt(savedSelect.value, 10);
    const connection = savedConnections.find((item) => item.id === connectionId);
    if (connection) {
      if (deleteButton) {
        deleteButton.disabled = false;
      }
      populateFormFromConnection(connection);
    } else if (deleteButton) {
      deleteButton.disabled = true;
    }
  });

  void loadSavedConnections();

  return container;
}
