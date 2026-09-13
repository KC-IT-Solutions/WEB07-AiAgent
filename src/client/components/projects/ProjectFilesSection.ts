import { createConfirmationModal } from '../ConfirmationModal.js';

interface ClientProjectFileEntry {
  name: string;
  relativePath: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: number;
}

interface ClientProjectDirectoryListing {
  relativePath: string;
  entries: ClientProjectFileEntry[];
}

interface ClientProjectTextFile {
  relativePath: string;
  content: string;
  size: number;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const TEXT_FILE_EXTENSIONS = new Set([
  'bat',
  'c',
  'cmd',
  'cpp',
  'cs',
  'css',
  'csv',
  'env',
  'go',
  'h',
  'html',
  'ini',
  'java',
  'js',
  'json',
  'jsonc',
  'jsx',
  'log',
  'md',
  'mjs',
  'php',
  'ps1',
  'py',
  'rb',
  'rs',
  'scss',
  'sh',
  'sql',
  'svg',
  'toml',
  'ts',
  'tsx',
  'txt',
  'xml',
  'yaml',
  'yml',
]);
let fileEditorId = 0;

function createProjectFileIcon(type: ClientProjectFileEntry['type']): SVGSVGElement {
  const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
  icon.classList.add('project-file-icon', `project-file-icon-${type}`);
  icon.setAttribute('viewBox', '0 0 20 20');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');

  if (type === 'directory') {
    const folderPath = document.createElementNS(SVG_NAMESPACE, 'path');
    folderPath.setAttribute('d', 'M2.5 5.5h5l1.5 2h8.5v7.5h-15z');
    icon.appendChild(folderPath);
    return icon;
  }

  const fileOutline = document.createElementNS(SVG_NAMESPACE, 'path');
  fileOutline.setAttribute('d', 'M5 2.5h6l4 4v11H5z');
  const fileFold = document.createElementNS(SVG_NAMESPACE, 'polyline');
  fileFold.setAttribute('points', '11 2.5 11 6.5 15 6.5');
  icon.append(fileOutline, fileFold);
  return icon;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeRelativePath(value: unknown, allowRoot: boolean): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  if (value === '') {
    return allowRoot;
  }
  return (
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes(':') &&
    value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

function parseEntry(value: unknown): ClientProjectFileEntry | null {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    value.name.length === 0 ||
    value.name.includes('/') ||
    value.name.includes('\\') ||
    !isSafeRelativePath(value.relativePath, false) ||
    (value.type !== 'file' && value.type !== 'directory') ||
    (value.type === 'file' &&
      (typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 0))
  ) {
    return null;
  }
  return {
    name: value.name,
    relativePath: value.relativePath,
    type: value.type,
    ...(value.type === 'file' ? { size: value.size as number } : {}),
    ...(typeof value.modifiedAt === 'number' && Number.isFinite(value.modifiedAt)
      ? { modifiedAt: value.modifiedAt }
      : {}),
  };
}

function parseListing(value: unknown): ClientProjectDirectoryListing | null {
  if (!isRecord(value) || !isSafeRelativePath(value.relativePath, true) || !Array.isArray(value.entries)) {
    return null;
  }
  const entries = value.entries.map(parseEntry);
  if (!entries.every((entry): entry is ClientProjectFileEntry => entry !== null)) {
    return null;
  }
  const prefix = value.relativePath === '' ? '' : `${value.relativePath}/`;
  if (entries.some((entry) => entry.relativePath !== `${prefix}${entry.name}`)) {
    return null;
  }
  return { relativePath: value.relativePath, entries };
}

function parseTextFile(value: unknown): ClientProjectTextFile | null {
  if (
    !isRecord(value) ||
    !isSafeRelativePath(value.relativePath, false) ||
    typeof value.content !== 'string' ||
    typeof value.size !== 'number' ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0
  ) {
    return null;
  }
  return { relativePath: value.relativePath, content: value.content, size: value.size };
}

function joinRelativePath(parent: string, name: string): string | null {
  const normalizedName = name.trim();
  if (
    normalizedName === '' ||
    normalizedName === '.' ||
    normalizedName === '..' ||
    normalizedName.includes('/') ||
    normalizedName.includes('\\') ||
    normalizedName.includes(':')
  ) {
    return null;
  }
  return parent ? `${parent}/${normalizedName}` : normalizedName;
}

function parentPath(path: string): string {
  return path.split('/').slice(0, -1).join('/');
}

function isSupportedTextFile(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  if (name === 'dockerfile' || name === 'makefile' || name === '.gitignore') {
    return true;
  }
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  return TEXT_FILE_EXTENSIONS.has(extension);
}

export function formatProjectFileModifiedAt(modifiedAt: number | undefined): string | null {
  if (modifiedAt === undefined || !Number.isFinite(modifiedAt)) {
    return null;
  }
  const date = new Date(modifiedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function getFileMoveUpDestination(sourcePath: string): string | null {
  if (!isSafeRelativePath(sourcePath, false)) {
    return null;
  }
  const containingDirectory = parentPath(sourcePath);
  if (containingDirectory === '') {
    return null;
  }
  const name = sourcePath.slice(sourcePath.lastIndexOf('/') + 1);
  const destinationDirectory = parentPath(containingDirectory);
  return destinationDirectory ? `${destinationDirectory}/${name}` : name;
}

function createNameField(id: string, labelText: string, value = ''): {
  group: HTMLElement;
  input: HTMLInputElement;
} {
  const group = document.createElement('div');
  group.className = 'settings-form-group';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  const input = document.createElement('input');
  input.id = id;
  input.className = 'settings-input';
  input.type = 'text';
  input.required = true;
  input.maxLength = 255;
  input.value = value;
  group.appendChild(label);
  group.appendChild(input);
  return { group, input };
}

export function createProjectFilesSection(projectId: number): HTMLElement {
  const section = document.createElement('section');
  section.className = 'project-files';
  section.setAttribute('aria-label', 'Files');
  let currentPath = '';
  let pendingOpenPath: string | null = null;
  let activeFilePath: string | null = null;
  let draggedFilePath: string | null = null;
  let renderVersion = 0;
  let openActionsPath: string | null = null;
  let openActionsTrigger: HTMLButtonElement | null = null;
  let removeActionMenuListeners: (() => void) | null = null;

  function setStatus(element: HTMLElement, message: string, error = false): void {
    element.textContent = message;
    element.classList.toggle('settings-saved-status-error', error);
    element.setAttribute('role', error ? 'alert' : 'status');
  }

  function closeActionMenu(restoreFocus = false): void {
    removeActionMenuListeners?.();
    removeActionMenuListeners = null;
    openActionsTrigger?.parentElement?.querySelector('.project-file-actions-menu')?.remove();
    openActionsTrigger?.setAttribute('aria-expanded', 'false');
    const trigger = openActionsTrigger;
    openActionsPath = null;
    openActionsTrigger = null;
    if (restoreFocus) trigger?.focus();
  }

  function renderBreadcrumb(container: HTMLElement): void {
    const rootButton = document.createElement('button');
    rootButton.type = 'button';
    rootButton.textContent = 'Files';
    rootButton.disabled = currentPath === '';
    rootButton.addEventListener('click', () => navigate(''));
    container.appendChild(rootButton);
    const segments = currentPath ? currentPath.split('/') : [];
    for (let index = 0; index < segments.length; index += 1) {
      const separator = document.createElement('span');
      separator.textContent = '/';
      separator.setAttribute('aria-hidden', 'true');
      const button = document.createElement('button');
      const targetPath = segments.slice(0, index + 1).join('/');
      button.type = 'button';
      button.textContent = segments[index] ?? '';
      button.disabled = index === segments.length - 1;
      button.addEventListener('click', () => navigate(targetPath));
      container.appendChild(separator);
      container.appendChild(button);
    }
  }

  function navigate(path: string): void {
    if (!isSafeRelativePath(path, true)) {
      return;
    }
    currentPath = path;
    pendingOpenPath = null;
    activeFilePath = null;
    render();
  }

  function clearDragState(): void {
    draggedFilePath = null;
    section
      .querySelectorAll('.project-file-entry-dragging, .project-file-entry-drop-target')
      .forEach((entry) => {
        entry.classList.remove('project-file-entry-dragging', 'project-file-entry-drop-target');
      });
  }

  async function moveFile(
    sourcePath: string,
    destinationPath: string,
    status: HTMLElement,
  ): Promise<void> {
    if (
      !isSafeRelativePath(sourcePath, false) ||
      !isSafeRelativePath(destinationPath, false) ||
      destinationPath === sourcePath
    ) {
      setStatus(status, 'Failed to move file.', true);
      clearDragState();
      return;
    }
    setStatus(status, 'Moving file...');
    try {
      const response = await fetch(`/api/projects/${projectId}/files/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath, destinationPath }),
      });
      if (!response.ok) {
        throw new Error('Move failed');
      }
      if (activeFilePath === sourcePath) {
        pendingOpenPath = destinationPath;
      }
      render();
    } catch {
      setStatus(status, 'Failed to move file.', true);
    } finally {
      clearDragState();
    }
  }

  async function uploadFile(
    file: File,
    input: HTMLInputElement,
    button: HTMLButtonElement,
    status: HTMLElement,
  ): Promise<void> {
    button.disabled = true;
    button.textContent = 'Uploading...';
    setStatus(status, 'Uploading...');
    try {
      const response = await fetch(
        `/api/projects/${projectId}/files/upload?directory=${encodeURIComponent(currentPath)}&filename=${encodeURIComponent(file.name)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file,
        },
      );
      if (!response.ok) {
        if (response.status === 409) {
          setStatus(status, 'A directory with that name already exists.', true);
          return;
        }
        throw new Error('Upload failed');
      }
      input.value = '';
      const uploadedPath = currentPath ? `${currentPath}/${file.name}` : file.name;
      if (activeFilePath === uploadedPath) {
        pendingOpenPath = uploadedPath;
      }
      render();
    } catch {
      setStatus(status, 'Failed to upload file.', true);
    } finally {
      input.value = '';
      button.disabled = false;
      button.textContent = 'Upload file';
    }
  }

  async function downloadFile(
    entry: ClientProjectFileEntry,
    button: HTMLButtonElement,
    status: HTMLElement,
  ): Promise<void> {
    button.disabled = true;
    setStatus(status, `Downloading ${entry.name}...`);
    let objectUrl: string | null = null;
    try {
      const response = await fetch(
        `/api/projects/${projectId}/files/download?path=${encodeURIComponent(entry.relativePath)}`,
      );
      if (!response.ok) {
        throw new Error('Download failed');
      }
      objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = entry.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setStatus(status, '');
    } catch {
      setStatus(status, 'Failed to download file.', true);
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      button.disabled = false;
    }
  }

  function createEditor(file: ClientProjectTextFile, status: HTMLElement): HTMLElement {
    const editor = document.createElement('div');
    editor.className = 'project-file-editor';
    const heading = document.createElement('h4');
    heading.textContent = file.relativePath;
    const id = `project-file-content-${++fileEditorId}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = 'File content';
    const textarea = document.createElement('textarea');
    textarea.id = id;
    textarea.className = 'settings-input';
    textarea.rows = 14;
    textarea.value = file.content;
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'settings-save-button';
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', async () => {
      saveButton.disabled = true;
      setStatus(status, 'Saving file...');
      try {
        const response = await fetch(`/api/projects/${projectId}/file`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: file.relativePath, content: textarea.value }),
        });
        if (!response.ok) {
          throw new Error('Save failed');
        }
        pendingOpenPath = file.relativePath;
        render();
      } catch {
        setStatus(status, 'Failed to save file.', true);
      } finally {
        saveButton.disabled = false;
      }
    });
    editor.appendChild(heading);
    editor.appendChild(label);
    editor.appendChild(textarea);
    editor.appendChild(saveButton);
    return editor;
  }

  async function openFile(path: string, editorHost: HTMLElement, status: HTMLElement): Promise<void> {
    setStatus(status, 'Loading file...');
    editorHost.replaceChildren();
    try {
      const response = await fetch(
        `/api/projects/${projectId}/file?path=${encodeURIComponent(path)}`,
      );
      const file = response.ok ? parseTextFile(await response.json()) : null;
      if (!file || file.relativePath !== path) {
        throw new Error('Invalid file response');
      }
      activeFilePath = path;
      setStatus(status, '');
      editorHost.appendChild(createEditor(file, status));
    } catch {
      if (activeFilePath === path) {
        activeFilePath = null;
      }
      setStatus(status, 'Failed to open this text file.', true);
    }
  }

  function openCreateFile(returnFocusTo: HTMLElement): void {
    const form = document.createElement('form');
    form.className = 'project-file-dialog-form';
    form.addEventListener('submit', (event) => event.preventDefault());
    const nameField = createNameField(`project-file-name-${++fileEditorId}`, 'File name');
    const contentLabel = document.createElement('label');
    const content = document.createElement('textarea');
    contentLabel.htmlFor = `project-new-file-content-${fileEditorId}`;
    contentLabel.textContent = 'File content';
    content.id = contentLabel.htmlFor;
    content.className = 'settings-input';
    content.rows = 8;
    const error = document.createElement('p');
    error.className = 'settings-saved-status settings-saved-status-error';
    error.setAttribute('role', 'alert');
    form.appendChild(nameField.group);
    form.appendChild(contentLabel);
    form.appendChild(content);
    form.appendChild(error);
    let saved = false;
    const modal = createConfirmationModal({
      title: 'New text file',
      message: '',
      content: form,
      confirmLabel: 'Create',
      cancelLabel: 'Cancel',
      returnFocusTo,
      canCloseAfterConfirm: () => saved,
      onCancel: () => undefined,
      onConfirm: async () => {
        const path = joinRelativePath(currentPath, nameField.input.value);
        if (!form.reportValidity() || !path) {
          error.textContent = 'Enter a valid file name without path separators.';
          return;
        }
        try {
          const response = await fetch(`/api/projects/${projectId}/file`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, content: content.value }),
          });
          if (!response.ok) {
            throw new Error('Create failed');
          }
          saved = true;
          pendingOpenPath = path;
          render();
        } catch {
          error.textContent = 'Failed to create file.';
        }
      },
    });
    section.appendChild(modal);
  }

  function openCreateDirectory(returnFocusTo: HTMLElement): void {
    const form = document.createElement('form');
    form.className = 'project-file-dialog-form';
    form.addEventListener('submit', (event) => event.preventDefault());
    const nameField = createNameField(`project-directory-name-${++fileEditorId}`, 'Directory name');
    const error = document.createElement('p');
    error.className = 'settings-saved-status settings-saved-status-error';
    error.setAttribute('role', 'alert');
    form.appendChild(nameField.group);
    form.appendChild(error);
    let saved = false;
    const modal = createConfirmationModal({
      title: 'New directory',
      message: '',
      content: form,
      confirmLabel: 'Create',
      cancelLabel: 'Cancel',
      returnFocusTo,
      canCloseAfterConfirm: () => saved,
      onCancel: () => undefined,
      onConfirm: async () => {
        const path = joinRelativePath(currentPath, nameField.input.value);
        if (!form.reportValidity() || !path) {
          error.textContent = 'Enter a valid directory name without path separators.';
          return;
        }
        try {
          const response = await fetch(`/api/projects/${projectId}/directory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
          });
          if (!response.ok) {
            throw new Error('Create failed');
          }
          saved = true;
          render();
        } catch {
          error.textContent = 'Failed to create directory.';
        }
      },
    });
    section.appendChild(modal);
  }

  function openRename(entry: ClientProjectFileEntry, returnFocusTo: HTMLElement): void {
    const form = document.createElement('form');
    form.className = 'project-file-dialog-form';
    form.addEventListener('submit', (event) => event.preventDefault());
    const nameField = createNameField(`project-entry-name-${++fileEditorId}`, 'New name', entry.name);
    const error = document.createElement('p');
    error.className = 'settings-saved-status settings-saved-status-error';
    error.setAttribute('role', 'alert');
    form.appendChild(nameField.group);
    form.appendChild(error);
    let renamed = false;
    const modal = createConfirmationModal({
      title: `Rename ${entry.type}`,
      message: '',
      content: form,
      confirmLabel: 'Rename',
      cancelLabel: 'Cancel',
      returnFocusTo,
      canCloseAfterConfirm: () => renamed,
      onCancel: () => undefined,
      onConfirm: async () => {
        const destinationPath = joinRelativePath(parentPath(entry.relativePath), nameField.input.value);
        if (!form.reportValidity() || !destinationPath) {
          error.textContent = 'Enter a valid name without path separators.';
          return;
        }
        try {
          const response = await fetch(`/api/projects/${projectId}/files/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath: entry.relativePath, destinationPath }),
          });
          if (!response.ok) {
            throw new Error('Rename failed');
          }
          renamed = true;
          render();
        } catch {
          error.textContent = 'Failed to rename entry.';
        }
      },
    });
    section.appendChild(modal);
  }

  function requestDelete(
    entry: ClientProjectFileEntry,
    returnFocusTo: HTMLElement,
    status: HTMLElement,
  ): void {
    let deleted = false;
    const modal = createConfirmationModal({
      title: `Delete ${entry.type}?`,
      message: `"${entry.name}" will be permanently deleted.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
      returnFocusTo,
      canCloseAfterConfirm: () => deleted,
      onCancel: () => undefined,
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/projects/${projectId}/files`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: entry.relativePath }),
          });
          if (!response.ok) {
            throw new Error('Delete failed');
          }
          deleted = true;
          render();
        } catch {
          setStatus(status, 'Failed to delete entry.', true);
        }
      },
    });
    section.appendChild(modal);
  }

  function openActionMenu(
    entry: ClientProjectFileEntry,
    actions: HTMLElement,
    trigger: HTMLButtonElement,
    status: HTMLElement,
  ): void {
    if (openActionsPath === entry.relativePath) {
      closeActionMenu(true);
      return;
    }
    closeActionMenu();
    openActionsPath = entry.relativePath;
    openActionsTrigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');

    const menu = document.createElement('div');
    menu.className = 'project-file-actions-menu';
    menu.setAttribute('role', 'menu');
    const addAction = (
      label: string,
      action: () => void,
      destructive = false,
    ): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = destructive
        ? 'project-file-actions-menu-button project-file-actions-delete'
        : 'project-file-actions-menu-button';
      button.textContent = label;
      button.setAttribute('role', 'menuitem');
      button.addEventListener('click', () => {
        closeActionMenu();
        action();
      });
      menu.appendChild(button);
      return button;
    };

    let firstAction: HTMLButtonElement | null = null;
    if (entry.type === 'file') {
      firstAction = addAction('Download', () => void downloadFile(entry, trigger, status));
      const moveUpDestination = getFileMoveUpDestination(entry.relativePath);
      if (moveUpDestination !== null) {
        addAction('Move up', () => void moveFile(entry.relativePath, moveUpDestination, status));
      }
    }
    const renameAction = addAction('Rename', () => openRename(entry, trigger));
    firstAction ??= renameAction;
    addAction('Delete', () => requestDelete(entry, trigger, status), true);
    actions.appendChild(menu);

    const handleOutsideClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || !actions.contains(event.target)) closeActionMenu();
    };
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeActionMenu(true);
    };
    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    removeActionMenuListeners = () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
    firstAction.focus();
  }

  async function loadDirectory(
    version: number,
    list: HTMLElement,
    editorHost: HTMLElement,
    status: HTMLElement,
  ): Promise<void> {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/files?path=${encodeURIComponent(currentPath)}`,
      );
      const listing = response.ok ? parseListing(await response.json()) : null;
      if (!listing || listing.relativePath !== currentPath || version !== renderVersion) {
        throw new Error('Invalid directory response');
      }
      setStatus(status, listing.entries.length === 0 ? 'This directory is empty.' : '');
      for (const entry of listing.entries) {
        const item = document.createElement('li');
        item.className = 'project-file-entry';
        item.draggable = entry.type === 'file';
        if (entry.type === 'file') {
          item.addEventListener('dragstart', (event) => {
            draggedFilePath = entry.relativePath;
            item.classList.add('project-file-entry-dragging');
            event.dataTransfer?.setData('text/plain', entry.relativePath);
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = 'move';
            }
          });
          item.addEventListener('dragend', clearDragState);
        } else {
          item.addEventListener('dragover', (event) => {
            if (!draggedFilePath) {
              return;
            }
            event.preventDefault();
            item.classList.add('project-file-entry-drop-target');
            if (event.dataTransfer) {
              event.dataTransfer.dropEffect = 'move';
            }
          });
          item.addEventListener('dragleave', (event) => {
            if (!(event.relatedTarget instanceof Node) || !item.contains(event.relatedTarget)) {
              item.classList.remove('project-file-entry-drop-target');
            }
          });
          item.addEventListener('drop', (event) => {
            event.preventDefault();
            const sourcePath = draggedFilePath;
            if (!sourcePath) {
              clearDragState();
              return;
            }
            const name = sourcePath.slice(sourcePath.lastIndexOf('/') + 1);
            const destinationPath = `${entry.relativePath}/${name}`;
            void moveFile(sourcePath, destinationPath, status);
          });
        }
        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'project-file-open';
        const openLabel = document.createElement('span');
        openLabel.className = 'project-file-label';
        openLabel.textContent = entry.name;
        openButton.append(createProjectFileIcon(entry.type), openLabel);
        openButton.addEventListener('click', () => {
          if (entry.type === 'directory') {
            navigate(entry.relativePath);
          } else if (!isSupportedTextFile(entry.relativePath)) {
            activeFilePath = null;
            editorHost.replaceChildren();
            setStatus(status, 'This file cannot be opened as text. Use Download instead.');
          } else {
            void openFile(entry.relativePath, editorHost, status);
          }
        });
        item.appendChild(openButton);
        const modifiedAt = entry.type === 'file' ? entry.modifiedAt : undefined;
        const modifiedTimestamp = formatProjectFileModifiedAt(modifiedAt);
        if (modifiedTimestamp && modifiedAt !== undefined) {
          const modifiedTime = document.createElement('time');
          modifiedTime.className = 'project-file-modified-at';
          modifiedTime.dateTime = new Date(modifiedAt).toISOString();
          modifiedTime.textContent = modifiedTimestamp;
          item.appendChild(modifiedTime);
        }
        const actions = document.createElement('div');
        actions.className = 'project-file-actions';
        actions.draggable = false;
        actions.addEventListener('click', (event) => event.stopPropagation());
        actions.addEventListener('mousedown', (event) => event.preventDefault());
        actions.addEventListener('dragstart', (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        const actionsButton = document.createElement('button');
        actionsButton.type = 'button';
        actionsButton.className = 'project-file-actions-trigger';
        actionsButton.textContent = '...';
        actionsButton.setAttribute(
          'aria-label',
          `${entry.type === 'directory' ? 'Folder' : 'File'} actions for ${entry.name}`,
        );
        actionsButton.setAttribute('aria-haspopup', 'menu');
        actionsButton.setAttribute('aria-expanded', 'false');
        actionsButton.addEventListener('click', () => {
          openActionMenu(entry, actions, actionsButton, status);
        });
        actions.appendChild(actionsButton);
        item.appendChild(actions);
        list.appendChild(item);
      }
      if (pendingOpenPath) {
        const path = pendingOpenPath;
        pendingOpenPath = null;
        await openFile(path, editorHost, status);
      }
    } catch {
      if (version === renderVersion) {
        setStatus(status, 'Failed to load project files.', true);
      }
    }
  }

  function render(): void {
    const version = ++renderVersion;
    activeFilePath = null;
    closeActionMenu();
    clearDragState();
    section.replaceChildren();
    const header = document.createElement('div');
    header.className = 'project-files-header';
    const heading = document.createElement('h3');
    heading.textContent = 'Files';
    const actions = document.createElement('div');
    actions.className = 'project-files-actions';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.hidden = true;
    fileInput.setAttribute('aria-label', 'Choose file to upload');
    const uploadButton = document.createElement('button');
    uploadButton.type = 'button';
    uploadButton.className = 'settings-save-button';
    uploadButton.textContent = 'Upload file';
    uploadButton.addEventListener('click', () => fileInput.click());
    const createFileButton = document.createElement('button');
    createFileButton.type = 'button';
    createFileButton.className = 'settings-save-button';
    createFileButton.textContent = 'New text file';
    createFileButton.addEventListener('click', () => openCreateFile(createFileButton));
    const createDirectoryButton = document.createElement('button');
    createDirectoryButton.type = 'button';
    createDirectoryButton.className = 'settings-test-button';
    createDirectoryButton.textContent = 'New directory';
    createDirectoryButton.addEventListener('click', () =>
      openCreateDirectory(createDirectoryButton),
    );
    actions.append(uploadButton, createFileButton, createDirectoryButton, fileInput);
    header.appendChild(heading);
    header.appendChild(actions);

    const navigation = document.createElement('div');
    navigation.className = 'project-files-navigation';
    const upButton = document.createElement('button');
    upButton.type = 'button';
    upButton.className = 'settings-test-button';
    upButton.textContent = 'Up';
    upButton.disabled = currentPath === '';
    upButton.addEventListener('click', () => navigate(parentPath(currentPath)));
    const breadcrumb = document.createElement('nav');
    breadcrumb.className = 'project-files-breadcrumb';
    breadcrumb.setAttribute('aria-label', 'Project file path');
    renderBreadcrumb(breadcrumb);
    navigation.appendChild(upButton);
    navigation.appendChild(breadcrumb);

    const status = document.createElement('p');
    status.className = 'settings-saved-status';
    setStatus(status, 'Loading files...');
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        void uploadFile(file, fileInput, uploadButton, status);
      }
    });
    const list = document.createElement('ul');
    list.className = 'project-files-list';
    list.setAttribute('aria-label', 'Project files');
    const editorHost = document.createElement('div');
    editorHost.className = 'project-file-editor-host';
    section.appendChild(header);
    section.appendChild(navigation);
    section.appendChild(status);
    section.appendChild(list);
    section.appendChild(editorHost);
    void loadDirectory(version, list, editorHost, status);
  }

  render();
  return section;
}
