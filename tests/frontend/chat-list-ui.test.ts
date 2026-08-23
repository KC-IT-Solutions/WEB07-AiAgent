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

const projectRoot = findProjectRoot(__dirname);
assert.ok(projectRoot, 'Project root should be found');

const layoutPath = resolve(projectRoot, 'src/client/components/layout.ts');
const chatViewPath = resolve(projectRoot, 'src/client/components/chat/ChatView.ts');
const confirmationModalPath = resolve(projectRoot, 'src/client/components/ConfirmationModal.ts');
const layout = readFileSync(layoutPath, 'utf-8');
const chatView = readFileSync(chatViewPath, 'utf-8');
const confirmationModal = readFileSync(confirmationModalPath, 'utf-8');

function extractSection(startMarker: string, endMarker: string): string {
  const start = layout.indexOf(startMarker);
  assert.notStrictEqual(start, -1, `Marker should exist: ${startMarker}`);
  const end = layout.indexOf(endMarker, start);
  assert.ok(end > start, `Marker should exist after previous marker: ${endMarker}`);
  return layout.substring(start, end);
}

await describe('chat list UI', async () => {
  await it('loads saved chats with GET /api/chats and validates the response', () => {
    const loadSection = extractSection('async function loadChats', 'async function createNewChat');
    assert.ok(loadSection.includes("fetch('/api/chats')"));
    assert.ok(loadSection.includes('parseChatList(await response.json())'));
    assert.ok(layout.includes("chatListStatus.textContent = 'Loading chats...'"));
  });

  await it('shows saved chat titles and an empty list state', () => {
    assert.ok(layout.includes('button.textContent = chat.data.title'));
    assert.ok(layout.includes("chatListStatus.textContent = 'No saved chats yet.'"));
  });

  await it('shows a chat list load failure state', () => {
    const loadSection = extractSection('async function loadChats', 'async function createNewChat');
    assert.ok(loadSection.includes("chatListStatus.textContent = 'Failed to load chats.'"));
    assert.ok(loadSection.includes("setAttribute('role', 'alert')"));
  });

  await it('creates a new chat with the required POST payload and no user id', () => {
    const createSection = extractSection('async function createNewChat', 'renderCurrentView();');
    const inputSection = extractSection('const NEW_CHAT_INPUT', 'function isRecord');
    assert.ok(createSection.includes("fetch('/api/chats',"));
    assert.ok(createSection.includes("method: 'POST'"));
    assert.ok(inputSection.includes("title: 'New chat'"));
    assert.ok(inputSection.includes('modelConnectionId: null'));
    assert.ok(inputSection.includes('modelId: null'));
    assert.ok(layout.includes('body: JSON.stringify(NEW_CHAT_INPUT)'));
    assert.ok(!layout.includes('userId'));
  });

  await it('adds the created chat and makes it active', () => {
    const createSection = extractSection('async function createNewChat', 'renderCurrentView();');
    assert.ok(createSection.includes('chats = [createdChat, ...chats]'));
    assert.ok(createSection.includes('activeChatId = createdChat.id'));
    assert.ok(layout.includes("activeChat?.data.title ?? 'Chat Interface'"));
    assert.ok(!chatView.includes("headerCard.className = 'chat-card'"));
  });

  await it('selects saved chats without a redundant GET-by-id request', () => {
    const renderSection = extractSection('function renderChatList', 'async function loadChats');
    assert.ok(renderSection.includes('activeChatId = chat.id'));
    assert.ok(!renderSection.includes('/api/chats'));
  });

  await it('visually identifies the active saved chat', () => {
    assert.ok(layout.includes("'chat-list-button chat-list-button-active'"));
    assert.ok(layout.includes("button.setAttribute('aria-pressed', String(isActive))"));
  });

  await it('keeps New chat single-flight and Settings navigation available', () => {
    const createSection = extractSection('async function createNewChat', 'renderCurrentView();');
    assert.ok(createSection.includes('if (createInProgress)'));
    assert.ok(createSection.includes('newChatButton.disabled = true'));
    assert.ok(layout.includes("settingsNavLink.textContent = 'Settings'"));
  });

  await it('loads saved model connections and only keeps enabled choices', () => {
    assert.ok(chatView.includes("fetch('/api/model-connections')"));
    assert.ok(chatView.includes('.filter((item) => item.data.enabled)'));
    assert.ok(chatView.includes("connectionLabel.textContent = 'Model connection'"));
    assert.ok(chatView.includes("modelLabel.textContent = 'Model'"));
  });

  await it('restores the active chat model connection and model', () => {
    assert.ok(chatView.includes('connection.id === activeChat.data.modelConnectionId'));
    assert.ok(chatView.includes('await loadModels(selectedConnection, activeChat.data.modelId)'));
    assert.ok(chatView.includes('modelIds.includes(selectedModelId)'));
    assert.ok(chatView.includes("'Selected connection unavailable'"));
    assert.ok(chatView.includes("'No models available'"));
  });

  await it('discovers all models through the backend and never calls the model server directly', () => {
    assert.ok(chatView.includes('`/api/model-connections/${connection.id}/models`'));
    assert.ok(chatView.includes('for (const modelId of modelIds)'));
    assert.ok(chatView.includes("createSelectOption('', 'Loading models...')"));
    assert.ok(chatView.includes("createSelectOption('', 'Models unavailable')"));
    assert.ok(!chatView.includes('/v1/models'));
    assert.ok(!layout.includes('/v1/models'));
  });

  await it('clears the old model when changing connection and waits for an explicit model choice', () => {
    assert.ok(chatView.includes('persistSelection(connection.id, null)'));
    assert.ok(chatView.includes("createSelectOption('', 'Select model')"));
    assert.ok(chatView.includes('const modelId = modelSelect.value || null'));
    assert.ok(!chatView.includes('connection?.data.modelId ?? null'));
  });

  await it('persists model selection to the same active chat without userId', () => {
    const updateSection = extractSection(
      'async function updateActiveChatModelSelection',
      'function renderCurrentView',
    );
    assert.ok(updateSection.includes('if (!activeChat)'));
    assert.ok(updateSection.includes("method: 'PUT'"));
    assert.ok(updateSection.includes('`/api/chats/${activeChat.id}`'));
    assert.ok(updateSection.includes('JSON.stringify({ modelConnectionId, modelId })'));
    assert.ok(updateSection.includes('chats = chats.map'));
    assert.ok(!updateSection.includes('userId'));
    assert.ok(!updateSection.includes('location.reload'));
    assert.ok(!updateSection.includes("method: 'POST'"));
  });

  await it('does not update when there is no active persisted chat', () => {
    assert.ok(chatView.includes('if (!activeChat || !updateModelSelection)'));
    assert.ok(chatView.includes("'No active chat'"));
    assert.ok(chatView.includes("'Select a saved chat to choose a model.'"));
  });

  await it('uses the active chat id for inference and ignores late responses after switching chats', () => {
    assert.ok(chatView.includes('sendToApi(activeChat.id, text)'));
    assert.ok(layout.includes("(chatId) => currentView === 'chat' && activeChatId === chatId"));
    assert.ok(chatView.includes('if (isActiveChat && !isActiveChat(activeChat.id))'));
  });

  await it('renders a real actions trigger for every saved chat without selecting it', () => {
    const renderSection = extractSection('function renderChatList', 'async function loadChats');
    const triggerSection = renderSection.substring(
      renderSection.indexOf("actionsButton.type = 'button'"),
      renderSection.indexOf('actions.appendChild(actionsButton)'),
    );

    assert.ok(renderSection.includes("actionsButton.textContent = '...'"));
    assert.ok(renderSection.includes("actionsButton.setAttribute('aria-label', 'Chat actions')"));
    assert.ok(renderSection.includes("actionsButton.setAttribute('aria-haspopup', 'menu')"));
    assert.ok(!triggerSection.includes('activeChatId = chat.id'));
  });

  await it('keeps only one contextual actions menu open at a time', () => {
    const renderSection = extractSection('function renderChatList', 'async function loadChats');
    assert.ok(layout.includes('let openChatActionsId: number | null = null'));
    assert.ok(renderSection.includes('openChatActionsId === chat.id ? null : chat.id'));
    assert.ok(renderSection.includes('if (openChatActionsId === chat.id)'));
    assert.ok(renderSection.includes("menu.setAttribute('role', 'menu')"));
    assert.ok(renderSection.includes("renameButton.textContent = 'Rename'"));
    assert.ok(renderSection.includes("deleteButton.textContent = 'Delete'"));
  });

  await it('closes the actions menu with Escape and outside clicks', () => {
    assert.ok(layout.includes("document.addEventListener('keydown'"));
    assert.ok(layout.includes("event.key !== 'Escape'"));
    assert.ok(layout.includes('openChatActionsId = null'));
    assert.ok(layout.includes("document.addEventListener('click'"));
    assert.ok(layout.includes("target.closest('.chat-actions')"));
  });

  await it('renames without using a native prompt', () => {
    assert.ok(!layout.includes('window.prompt'));
  });

  await it('enters inline rename mode with the current title prefilled', () => {
    const renderSection = extractSection('function renderChatList', 'async function loadChats');
    assert.ok(layout.includes('let renamingChatId: number | null = null'));
    assert.ok(layout.includes('renamingChatId = chat.id'));
    assert.ok(renderSection.includes('const isRenaming = renamingChatId === chat.id'));
    assert.ok(renderSection.includes("document.createElement('input')"));
    assert.ok(renderSection.includes('input.value = chat.data.title'));
    assert.ok(layout.includes('input?.focus()'));
  });

  await it('saves a trimmed title-only rename through PUT on blur', () => {
    const renameSection = extractSection('async function renameChat', 'async function deleteChat');
    const renderSection = extractSection('function renderChatList', 'async function loadChats');
    assert.ok(renameSection.includes('`/api/chats/${chat.id}`'));
    assert.ok(renameSection.includes("method: 'PUT'"));
    assert.ok(renameSection.includes('JSON.stringify({ title: renamedTitle })'));
    assert.ok(!renameSection.includes('modelConnectionId'));
    assert.ok(!renameSection.includes('modelId'));
    assert.ok(renderSection.includes('const renamedTitle = input.value.trim()'));
    assert.ok(renderSection.includes("input.addEventListener('blur', saveRename)"));
  });

  await it('saves on Enter and prevents Enter plus blur from sending duplicate PUT requests', () => {
    const renderSection = extractSection('function renderChatList', 'async function loadChats');
    assert.ok(renderSection.includes("event.key === 'Enter'"));
    assert.ok(renderSection.includes('saveRename()'));
    assert.ok(renderSection.includes('if (saveStarted || renameSaveInProgressId === chat.id)'));
    assert.ok(renderSection.includes('saveStarted = true'));
    assert.ok(renderSection.includes('renameSaveInProgressId = chat.id'));
  });

  await it('cancels inline rename with Escape without issuing PUT', () => {
    const renderSection = extractSection('function renderChatList', 'async function loadChats');
    const keydownSection = renderSection.substring(
      renderSection.indexOf("input.addEventListener('keydown'"),
      renderSection.indexOf('item.appendChild(input)'),
    );
    assert.ok(keydownSection.includes("event.key === 'Escape'"));
    assert.ok(keydownSection.includes('cancelRenameChat(chat.id)'));
    assert.ok(!keydownSection.includes('renameChat(chat'));
    assert.ok(layout.includes('renamingChatId = null'));
    assert.ok(layout.includes('`[data-chat-actions-id="${chatId}"]`'));
  });

  await it('rejects empty and whitespace-only inline titles without PUT', () => {
    const renderSection = extractSection('function renderChatList', 'async function loadChats');
    const trimPosition = renderSection.indexOf('const renamedTitle = input.value.trim()');
    const invalidPosition = renderSection.indexOf('if (renamedTitle.length === 0)', trimPosition);
    const requestPosition = renderSection.indexOf(
      'void renameChat(chat, renamedTitle)',
      trimPosition,
    );
    assert.ok(trimPosition !== -1);
    assert.ok(invalidPosition > trimPosition);
    assert.ok(requestPosition > invalidPosition);
    assert.ok(
      renderSection
        .substring(invalidPosition, requestPosition)
        .includes('cancelRenameChat(chat.id)'),
    );
  });

  await it('updates the sidebar and active chat title after a successful rename', () => {
    const renameSection = extractSection('async function renameChat', 'async function deleteChat');
    assert.ok(renameSection.includes('chats = chats.map'));
    assert.ok(renameSection.includes('if (activeChatId === updatedChat.id)'));
    assert.ok(renameSection.includes('renderCurrentView()'));
    assert.ok(renameSection.includes('renderChatList()'));
    assert.ok(!renameSection.includes('location.reload'));
  });

  await it('closes the actions menu when rename begins', () => {
    const renameSection = extractSection('function beginRenameChat', 'function cancelRenameChat');
    assert.ok(renameSection.includes('openChatActionsId = null'));
    assert.ok(renameSection.includes('renamingChatId = chat.id'));
    assert.ok(renameSection.includes('renderChatList()'));
  });

  await it('keeps only one chat in rename mode', () => {
    const renderSection = extractSection('function renderChatList', 'async function loadChats');
    assert.ok(layout.includes('let renamingChatId: number | null = null'));
    assert.ok(renderSection.includes('const isRenaming = renamingChatId === chat.id'));
    assert.ok(!layout.includes('renamingChatIds'));
  });

  await it('opens the confirmation modal without using window.confirm', () => {
    const deleteSection = extractSection('async function deleteChat', 'function requestDeleteChat');
    const requestSection = extractSection('function requestDeleteChat', 'function renderChatList');
    assert.ok(!deleteSection.includes('window.confirm'));
    assert.ok(!requestSection.includes('window.confirm'));
    assert.ok(requestSection.includes('openChatActionsId = null'));
    assert.ok(requestSection.includes('createConfirmationModal({'));
    assert.ok(requestSection.includes("title: 'Delete chat?'"));
    assert.ok(
      requestSection.includes('message: `"${chat.data.title}" will be permanently deleted.`'),
    );
    assert.ok(requestSection.includes("confirmLabel: 'Delete'"));
    assert.ok(requestSection.includes("cancelLabel: 'Cancel'"));
    assert.ok(requestSection.includes('destructive: true'));
    assert.ok(requestSection.includes('container.appendChild(modal)'));
  });

  await it('only sends DELETE from the modal confirm callback', () => {
    const deleteSection = extractSection('async function deleteChat', 'function requestDeleteChat');
    const requestSection = extractSection('function requestDeleteChat', 'function renderChatList');
    assert.ok(requestSection.includes('onConfirm: () => deleteChat(chat)'));
    assert.ok(requestSection.includes('onCancel: () => undefined'));
    assert.ok(!requestSection.includes("method: 'DELETE'"));
    assert.ok(deleteSection.includes("method: 'DELETE'"));
  });

  await it('removes a successfully deleted chat without reloading', () => {
    const deleteSection = extractSection('async function deleteChat', 'function requestDeleteChat');
    assert.ok(deleteSection.includes('chats = chats.filter'));
    assert.ok(deleteSection.includes('openChatActionsId = null'));
    assert.ok(!deleteSection.includes('location.reload'));
  });

  await it('clears only a deleted active chat and preserves an inactive active chat', () => {
    const deleteSection = extractSection('async function deleteChat', 'function requestDeleteChat');
    assert.ok(deleteSection.includes('const wasActive = activeChatId === chat.id'));
    assert.ok(deleteSection.includes('if (wasActive)'));
    assert.ok(deleteSection.includes('activeChatId = null'));
    assert.ok(deleteSection.includes('renderCurrentView()'));
  });

  await it('uses the reusable modal component rather than chat-specific modal markup', () => {
    assert.ok(layout.includes("import { createConfirmationModal } from './ConfirmationModal.js'"));
    assert.ok(confirmationModal.includes('export interface ConfirmationModalOptions'));
    assert.ok(confirmationModal.includes('export function createConfirmationModal'));
    assert.ok(!confirmationModal.toLowerCase().includes('chat'));
  });
});
