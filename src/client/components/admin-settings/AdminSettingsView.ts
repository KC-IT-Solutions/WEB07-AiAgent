import { createConfirmationModal } from '../ConfirmationModal.js';

const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'trace'] as const;
const MODEL_VISIBILITY_SAVE_DELAY_MS = 300;
const MAX_MODEL_DESCRIPTION_LENGTH = 500;
type LogLevel = (typeof LOG_LEVELS)[number];

interface LoggingSettings {
  level: LogLevel;
  applicationLogEnabled: boolean;
  modelInferenceLogEnabled: boolean;
  clearLogsOnStartup: boolean;
}

interface AdminModelConnection {
  id: number;
  name: string;
}

interface ModelVisibilityEditor {
  connectionId: number;
  filterConfigured: boolean;
  visibleModelIds: string[];
  discoveredModels: string[];
  modelDescriptions: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseModelConnections(value: unknown): AdminModelConnection[] | null {
  if (!Array.isArray(value)) return null;
  const connections = value.map((item): AdminModelConnection | null => {
    if (
      !isRecord(item) ||
      !Number.isSafeInteger(item.id) ||
      Number(item.id) <= 0 ||
      !isRecord(item.data) ||
      typeof item.data.name !== 'string' ||
      item.data.name.length === 0
    ) {
      return null;
    }
    return { id: Number(item.id), name: item.data.name };
  });
  return connections.every((connection): connection is AdminModelConnection => connection !== null)
    ? connections
    : null;
}

function parseStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : null;
}

function parseModelDescriptions(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const entries: Array<[string, string]> = [];
  for (const [modelId, description] of Object.entries(value)) {
    if (modelId.length === 0 || typeof description !== 'string') return null;
    entries.push([modelId, description]);
  }
  return Object.fromEntries(entries);
}

function parseModelVisibility(value: unknown): ModelVisibilityEditor | null {
  if (!isRecord(value)) return null;
  const visibleModelIds = parseStringArray(value.visibleModelIds);
  const discoveredModels = parseStringArray(value.discoveredModels);
  const modelDescriptions = parseModelDescriptions(value.modelDescriptions);
  if (
    !Number.isSafeInteger(value.connectionId) ||
    Number(value.connectionId) <= 0 ||
    typeof value.filterConfigured !== 'boolean' ||
    !visibleModelIds ||
    !discoveredModels ||
    !modelDescriptions
  ) {
    return null;
  }
  return {
    connectionId: Number(value.connectionId),
    filterConfigured: value.filterConfigured,
    visibleModelIds,
    discoveredModels,
    modelDescriptions,
  };
}

function createModelVisibilityCard(): HTMLElement {
  const card = document.createElement('section');
  card.className = 'settings-card';
  const heading = document.createElement('h2');
  heading.textContent = 'Model visibility';
  const description = document.createElement('p');
  description.textContent = 'Choose which discovered models are available throughout the application.';
  const list = document.createElement('div');
  list.className = 'admin-model-visibility-list';
  const status = document.createElement('p');
  status.className = 'settings-saved-status';
  status.setAttribute('role', 'status');
  card.append(heading, description, list, status);

  function setStatus(message: string, isError = false): void {
    status.textContent = message;
    status.classList.toggle('settings-saved-status-error', isError);
    status.setAttribute('role', isError ? 'alert' : 'status');
  }

  function renderEditor(
    panel: HTMLElement,
    visibility: ModelVisibilityEditor,
    initialStatus = '',
    initialStatusIsError = false,
  ): void {
    panel.replaceChildren();
    const form = document.createElement('form');
    form.className = 'admin-model-visibility-form';
    const showAllRow = document.createElement('div');
    showAllRow.className = 'tool-settings-checkbox';
    const showAll = document.createElement('input');
    showAll.type = 'checkbox';
    showAll.id = `admin-show-all-models-${visibility.connectionId}`;
    showAll.checked = !visibility.filterConfigured;
    const showAllLabel = document.createElement('label');
    showAllLabel.htmlFor = showAll.id;
    showAllLabel.textContent = 'Show all discovered models';
    showAllRow.append(showAll, showAllLabel);

    const explicitControls = document.createElement('div');
    explicitControls.className = 'admin-model-explicit-controls';
    explicitControls.id = `admin-model-explicit-controls-${visibility.connectionId}`;
    const checklist = document.createElement('div');
    checklist.className = 'admin-model-checklist';
    const selectedIds = new Set(visibility.visibleModelIds);
    const discoveredIds = new Set(visibility.discoveredModels);
    const modelIds = [
      ...visibility.discoveredModels,
      ...visibility.visibleModelIds.filter((modelId) => !discoveredIds.has(modelId)),
      ...Object.keys(visibility.modelDescriptions).filter(
        (modelId) => !discoveredIds.has(modelId) && !selectedIds.has(modelId),
      ),
    ];
    const checkboxes = new Map<string, HTMLInputElement>();
    const descriptionInputs = new Map<string, HTMLTextAreaElement>();

    if (modelIds.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No models reported by this connection.';
      checklist.appendChild(empty);
    }
    for (const modelId of modelIds) {
      const row = document.createElement('div');
      row.className = 'admin-model-checklist-row';
      const identity = document.createElement('div');
      identity.className = 'admin-model-checklist-identity';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `admin-visible-model-${visibility.connectionId}-${checkboxes.size}`;
      checkbox.checked = visibility.filterConfigured ? selectedIds.has(modelId) : true;
      checkbox.disabled = !discoveredIds.has(modelId);
      const label = document.createElement('label');
      label.htmlFor = checkbox.id;
      label.textContent = checkbox.disabled ? `${modelId} (currently unavailable)` : modelId;
      identity.append(checkbox, label);
      const descriptionLabel = document.createElement('label');
      const description = document.createElement('textarea');
      description.id = `admin-model-description-${visibility.connectionId}-${checkboxes.size}`;
      descriptionLabel.htmlFor = description.id;
      descriptionLabel.textContent = 'Description';
      description.className = 'admin-model-description';
      description.rows = 1;
      description.maxLength = MAX_MODEL_DESCRIPTION_LENGTH;
      description.placeholder = 'Optional model guidance';
      description.value = visibility.modelDescriptions[modelId] ?? '';
      row.append(identity, descriptionLabel, description);
      checklist.appendChild(row);
      checkboxes.set(modelId, checkbox);
      descriptionInputs.set(modelId, description);
    }

    const checklistActions = document.createElement('div');
    checklistActions.className = 'settings-button-row';
    const selectAll = document.createElement('button');
    selectAll.type = 'button';
    selectAll.className = 'settings-test-button';
    selectAll.textContent = 'Select all';
    const clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.className = 'settings-test-button';
    clearAll.textContent = 'Clear all';
    checklistActions.append(selectAll, clearAll);
    explicitControls.append(checklistActions, checklist);

    const editorStatus = document.createElement('p');
    editorStatus.className = 'settings-saved-status';
    editorStatus.textContent = initialStatus;
    editorStatus.classList.toggle('settings-saved-status-error', initialStatusIsError);
    editorStatus.setAttribute('role', initialStatusIsError ? 'alert' : 'status');
    form.append(showAllRow, explicitControls, editorStatus);
    panel.appendChild(form);

    let saveTimer: number | null = null;
    let saveInFlight = false;
    let editGeneration = 0;
    let queuedSave: {
      generation: number;
      filterConfigured: boolean;
      visibleModelIds: string[];
      modelDescriptions: Record<string, string>;
      saveVisibility: boolean;
      saveDescriptions: boolean;
    } | null = null;

    const readEditorState = (): {
      filterConfigured: boolean;
      visibleModelIds: string[];
      modelDescriptions: Record<string, string>;
    } => {
      const descriptionEntries: Array<[string, string]> = [];
      for (const [modelId, input] of descriptionInputs) {
        if (input.value.trim().length > 0) descriptionEntries.push([modelId, input.value]);
      }
      return {
        filterConfigured: !showAll.checked,
        visibleModelIds: showAll.checked
          ? []
          : [...checkboxes].filter(([, checkbox]) => checkbox.checked).map(([modelId]) => modelId),
        modelDescriptions: Object.fromEntries(descriptionEntries),
      };
    };

    const updateMode = (): void => {
      checklistActions.hidden = showAll.checked;
      for (const [modelId, checkbox] of checkboxes) {
        checkbox.disabled = showAll.checked || !discoveredIds.has(modelId);
      }
    };

    const restoreAuthoritativeState = async (): Promise<void> => {
      try {
        const response = await fetch(
          `/api/admin/model-connections/${visibility.connectionId}/model-visibility`,
        );
        const authoritative = response.ok ? parseModelVisibility(await response.json()) : null;
        if (!authoritative || authoritative.connectionId !== visibility.connectionId) {
          throw new Error('Invalid model visibility response');
        }
        renderEditor(panel, authoritative, 'Failed to save. Restored saved settings.', true);
      } catch {
        editorStatus.textContent = 'Failed to save. Reload model visibility to restore saved settings.';
      }
    };

    const flushSave = async (): Promise<void> => {
      if (saveInFlight || !queuedSave) return;
      saveInFlight = true;
      const saving = queuedSave;
      queuedSave = null;
      try {
        let savedVisibility: { filterConfigured: boolean; visibleModelIds: string[] } | null = null;
        let savedDescriptions: Record<string, string> | null = null;
        if (saving.saveVisibility) {
          const response = await fetch(
            `/api/admin/model-connections/${visibility.connectionId}/model-visibility`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filterConfigured: saving.filterConfigured,
                visibleModelIds: saving.visibleModelIds,
              }),
            },
          );
          const saved = response.ok ? ((await response.json()) as unknown) : null;
          const savedIds = isRecord(saved) ? parseStringArray(saved.visibleModelIds) : null;
          if (!isRecord(saved) || typeof saved.filterConfigured !== 'boolean' || !savedIds) {
            throw new Error('Invalid model visibility response');
          }
          savedVisibility = { filterConfigured: saved.filterConfigured, visibleModelIds: savedIds };
        }
        if (saving.saveDescriptions) {
          const response = await fetch(
            `/api/admin/model-connections/${visibility.connectionId}/model-descriptions`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ modelDescriptions: saving.modelDescriptions }),
            },
          );
          const saved = response.ok ? ((await response.json()) as unknown) : null;
          savedDescriptions = isRecord(saved)
            ? parseModelDescriptions(saved.modelDescriptions)
            : null;
          if (!isRecord(saved) || saved.connectionId !== visibility.connectionId || !savedDescriptions) {
            throw new Error('Invalid model descriptions response');
          }
        }
        if (saving.generation === editGeneration && queuedSave === null) {
          if (savedVisibility) {
            visibility.filterConfigured = savedVisibility.filterConfigured;
            visibility.visibleModelIds = savedVisibility.visibleModelIds;
            showAll.checked = !savedVisibility.filterConfigured;
            updateMode();
            const authoritativeIds = new Set(savedVisibility.visibleModelIds);
            for (const [modelId, checkbox] of checkboxes) {
              checkbox.checked =
                !savedVisibility.filterConfigured || authoritativeIds.has(modelId);
            }
          }
          if (savedDescriptions) {
            visibility.modelDescriptions = savedDescriptions;
            for (const [modelId, input] of descriptionInputs) {
              input.value = savedDescriptions[modelId] ?? '';
            }
          }
          editorStatus.textContent = 'Saved';
        }
      } catch {
        queuedSave = null;
        if (saveTimer !== null) window.clearTimeout(saveTimer);
        saveTimer = null;
        editGeneration += 1;
        form.querySelectorAll('button, input, textarea').forEach((control) => {
          (control as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement).disabled = true;
        });
        editorStatus.classList.add('settings-saved-status-error');
        editorStatus.setAttribute('role', 'alert');
        editorStatus.textContent = 'Failed to save';
        await restoreAuthoritativeState();
        return;
      } finally {
        saveInFlight = false;
      }
      if (queuedSave && saveTimer === null) void flushSave();
    };

    const scheduleSave = (kind: 'visibility' | 'descriptions'): void => {
      const editorState = readEditorState();
      editGeneration += 1;
      queuedSave = {
        generation: editGeneration,
        ...editorState,
        saveVisibility: kind === 'visibility' || queuedSave?.saveVisibility === true,
        saveDescriptions: kind === 'descriptions' || queuedSave?.saveDescriptions === true,
      };
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      editorStatus.classList.remove('settings-saved-status-error');
      editorStatus.setAttribute('role', 'status');
      editorStatus.textContent = 'Saving...';
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        void flushSave();
      }, MODEL_VISIBILITY_SAVE_DELAY_MS);
    };

    showAll.addEventListener('change', () => {
      updateMode();
      scheduleSave('visibility');
    });
    for (const checkbox of checkboxes.values()) {
      checkbox.addEventListener('change', () => scheduleSave('visibility'));
    }
    for (const description of descriptionInputs.values()) {
      description.addEventListener('input', () => scheduleSave('descriptions'));
    }
    selectAll.addEventListener('click', () => {
      for (const checkbox of checkboxes.values()) {
        if (!checkbox.disabled) checkbox.checked = true;
      }
      scheduleSave('visibility');
    });
    clearAll.addEventListener('click', () => {
      for (const checkbox of checkboxes.values()) checkbox.checked = false;
      scheduleSave('visibility');
    });
    updateMode();
  }

  async function loadVisibility(
    connection: AdminModelConnection,
    panel: HTMLElement,
  ): Promise<void> {
    panel.replaceChildren();
    const loading = document.createElement('p');
    loading.textContent = 'Loading models...';
    panel.appendChild(loading);
    try {
      const response = await fetch(
        `/api/admin/model-connections/${connection.id}/model-visibility`,
      );
      const visibility = response.ok ? parseModelVisibility(await response.json()) : null;
      if (!visibility || visibility.connectionId !== connection.id) {
        throw new Error('Invalid model visibility response');
      }
      renderEditor(panel, visibility);
    } catch {
      panel.replaceChildren();
      const error = document.createElement('p');
      error.className = 'settings-saved-status settings-saved-status-error';
      error.setAttribute('role', 'alert');
      error.textContent = 'Failed to load discovered models. The saved filter was not changed.';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'settings-test-button';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => void loadVisibility(connection, panel));
      panel.append(error, retry);
    }
  }

  function renderConnections(connections: AdminModelConnection[]): void {
    list.replaceChildren();
    if (connections.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No saved model connections.';
      list.appendChild(empty);
      return;
    }
    for (const connection of connections) {
      const item = document.createElement('article');
      item.className = 'admin-model-visibility-item';
      const name = document.createElement('h3');
      name.textContent = connection.name;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'settings-test-button';
      toggle.textContent = 'Configure model visibility';
      toggle.setAttribute('aria-expanded', 'false');
      const panel = document.createElement('div');
      panel.className = 'admin-model-visibility-panel';
      panel.id = `admin-model-visibility-panel-${connection.id}`;
      panel.hidden = true;
      toggle.setAttribute('aria-controls', panel.id);
      toggle.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        toggle.setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden && panel.childElementCount === 0) {
          void loadVisibility(connection, panel);
        }
      });
      item.append(name, toggle, panel);
      list.appendChild(item);
    }
  }

  void (async () => {
    setStatus('Loading model connections...');
    try {
      const response = await fetch('/api/model-connections');
      const connections = response.ok ? parseModelConnections(await response.json()) : null;
      if (!connections) throw new Error('Invalid model connections response');
      renderConnections(connections);
      setStatus('');
    } catch {
      setStatus('Failed to load model connections.', true);
    }
  })();

  return card;
}

function parseLoggingSettings(value: unknown): LoggingSettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const data = value as Record<string, unknown>;
  if (
    typeof data.level !== 'string' ||
    !LOG_LEVELS.includes(data.level as LogLevel) ||
    typeof data.applicationLogEnabled !== 'boolean' ||
    typeof data.modelInferenceLogEnabled !== 'boolean' ||
    typeof data.clearLogsOnStartup !== 'boolean'
  ) {
    return null;
  }
  return {
    level: data.level as LogLevel,
    applicationLogEnabled: data.applicationLogEnabled,
    modelInferenceLogEnabled: data.modelInferenceLogEnabled,
    clearLogsOnStartup: data.clearLogsOnStartup,
  };
}

function createLogTypeControl(
  id: string,
  labelText: string,
  descriptionText: string,
  stream: string,
): { group: HTMLElement; checkbox: HTMLInputElement } {
  const group = document.createElement('div');
  group.className = 'settings-log-type';

  const topRow = document.createElement('div');
  topRow.className = 'settings-log-type-row';

  const checkboxRow = document.createElement('div');
  checkboxRow.className = 'tool-settings-checkbox';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = id;
  const descriptionId = `${id}-description`;
  checkbox.setAttribute('aria-describedby', descriptionId);
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  checkboxRow.appendChild(checkbox);
  checkboxRow.appendChild(label);

  const overflowWrapper = document.createElement('div');
  overflowWrapper.className = 'settings-log-overflow';

  const overflowButton = document.createElement('button');
  overflowButton.type = 'button';
  overflowButton.className = 'settings-log-overflow-trigger';
  overflowButton.textContent = '\u2026';
  overflowButton.setAttribute('aria-label', `${labelText} actions`);
  overflowButton.setAttribute('aria-haspopup', 'menu');
  overflowButton.setAttribute('aria-expanded', 'false');

  const menuWrapper = document.createElement('div');
  menuWrapper.className = 'settings-log-overflow-menu-wrapper';
  menuWrapper.hidden = true;

  const viewLogItem = document.createElement('button');
  viewLogItem.type = 'button';
  viewLogItem.className = 'settings-log-overflow-menu-button';
  viewLogItem.textContent = 'View log';
  viewLogItem.setAttribute('role', 'menuitem');

  const downloadItem = document.createElement('button');
  downloadItem.type = 'button';
  downloadItem.className = 'settings-log-overflow-menu-button';
  downloadItem.textContent = 'Download';
  downloadItem.setAttribute('role', 'menuitem');

  menuWrapper.append(viewLogItem, downloadItem);
  overflowWrapper.append(overflowButton, menuWrapper);

  let menuOpen = false;

  function closeMenu(): void {
    menuOpen = false;
    menuWrapper.hidden = true;
    overflowButton.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu(): void {
    if (menuOpen) {
      closeMenu();
    } else {
      menuOpen = true;
      menuWrapper.hidden = false;
      overflowButton.setAttribute('aria-expanded', 'true');
      viewLogItem.focus();
      document.addEventListener('click', closeMenuOutside);
    }
  }

  overflowButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMenu();
  });

  const closeMenuOutside = (event: MouseEvent): void => {
    if (!overflowWrapper.contains(event.target as Node)) {
      closeMenu();
      document.removeEventListener('click', closeMenuOutside);
    }
  };

  overflowButton.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  });

  viewLogItem.addEventListener('click', () => {
    closeMenu();
    void openLogViewer(labelText, stream);
  });

  downloadItem.addEventListener('click', () => {
    closeMenu();
    triggerDownload(stream);
  });

  topRow.append(checkboxRow, overflowWrapper);

  const description = document.createElement('p');
  description.id = descriptionId;
  description.className = 'settings-log-type-description';
  description.textContent = descriptionText;

  group.appendChild(topRow);
  group.appendChild(description);

  function triggerDownload(streamIdentifier: string): void {
    const link = document.createElement('a');
    link.href = `/api/admin/logs/${streamIdentifier}/download`;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function openLogViewer(title: string, streamIdentifier: string): Promise<void> {
    const content = document.createElement('div');
    content.className = 'admin-log-viewer-content';
    const logText = document.createElement('pre');
    logText.className = 'admin-log-viewer-text';
    content.appendChild(logText);

    const modal = createConfirmationModal({
      title,
      message: '',
      content,
      confirmLabel: 'Close',
      destructive: false,
      onConfirm: () => undefined,
      canCloseAfterConfirm: () => true,
    });
    modal.classList.add('admin-log-viewer-backdrop');

    const parent = document.body;
    parent.appendChild(modal);

    try {
      const response = await fetch(`/api/admin/logs/${streamIdentifier}/readable`);
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const text = await response.text();
      if (text.length === 0 || text.trim().length === 0) {
        logText.textContent = 'No log entries.';
      } else {
        logText.textContent = text;
      }
    } catch {
      logText.textContent = 'Failed to load log. Please try again later.';
    }
  }

  return { group, checkbox };
}

export function createAdminSettingsView(): HTMLElement {
  const container = document.createElement('section');
  container.className = 'settings-view-container';

  const card = document.createElement('section');
  card.className = 'settings-card';
  const heading = document.createElement('h2');
  heading.textContent = 'Logging';
  const description = document.createElement('p');
  description.textContent = 'Configure global server logging behavior.';
  const form = document.createElement('form');
  form.className = 'settings-form';

  const levelGroup = document.createElement('div');
  levelGroup.className = 'settings-form-group';
  const levelLabel = document.createElement('label');
  levelLabel.htmlFor = 'admin-logging-level';
  levelLabel.textContent = 'Logging level';
  const levelSelect = document.createElement('select');
  levelSelect.id = 'admin-logging-level';
  levelSelect.className = 'settings-input';
  for (const level of LOG_LEVELS) {
    const option = document.createElement('option');
    option.value = level;
    option.textContent = level;
    levelSelect.appendChild(option);
  }
  levelGroup.appendChild(levelLabel);
  levelGroup.appendChild(levelSelect);

  const applicationLog = createLogTypeControl(
    'admin-application-log-enabled',
    'Application log',
    'Server events, warnings, errors and application activity.',
    'application',
  );
  const modelInferenceLog = createLogTypeControl(
    'admin-model-inference-log-enabled',
    'Model inference log',
    'Model requests, responses, tool calls and inference tracing.',
    'model-inference',
  );

  const clearGroup = document.createElement('div');
  clearGroup.className = 'tool-settings-checkbox';
  const clearCheckbox = document.createElement('input');
  clearCheckbox.type = 'checkbox';
  clearCheckbox.id = 'admin-clear-logs-on-startup';
  const clearLabel = document.createElement('label');
  clearLabel.htmlFor = clearCheckbox.id;
  clearLabel.textContent = 'Clear all logs on server startup';
  clearGroup.appendChild(clearCheckbox);
  clearGroup.appendChild(clearLabel);

  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.className = 'settings-save-button';
  saveButton.textContent = 'Save';
  saveButton.disabled = true;
  const status = document.createElement('p');
  status.className = 'settings-saved-status';
  status.setAttribute('role', 'status');

  form.appendChild(levelGroup);
  form.appendChild(applicationLog.group);
  form.appendChild(modelInferenceLog.group);
  form.appendChild(clearGroup);
  form.appendChild(saveButton);
  form.appendChild(status);
  card.appendChild(heading);
  card.appendChild(description);
  card.appendChild(form);
  container.appendChild(card);
  container.appendChild(createModelVisibilityCard());

  async function loadSettings(): Promise<void> {
    status.textContent = 'Loading logging settings...';
    try {
      const response = await fetch('/api/admin/settings/logging');
      const settings = response.ok ? parseLoggingSettings(await response.json()) : null;
      if (!settings) {
        throw new Error('Invalid logging settings response');
      }
      levelSelect.value = settings.level;
      applicationLog.checkbox.checked = settings.applicationLogEnabled;
      modelInferenceLog.checkbox.checked = settings.modelInferenceLogEnabled;
      clearCheckbox.checked = settings.clearLogsOnStartup;
      saveButton.disabled = false;
      status.textContent = '';
    } catch {
      status.classList.add('settings-saved-status-error');
      status.setAttribute('role', 'alert');
      status.textContent = 'Failed to load logging settings.';
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      saveButton.disabled = true;
      status.classList.remove('settings-saved-status-error');
      status.setAttribute('role', 'status');
      status.textContent = 'Saving...';
      try {
        const response = await fetch('/api/admin/settings/logging', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            level: levelSelect.value,
            applicationLogEnabled: applicationLog.checkbox.checked,
            modelInferenceLogEnabled: modelInferenceLog.checkbox.checked,
            clearLogsOnStartup: clearCheckbox.checked,
          }),
        });
        const settings = response.ok ? parseLoggingSettings(await response.json()) : null;
        if (!settings) {
          throw new Error('Invalid logging settings response');
        }
        levelSelect.value = settings.level;
        applicationLog.checkbox.checked = settings.applicationLogEnabled;
        modelInferenceLog.checkbox.checked = settings.modelInferenceLogEnabled;
        clearCheckbox.checked = settings.clearLogsOnStartup;
        status.textContent = 'Logging settings saved.';
      } catch {
        status.classList.add('settings-saved-status-error');
        status.setAttribute('role', 'alert');
        status.textContent = 'Failed to save logging settings.';
      } finally {
        saveButton.disabled = false;
      }
    })();
  });

  void loadSettings();
  return container;
}
