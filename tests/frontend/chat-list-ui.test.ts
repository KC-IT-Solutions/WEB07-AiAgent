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
const chatCssPath = resolve(projectRoot, 'src/client/components/chat/chat.css');
const confirmationModalPath = resolve(projectRoot, 'src/client/components/ConfirmationModal.ts');
const layout = readFileSync(layoutPath, 'utf-8');
const chatView = readFileSync(chatViewPath, 'utf-8');
const chatCss = readFileSync(chatCssPath, 'utf-8');
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
    assert.ok(layout.includes('chatTitle.textContent = chat.data.title'));
    assert.ok(layout.includes("chatListStatus.textContent = 'No saved chats yet.'"));
  });

  await it('provides an accessible Chat section toggle that starts collapsed', () => {
    const panelSection = extractSection(
      "const chatListPanel = document.createElement('li')",
      "const settingsNavItem = document.createElement('li')",
    );

    assert.ok(layout.includes("chatSectionToggle.type = 'button'"));
    assert.ok(
      layout.includes("chatSectionToggle.setAttribute('aria-label', 'Toggle saved chats')"),
    );
    assert.ok(layout.includes("chatSectionToggle.setAttribute('aria-expanded', 'false')"));
    assert.ok(panelSection.includes('chatListPanel.hidden = true'));
    assert.ok(layout.includes('let isChatSectionExpanded = false'));
    assert.ok(panelSection.includes('chatListPanel.appendChild(newChatButton)'));
    assert.ok(panelSection.includes('chatListPanel.appendChild(chatList)'));
    assert.ok(layout.includes("settingsNavLink.textContent = 'Settings'"));
    assert.ok(layout.includes("chatSectionTogglePath.setAttribute('d', 'M6 9l6 6 6-6')"));
    assert.ok(layout.includes("chatSectionTogglePath.setAttribute('stroke-linecap', 'round')"));
    assert.ok(layout.includes("chatSectionTogglePath.setAttribute('stroke-linejoin', 'round')"));
  });

  await it('expands on the first toggle and collapses on the second without changing active chat', () => {
    const toggleSection = extractSection(
      "chatSectionToggle.addEventListener('click'",
      "chatNavLink.addEventListener('click'",
    );

    assert.ok(layout.includes('let isChatSectionExpanded = false'));
    assert.ok(toggleSection.includes('isChatSectionExpanded = !isChatSectionExpanded'));
    assert.ok(
      toggleSection.includes(
        "chatSectionToggle.setAttribute('aria-expanded', String(isChatSectionExpanded))",
      ),
    );
    assert.ok(toggleSection.includes('chatListPanel.hidden = !isChatSectionExpanded'));
    assert.ok(!toggleSection.includes('activeChatId ='));
    assert.ok(!toggleSection.includes('chats ='));
    assert.ok(!toggleSection.includes('location.reload'));
    assert.ok(chatCss.includes(".chat-section-toggle[aria-expanded='false'] svg"));
    assert.ok(chatCss.includes('transform: rotate(-90deg)'));
    assert.ok(chatCss.includes('.chat-list-panel[hidden]'));
  });

  await it('adds the supplied decorative chat icon before each saved chat title', () => {
    const renderSection = extractSection('function renderChatList', 'async function loadChats');
    const iconSection = renderSection.substring(
      renderSection.indexOf("const chatIcon = document.createElementNS(SVG_NAMESPACE, 'svg')"),
      renderSection.indexOf("button.type = 'button'"),
    );

    assert.ok(iconSection.includes("chatIcon.classList.add('chat-list-icon')"));
    assert.ok(
      iconSection.includes("'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'"),
    );
    assert.ok(iconSection.includes("chatIcon.setAttribute('aria-hidden', 'true')"));
    assert.ok(iconSection.includes("chatIcon.setAttribute('focusable', 'false')"));
    assert.ok(!iconSection.includes('addEventListener'));
    assert.ok(
      renderSection.indexOf('button.appendChild(chatIcon)') <
        renderSection.indexOf('button.appendChild(chatTitle)'),
    );
    assert.ok(chatCss.includes('.chat-list-title {'));
    assert.ok(chatCss.includes('text-overflow: ellipsis'));
  });

  await it(
    'adds a decorative plus SVG before the upper New chat label without changing its action',
    () => {
      const buttonSection = extractSection(
        "const newChatButton = document.createElement('button')",
        "const chatListStatus = document.createElement('p')",
      );
      const clickSection = extractSection(
        "newChatButton.addEventListener('click'",
        "chatSectionToggle.addEventListener('click'",
      );

      assert.ok(
        buttonSection.includes(
          "newChatIcon = document.createElementNS(SVG_NAMESPACE, 'svg')",
        ),
      );
      assert.equal(
        buttonSection.match(/document\.createElementNS\(SVG_NAMESPACE, 'line'\)/g)?.length,
        2,
      );
      assert.ok(buttonSection.includes('newChatIcon.appendChild(newChatHorizontalLine)'));
      assert.ok(buttonSection.includes('newChatIcon.appendChild(newChatVerticalLine)'));
assert.ok(buttonSection.includes("newChatIcon.setAttribute('aria-hidden', 'true')"));
    assert.ok(buttonSection.includes("newChatLabel.textContent = 'New chat'"));
    assert.ok(buttonSection.includes("newChatButton.setAttribute('title', 'Create a new chat')"));
      assert.ok(
        buttonSection.indexOf('newChatButton.appendChild(newChatIcon)') <
          buttonSection.indexOf('newChatButton.appendChild(newChatLabel)'),
      );
      assert.ok(clickSection.includes('void createNewChat()'));
      assert.ok(chatCss.includes('.chat-new-button svg {'));
      assert.ok(chatCss.includes('stroke: currentColor'));
    },
  );

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
    assert.ok(!inputSection.includes('modelConnectionId'));
    assert.ok(!inputSection.includes('modelId'));
    assert.ok(layout.includes('body: JSON.stringify(NEW_CHAT_INPUT)'));
    assert.ok(!layout.includes('userId'));
  });

  await it('adds the created chat and makes it active', () => {
    const createSection = extractSection('async function createNewChat', 'renderCurrentView();');
    assert.ok(createSection.includes('chats = [createdChat, ...chats]'));
    assert.ok(createSection.includes('activeChatId = createdChat.id'));
    assert.ok(createSection.includes("currentView = 'chat'"));
    assert.ok(createSection.includes('setActiveNavItem(currentView, navItems)'));
    assert.ok(layout.includes("activeChat?.data.title ?? 'Chat Interface'"));
    assert.ok(!chatView.includes("headerCard.className = 'chat-card'"));
  });

  await it('selects saved chats without a redundant GET-by-id request', () => {
    const renderSection = extractSection('function renderChatList', 'async function loadChats');
    assert.ok(renderSection.includes('activeChatId = chat.id'));
    assert.ok(renderSection.includes("currentView = 'chat'"));
    assert.ok(renderSection.includes('setActiveNavItem(currentView, navItems)'));
    assert.ok(!renderSection.includes('/api/chats'));
  });

  await it('starts with no active navigation item until an explicit click', () => {
    const initialChatLinkSection = extractSection(
      "const chatNavLink = document.createElement('a')",
      "const chatSectionToggle = document.createElement('button')",
    );
    assert.ok(initialChatLinkSection.includes("chatNavLink.className = 'chat-sidebar-item'"));
    assert.ok(!initialChatLinkSection.includes('chat-sidebar-item-active'));
    assert.ok(layout.includes('let currentView: ViewName | null = null'));
    assert.ok(!layout.includes("chatNavLink.className = 'chat-sidebar-item chat-sidebar-item-active'"));
  });

  await it('keeps the initial main area empty without mounting Chat or Settings', () => {
    const renderSection = extractSection('function renderCurrentView', 'async function renameChat');
    const nullViewSection = renderSection.substring(
      renderSection.indexOf('if (currentView === null)'),
      renderSection.indexOf('const activeChat = getActiveChat()'),
    );

    assert.ok(layout.includes("headerTitle.textContent = ''"));
    assert.ok(layout.includes('header.hidden = true'));
    assert.ok(nullViewSection.includes('main.replaceChildren()'));
    assert.ok(nullViewSection.includes('return'));
    assert.ok(!nullViewSection.includes('createChatView'));
    assert.ok(!nullViewSection.includes('createSettingsView'));
    assert.ok(!nullViewSection.includes('Chat Interface'));
    assert.ok(!nullViewSection.includes('chat-message-input'));
  });

  await it('activates Chat and Settings only when clicked and switches active state normally', () => {
    const switchSection = extractSection('function switchView', "newChatButton.addEventListener('click'");
    const chatClickSection = extractSection(
      "chatNavLink.addEventListener('click'",
      "settingsNavLink.addEventListener('click'",
    );
    const settingsClickSection = extractSection(
      "settingsNavLink.addEventListener('click'",
      "document.addEventListener('keydown'",
    );

    assert.ok(chatClickSection.includes("switchView('chat')"));
    assert.ok(settingsClickSection.includes("switchView('settings')"));
    assert.ok(switchSection.includes('setActiveNavItem(viewName, navItems)'));
    assert.ok(layout.includes("item.classList.add('chat-sidebar-item-active')"));
    assert.ok(layout.includes("item.classList.remove('chat-sidebar-item-active')"));
    assert.ok(layout.includes("currentView === 'chat'"));
    assert.ok(layout.includes('createChatView('));
    assert.ok(layout.includes('createSettingsView()'));
  });

  await it('loads selected chat history and clears the previous visible chat view immediately', () => {
    const renderViewSection = extractSection('function renderCurrentView', 'async function renameChat');
    const selectSection = extractSection('function renderChatList', 'async function loadChats');
    assert.ok(chatView.includes('`/api/chats/${activeChat.id}/messages`'));
    assert.ok(selectSection.includes('activeChatId = chat.id'));
    assert.ok(selectSection.includes('renderCurrentView()'));
    assert.ok(renderViewSection.includes('main.replaceChildren('));
    assert.ok(chatView.includes("historyStatus.textContent = 'Loading chat history...'"));
  });

  await it('keeps history and inference race checks scoped to the active chat', () => {
    assert.ok(layout.includes("(chatId) => currentView === 'chat' && activeChatId === chatId"));
    assert.ok(chatView.includes('if (isActiveChat && !isActiveChat(activeChat.id))'));
    assert.ok(chatView.includes('messageArea.replaceChildren('));
    assert.ok(chatView.includes('scrollAnchor.before(userMessage)'));
    assert.ok(chatView.includes('waitingMessage.before(element)'));
    assert.ok(chatView.includes('JSON.stringify({ message: text })'));
    assert.ok(!chatView.includes('JSON.stringify({ messages:'));
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
    assert.ok(
      layout.indexOf('bottomNavList.appendChild(settingsNavItem)') >
        layout.indexOf('upperNavList.appendChild(chatListPanel)'),
    );
  });

  await it('keeps active navigation on the whole row without a boxed SVG area', () => {
    const toggleStyles = chatCss.substring(
      chatCss.indexOf('.chat-section-toggle {'),
      chatCss.indexOf('.chat-section-toggle:hover {'),
    );

    assert.ok(layout.includes("chatNavLink.className = 'chat-sidebar-item'"));
    assert.ok(layout.includes("item.classList.add('chat-sidebar-item-active')"));
    assert.ok(layout.includes("settingsNavLink.className = 'chat-sidebar-item'"));
    assert.ok(chatCss.includes('.chat-sidebar-item-active {'));
    assert.ok(chatCss.includes('.chat-section-heading:has(.chat-sidebar-item-active)'));
    assert.ok(toggleStyles.includes('border: 0'));
    assert.ok(toggleStyles.includes('background: transparent'));
    assert.ok(
      /\.chat-section-toggle:hover\s*\{\s*background-color:\s*transparent/.test(chatCss),
    );
    assert.ok(chatCss.includes('.chat-sidebar-item:focus-visible {'));
    assert.ok(chatCss.includes('.chat-section-toggle:focus-visible {'));
  });

  await it('loads saved model connections and only keeps enabled choices', () => {
    assert.ok(chatView.includes("fetch('/api/model-connections')"));
    assert.ok(chatView.includes('.filter((item) => item.data.enabled)'));
    assert.ok(!chatView.includes("connectionLabel.textContent = 'Model connection'"));
    assert.ok(!chatView.includes("modelLabel.textContent = 'Model'"));
    assert.ok(chatView.includes("connectionSelect.setAttribute('aria-label', 'Model connection')"));
    assert.ok(chatView.includes("modelSelect.setAttribute('aria-label', 'Model')"));
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
    assert.ok(chatView.includes('for (const model of models)'));
    assert.ok(chatView.includes('parseEffectiveModels'));
    assert.ok(chatView.includes("createSelectOption('', 'Loading models...')"));
    assert.ok(chatView.includes("createSelectOption('', 'Models unavailable')"));
    assert.ok(!chatView.includes('/v1/models'));
    assert.ok(!layout.includes('/v1/models'));
  });

  await it('clears the old model when changing connection and waits for an explicit model choice', () => {
    assert.ok(chatView.includes('persistSelection(connection.id, null)'));
    assert.ok(chatView.includes("createSelectPlaceholder('Select model')"));
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
    assert.ok(chatView.includes("createSelectPlaceholder('Select connection')"));
    assert.ok(chatView.includes("createSelectPlaceholder('Select model')"));
    assert.ok(chatView.includes("'Select a saved chat to choose a model.'"));
  });

  await it('uses the active chat id for inference and ignores late responses after switching chats', () => {
    assert.ok(chatView.includes('sendToApi(activeChat.id, text,'));
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
