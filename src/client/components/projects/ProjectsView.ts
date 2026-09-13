import { createConfirmationModal } from '../ConfirmationModal.js';
import { createProjectFilesSection } from './ProjectFilesSection.js';
import { createProjectAgentsSection } from './ProjectAgentsSection.js';

export interface ClientProject {
  id: number;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

let editorId = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseProject(value: unknown): ClientProject | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    typeof value.name !== 'string' ||
    value.name.trim().length === 0 ||
    typeof value.description !== 'string' ||
    typeof value.createdAt !== 'number' ||
    !Number.isInteger(value.createdAt) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isInteger(value.updatedAt)
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function parseProjects(value: unknown): ClientProject[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const projects = value.map(parseProject);
  return projects.every((project): project is ClientProject => project !== null) ? projects : null;
}

function createField(
  id: string,
  labelText: string,
  control: HTMLInputElement | HTMLTextAreaElement,
  helpText?: string,
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'settings-form-group';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  control.id = id;
  control.className = 'settings-input';
  group.appendChild(label);
  group.appendChild(control);
  if (helpText) {
    const help = document.createElement('small');
    help.className = 'projects-field-help';
    help.textContent = helpText;
    group.appendChild(help);
  }
  return group;
}

interface ProjectsViewOptions {
  selectedProjectId?: number | null;
  onStateChange?: (projects: readonly ClientProject[], selectedProjectId: number | null) => void;
}

export function createProjectsView(options: ProjectsViewOptions = {}): HTMLElement {
  const container = document.createElement('section');
  container.className = 'projects-view-container';
  const toolbar = document.createElement('div');
  toolbar.className = 'projects-toolbar';
  const introduction = document.createElement('p');
  introduction.textContent = 'Create and manage your project workspaces.';
  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.className = 'settings-save-button';
  createButton.textContent = '+ New project';
  createButton.disabled = true;
  toolbar.appendChild(introduction);
  toolbar.appendChild(createButton);

  const status = document.createElement('p');
  status.className = 'settings-saved-status';
  status.setAttribute('role', 'status');
  status.textContent = 'Loading projects...';

  const detail = document.createElement('section');
  detail.className = 'projects-detail';
  detail.setAttribute('aria-live', 'polite');
  container.appendChild(toolbar);
  container.appendChild(status);

  let projects: ClientProject[] = [];
  let selectedProjectId: number | null = options.selectedProjectId ?? null;

  function notifyStateChange(): void {
    options.onStateChange?.(projects, selectedProjectId);
  }

  function setError(message: string): void {
    status.hidden = false;
    status.classList.add('settings-saved-status-error');
    status.setAttribute('role', 'alert');
    status.textContent = message;
  }

  function clearStatus(): void {
    status.hidden = true;
    status.classList.remove('settings-saved-status-error');
    status.setAttribute('role', 'status');
    status.textContent = '';
  }

  function getSelectedProject(): ClientProject | null {
    return projects.find((project) => project.id === selectedProjectId) ?? null;
  }

  function renderDetail(): void {
    detail.replaceChildren();
    detail.remove();
    const project = getSelectedProject();
    if (!project) {
      return;
    }

    const heading = document.createElement('h2');
    heading.textContent = project.name;
    const description = document.createElement('p');
    description.className = 'projects-description';
    description.textContent = project.description || 'No description.';
    const actions = document.createElement('div');
    actions.className = 'projects-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'settings-test-button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => openEditor(project));
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'settings-delete-button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => requestDelete(project, deleteButton));
    actions.appendChild(editButton);
    actions.appendChild(deleteButton);
    detail.appendChild(heading);
    detail.appendChild(description);
    detail.appendChild(actions);
    detail.appendChild(createProjectFilesSection(project.id));
    detail.appendChild(createProjectAgentsSection(project.id));
    container.appendChild(detail);
  }

  async function openProject(projectId: number): Promise<void> {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      const project = response.ok ? parseProject(await response.json()) : null;
      if (!project || project.id !== projectId) {
        throw new Error('Invalid project response');
      }
      projects = projects.map((item) => (item.id === project.id ? project : item));
      selectedProjectId = project.id;
      clearStatus();
      renderDetail();
      notifyStateChange();
    } catch {
      setError('Failed to open project.');
    }
  }

  function requestDelete(project: ClientProject, returnFocusTo: HTMLButtonElement): void {
    let deleted = false;
    const modal = createConfirmationModal({
      title: 'Delete project?',
      message: `"${project.name}" and its project directory will be permanently deleted.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
      returnFocusTo,
      canCloseAfterConfirm: () => deleted,
      onCancel: () => undefined,
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
          if (!response.ok) {
            throw new Error('Delete failed');
          }
          projects = projects.filter((item) => item.id !== project.id);
          if (selectedProjectId === project.id) {
            selectedProjectId = null;
          }
          deleted = true;
          clearStatus();
          renderDetail();
          notifyStateChange();
        } catch {
          setError('Failed to delete project.');
        }
      },
    });
    container.appendChild(modal);
  }

  function openEditor(project?: ClientProject): void {
    const id = ++editorId;
    const form = document.createElement('form');
    form.className = 'projects-editor';
    form.addEventListener('submit', (event) => event.preventDefault());
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.required = true;
    nameInput.maxLength = 120;
    nameInput.value = project?.name ?? '';
    nameInput.placeholder = 'Project name';
    const descriptionInput = document.createElement('textarea');
    descriptionInput.rows = 6;
    descriptionInput.maxLength = 2000;
    descriptionInput.value = project?.description ?? '';
    form.appendChild(createField(`project-name-${id}`, 'Name', nameInput));
    descriptionInput.placeholder = 'Optional project description';
    form.appendChild(
      createField(`project-description-${id}`, 'Description', descriptionInput, 'Optional'),
    );
    const editorError = document.createElement('p');
    editorError.className = 'settings-saved-status settings-saved-status-error';
    editorError.setAttribute('role', 'alert');
    form.appendChild(editorError);

    let saved = false;
    const modal = createConfirmationModal({
      title: project ? 'Edit project' : 'New project',
      message: '',
      content: form,
      confirmLabel: 'Save',
      cancelLabel: 'Cancel',
      returnFocusTo: project ? undefined : createButton,
      canCloseAfterConfirm: () => saved,
      onCancel: () => undefined,
      onConfirm: async () => {
        editorError.textContent = '';
        if (!form.reportValidity()) {
          return;
        }
        const payload = {
          name: nameInput.value.trim(),
          description: descriptionInput.value.trim(),
        };
        try {
          const response = await fetch(project ? `/api/projects/${project.id}` : '/api/projects', {
            method: project ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const persisted = response.ok ? parseProject(await response.json()) : null;
          if (!persisted) {
            throw new Error('Save failed');
          }
          projects = project
            ? projects.map((item) => (item.id === persisted.id ? persisted : item))
            : [persisted, ...projects];
          selectedProjectId = persisted.id;
          saved = true;
          clearStatus();
          renderDetail();
          notifyStateChange();
        } catch {
          editorError.textContent = 'Failed to save project. Check the fields and try again.';
        }
      },
    });
    container.appendChild(modal);
  }

  async function load(): Promise<void> {
    try {
      const response = await fetch('/api/projects');
      const loaded = response.ok ? parseProjects(await response.json()) : null;
      if (!loaded) {
        throw new Error('Invalid projects response');
      }
      projects = loaded;
      if (!projects.some((project) => project.id === selectedProjectId)) {
        selectedProjectId = null;
      }
      createButton.disabled = false;
      clearStatus();
      if (selectedProjectId === null) {
        renderDetail();
        notifyStateChange();
      } else {
        await openProject(selectedProjectId);
      }
    } catch {
      setError('Failed to load projects.');
      renderDetail();
    }
  }

  createButton.addEventListener('click', () => openEditor());
  renderDetail();
  void load();
  return container;
}
