import { createConfirmationModal } from '../ConfirmationModal.js';

interface ClientSkill {
  id: number;
  commandName: string;
  name: string;
  markdown: string;
  requiredTools: string[];
  createdAt: number;
  updatedAt: number;
}

interface ClientTool {
  name: string;
  displayName: string;
}

let editorId = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSkill(value: unknown): ClientSkill | null {
  if (!isRecord(value) || !Array.isArray(value.requiredTools)) {
    return null;
  }
  if (
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    typeof value.commandName !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.markdown !== 'string' ||
    typeof value.createdAt !== 'number' ||
    !Number.isInteger(value.createdAt) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isInteger(value.updatedAt) ||
    !value.requiredTools.every((toolName) => typeof toolName === 'string')
  ) {
    return null;
  }
  return {
    id: value.id,
    commandName: value.commandName,
    name: value.name,
    markdown: value.markdown,
    requiredTools: value.requiredTools as string[],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseSkills(value: unknown): ClientSkill[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const skills = value.map(parseSkill);
  return skills.every((skill): skill is ClientSkill => skill !== null) ? skills : null;
}

function parseTools(value: unknown): ClientTool[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const tools: ClientTool[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.displayName !== 'string') {
      return null;
    }
    tools.push({ name: item.name, displayName: item.displayName });
  }
  return tools;
}

function createField(
  id: string,
  labelText: string,
  control: HTMLInputElement | HTMLTextAreaElement,
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
  return group;
}

export function createSkillsView(): HTMLElement {
  const container = document.createElement('section');
  container.className = 'skills-view-container';
  const toolbar = document.createElement('div');
  toolbar.className = 'skills-toolbar';
  const introduction = document.createElement('p');
  introduction.textContent = 'Manage reusable Skill instructions and their required tools.';
  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.className = 'settings-save-button';
  createButton.textContent = 'Create Skill';
  createButton.disabled = true;
  toolbar.appendChild(introduction);
  toolbar.appendChild(createButton);

  const status = document.createElement('p');
  status.className = 'settings-saved-status';
  status.setAttribute('role', 'status');
  status.textContent = 'Loading Skills...';
  const list = document.createElement('ul');
  list.className = 'skills-list';
  list.setAttribute('aria-label', 'Skills');
  container.appendChild(toolbar);
  container.appendChild(status);
  container.appendChild(list);

  let skills: ClientSkill[] = [];
  let tools: ClientTool[] = [];

  function setError(message: string): void {
    status.classList.add('settings-saved-status-error');
    status.setAttribute('role', 'alert');
    status.textContent = message;
  }

  function clearStatus(): void {
    status.classList.remove('settings-saved-status-error');
    status.setAttribute('role', 'status');
    status.textContent = '';
  }

  function requestDelete(skill: ClientSkill, returnFocusTo: HTMLButtonElement): void {
    let deleted = false;
    const modal = createConfirmationModal({
      title: 'Delete Skill?',
      message: `"${skill.name}" and its Markdown instructions will be permanently deleted.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
      returnFocusTo,
      canCloseAfterConfirm: () => deleted,
      onCancel: () => undefined,
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/admin/skills/${skill.id}`, { method: 'DELETE' });
          if (!response.ok) {
            throw new Error('Delete failed');
          }
          skills = skills.filter((item) => item.id !== skill.id);
          deleted = true;
          clearStatus();
          renderList();
        } catch {
          setError('Failed to delete Skill.');
        }
      },
    });
    container.appendChild(modal);
  }

  function openEditor(skill?: ClientSkill): void {
    const id = ++editorId;
    const form = document.createElement('form');
    form.className = 'skills-editor';
    form.addEventListener('submit', (event) => event.preventDefault());
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.required = true;
    nameInput.maxLength = 120;
    nameInput.value = skill?.name ?? '';
    const commandInput = document.createElement('input');
    commandInput.type = 'text';
    commandInput.required = true;
    commandInput.maxLength = 64;
    commandInput.pattern = '[a-z][a-z0-9_-]*';
    commandInput.placeholder = 'example-command';
    commandInput.value = skill?.commandName ?? '';
    const markdownInput = document.createElement('textarea');
    markdownInput.required = true;
    markdownInput.rows = 12;
    markdownInput.value = skill?.markdown ?? '';

    form.appendChild(createField(`skill-name-${id}`, 'Name', nameInput));
    form.appendChild(createField(`skill-command-${id}`, 'Command name', commandInput));
    form.appendChild(createField(`skill-markdown-${id}`, 'Markdown', markdownInput));

    const toolFieldset = document.createElement('fieldset');
    toolFieldset.className = 'skills-tool-fieldset';
    const legend = document.createElement('legend');
    legend.textContent = 'Required tools';
    toolFieldset.appendChild(legend);
    const toolInputs = new Map<string, HTMLInputElement>();
    for (const tool of tools) {
      const option = document.createElement('label');
      option.className = 'skills-tool-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = tool.name;
      checkbox.checked = skill?.requiredTools.includes(tool.name) ?? false;
      toolInputs.set(tool.name, checkbox);
      const labelText = document.createElement('span');
      labelText.textContent = `${tool.displayName} (${tool.name})`;
      option.appendChild(checkbox);
      option.appendChild(labelText);
      toolFieldset.appendChild(option);
    }
    form.appendChild(toolFieldset);
    const editorError = document.createElement('p');
    editorError.className = 'settings-saved-status settings-saved-status-error';
    editorError.setAttribute('role', 'alert');
    form.appendChild(editorError);

    let saved = false;
    const modal = createConfirmationModal({
      title: skill ? 'Edit Skill' : 'Create Skill',
      message: '',
      content: form,
      confirmLabel: 'Save',
      cancelLabel: 'Cancel',
      returnFocusTo: skill ? undefined : createButton,
      canCloseAfterConfirm: () => saved,
      onCancel: () => undefined,
      onConfirm: async () => {
        editorError.textContent = '';
        if (!form.reportValidity()) {
          return;
        }
        const payload = {
          name: nameInput.value.trim(),
          commandName: commandInput.value,
          markdown: markdownInput.value,
          requiredTools: [...toolInputs]
            .filter(([, checkbox]) => checkbox.checked)
            .map(([toolName]) => toolName),
        };
        try {
          const response = await fetch(
            skill ? `/api/admin/skills/${skill.id}` : '/api/admin/skills',
            {
              method: skill ? 'PUT' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            },
          );
          const persisted = response.ok ? parseSkill(await response.json()) : null;
          if (!persisted) {
            throw new Error('Save failed');
          }
          skills = skill
            ? skills.map((item) => (item.id === persisted.id ? persisted : item))
            : [...skills, persisted];
          saved = true;
          clearStatus();
          renderList();
        } catch {
          editorError.textContent = 'Failed to save Skill. Check the command name and fields.';
        }
      },
    });
    container.appendChild(modal);
  }

  function renderList(): void {
    list.replaceChildren();
    if (skills.length === 0) {
      status.textContent = 'No Skills have been created.';
      return;
    }
    for (const skill of skills) {
      const item = document.createElement('li');
      item.className = 'skills-list-item';
      const details = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = skill.name;
      const command = document.createElement('code');
      command.textContent = `/${skill.commandName}`;
      const requiredTools = document.createElement('p');
      requiredTools.textContent = skill.requiredTools.length
        ? `Required tools: ${skill.requiredTools.join(', ')}`
        : 'Required tools: none';
      details.appendChild(name);
      details.appendChild(command);
      details.appendChild(requiredTools);

      const actions = document.createElement('div');
      actions.className = 'skills-list-actions';
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'settings-test-button';
      editButton.textContent = 'Edit';
      editButton.addEventListener('click', () => openEditor(skill));
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'settings-delete-button';
      deleteButton.textContent = 'Delete';
      deleteButton.addEventListener('click', () => requestDelete(skill, deleteButton));
      actions.appendChild(editButton);
      actions.appendChild(deleteButton);
      item.appendChild(details);
      item.appendChild(actions);
      list.appendChild(item);
    }
  }

  async function load(): Promise<void> {
    try {
      const [skillsResponse, toolsResponse] = await Promise.all([
        fetch('/api/admin/skills'),
        fetch('/api/tools'),
      ]);
      const loadedSkills = skillsResponse.ok ? parseSkills(await skillsResponse.json()) : null;
      const loadedTools = toolsResponse.ok ? parseTools(await toolsResponse.json()) : null;
      if (!loadedSkills || !loadedTools) {
        throw new Error('Invalid response');
      }
      skills = loadedSkills;
      tools = loadedTools;
      createButton.disabled = false;
      clearStatus();
      renderList();
    } catch {
      setError('Failed to load Skills.');
    }
  }

  createButton.addEventListener('click', () => openEditor());
  void load();
  return container;
}
