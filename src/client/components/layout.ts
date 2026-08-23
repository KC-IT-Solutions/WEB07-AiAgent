import { createChatView } from './chat/ChatView.js';
import { createConfirmationModal } from './ConfirmationModal.js';
import { createSettingsView } from './settings/SettingsView.js';

type ViewName = 'chat' | 'settings';

interface ClientChatData {
  title: string;
  modelConnectionId: number | null;
  modelId: string | null;
}

interface ClientChat {
  id: number;
  createdAt: number;
  updatedAt: number;
  data: ClientChatData;
}

const NEW_CHAT_INPUT: ClientChatData = {
  title: 'New chat',
  modelConnectionId: null,
  modelId: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseChat(value: unknown): ClientChat | null {
  if (!isRecord(value) || !isRecord(value.data)) {
    return null;
  }

  const data = value.data;
  const validModelConnectionId =
    data.modelConnectionId === null ||
    (typeof data.modelConnectionId === 'number' &&
      Number.isInteger(data.modelConnectionId) &&
      data.modelConnectionId > 0);
  const validModelId =
    data.modelId === null ||
    (typeof data.modelId === 'string' && data.modelId.trim().length > 0);

  if (
    typeof value.id !== 'number' ||
    !Number.isInteger(value.id) ||
    value.id <= 0 ||
    typeof value.createdAt !== 'number' ||
    !Number.isInteger(value.createdAt) ||
    value.createdAt < 0 ||
    typeof value.updatedAt !== 'number' ||
    !Number.isInteger(value.updatedAt) ||
    value.updatedAt < 0 ||
    typeof data.title !== 'string' ||
    data.title.trim().length === 0 ||
    !validModelConnectionId ||
    !validModelId
  ) {
    return null;
  }

  return {
    id: Number(value.id),
    createdAt: Number(value.createdAt),
    updatedAt: Number(value.updatedAt),
    data: {
      title: data.title.trim(),
      modelConnectionId:
        data.modelConnectionId === null ? null : Number(data.modelConnectionId),
      modelId: typeof data.modelId === 'string' ? data.modelId.trim() : null,
    },
  };
}

function parseChatList(value: unknown): ClientChat[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const chats = value.map(parseChat);
  return chats.every((chat): chat is ClientChat => chat !== null) ? chats : null;
}

function setActiveNavItem(activeView: ViewName, navItems: Map<ViewName, HTMLElement>): void {
  for (const [viewName, item] of navItems) {
    if (viewName === activeView) {
      item.classList.add('chat-sidebar-item-active');
    } else {
      item.classList.remove('chat-sidebar-item-active');
    }
  }
}

export function createLayout(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'chat-container';

  const sidebar = document.createElement('nav');
  sidebar.className = 'chat-sidebar';

  const sidebarHeader = document.createElement('div');
  sidebarHeader.className = 'chat-header';

  const title = document.createElement('h1');
  title.textContent = 'AI Agent';
  sidebarHeader.appendChild(title);
  sidebar.appendChild(sidebarHeader);

  const navList = document.createElement('ul');

  const navItems = new Map<ViewName, HTMLElement>();

  const chatNavItem = document.createElement('li');
  const chatNavLink = document.createElement('a');
  chatNavLink.href = '#';
  chatNavLink.className = 'chat-sidebar-item chat-sidebar-item-active';
  chatNavLink.textContent = 'Chat';
  chatNavLink.setAttribute('data-view', 'chat');
  chatNavItem.appendChild(chatNavLink);
  navList.appendChild(chatNavItem);
  navItems.set('chat', chatNavLink);

  const chatListPanel = document.createElement('li');
  chatListPanel.className = 'chat-list-panel';

  const newChatButton = document.createElement('button');
  newChatButton.type = 'button';
  newChatButton.className = 'chat-new-button';
  newChatButton.textContent = 'New chat';
  newChatButton.disabled = true;

  const chatListStatus = document.createElement('p');
  chatListStatus.className = 'chat-list-status';
  chatListStatus.setAttribute('role', 'status');
  chatListStatus.textContent = 'Loading chats...';

  const chatList = document.createElement('ul');
  chatList.className = 'chat-list';
  chatList.setAttribute('aria-label', 'Saved chats');

  chatListPanel.appendChild(newChatButton);
  chatListPanel.appendChild(chatListStatus);
  chatListPanel.appendChild(chatList);
  navList.appendChild(chatListPanel);

  const settingsNavItem = document.createElement('li');
  const settingsNavLink = document.createElement('a');
  settingsNavLink.href = '#';
  settingsNavLink.className = 'chat-sidebar-item';
  settingsNavLink.textContent = 'Settings';
  settingsNavLink.setAttribute('data-view', 'settings');
  settingsNavItem.appendChild(settingsNavLink);
  navList.appendChild(settingsNavItem);
  navItems.set('settings', settingsNavLink);

  sidebar.appendChild(navList);

  const mainWrapper = document.createElement('div');
  mainWrapper.className = 'chat-main-wrapper';

  const header = document.createElement('header');
  header.className = 'chat-main-header';

  const headerTitle = document.createElement('h2');
  headerTitle.textContent = 'Chat Interface';
  header.appendChild(headerTitle);
  mainWrapper.appendChild(header);

  const main = document.createElement('main');
  main.className = 'chat-main-content';
  mainWrapper.appendChild(main);

  container.appendChild(sidebar);
  container.appendChild(mainWrapper);

  let currentView: ViewName = 'chat';
  let chats: ClientChat[] = [];
  let activeChatId: number | null = null;
  let openChatActionsId: number | null = null;
  let renamingChatId: number | null = null;
  let renameSaveInProgressId: number | null = null;
  let createInProgress = false;

  function getActiveChat(): ClientChat | null {
    return chats.find((chat) => chat.id === activeChatId) ?? null;
  }

  async function updateActiveChatModelSelection(
    modelConnectionId: number | null,
    modelId: string | null,
  ): Promise<boolean> {
    const activeChat = getActiveChat();
    if (!activeChat) {
      return false;
    }

    try {
      const response = await fetch(`/api/chats/${activeChat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelConnectionId, modelId }),
      });

      if (!response.ok) {
        return false;
      }

      const updatedChat = parseChat(await response.json());
      if (!updatedChat || updatedChat.id !== activeChat.id) {
        return false;
      }

      chats = chats.map((chat) => (chat.id === updatedChat.id ? updatedChat : chat));
      return true;
    } catch {
      return false;
    }
  }

  function renderCurrentView(): void {
    const activeChat = getActiveChat();
    main.replaceChildren(
      currentView === 'chat'
        ? createChatView(
            activeChat ?? undefined,
            updateActiveChatModelSelection,
            (chatId) => currentView === 'chat' && activeChatId === chatId,
          )
        : createSettingsView(),
    );
    headerTitle.textContent =
      currentView === 'chat' ? (activeChat?.data.title ?? 'Chat Interface') : 'Settings';
  }

  async function renameChat(chat: ClientChat, renamedTitle: string): Promise<void> {
    let renameFailed = false;

    try {
      const response = await fetch(`/api/chats/${chat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: renamedTitle }),
      });

      if (!response.ok) {
        throw new Error('Failed to rename chat');
      }

      const updatedChat = parseChat(await response.json());
      if (!updatedChat || updatedChat.id !== chat.id) {
        throw new Error('Invalid rename chat response');
      }

      chats = chats.map((item) => (item.id === updatedChat.id ? updatedChat : item));
      if (activeChatId === updatedChat.id) {
        renderCurrentView();
      }
    } catch {
      renameFailed = true;
    } finally {
      if (renameSaveInProgressId === chat.id) {
        renameSaveInProgressId = null;
      }
      if (renamingChatId === chat.id) {
        renamingChatId = null;
      }
      renderChatList();
      if (renameFailed) {
        chatListStatus.setAttribute('role', 'alert');
        chatListStatus.textContent = 'Failed to rename chat.';
      }
    }
  }

  function beginRenameChat(chat: ClientChat): void {
    openChatActionsId = null;
    renamingChatId = chat.id;
    renderChatList();

    const input = chatList.querySelector<HTMLInputElement>(
      `[data-chat-rename-id="${chat.id}"]`,
    );
    input?.focus();
    input?.select();
  }

  function cancelRenameChat(chatId: number): void {
    renamingChatId = null;
    renderChatList();
    chatList
      .querySelector<HTMLButtonElement>(`[data-chat-actions-id="${chatId}"]`)
      ?.focus();
  }

  async function deleteChat(chat: ClientChat): Promise<void> {
    try {
      const response = await fetch(`/api/chats/${chat.id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to delete chat');
      }

      const wasActive = activeChatId === chat.id;
      chats = chats.filter((item) => item.id !== chat.id);
      if (wasActive) {
        activeChatId = null;
      }
      openChatActionsId = null;
      renderChatList();
      if (wasActive) {
        renderCurrentView();
      }
    } catch {
      chatListStatus.setAttribute('role', 'alert');
      chatListStatus.textContent = 'Failed to delete chat.';
    }
  }

  function requestDeleteChat(chat: ClientChat): void {
    openChatActionsId = null;
    renderChatList();

    const actionsButton = chatList.querySelector<HTMLButtonElement>(
      `[data-chat-actions-id="${chat.id}"]`,
    );
    const modal = createConfirmationModal({
      title: 'Delete chat?',
      message: `"${chat.data.title}" will be permanently deleted.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
      returnFocusTo: actionsButton ?? undefined,
      onConfirm: () => deleteChat(chat),
      onCancel: () => undefined,
    });
    container.appendChild(modal);
  }

  function renderChatList(): void {
    chatList.replaceChildren();

    if (chats.length === 0) {
      chatListStatus.textContent = 'No saved chats yet.';
      return;
    }

    chatListStatus.textContent = '';

    for (const chat of chats) {
      const item = document.createElement('li');
      const actions = document.createElement('div');
      const button = document.createElement('button');
      const actionsButton = document.createElement('button');
      const isActive = chat.id === activeChatId;
      const isRenaming = renamingChatId === chat.id;

      item.className = 'chat-list-item';

      if (isRenaming) {
        const input = document.createElement('input');
        let saveStarted = false;

        input.type = 'text';
        input.className = isActive
          ? 'chat-list-title-input chat-list-button-active'
          : 'chat-list-title-input';
        input.value = chat.data.title;
        input.setAttribute('aria-label', 'Rename chat');
        input.setAttribute('data-chat-rename-id', String(chat.id));
        input.addEventListener('click', (event) => event.stopPropagation());

        const saveRename = (): void => {
          if (saveStarted || renameSaveInProgressId === chat.id) {
            return;
          }

          saveStarted = true;
          renameSaveInProgressId = chat.id;
          const renamedTitle = input.value.trim();
          if (renamedTitle.length === 0) {
            renameSaveInProgressId = null;
            cancelRenameChat(chat.id);
            return;
          }

          input.disabled = true;
          void renameChat(chat, renamedTitle);
        };

        input.addEventListener('blur', saveRename);
        input.addEventListener('keydown', (event: KeyboardEvent) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            saveRename();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            saveStarted = true;
            cancelRenameChat(chat.id);
          }
        });

        item.appendChild(input);
      } else {
        button.type = 'button';
        button.className = isActive
          ? 'chat-list-button chat-list-button-active'
          : 'chat-list-button';
        button.textContent = chat.data.title;
        button.setAttribute('aria-pressed', String(isActive));
        button.addEventListener('click', () => {
          openChatActionsId = null;
          activeChatId = chat.id;
          currentView = 'chat';
          setActiveNavItem(currentView, navItems);
          renderChatList();
          renderCurrentView();
        });
        item.appendChild(button);
      }

      actions.className = 'chat-actions';
      actions.addEventListener('click', (event) => event.stopPropagation());

      actionsButton.type = 'button';
      actionsButton.className = 'chat-actions-trigger';
      actionsButton.textContent = '...';
      actionsButton.setAttribute('aria-label', 'Chat actions');
      actionsButton.setAttribute('aria-haspopup', 'menu');
      actionsButton.setAttribute('aria-expanded', String(openChatActionsId === chat.id));
      actionsButton.setAttribute('data-chat-actions-id', String(chat.id));
      actionsButton.addEventListener('click', (event) => {
        event.stopPropagation();
        openChatActionsId = openChatActionsId === chat.id ? null : chat.id;
        renderChatList();

        if (openChatActionsId === chat.id) {
          chatList.querySelector<HTMLButtonElement>('.chat-actions-menu-button')?.focus();
        }
      });
      if (!isRenaming) {
        actions.appendChild(actionsButton);
      }

      if (openChatActionsId === chat.id) {
        const menu = document.createElement('div');
        const renameButton = document.createElement('button');
        const deleteButton = document.createElement('button');

        menu.className = 'chat-actions-menu';
        menu.setAttribute('role', 'menu');

        renameButton.type = 'button';
        renameButton.className = 'chat-actions-menu-button';
        renameButton.textContent = 'Rename';
        renameButton.setAttribute('role', 'menuitem');
        renameButton.addEventListener('click', () => beginRenameChat(chat));

        deleteButton.type = 'button';
        deleteButton.className = 'chat-actions-menu-button chat-actions-delete';
        deleteButton.textContent = 'Delete';
        deleteButton.setAttribute('role', 'menuitem');
        deleteButton.addEventListener('click', () => requestDeleteChat(chat));

        menu.appendChild(renameButton);
        menu.appendChild(deleteButton);
        actions.appendChild(menu);
      }

      item.appendChild(actions);
      chatList.appendChild(item);
    }
  }

  async function loadChats(): Promise<void> {
    try {
      const response = await fetch('/api/chats');

      if (!response.ok) {
        throw new Error('Failed to load chats');
      }

      const parsedChats = parseChatList(await response.json());

      if (parsedChats === null) {
        throw new Error('Invalid chat list response');
      }

      chats = parsedChats;
      renderChatList();
    } catch {
      chatList.replaceChildren();
      chatListStatus.setAttribute('role', 'alert');
      chatListStatus.textContent = 'Failed to load chats.';
    } finally {
      newChatButton.disabled = false;
    }
  }

  async function createNewChat(): Promise<void> {
    if (createInProgress) {
      return;
    }

    createInProgress = true;
    newChatButton.disabled = true;

    try {
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(NEW_CHAT_INPUT),
      });

      if (!response.ok) {
        throw new Error('Failed to create chat');
      }

      const createdChat = parseChat(await response.json());

      if (createdChat === null) {
        throw new Error('Invalid create chat response');
      }

      chats = [createdChat, ...chats];
      activeChatId = createdChat.id;
      currentView = 'chat';
      chatListStatus.setAttribute('role', 'status');
      setActiveNavItem(currentView, navItems);
      renderChatList();
      renderCurrentView();
    } catch {
      chatListStatus.setAttribute('role', 'alert');
      chatListStatus.textContent = 'Failed to create chat.';
    } finally {
      createInProgress = false;
      newChatButton.disabled = false;
    }
  }

  renderCurrentView();
  void loadChats();

  function switchView(viewName: ViewName): void {
    if (viewName === currentView) {
      return;
    }

    currentView = viewName;

    setActiveNavItem(viewName, navItems);
    renderCurrentView();
  }

  newChatButton.addEventListener('click', () => {
    void createNewChat();
  });

  chatNavLink.addEventListener('click', (event: Event) => {
    event.preventDefault();
    switchView('chat');
  });

  settingsNavLink.addEventListener('click', (event: Event) => {
    event.preventDefault();
    switchView('settings');
  });

  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || openChatActionsId === null) {
      return;
    }

    const closedChatId = openChatActionsId;
    openChatActionsId = null;
    renderChatList();
    chatList
      .querySelector<HTMLButtonElement>(`[data-chat-actions-id="${closedChatId}"]`)
      ?.focus();
  });

  document.addEventListener('click', (event: MouseEvent) => {
    if (openChatActionsId === null) {
      return;
    }

    const target = event.target;
    if (target instanceof Element && target.closest('.chat-actions')) {
      return;
    }

    openChatActionsId = null;
    renderChatList();
  });

  return container;
}

const root = document.getElementById('root');

if (root) {
  root.appendChild(createLayout());
}
