import { createChatView } from './chat/ChatView.js';
import { createConfirmationModal } from './ConfirmationModal.js';
import { createSettingsView } from './settings/SettingsView.js';
import { createAdminSettingsView } from './admin-settings/AdminSettingsView.js';
import { createSkillsView } from './skills/SkillsView.js';
import { createToolsView } from './tools/ToolsView.js';
import {
  createProjectsView,
  parseProjects,
  type ClientProject,
} from './projects/ProjectsView.js';

type ViewName = 'chat' | 'projects' | 'tools' | 'settings' | 'admin-settings' | 'skills';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

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

const NEW_CHAT_INPUT = {
  title: 'New chat',
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
    data.modelId === null || (typeof data.modelId === 'string' && data.modelId.trim().length > 0);

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
      modelConnectionId: data.modelConnectionId === null ? null : Number(data.modelConnectionId),
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

  const upperNavList = document.createElement('ul');
  upperNavList.className = 'chat-sidebar-navigation';
  upperNavList.setAttribute('aria-label', 'Primary navigation');

  const bottomNavList = document.createElement('ul');
  bottomNavList.className = 'chat-sidebar-bottom';
  bottomNavList.setAttribute('aria-label', 'Settings navigation');

  const navItems = new Map<ViewName, HTMLElement>();

  const chatNavItem = document.createElement('li');
  chatNavItem.className = 'chat-section-heading';
  const chatNavLink = document.createElement('a');
  chatNavLink.href = '#';
  chatNavLink.className = 'chat-sidebar-item';
  chatNavLink.textContent = 'Chat';
  chatNavLink.setAttribute('data-view', 'chat');
  const chatSectionToggle = document.createElement('button');
  chatSectionToggle.type = 'button';
  chatSectionToggle.className = 'chat-section-toggle';
  chatSectionToggle.setAttribute('aria-label', 'Toggle saved chats');
  chatSectionToggle.setAttribute('aria-expanded', 'false');

  const chatSectionToggleIcon = document.createElementNS(SVG_NAMESPACE, 'svg');
  chatSectionToggleIcon.setAttribute('viewBox', '0 0 24 24');
  chatSectionToggleIcon.setAttribute('aria-hidden', 'true');
  chatSectionToggleIcon.setAttribute('focusable', 'false');
  const chatSectionTogglePath = document.createElementNS(SVG_NAMESPACE, 'path');
  chatSectionTogglePath.setAttribute('d', 'M6 9l6 6 6-6');
  chatSectionTogglePath.setAttribute('stroke-linecap', 'round');
  chatSectionTogglePath.setAttribute('stroke-linejoin', 'round');
  chatSectionToggleIcon.appendChild(chatSectionTogglePath);
  chatSectionToggle.appendChild(chatSectionToggleIcon);
  chatNavItem.appendChild(chatNavLink);
  chatNavItem.appendChild(chatSectionToggle);
  upperNavList.appendChild(chatNavItem);
  navItems.set('chat', chatNavLink);

  const chatListPanel = document.createElement('li');
  chatListPanel.className = 'chat-list-panel';
  chatListPanel.hidden = true;

  const newChatButton = document.createElement('button');
  newChatButton.type = 'button';
  newChatButton.className = 'chat-new-button';
  const newChatIcon = document.createElementNS(SVG_NAMESPACE, 'svg');
  newChatIcon.setAttribute('viewBox', '0 0 24 24');
  newChatIcon.setAttribute('aria-hidden', 'true');
  newChatIcon.setAttribute('focusable', 'false');
  const newChatHorizontalLine = document.createElementNS(SVG_NAMESPACE, 'line');
  newChatHorizontalLine.setAttribute('x1', '5');
  newChatHorizontalLine.setAttribute('y1', '12');
  newChatHorizontalLine.setAttribute('x2', '19');
  newChatHorizontalLine.setAttribute('y2', '12');
  const newChatVerticalLine = document.createElementNS(SVG_NAMESPACE, 'line');
  newChatVerticalLine.setAttribute('x1', '12');
  newChatVerticalLine.setAttribute('y1', '5');
  newChatVerticalLine.setAttribute('x2', '12');
  newChatVerticalLine.setAttribute('y2', '19');
  newChatIcon.appendChild(newChatHorizontalLine);
  newChatIcon.appendChild(newChatVerticalLine);
  const newChatLabel = document.createElement('span');
  newChatLabel.textContent = 'New chat';
  newChatButton.appendChild(newChatIcon);
  newChatButton.appendChild(newChatLabel);
   newChatButton.setAttribute('title', 'Create a new chat');
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
  upperNavList.appendChild(chatListPanel);

  const projectsNavItem = document.createElement('li');
  projectsNavItem.className = 'chat-section-heading';
  const projectsNavLink = document.createElement('a');
  projectsNavLink.href = '/projects';
  projectsNavLink.className = 'chat-sidebar-item';
  projectsNavLink.textContent = 'Projects';
  projectsNavLink.setAttribute('data-view', 'projects');
  const projectsSectionToggle = document.createElement('button');
  projectsSectionToggle.type = 'button';
  projectsSectionToggle.className = 'chat-section-toggle';
  projectsSectionToggle.setAttribute('aria-label', 'Toggle projects');
  projectsSectionToggle.setAttribute('aria-expanded', 'false');
  projectsSectionToggle.setAttribute('aria-controls', 'sidebar-project-list');

  const projectsSectionToggleIcon = document.createElementNS(SVG_NAMESPACE, 'svg');
  projectsSectionToggleIcon.setAttribute('viewBox', '0 0 24 24');
  projectsSectionToggleIcon.setAttribute('aria-hidden', 'true');
  projectsSectionToggleIcon.setAttribute('focusable', 'false');
  const projectsSectionTogglePath = document.createElementNS(SVG_NAMESPACE, 'path');
  projectsSectionTogglePath.setAttribute('d', 'M6 9l6 6 6-6');
  projectsSectionTogglePath.setAttribute('stroke-linecap', 'round');
  projectsSectionTogglePath.setAttribute('stroke-linejoin', 'round');
  projectsSectionToggleIcon.appendChild(projectsSectionTogglePath);
  projectsSectionToggle.appendChild(projectsSectionToggleIcon);
  projectsNavItem.appendChild(projectsNavLink);
  projectsNavItem.appendChild(projectsSectionToggle);
  upperNavList.appendChild(projectsNavItem);
  navItems.set('projects', projectsNavLink);

  const projectsListPanel = document.createElement('li');
  projectsListPanel.id = 'sidebar-project-list';
  projectsListPanel.className = 'projects-sidebar-panel';
  projectsListPanel.hidden = true;
  const projectsListStatus = document.createElement('p');
  projectsListStatus.className = 'projects-sidebar-status';
  projectsListStatus.setAttribute('role', 'status');
  projectsListStatus.textContent = 'Loading projects...';
  const projectsList = document.createElement('ul');
  projectsList.className = 'projects-sidebar-list';
  projectsList.setAttribute('aria-label', 'Projects');
  projectsListPanel.appendChild(projectsListStatus);
  projectsListPanel.appendChild(projectsList);
  upperNavList.appendChild(projectsListPanel);

  const toolsNavItem = document.createElement('li');
  const toolsNavLink = document.createElement('a');
  toolsNavLink.href = '/tools';
  toolsNavLink.className = 'chat-sidebar-item';
  toolsNavLink.textContent = 'Tools';
  toolsNavLink.setAttribute('data-view', 'tools');
  toolsNavItem.appendChild(toolsNavLink);
  upperNavList.appendChild(toolsNavItem);
  navItems.set('tools', toolsNavLink);

  const skillsNavItem = document.createElement('li');
  skillsNavItem.hidden = true;
  const skillsNavLink = document.createElement('a');
  skillsNavLink.href = '#';
  skillsNavLink.className = 'chat-sidebar-item';
  skillsNavLink.textContent = 'Skills';
  skillsNavLink.setAttribute('data-view', 'skills');
  skillsNavItem.appendChild(skillsNavLink);
  upperNavList.appendChild(skillsNavItem);
  navItems.set('skills', skillsNavLink);

  const settingsNavItem = document.createElement('li');
  const settingsNavLink = document.createElement('a');
  settingsNavLink.href = '#';
  settingsNavLink.className = 'chat-sidebar-item';
  settingsNavLink.textContent = 'Settings';
  settingsNavLink.setAttribute('data-view', 'settings');
  settingsNavItem.appendChild(settingsNavLink);
  bottomNavList.appendChild(settingsNavItem);
  navItems.set('settings', settingsNavLink);

  const adminSettingsNavItem = document.createElement('li');
  adminSettingsNavItem.hidden = true;
  const adminSettingsNavLink = document.createElement('a');
  adminSettingsNavLink.href = '#';
  adminSettingsNavLink.className = 'chat-sidebar-item';
  adminSettingsNavLink.textContent = 'Admin Settings';
  adminSettingsNavLink.setAttribute('data-view', 'admin-settings');
  adminSettingsNavItem.appendChild(adminSettingsNavLink);
  bottomNavList.appendChild(adminSettingsNavItem);
  navItems.set('admin-settings', adminSettingsNavLink);

  sidebar.appendChild(upperNavList);
  sidebar.appendChild(bottomNavList);

  const mainWrapper = document.createElement('div');
  mainWrapper.className = 'chat-main-wrapper';

  const header = document.createElement('header');
  header.className = 'chat-main-header';

  const headerTitle = document.createElement('h2');
  headerTitle.textContent = '';
  header.appendChild(headerTitle);
  header.hidden = true;
  mainWrapper.appendChild(header);

  const main = document.createElement('main');
  main.className = 'chat-main-content';
  mainWrapper.appendChild(main);

  container.appendChild(sidebar);
  container.appendChild(mainWrapper);

  let currentView: ViewName | null = null;
  let chats: ClientChat[] = [];
  let activeChatId: number | null = null;
  let openChatActionsId: number | null = null;
  let renamingChatId: number | null = null;
  let renameSaveInProgressId: number | null = null;
  let createInProgress = false;
  let isChatSectionExpanded = false;
  let projects: ClientProject[] = [];
  let activeProjectId: number | null = null;
  let isProjectsSectionExpanded = false;
  let projectsLoadState: 'loading' | 'loaded' | 'error' = 'loading';

  function updateProjectState(
    updatedProjects: readonly ClientProject[],
    selectedProjectId: number | null,
  ): void {
    projects = [...updatedProjects];
    activeProjectId = selectedProjectId;
    projectsLoadState = 'loaded';
    renderProjectsList();
  }

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
    if (currentView === null) {
      header.hidden = true;
      headerTitle.textContent = '';
      main.replaceChildren();
      return;
    }

    const activeChat = getActiveChat();
    header.hidden = false;
    const view =
       currentView === 'chat'
        ? createChatView(
            activeChat ?? undefined,
            updateActiveChatModelSelection,
            (chatId) => currentView === 'chat' && activeChatId === chatId,
             createNewChat,
           )
        : currentView === 'projects'
          ? createProjectsView({
              selectedProjectId: activeProjectId,
              onStateChange: updateProjectState,
            })
          : currentView === 'settings'
            ? createSettingsView()
            : currentView === 'tools'
              ? createToolsView()
              : currentView === 'admin-settings'
                ? createAdminSettingsView()
                : createSkillsView();
    main.replaceChildren(view);
    headerTitle.textContent =
      currentView === 'projects'
        ? 'Projects'
        : currentView === 'settings'
          ? 'Settings'
          : currentView === 'tools'
            ? 'Tools'
            : currentView === 'admin-settings'
              ? 'Admin Settings'
              : currentView === 'skills'
                ? 'Skills'
                : (activeChat?.data.title ?? 'Chat Interface');
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

    const input = chatList.querySelector<HTMLInputElement>(`[data-chat-rename-id="${chat.id}"]`);
    input?.focus();
    input?.select();
  }

  function cancelRenameChat(chatId: number): void {
    renamingChatId = null;
    renderChatList();
    chatList.querySelector<HTMLButtonElement>(`[data-chat-actions-id="${chatId}"]`)?.focus();
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
        const chatIcon = document.createElementNS(SVG_NAMESPACE, 'svg');
        chatIcon.classList.add('chat-list-icon');
        chatIcon.setAttribute('viewBox', '0 0 24 24');
        chatIcon.setAttribute('aria-hidden', 'true');
        chatIcon.setAttribute('focusable', 'false');
        const chatIconPath = document.createElementNS(SVG_NAMESPACE, 'path');
        chatIconPath.setAttribute(
          'd',
          'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
        );
        chatIcon.appendChild(chatIconPath);
        const chatTitle = document.createElement('span');
        chatTitle.className = 'chat-list-title';
        chatTitle.textContent = chat.data.title;

        button.type = 'button';
        button.className = isActive
          ? 'chat-list-button chat-list-button-active'
          : 'chat-list-button';
        button.setAttribute('aria-pressed', String(isActive));
        button.appendChild(chatIcon);
        button.appendChild(chatTitle);
        button.addEventListener('click', () => {
          openChatActionsId = null;
          activeChatId = chat.id;
          currentView = 'chat';
          setActiveNavItem(currentView, navItems);
          renderChatList();
          renderProjectsList();
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

  function renderProjectsList(): void {
    projectsList.replaceChildren();
    projectsListStatus.setAttribute('role', projectsLoadState === 'error' ? 'alert' : 'status');

    if (projectsLoadState === 'loading') {
      projectsListStatus.textContent = 'Loading projects...';
      return;
    }

    if (projectsLoadState === 'error') {
      projectsListStatus.textContent = 'Projects unavailable.';
      return;
    }

    if (projects.length === 0) {
      projectsListStatus.textContent = 'No projects';
      return;
    }

    projectsListStatus.textContent = '';
    for (const project of projects) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      const isActive = currentView === 'projects' && activeProjectId === project.id;
      button.type = 'button';
      button.className = isActive
        ? 'projects-sidebar-button projects-sidebar-button-active'
        : 'projects-sidebar-button';
      button.textContent = project.name;
      button.setAttribute('aria-pressed', String(isActive));
      button.addEventListener('click', () => {
        activeProjectId = project.id;
        renderProjectsList();
        switchView('projects', true);
      });
      item.appendChild(button);
      projectsList.appendChild(item);
    }
  }

  async function loadProjects(): Promise<void> {
    try {
      const response = await fetch('/api/projects');
      const loaded = response.ok ? parseProjects(await response.json()) : null;
      if (!loaded) {
        throw new Error('Invalid projects response');
      }
      projects = loaded;
      projectsLoadState = 'loaded';
    } catch {
      projects = [];
      projectsLoadState = 'error';
    }
    renderProjectsList();
  }

  async function createNewChat(): Promise<boolean> {
    if (createInProgress) {
      return false;
    }

    createInProgress = true;
newChatButton.setAttribute('title', 'Create a new chat');
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
      renderProjectsList();
      renderCurrentView();
      return true;
    } catch {
      chatListStatus.setAttribute('role', 'alert');
      chatListStatus.textContent = 'Failed to create chat.';
      return false;
    } finally {
      createInProgress = false;
      newChatButton.disabled = false;
    }
  }

  renderCurrentView();
  void loadChats();
  void loadProjects();

  function switchView(viewName: ViewName, forceRender = false): void {
    if (viewName === currentView && !forceRender) {
      return;
    }

    currentView = viewName;

    setActiveNavItem(viewName, navItems);
    renderProjectsList();
    renderCurrentView();
  }

  newChatButton.addEventListener('click', () => {
    void createNewChat();
  });

  chatSectionToggle.addEventListener('click', () => {
    isChatSectionExpanded = !isChatSectionExpanded;
    chatSectionToggle.setAttribute('aria-expanded', String(isChatSectionExpanded));
    chatListPanel.hidden = !isChatSectionExpanded;
  });

  projectsSectionToggle.addEventListener('click', () => {
    isProjectsSectionExpanded = !isProjectsSectionExpanded;
    projectsSectionToggle.setAttribute('aria-expanded', String(isProjectsSectionExpanded));
    projectsListPanel.hidden = !isProjectsSectionExpanded;
  });

  chatNavLink.addEventListener('click', (event: Event) => {
    event.preventDefault();
    switchView('chat');
  });

  projectsNavLink.addEventListener('click', (event: Event) => {
    event.preventDefault();
    activeProjectId = null;
    switchView('projects', true);
  });

  toolsNavLink.addEventListener('click', (event: Event) => {
    event.preventDefault();
    window.history.pushState({}, '', '/tools');
    switchView('tools');
  });

  settingsNavLink.addEventListener('click', (event: Event) => {
    event.preventDefault();
    switchView('settings');
  });

  adminSettingsNavLink.addEventListener('click', (event: Event) => {
    event.preventDefault();
    if (!adminSettingsNavItem.hidden) {
      switchView('admin-settings');
    }
  });

  skillsNavLink.addEventListener('click', (event: Event) => {
    event.preventDefault();
    if (!skillsNavItem.hidden) {
      switchView('skills');
    }
  });

  window.addEventListener('popstate', () => {
    if (window.location.pathname === '/tools') {
      switchView('tools');
    }
  });

  if (window.location.pathname === '/tools') {
    switchView('tools');
  }

  void (async () => {
    try {
      const response = await fetch('/api/me');
      const capabilities: unknown = response.ok ? await response.json() : null;
      if (
        typeof capabilities === 'object' &&
        capabilities !== null &&
        !Array.isArray(capabilities) &&
        (capabilities as Record<string, unknown>).isAdmin === true
      ) {
        adminSettingsNavItem.hidden = false;
        skillsNavItem.hidden = false;
      }
    } catch {
      adminSettingsNavItem.hidden = true;
      skillsNavItem.hidden = true;
    }
  })();

  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || openChatActionsId === null) {
      return;
    }

    const closedChatId = openChatActionsId;
    openChatActionsId = null;
    renderChatList();
    chatList.querySelector<HTMLButtonElement>(`[data-chat-actions-id="${closedChatId}"]`)?.focus();
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
