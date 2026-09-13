import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findProjectRoot(startDir: string): string | null {
  let current = startDir;
  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'package.json'))) {
      return current;
    }
    current = dirname(current);
  }
  return null;
}

await describe('SettingsView', async () => {
  const projectRoot = findProjectRoot(__dirname);
  assert.ok(projectRoot, 'Project root should be found');

  const settingsViewPath = resolve(projectRoot, 'src/client/components/settings/SettingsView.ts');
  const content = readFileSync(settingsViewPath, 'utf-8');
  const toolsContent = readFileSync(
    resolve(projectRoot, 'src/client/components/tools/ToolsView.ts'),
    'utf-8',
  );

  await it('should have a valid component file exporting createSettingsView', () => {
    assert.ok(content.includes('export function createSettingsView'));
  });

  await it('should have a connection name input', () => {
    assert.ok(
      content.includes('settings-name'),
      'Should have a connection name input with id settings-name',
    );
  });

  await it('should have a base URL input', () => {
    assert.ok(
      content.includes('settings-base-url'),
      'Should have a base URL input with id settings-base-url',
    );
  });

  await it('should have an API key input', () => {
    assert.ok(
      content.includes('settings-api-key'),
      'Should have an API key input with id settings-api-key',
    );
  });

  await it('should have a timeout input', () => {
    assert.ok(
      content.includes('settings-timeout'),
      'Should have a timeout input with id settings-timeout',
    );
  });

  await it('should use password input type for API key', () => {
    assert.ok(
      content.includes("'password'") || content.includes('"password"'),
      'API key input must use password type',
    );
  });

  await it('should have a Save button', () => {
    assert.ok(
      content.includes("'Save'"),
      'Should create a Save button',
    );
  });

  await it('should have a Test connection button', () => {
    assert.ok(
      content.includes('settings-test-button'),
      'Should have a Test connection button with id settings-test-button',
    );
  });

  await it('should have a model selector', () => {
    assert.ok(
      content.includes('settings-model'),
      'Should have a model selector with id settings-model',
    );
  });

  await it('should have an enabled checkbox', () => {
    assert.ok(
      content.includes('settings-enabled'),
      'Should have an enabled checkbox with id settings-enabled',
    );
  });

  await it('should have a form element', () => {
    assert.ok(
      content.includes('settings-form'),
      'Should have a form with class settings-form',
    );
  });

  await it('should prevent default form submission', () => {
    assert.ok(
      content.includes('preventDefault'),
      'Should prevent default form submission',
    );
  });

  await it('should use timeout in minutes', () => {
    assert.ok(
      content.includes('Timeout (minutes)'),
      'Timeout should be labeled in minutes',
    );
  });

  await it('should have default timeout of 30 minutes', () => {
    assert.ok(
      content.includes('DEFAULT_TIMEOUT_MINUTES'),
      'Should define default timeout in minutes',
    );
  });

  await it('should not include /v1 in base URL placeholder', () => {
    const baseUrlPlaceholderMatch = content.match(/'http:\/\/127\.0\.0\.1:1234[^']*'/);
    assert.ok(
      baseUrlPlaceholderMatch && !baseUrlPlaceholderMatch[0].includes('/v1'),
      'Base URL placeholder should not include /v1',
    );
  });

  await it('should make network requests for connection test', () => {
    assert.ok(
      content.includes('fetch('),
      'Should make fetch calls for connection test',
    );
    assert.ok(
      !content.includes('XMLHttpRequest'),
      'Should not use XMLHttpRequest',
    );
  });

  await it('should not persist data to localStorage or sessionStorage', () => {
    assert.ok(
      !content.includes('localStorage'),
      'Should not use localStorage',
    );
    assert.ok(
      !content.includes('sessionStorage'),
      'Should not use sessionStorage',
    );
  });

  await it('should not use innerHTML', () => {
    assert.ok(
      !content.includes('innerHTML'),
      'Should not use innerHTML',
    );
  });

  await it('should have a view container class', () => {
    assert.ok(
      content.includes('settings-view-container'),
      'Should have a settings-view-container class',
    );
  });

  await it('should reference OpenAI-compatible connection text', () => {
    assert.ok(
      content.includes('OpenAI-compatible'),
      'Should mention OpenAI-compatible connection',
    );
  });

  await it('loads registered tools and opens their settings in the shared modal', () => {
    assert.ok(toolsContent.includes("fetch('/api/tools')"));
    assert.ok(toolsContent.includes("toolsTitle.textContent = 'Tools'"));
    assert.ok(toolsContent.includes('openToolSettings(tool, button)'));
    assert.ok(toolsContent.includes('createConfirmationModal({'));
    assert.ok(toolsContent.includes("title: `${tool.displayName} settings`"));
    assert.ok(!content.includes("fetch('/api/tools')"));
    assert.ok(!content.includes("toolsTitle.textContent = 'Tools'"));
  });

  await it('saves validated tool settings while Cancel performs no request', () => {
    assert.ok(toolsContent.includes('Results per search must be an integer from 1 to 10.'));
    assert.ok(toolsContent.includes('`/api/tools/${tool.name}/settings`'));
    assert.ok(toolsContent.includes("method: 'PUT'"));
    assert.ok(toolsContent.includes('enabledForChat: enabled.checked'));
    assert.ok(toolsContent.includes('pageSize: parsedPageSize'));
    assert.ok(toolsContent.includes('safeSearch: selectedSafeSearch'));
    assert.ok(toolsContent.includes("'Request delay (ms)'"));
    assert.ok(toolsContent.includes("'Cooldown after HTTP 202 (ms)'"));
    assert.ok(toolsContent.includes("'tool-request-delay-ms'"));
    assert.ok(toolsContent.includes("'tool-cooldown-after-202-ms'"));
    assert.ok(toolsContent.includes('requestDelayMs: parsedRequestDelayMs'));
    assert.ok(toolsContent.includes('cooldownAfter202Ms: parsedCooldownAfter202Ms'));
    assert.ok(toolsContent.includes("input.step = '1'"));
    assert.ok(toolsContent.includes('Request delay must be an integer of 0 ms or more.'));
    assert.ok(toolsContent.includes('HTTP 202 cooldown must be an integer of 0 ms or more.'));
    assert.ok(toolsContent.includes("requestDelayMs?.value.trim() === ''"));
    assert.ok(toolsContent.includes("cooldownAfter202Ms?.value.trim() === ''"));
    assert.ok(toolsContent.includes('Number.isSafeInteger(parsedRequestDelayMs)'));
    assert.ok(toolsContent.includes('Number.isSafeInteger(parsedCooldownAfter202Ms)'));
    assert.ok(toolsContent.includes('onCancel: () => undefined'));
  });

  await it('supports Visit Website fields and validation in the shared modal', () => {
    assert.ok(toolsContent.includes("name: 'visit_website'"));
    assert.ok(toolsContent.includes("'tool-content-limit'"));
    assert.ok(toolsContent.includes("'Content limit'"));
    assert.ok(toolsContent.includes("'tool-max-links'"));
    assert.ok(toolsContent.includes("'Max links'"));
    assert.ok(toolsContent.includes("'tool-max-images'"));
    assert.ok(toolsContent.includes("'Max images'"));
    assert.ok(toolsContent.includes('Content limit must be an integer from 200 to 10000.'));
    assert.ok(toolsContent.includes('Max links must be an integer from 0 to 40.'));
    assert.ok(toolsContent.includes('Max images must be an integer from 0 to 20.'));
    assert.ok(toolsContent.includes('body: JSON.stringify(updatedSettings)'));
    assert.ok(toolsContent.includes('onCancel: () => undefined'));
  });

  await it('loads and explicitly saves nullable default Chat model settings', () => {
    assert.ok(content.includes("chatTitle.textContent = 'Chat'"));
    assert.ok(content.includes("'Default model connection'"));
    assert.ok(content.includes("'Default model'"));
    assert.ok(content.includes("createPlaceholder('Select connection')"));
    assert.ok(content.includes("createPlaceholder('Select model')"));
    assert.ok(content.includes("fetch('/api/settings/chat')"));
    assert.ok(content.includes("method: 'PUT'"));
    assert.ok(content.includes('showReasoning: showReasoningInput.checked'));
    assert.ok(content.includes('showToolCalls: showToolCallsInput.checked'));
    assert.ok(content.includes("'Show model reasoning'"));
    assert.ok(content.includes("'Show tool calls'"));
    assert.ok(content.includes("chatForm.addEventListener('submit'"));
  });

  await it('uses saved enabled connections and existing model discovery for Chat defaults', () => {
    assert.ok(content.includes('savedConnections.filter((item) => item.data.enabled)'));
    assert.ok(content.includes('`/api/model-connections/${connectionId}/models`'));
    assert.ok(content.includes('defaultModelSelect.disabled = true'));
    assert.ok(content.includes('loadDefaultModels(connectionId, null)'));
    assert.ok(!content.includes('localStorage'));
  });

  await it('should call /api/model-connections/test endpoint', () => {
    assert.ok(
      content.includes('/api/model-connections/test'),
      'Should call the model-connections test endpoint',
    );
    const testCallbackStart = content.indexOf('const testCallback');
    const testCallbackSection = content.substring(testCallbackStart);
    assert.ok(testCallbackSection.includes("'settings-saved-connections'"));
    assert.ok(
      testCallbackSection.includes(
        'JSON.stringify({ baseUrl, apiKey, timeoutMinutes, connectionId })',
      ),
      'Saved connection tests should identify the credential to resolve server-side',
    );
  });

  await it('should call /api/model-connections for persistence', () => {
    assert.ok(
      content.includes('/api/model-connections'),
      'Should call the model-connections persistence endpoint',
    );
  });

  await it('should POST to persistence endpoint on save', () => {
    assert.ok(
      content.includes("method: 'POST'") && content.includes('/api/model-connections'),
      'Should POST to the persistence endpoint',
    );
  });

  await it('should send the entered apiKey to the persistence endpoint', () => {
    const saveCallbackStart = content.indexOf('const saveCallback');
    const testCallbackStart = content.indexOf('const testCallback');
    const saveCallbackSection = content.substring(saveCallbackStart, testCallbackStart);
    const stringifyMatch = saveCallbackSection.match(/JSON\.stringify\(\{([^}]+)\}/);
    assert.ok(stringifyMatch, 'Should have a JSON.stringify call in save callback');
    assert.ok(
      stringifyMatch[1].includes('apiKey'),
      'Save persistence request body should include apiKey',
    );
  });

  await it('should clear API key input and state after a successful save', () => {
    const saveCallbackStart = content.indexOf('const saveCallback');
    const testCallbackStart = content.indexOf('const testCallback');
    const saveCallbackSection = content.substring(saveCallbackStart, testCallbackStart);
    assert.ok(saveCallbackSection.includes("apiKeyInput.value = ''"));
    assert.ok(saveCallbackSection.includes("connectionState.apiKey = ''"));
  });

  await it('should populate model selector on successful connection', () => {
    assert.ok(
      content.includes('modelSelect'),
      'Should reference modelSelect element',
    );
    assert.ok(
      content.includes('data.models'),
      'Should use data.models from response',
    );
  });

  await it('should disable model selector on connection failure', () => {
    assert.ok(
      content.includes('modelSelect.disabled = true'),
      'Should disable model selector on failure',
    );
  });

  await it('should enable model selector on successful connection with models', () => {
    assert.ok(
      content.includes('modelSelect.disabled = false'),
      'Should enable model selector on success',
    );
  });

  await it('should show connection status message', () => {
    assert.ok(
      content.includes('settings-test-status'),
      'Should have a test status element',
    );
  });

  await it('should handle connection error gracefully', () => {
    assert.ok(
      content.includes('catch'),
      'Should handle errors with try/catch',
    );
  });

  function extractSection(startMarker: string, endMarker: string): string {
    const start = content.indexOf(startMarker);
    assert.ok(start !== -1, `Marker should exist: ${startMarker}`);
    const end = content.indexOf(endMarker, start);
    assert.ok(end > start, `Marker should exist after previous marker: ${endMarker}`);
    return content.substring(start, end);
  }

  await describe('saved connections', async () => {
    await it('should have a saved connections selector', () => {
      assert.ok(
        content.includes('settings-saved-connections'),
        'Should have a saved connections selector with id settings-saved-connections',
      );
    });

    await it('should offer a New connection option', () => {
      assert.ok(
        content.includes("'New connection'"),
        'Should provide a New connection option',
      );
      assert.ok(
        content.includes('NEW_CONNECTION_VALUE'),
        'Should use a named constant for the new connection option value',
      );
    });

    await it('should load saved connections from GET /api/model-connections', () => {
      const loadSection = extractSection(
        'const loadSavedConnections',
        "savedSelect.addEventListener('change'",
      );
      assert.ok(
        loadSection.includes("fetch('/api/model-connections')"),
        'Should fetch saved connections from GET /api/model-connections',
      );
    });

    await it('should not call /v1/models when loading saved connections', () => {
      const loadSection = extractSection(
        'const loadSavedConnections',
        "savedSelect.addEventListener('change'",
      );
      assert.ok(
        !loadSection.includes('/v1/models'),
        'Loading saved connections should not call the live model list endpoint',
      );
    });

    await it('should display connection name and base URL in the selector', () => {
      assert.ok(
        content.includes('connection.data.name'),
        'Should use the connection name in the selector label',
      );
      assert.ok(
        content.includes('connection.data.baseUrl'),
        'Should show the base URL as secondary information in the selector label',
      );
    });

    await it('should show a loading state while saved connections load', () => {
      assert.ok(
        content.includes('Loading saved connections'),
        'Should show a loading state for saved connections',
      );
    });

    await it('should show an error when loading saved connections fails', () => {
      assert.ok(
        content.includes("'Failed to load saved connections'"),
        'Should show a failure state when saved connections cannot be loaded',
      );
      assert.ok(
        content.includes('settings-saved-status-error'),
        'Should mark the saved connections status as an error',
      );
    });

    await it('should listen for changes on the saved connections selector', () => {
      assert.ok(
        content.includes("savedSelect.addEventListener('change'"),
        'Should react to saved connections selector changes',
      );
    });

    await it('should populate the form when a saved connection is selected', () => {
      const populateSection = extractSection(
        'const populateFormFromConnection',
        'const loadSavedConnections',
      );
      assert.ok(
        populateSection.includes('nameInput.value = data.name'),
        'Should restore the connection name',
      );
      assert.ok(
        populateSection.includes('baseUrlInput.value = data.baseUrl'),
        'Should restore the base URL',
      );
      assert.ok(
        populateSection.includes('timeoutInput.value = String(data.timeoutMinutes)'),
        'Should restore timeoutMinutes',
      );
      assert.ok(
        populateSection.includes('enabledCheckbox.checked = data.enabled'),
        'Should restore the enabled flag',
      );
    });

    await it('should restore the persisted modelId without a live model fetch', () => {
      const populateSection = extractSection(
        'const populateFormFromConnection',
        'const loadSavedConnections',
      );
      assert.ok(
        populateSection.includes('option.value = data.modelId'),
        'Should set the persisted modelId as the selected model option',
      );
      assert.ok(
        !populateSection.includes('/v1/models'),
        'Should not call the live model list endpoint when populating the form',
      );
    });

    await it('should keep the API key empty when a saved connection is selected', () => {
      const populateSection = extractSection(
        'const populateFormFromConnection',
        'const loadSavedConnections',
      );
      assert.ok(
        populateSection.includes("apiKeyInput.value = ''"),
        'API key field must be cleared when populating from a saved connection',
      );
      assert.ok(
        !populateSection.includes('data.apiKey'),
        'Should not read an apiKey value from persisted connection data',
      );
      assert.ok(
        populateSection.includes("connectionState.apiKey = ''"),
        'Should clear retained API key state when selecting a saved connection',
      );
    });

    await it('should reset the form to defaults for a new connection', () => {
      const resetSection = extractSection(
        'const resetFormToNewConnection',
        'const populateFormFromConnection',
      );
      assert.ok(
        resetSection.includes("nameInput.value = ''"),
        'Should clear the connection name for a new connection',
      );
      assert.ok(
        resetSection.includes("baseUrlInput.value = ''"),
        'Should clear the base URL for a new connection',
      );
      assert.ok(
        resetSection.includes("apiKeyInput.value = ''"),
        'Should keep the API key empty for a new connection',
      );
      assert.ok(
        resetSection.includes('timeoutInput.value = String(DEFAULT_TIMEOUT_MINUTES)'),
        'Should reset timeoutMinutes to the 30 minute default',
      );
      assert.ok(
        resetSection.includes('enabledCheckbox.checked = true'),
        'Should reset enabled to true',
      );
      assert.ok(
        resetSection.includes('modelSelect.disabled = true'),
        'Should return the model selector to its unloaded state',
      );
    });

    await it('should PUT to /api/model-connections/:id when a saved connection is selected', () => {
      const saveSection = extractSection(
        'const saveCallback',
        'const testCallback',
      );
      assert.ok(
        saveSection.includes("method: isUpdate ? 'PUT' : 'POST'"),
        'Save must use PUT for a selected saved connection',
      );
      assert.ok(
        saveSection.includes('/api/model-connections/${selectedId}'),
        'Save must target the selected connection id',
      );
    });

    await it('should still POST to /api/model-connections for a new connection', () => {
      const saveSection = extractSection(
        'const saveCallback',
        'const testCallback',
      );
      assert.ok(
        saveSection.includes("method: isUpdate ? 'PUT' : 'POST'"),
        'Save must fall back to POST when the New connection option is active',
      );
      assert.ok(
        saveSection.includes("'/api/model-connections'"),
        'Save must target the collection endpoint for a new connection',
      );
    });

    await it('should add and select the connection returned by a successful POST', () => {
      const saveSection = extractSection(
        'const saveCallback',
        'const testCallback',
      );
      assert.ok(
        saveSection.includes('savedConnections.push(createdConnection)'),
        'Should add the created connection to saved state',
      );
      assert.ok(
        saveSection.includes('savedSelect.appendChild(savedOption)'),
        'Should add an option for the created connection',
      );
      assert.ok(
        saveSection.includes('savedSelect.value = String(createdConnection.id)'),
        'Should select the created connection id',
      );
    });

    await it('should use the selected created id for a subsequent PUT', () => {
      const saveSection = extractSection(
        'const saveCallback',
        'const testCallback',
      );
      assert.ok(
        saveSection.includes('savedSelect.value = String(createdConnection.id)'),
        'Should switch local selection to the created id',
      );
      assert.ok(
        saveSection.includes("method: isUpdate ? 'PUT' : 'POST'"),
        'The next save should use PUT when the created id is selected',
      );
    });

    await it('should not reload saved connections after a successful POST', () => {
      const saveSection = extractSection(
        'const saveCallback',
        'const testCallback',
      );
      assert.ok(
        !saveSection.includes("fetch('/api/model-connections')"),
        'Should use the POST response without an additional list GET',
      );
    });

    await it('should reject a malformed successful POST response', () => {
      const saveSection = extractSection(
        'const saveCallback',
        'const testCallback',
      );
      const validationIndex = saveSection.indexOf('!isSavedConnection(payload)');
      const addIndex = saveSection.indexOf('savedConnections.push(createdConnection)');
      const errorIndex = saveSection.indexOf('showSaveError();', validationIndex);
      assert.ok(validationIndex !== -1, 'Should validate the POST response');
      assert.ok(
        validationIndex < addIndex,
        'Should validate the POST response before adding it to saved state',
      );
      assert.ok(
        errorIndex > validationIndex && errorIndex < addIndex,
        'Should show the existing save error for malformed data',
      );
    });

    await it('should update the visible saved connection entry after a successful update', () => {
      const saveSection = extractSection(
        'const saveCallback',
        'const testCallback',
      );
      assert.ok(
        saveSection.includes('savedEntry.data.name = name'),
        'Should update the saved connection data after a successful save',
      );
      assert.ok(
        saveSection.includes('savedOption.textContent = `${name} - ${baseUrl}`'),
        'Should update the visible saved connection label after a successful save',
      );
    });

    await it('should show a success state after updating a saved connection', () => {
      const saveSection = extractSection(
        'const saveCallback',
        'const testCallback',
      );
      assert.ok(
        saveSection.includes("'Connection updated successfully'"),
        'Should show a success message after a successful update',
      );
    });

    await it('should use the selected connection id for DELETE', () => {
      const deleteSection = extractSection(
        'const deleteConnection',
        'const requestDeleteConnection',
      );
      assert.ok(
        deleteSection.includes('fetch(`/api/model-connections/${selectedId}`'),
        'Delete must target the selected connection id',
      );
      assert.ok(
        deleteSection.includes("method: 'DELETE'"),
        'Delete must use the DELETE method',
      );
      assert.ok(
        !deleteSection.includes('body:'),
        'Delete must not send a request body',
      );
    });

    await it('should keep Delete unavailable for New connection', () => {
      assert.ok(
        content.includes("deleteButton.id = 'settings-delete-button'") &&
          content.includes('deleteButton.disabled = true'),
        'Delete should start disabled for New connection',
      );
      const changeSection = content.substring(
        content.indexOf("savedSelect.addEventListener('change'"),
      );
      assert.ok(
        changeSection.includes('savedSelect.value === NEW_CONNECTION_VALUE') &&
          changeSection.includes('deleteButton.disabled = true'),
        'Selecting New connection should disable Delete',
      );
    });

    await it('should remove a successfully deleted connection from the UI list', () => {
      const deleteSection = extractSection(
        'const deleteConnection',
        'const requestDeleteConnection',
      );
      assert.ok(
        deleteSection.includes('savedConnections = savedConnections.filter'),
        'Should remove the deleted connection from saved state',
      );
      assert.ok(
        deleteSection.includes('deletedOption?.remove()'),
        'Should remove the deleted connection option',
      );
    });

    await it('should reset to New connection after successful deletion', () => {
      const deleteSection = extractSection(
        'const deleteConnection',
        'const requestDeleteConnection',
      );
      assert.ok(
        deleteSection.includes('savedSelect.value = NEW_CONNECTION_VALUE'),
        'Should select New connection after deletion',
      );
      assert.ok(
        deleteSection.includes('resetFormToNewConnection()'),
        'Should reset all form fields after deletion',
      );
      assert.ok(
        deleteSection.includes("'Connection deleted successfully'"),
        'Should show a deletion success state',
      );
    });

    await it('should use the shared confirmation modal instead of window.confirm', () => {
      assert.ok(
        content.includes("import { createConfirmationModal } from '../ConfirmationModal.js'"),
        'Settings should import the shared ConfirmationModal',
      );
      assert.ok(
        !content.includes('window.confirm'),
        'Settings should not use native confirmation',
      );
    });

    await it('should open a destructive delete modal with the selected connection name', () => {
      const requestSection = extractSection(
        'const requestDeleteConnection',
        'const form = createSettingsForm',
      );
      assert.ok(requestSection.includes('createConfirmationModal({'));
      assert.ok(requestSection.includes("title: 'Delete connection?'"));
      assert.ok(
        requestSection.includes('`"${connection.data.name}" will be permanently deleted.`'),
        'Modal message should include the selected saved connection name',
      );
      assert.ok(requestSection.includes("confirmLabel: 'Delete'"));
      assert.ok(requestSection.includes("cancelLabel: 'Cancel'"));
      assert.ok(requestSection.includes('destructive: true'));
      assert.ok(requestSection.includes('returnFocusTo: deleteButton'));
      assert.ok(requestSection.includes('container.appendChild(modal)'));
    });

    await it('should not send DELETE until the shared modal confirms', () => {
      const requestSection = extractSection(
        'const requestDeleteConnection',
        'const form = createSettingsForm',
      );
      assert.ok(
        requestSection.includes('onConfirm: () => deleteConnection(selectedId, deleteButton)'),
        'Confirmation should invoke the existing delete behavior',
      );
      assert.ok(
        requestSection.includes('onCancel: () => undefined'),
        'Cancellation should not invoke deletion',
      );
      assert.ok(
        !requestSection.includes('fetch('),
        'Opening, cancelling, escaping, or backdrop-closing the modal must not send DELETE',
      );
    });

    await it('should not duplicate confirmation modal markup or styles in Settings', () => {
      assert.ok(
        !content.includes("className = 'confirmation-modal"),
        'Settings should not create shared modal DOM',
      );
      assert.ok(
        !content.includes('confirmation-modal-backdrop'),
        'Settings should not duplicate shared modal styling hooks',
      );
    });
  });
});
