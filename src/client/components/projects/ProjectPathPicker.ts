import { createConfirmationModal } from '../ConfirmationModal.js';

interface ProjectPathPickerEntry {
  name: string;
  relativePath: string;
  type: 'file' | 'directory';
}

interface ProjectPathPickerListing {
  relativePath: string;
  entries: ProjectPathPickerEntry[];
}

export interface ProjectPathPickerOptions {
  projectId: number;
  mode: 'file' | 'directory';
  allowedExtensions?: readonly string[];
  initialPath?: string;
  returnFocusTo?: HTMLElement;
  onSelect: (relativePath: string) => void;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSafeProjectPickerPath(value: unknown, allowRoot: boolean): value is string {
  if (typeof value !== 'string') return false;
  if (value === '') return allowRoot;
  return (
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes(':') &&
    value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

export function getProjectPathPickerParent(path: string): string {
  return isSafeProjectPickerPath(path, true) ? path.split('/').slice(0, -1).join('/') : '';
}

export function isAllowedProjectPathPickerFile(
  name: string,
  allowedExtensions: readonly string[] = [],
): boolean {
  if (allowedExtensions.length === 0) return true;
  const lowerName = name.toLowerCase();
  return allowedExtensions.some(
    (extension) => extension.startsWith('.') && lowerName.endsWith(extension.toLowerCase()),
  );
}

function parseListing(value: unknown): ProjectPathPickerListing | null {
  if (!isRecord(value) || !isSafeProjectPickerPath(value.relativePath, true) || !Array.isArray(value.entries)) {
    return null;
  }
  const prefix = value.relativePath === '' ? '' : `${value.relativePath}/`;
  const entries = value.entries.flatMap((item): ProjectPathPickerEntry[] => {
    if (
      !isRecord(item) ||
      typeof item.name !== 'string' ||
      item.name.length === 0 ||
      item.name.includes('/') ||
      item.name.includes('\\') ||
      !isSafeProjectPickerPath(item.relativePath, false) ||
      item.relativePath !== `${prefix}${item.name}` ||
      (item.type !== 'file' && item.type !== 'directory')
    ) {
      return [];
    }
    return [{ name: item.name, relativePath: item.relativePath, type: item.type }];
  });
  return entries.length === value.entries.length ? { relativePath: value.relativePath, entries } : null;
}

function createEntryIcon(type: ProjectPathPickerEntry['type']): SVGSVGElement {
  const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
  icon.classList.add('project-file-icon', `project-file-icon-${type}`);
  icon.setAttribute('viewBox', '0 0 20 20');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  const outline = document.createElementNS(SVG_NAMESPACE, 'path');
  if (type === 'directory') {
    outline.setAttribute('d', 'M2.5 5.5h5l1.5 2h8.5v7.5h-15z');
    icon.appendChild(outline);
  } else {
    outline.setAttribute('d', 'M5 2.5h6l4 4v11H5z');
    const fold = document.createElementNS(SVG_NAMESPACE, 'polyline');
    fold.setAttribute('points', '11 2.5 11 6.5 15 6.5');
    icon.append(outline, fold);
  }
  return icon;
}

export function createProjectBrowseButton(mode: 'file' | 'directory'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'project-path-browse-button';
  button.setAttribute(
    'aria-label',
    mode === 'file' ? 'Browse Project files' : 'Browse Project directories',
  );
  button.appendChild(createEntryIcon('directory'));
  return button;
}

export function createProjectPathPicker(options: ProjectPathPickerOptions): HTMLElement {
  let currentPath = isSafeProjectPickerPath(options.initialPath, true) ? options.initialPath : '';
  let selectedFilePath: string | null = null;
  let renderVersion = 0;
  let selectionComplete = false;
  const content = document.createElement('div');
  content.className = 'project-path-picker';
  const current = document.createElement('p');
  current.className = 'project-path-picker-current';
  const navigation = document.createElement('div');
  navigation.className = 'project-path-picker-navigation';
  const upButton = document.createElement('button');
  upButton.type = 'button';
  upButton.className = 'settings-test-button';
  upButton.textContent = 'Up';
  const status = document.createElement('p');
  status.className = 'settings-saved-status';
  status.setAttribute('role', 'status');
  const list = document.createElement('ul');
  list.className = 'project-path-picker-list';
  list.setAttribute('aria-label', options.mode === 'file' ? 'Project files' : 'Project directories');
  navigation.append(upButton, current);
  content.append(navigation, status, list);

  function navigate(path: string): void {
    if (!isSafeProjectPickerPath(path, true)) return;
    currentPath = path;
    selectedFilePath = null;
    void render();
  }

  upButton.addEventListener('click', () => navigate(getProjectPathPickerParent(currentPath)));

  async function render(): Promise<void> {
    const version = ++renderVersion;
    current.textContent = `Current directory: ${currentPath || 'Project root'}`;
    upButton.disabled = currentPath === '';
    status.textContent = 'Loading files...';
    status.classList.remove('settings-saved-status-error');
    list.replaceChildren();
    try {
      const response = await fetch(
        `/api/projects/${options.projectId}/files?path=${encodeURIComponent(currentPath)}`,
      );
      const listing = response.ok ? parseListing(await response.json()) : null;
      if (!listing || listing.relativePath !== currentPath || version !== renderVersion) {
        throw new Error('Invalid Project files response');
      }
      status.textContent = listing.entries.length === 0 ? 'This directory is empty.' : '';
      for (const entry of listing.entries) {
        const item = document.createElement('li');
        item.className = 'project-path-picker-entry';
        const supportedFile =
          entry.type === 'file' &&
          isAllowedProjectPathPickerFile(entry.name, options.allowedExtensions);
        const selectable = entry.type === 'directory' || (options.mode === 'file' && supportedFile);
        const row = selectable ? document.createElement('button') : document.createElement('span');
        row.className = 'project-path-picker-entry-control';
        if (row instanceof HTMLButtonElement) {
          row.type = 'button';
          row.addEventListener('click', () => {
            if (entry.type === 'directory') {
              navigate(entry.relativePath);
              return;
            }
            selectedFilePath = entry.relativePath;
            list.querySelectorAll('[aria-pressed="true"]').forEach((element) => {
              element.setAttribute('aria-pressed', 'false');
            });
            row.setAttribute('aria-pressed', 'true');
            status.textContent = `Selected file: ${entry.relativePath}`;
          });
        } else {
          item.classList.add('project-path-picker-entry-disabled');
          row.setAttribute('aria-disabled', 'true');
        }
        const label = document.createElement('span');
        label.className = 'project-file-label';
        label.textContent = entry.name;
        row.append(createEntryIcon(entry.type), label);
        item.appendChild(row);
        list.appendChild(item);
      }
    } catch {
      if (version === renderVersion) {
        status.textContent = 'Failed to load Project files.';
        status.classList.add('settings-saved-status-error');
      }
    }
  }

  const modal = createConfirmationModal({
    title: options.mode === 'file' ? 'Select Project file' : 'Select Project directory',
    message: '',
    content,
    confirmLabel: options.mode === 'file' ? 'Select file' : 'Use this directory',
    cancelLabel: 'Cancel',
    returnFocusTo: options.returnFocusTo,
    canCloseAfterConfirm: () => selectionComplete,
    onCancel: () => undefined,
    onConfirm: () => {
      const selection = options.mode === 'directory' ? currentPath : selectedFilePath;
      if (selection === null) {
        status.textContent = 'Select a supported file.';
        status.classList.add('settings-saved-status-error');
        return;
      }
      options.onSelect(selection);
      selectionComplete = true;
    },
  });
  modal.classList.add('project-path-picker-backdrop');
  void render();
  return modal;
}
