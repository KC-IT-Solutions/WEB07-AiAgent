import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatProjectFileModifiedAt,
  getFileMoveUpDestination,
} from '../../src/client/components/projects/ProjectFilesSection.js';
import {
  formatAgentCompletedAt,
  getAgentCompletionTimestamp,
} from '../../src/client/components/projects/ProjectAgentsSection.js';
import {
  getProjectPathPickerParent,
  isAllowedProjectPathPickerFile,
  isSafeProjectPickerPath,
} from '../../src/client/components/projects/ProjectPathPicker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
assert.ok(projectRoot);
const layout = readFileSync(resolve(projectRoot, 'src/client/components/layout.ts'), 'utf8');
const view = readFileSync(
  resolve(projectRoot, 'src/client/components/projects/ProjectsView.ts'),
  'utf8',
);
const filesView = readFileSync(
  resolve(projectRoot, 'src/client/components/projects/ProjectFilesSection.ts'),
  'utf8',
);
const agentsView = readFileSync(
  resolve(projectRoot, 'src/client/components/projects/ProjectAgentsSection.ts'),
  'utf8',
);
const confirmationModalView = readFileSync(
  resolve(projectRoot, 'src/client/components/ConfirmationModal.ts'),
  'utf8',
);
const pathPickerView = readFileSync(
  resolve(projectRoot, 'src/client/components/projects/ProjectPathPicker.ts'),
  'utf8',
);
const css = readFileSync(
  resolve(projectRoot, 'src/client/components/projects/projects.css'),
  'utf8',
);
const settingsCss = readFileSync(
  resolve(projectRoot, 'src/client/components/settings/settings.css'),
  'utf8',
);
const chatCss = readFileSync(resolve(projectRoot, 'src/client/components/chat/chat.css'), 'utf8');

await describe('Projects UI', () => {
  it('shows Projects to every user while preserving existing navigation gating', () => {
    assert.ok(layout.includes("projectsNavLink.textContent = 'Projects'"));
    assert.ok(layout.includes("navItems.set('projects', projectsNavLink)"));
    assert.ok(layout.includes("switchView('projects', true)"));
    assert.ok(!layout.includes('projectsNavItem.hidden'));
    assert.ok(layout.includes("chatNavLink.textContent = 'Chat'"));
    assert.ok(layout.includes("settingsNavLink.textContent = 'Settings'"));
    assert.ok(layout.includes('adminSettingsNavItem.hidden = true'));
    assert.ok(layout.includes('skillsNavItem.hidden = true'));
    assert.ok(layout.includes('adminSettingsNavItem.hidden = false'));
    assert.ok(layout.includes('skillsNavItem.hidden = false'));
  });

  it('keeps Projects navigation separate from its accessible expansion control', () => {
    assert.ok(layout.includes("projectsNavLink.href = '/projects'"));
    assert.ok(
      layout.includes("projectsSectionToggle.setAttribute('aria-label', 'Toggle projects')"),
    );
    assert.ok(layout.includes("projectsSectionToggle.setAttribute('aria-expanded', 'false')"));
    const navigation = layout.slice(
      layout.indexOf("projectsNavLink.addEventListener('click'"),
      layout.indexOf("settingsNavLink.addEventListener('click'"),
    );
    const expansion = layout.slice(
      layout.indexOf("projectsSectionToggle.addEventListener('click'"),
      layout.indexOf("chatNavLink.addEventListener('click'"),
    );
    assert.ok(navigation.includes("switchView('projects', true)"));
    assert.ok(!navigation.includes('isProjectsSectionExpanded = !isProjectsSectionExpanded'));
    assert.ok(expansion.includes('isProjectsSectionExpanded = !isProjectsSectionExpanded'));
    assert.ok(expansion.includes('projectsListPanel.hidden = !isProjectsSectionExpanded'));
    assert.ok(!expansion.includes("switchView('projects'"));
  });

  it('loads compact project-name-only sidebar controls and handles loading, empty, and failure states', () => {
    const sidebarRender = layout.slice(
      layout.indexOf('function renderProjectsList'),
      layout.indexOf('async function loadProjects'),
    );
    assert.ok(layout.includes("fetch('/api/projects')"));
    assert.ok(sidebarRender.includes('button.textContent = project.name'));
    assert.ok(sidebarRender.includes("projectsListStatus.textContent = 'No projects'"));
    assert.ok(sidebarRender.includes("projectsListStatus.textContent = 'Projects unavailable.'"));
    assert.ok(!sidebarRender.includes('project.description'));
    assert.ok(!sidebarRender.includes('project.path'));
    assert.ok(!sidebarRender.includes('createProjectFilesSection'));
    assert.ok(chatCss.includes('.projects-sidebar-button'));
  });

  it('opens sidebar projects in the existing Projects view and marks the selection active', () => {
    const sidebarRender = layout.slice(
      layout.indexOf('function renderProjectsList'),
      layout.indexOf('async function loadProjects'),
    );
    assert.ok(sidebarRender.includes('activeProjectId = project.id'));
    assert.ok(sidebarRender.includes("switchView('projects', true)"));
    assert.ok(sidebarRender.includes('projects-sidebar-button-active'));
    assert.ok(layout.includes('selectedProjectId: activeProjectId'));
    assert.ok(view.includes('await openProject(selectedProjectId)'));
    assert.ok(view.includes('fetch(`/api/projects/${projectId}`)'));
  });

  it('synchronizes sidebar names after project load, create, rename, and delete', () => {
    assert.ok(layout.includes('onStateChange: updateProjectState'));
    assert.ok(view.includes('options.onStateChange?.(projects, selectedProjectId)'));
    assert.ok(view.includes(': [persisted, ...projects]'));
    assert.ok(
      view.includes('projects.map((item) => (item.id === persisted.id ? persisted : item))'),
    );
    assert.ok(view.includes('projects = projects.filter((item) => item.id !== project.id)'));
    assert.ok(view.includes('notifyStateChange();'));
  });

  it('preserves Chat expansion and Settings, Admin Settings, and Skills navigation', () => {
    assert.ok(layout.includes('isChatSectionExpanded = !isChatSectionExpanded'));
    assert.ok(layout.includes('chatListPanel.hidden = !isChatSectionExpanded'));
    assert.ok(layout.includes("switchView('settings')"));
    assert.ok(layout.includes("switchView('admin-settings')"));
    assert.ok(layout.includes("switchView('skills')"));
  });

  it('keeps the compact Projects header and selected detail without the redundant list or placeholder', () => {
    assert.ok(view.includes("createButton.textContent = '+ New project'"));
    assert.ok(
      view.includes("introduction.textContent = 'Create and manage your project workspaces.'"),
    );
    assert.ok(!view.includes("'My projects'"));
    assert.ok(!view.includes('Select a project to view its details.'));
    assert.ok(!view.includes("className = 'projects-content'"));
    assert.ok(view.includes('if (!project) {\n      return;'));
    assert.ok(view.includes("'Name', nameInput"));
    assert.ok(view.includes("'Description', descriptionInput"));
    assert.ok(view.includes('heading.textContent = project.name'));
    assert.ok(view.includes("description.textContent = project.description || 'No description.'"));
    assert.ok(view.includes('createProjectFilesSection(project.id)'));
    assert.ok(filesView.includes("heading.textContent = 'Files'"));
    assert.ok(view.includes('createProjectAgentsSection(project.id)'));
  });

  it('renders Project Agents CRUD with model, Skill, tool, and permission settings', () => {
    assert.ok(agentsView.includes("heading.textContent = 'Agents'"));
    assert.ok(agentsView.includes("createButton.textContent = '+ New agent'"));
    assert.ok(agentsView.includes("setStatus('No agents yet.')"));
    assert.ok(agentsView.includes("'Name', nameInput"));
    assert.ok(agentsView.includes("'Description', descriptionInput"));
    assert.ok(agentsView.includes("instructionSourceLegend.textContent = 'Instructions'"));
    assert.ok(agentsView.includes("'Task / Assignment'"));
    assert.ok(agentsView.includes("assignmentInput.placeholder = 'Describe what this Agent should do when started.'"));
    assert.ok(agentsView.includes("'Model connection', connectionSelect"));
    assert.ok(agentsView.includes("'Model', modelSelect"));
    assert.ok(agentsView.includes("permissionLabel.textContent = 'Allow agent to choose model'"));
    assert.ok(agentsView.includes('agent?.allowModelSelection ?? false'));
    assert.ok(agentsView.includes("assignmentInput.value = agent?.assignment ?? ''"));
    assert.ok(agentsView.includes("'Skills'"));
    assert.ok(agentsView.includes("'Model tool access'"));
    assert.ok(agentsView.includes('Allow model to use this tool'));
    assert.ok(agentsView.includes("preRunHeading.textContent = 'Tool pre-run input files'"));
    assert.ok(agentsView.includes('ordered JSON array of argument objects'));
    assert.ok(agentsView.includes("allowedExtensions: ['.json']"));
    assert.ok(agentsView.includes('configuration.preRunInputFile'));
    assert.ok(agentsView.includes('preRunInputFile: preRunFiles.get(toolName)!.value.trim() || null'));
    assert.ok(agentsView.includes("clearButton.textContent = 'None'"));
    assert.ok(!agentsView.includes('controls.hidden = !enabledInput.checked'));
    assert.ok(
      agentsView.includes('input.checked ||') &&
        agentsView.includes('preRunFiles.get(toolName)!.value.trim().length > 0'),
    );
    const clearHandler = agentsView.slice(
      agentsView.indexOf("clearButton.addEventListener('click'"),
      agentsView.indexOf('preRunFiles.set(tool.name, input)'),
    );
    assert.ok(clearHandler.includes("input.value = ''"));
    assert.ok(!clearHandler.includes('.checked'));
  });

  it('configures Agent Runner through an accessible tool-specific settings dialog', () => {
    assert.ok(agentsView.includes("const AGENT_RUNNER_TOOL_NAME = 'run_agent'"));
    assert.ok(agentsView.includes("runnerSettingsButton.textContent = '...'"));
    assert.ok(agentsView.includes("runnerSettingsButton.setAttribute('aria-label', 'Configure Agent Runner')"));
    assert.ok(agentsView.includes("runnerSettingsButton.setAttribute('aria-haspopup', 'dialog')"));
    assert.ok(agentsView.includes("title: 'Agent Runner settings'"));
    assert.ok(agentsView.includes("'Target agent', targetSelect"));
    assert.ok(agentsView.includes('agents.filter((candidate) => candidate.id !== currentAgentId)'));
    assert.ok(agentsView.includes('(unavailable)'));
    assert.ok(agentsView.includes('targetSelect.value = selectedTargetAgentId === null'));
    assert.ok(agentsView.includes('runnerSettingsButton,'));
    assert.ok(agentsView.includes('runnerEnabled && !runnerTargetAvailable'));
    assert.ok(agentsView.includes('targetAgentId: runnerTargetAgentId'));
    assert.ok(
      agentsView.includes(
        'toolName === AGENT_RUNNER_TOOL_NAME && runnerTargetAgentId !== null',
      ),
    );
    const settingsButtonSource = agentsView.slice(
      agentsView.indexOf("runnerSettingsButton.type = 'button'"),
      agentsView.indexOf("runnerSettingsButton.addEventListener('click'"),
    );
    assert.equal(settingsButtonSource.includes('runnerEnabled'), false);
    assert.equal(settingsButtonSource.includes('runnerSettingsButton.disabled'), false);
    assert.ok(css.includes('.project-agent-tool-settings-button:focus-visible'));
    assert.ok(css.includes('.project-agent-runner-settings-backdrop'));
  });

  it('loads Agent options and models and refreshes the Project Agent list after every mutation', () => {
    assert.ok(agentsView.includes("fetch('/api/model-connections')"));
    assert.ok(agentsView.includes("fetch('/api/skills')"));
    assert.ok(agentsView.includes("fetch('/api/tools')"));
    assert.ok(agentsView.includes('fetch(`/api/model-connections/${connectionId}/models`)'));
    assert.ok(agentsView.includes('(hidden or unavailable)'));
    assert.ok(agentsView.includes('option.disabled = unavailable'));
    assert.ok(agentsView.includes("modelDescription.className = 'projects-field-help project-agent-model-description'"));
    assert.ok(agentsView.includes("modelDescription.textContent = modelSelect.selectedOptions[0]?.dataset.description ?? ''"));
    assert.ok(agentsView.includes('description: model.description'));
    assert.ok(!agentsView.includes('modelDescription: modelDescription.textContent'));
    assert.ok(agentsView.includes('`/api/projects/${projectId}/agents`'));
    assert.ok(agentsView.includes('`/api/projects/${projectId}/agents/${agent.id}`'));
    assert.ok(agentsView.includes("method: agent ? 'PUT' : 'POST'"));
    assert.ok(agentsView.includes("{ method: 'DELETE' }"));
    assert.ok((agentsView.match(/await loadAgents\(\)/g) ?? []).length >= 2);
  });

  it('copies persisted Agents from the overflow menu and refreshes the authoritative list', () => {
    assert.equal((agentsView.match(/textContent = 'Copy agent'/g) ?? []).length, 1);
    const menuSource = agentsView.slice(
      agentsView.indexOf("copyMenuItem.textContent = 'Copy agent'"),
      agentsView.indexOf('const executionMenuItem'),
    );
    assert.ok(menuSource.includes("copyMenuItem.setAttribute('role', 'menuitem')"));
    assert.ok(menuSource.includes('void copyAgent(agent)'));

    const copySource = agentsView.slice(
      agentsView.indexOf('async function copyAgent('),
      agentsView.indexOf('async function performRunAction('),
    );
    assert.ok(copySource.includes('`/api/projects/${projectId}/agents/${agent.id}/copy`'));
    assert.ok(copySource.includes("method: 'POST'"));
    assert.ok(copySource.includes('parseAgent(await response.json(), projectId)'));
    assert.ok(copySource.includes('await loadAgents()'));
    assert.ok(!copySource.includes('createConfirmationModal'));
    assert.ok(!copySource.includes('JSON.stringify'));
  });

  it('opens existing Agents for edit and confirms settings deletion without touching Project files', () => {
    assert.ok(agentsView.includes('openEditor(agent)'));
    assert.ok(agentsView.includes("title: agent ? 'Edit agent' : 'New agent'"));
    assert.ok(agentsView.includes('if (agent) {'));
    assert.ok(agentsView.includes("dangerHeading.textContent = 'Danger zone'"));
    assert.ok(agentsView.includes("deleteButton.textContent = 'Delete agent'"));
    assert.ok(agentsView.includes('advancedPanel.appendChild(dangerZone)'));
    assert.ok(agentsView.includes('content: form'));
    assert.ok(
      confirmationModalView.indexOf('dialog.appendChild(options.content)') <
        confirmationModalView.indexOf('dialog.appendChild(actions)'),
    );
    assert.ok(agentsView.includes("title: 'Delete agent?'"));
    assert.ok(agentsView.includes('destructive: true'));
    assert.ok(agentsView.includes('Project files will not be changed.'));
    assert.ok(agentsView.includes("{ method: 'DELETE' }"));
    assert.ok(agentsView.includes('await loadAgents()'));
    assert.ok(agentsView.includes('requestDelete(agent, deleteButton, () => modal.remove())'));
    assert.ok(agentsView.includes("deleteError.textContent = 'Failed to delete Agent."));
    assert.ok(!agentsView.includes('innerHTML'));
    assert.ok(view.includes('createProjectFilesSection(project.id)'));
  });

  it('keeps Agent deletion out of the overview and blocks it for active settings', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns'),
    );
    assert.ok(!renderSource.includes("deleteButton.textContent = 'Delete'"));
    assert.ok(!renderSource.includes('settings-delete-button'));
    assert.ok(agentsView.includes("runStatus === 'running' || runStatus === 'paused'"));
    assert.ok(agentsView.includes('deleteButton.disabled = deleteBlocked'));
    assert.ok(
      agentsView.includes(
        "activeRunHelp.textContent = 'Stop or cancel the active run before deleting this Agent.'",
      ),
    );
    assert.ok(agentsView.includes("confirmLabel: 'Save'"));
    assert.ok(agentsView.includes("cancelLabel: 'Cancel'"));
  });

  it('keeps Agent modal controls readable, contained, responsive, and keyboard accessible', () => {
    assert.ok(css.includes('.project-agent-editor .settings-input'));
    assert.ok(css.includes('.project-agent-editor label'));
    assert.ok(css.includes('.project-agent-editor legend'));
    assert.ok(css.includes('.project-agent-editor .settings-saved-status-error'));
    assert.ok(css.includes('.project-agent-check-option'));
    assert.ok(css.includes('.project-agent-editor {'));
    assert.ok(css.includes('max-width: 100%'));
    assert.ok(css.includes('@media (max-width: 760px)'));
    assert.ok(agentsView.includes("input.type = 'checkbox'"));
    assert.ok(agentsView.includes('label.htmlFor = id'));
    assert.ok(css.includes('.project-agent-modal-backdrop .confirmation-modal'));
    assert.ok(css.includes('width: min(50rem, calc(100vw - 2rem))'));
    assert.ok(agentsView.includes("modal.classList.add('project-agent-modal-backdrop')"));
    assert.ok(agentsView.includes("title: agent ? 'Edit agent' : 'New agent'"));
  });

  it('validates persisted Agent order and renders responsive info, status, and action regions', () => {
    const parserSource = agentsView.slice(
      agentsView.indexOf('function parseAgent('),
      agentsView.indexOf('function parseAgents('),
    );
    assert.ok(parserSource.includes('Number.isSafeInteger(value.sortOrder)'));
    assert.ok(parserSource.includes('Number(value.sortOrder) < 0'));
    assert.ok(parserSource.includes('sortOrder: Number(value.sortOrder)'));

    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('function clearDropIndicators(): void'),
    );
    assert.ok(renderSource.includes("info.className = 'project-agent-info'"));
    assert.ok(renderSource.includes("statusRegion.className = 'project-agent-status-region'"));
    assert.ok(renderSource.includes("actions.className = 'project-agent-actions'"));
    assert.ok(renderSource.includes('item.append(info, statusRegion, actions)'));
    assert.ok(renderSource.includes('statusRegion.appendChild(errorStatus)'));
    assert.ok(renderSource.includes('statusRegion.appendChild(statusBadge)'));
    assert.ok(!renderSource.includes('agentHeader.append(openButton, statusBadge)'));
    assert.ok(css.includes("grid-template-areas: 'info status actions'"));
    assert.ok(css.includes('grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)'));
    assert.ok(css.includes('grid-area: status'));
    assert.ok(css.includes('justify-self: center'));
    assert.ok(css.includes("'info'\n      'status'\n      'actions'"));
  });

  it('uses a dedicated accessible SVG handle for safe vertical Agent drag and drop', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('function clearDropIndicators(): void'),
    );
    assert.ok(renderSource.includes("dragHandle.type = 'button'"));
    assert.ok(renderSource.includes("dragHandle.className = 'project-agent-drag-handle'"));
    assert.ok(renderSource.includes('dragHandle.draggable = !reorderInFlight'));
    assert.ok(renderSource.includes('dragHandle.disabled = reorderInFlight'));
    assert.ok(
      renderSource.includes("dragHandle.setAttribute('aria-label', `Reorder ${agent.name}`)"),
    );
    assert.ok(
      renderSource.includes("document.createElementNS('http://www.w3.org/2000/svg', 'svg')"),
    );
    assert.ok(
      renderSource.includes("document.createElementNS('http://www.w3.org/2000/svg', 'circle')"),
    );
    assert.ok(renderSource.includes("dragIcon.setAttribute('aria-hidden', 'true')"));
    assert.ok(renderSource.includes("dragHandle.addEventListener('dragstart'"));
    assert.ok(renderSource.includes("dragHandle.addEventListener('dragend'"));
    assert.ok(renderSource.includes("item.addEventListener('dragover'"));
    assert.ok(renderSource.includes('item.getBoundingClientRect().top + item.offsetHeight / 2'));
    assert.ok(renderSource.includes("item.addEventListener('drop'"));
    assert.ok(renderSource.includes("'project-agent-row-drop-before'"));
    assert.ok(renderSource.includes("'project-agent-row-drop-after'"));
    assert.ok(!renderSource.includes('item.draggable ='));
    assert.ok(css.includes('.project-agent-drag-handle'));
    assert.ok(css.includes('.project-agent-row-dragging'));
    assert.ok(css.includes('.project-agent-row-drop-before'));
    assert.ok(css.includes('.project-agent-row-drop-after'));
  });

  it('persists complete keyboard or pointer Agent reorders and restores authoritative state on failure', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('function clearDropIndicators(): void'),
    );
    assert.ok(renderSource.includes("dragHandle.addEventListener('keydown'"));
    assert.ok(renderSource.includes("event.key !== 'ArrowUp' && event.key !== 'ArrowDown'"));
    assert.ok(renderSource.includes('if (!event.altKey'));
    assert.ok(renderSource.includes('event.preventDefault()'));
    assert.ok(renderSource.includes("event.key === 'ArrowDown'"));

    const reorderSource = agentsView.slice(
      agentsView.indexOf('async function moveAgent('),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(reorderSource.includes('if (reorderInFlight) return'));
    assert.ok(reorderSource.includes('const previous = [...agents]'));
    assert.ok(reorderSource.includes('agents = reordered'));
    assert.ok(reorderSource.includes('reorderInFlight = true'));
    assert.ok(reorderSource.includes('`/api/projects/${projectId}/agents/order`'));
    assert.ok(reorderSource.includes("method: 'PUT'"));
    assert.ok(reorderSource.includes('agentIds: reordered.map((agent) => agent.id)'));
    assert.ok(reorderSource.includes('parseAgents(await response.json(), projectId)'));
    assert.ok(reorderSource.includes('agents = persisted'));
    assert.ok(reorderSource.includes('await loadAgents()'));
    assert.ok(reorderSource.includes('agents = previous'));
    assert.ok(reorderSource.includes('The saved order was restored.'));
    assert.ok(agentsView.includes('if (draggedAgentId === null) render()'));
  });

  it('renders persistent Agent run states, lifecycle controls, safe logs, and cleaned polling', () => {
    assert.ok(agentsView.includes("const runStatus = run?.status ?? 'idle'"));
    assert.ok(!agentsView.includes("statusLabel.textContent = 'Status: '"));
    assert.ok(agentsView.includes("agentHeader.className = 'project-agent-heading'"));
    assert.ok(agentsView.includes("statusRegion.className = 'project-agent-status-region'"));
    assert.ok(agentsView.includes('statusRegion.appendChild(statusBadge)'));
    assert.ok(agentsView.includes('statusBadge.textContent = runStatus.toUpperCase()'));
    for (const statusName of ['idle', 'running', 'paused', 'done', 'error', 'cancelled']) {
      assert.ok(css.includes(`.project-agent-status-${statusName}`));
    }
    // Visible action buttons: Start, Pause, Resume, Cancel
    for (const action of ['Start', 'Pause', 'Resume', 'Cancel']) {
      assert.ok(agentsView.includes(`addAction('${action}'`));
    }
    // Overflow menu actions: Execution, Run log, Error log
    for (const overflowAction of ['Execution', 'Run log', 'Error log']) {
      assert.ok(agentsView.includes(`textContent = '${overflowAction}'`));
    }
    assert.ok(agentsView.includes("errorStatus.type = 'button'"));
    assert.ok(agentsView.includes("errorStatus.textContent = 'ERROR'"));
    assert.ok(
      agentsView.includes("errorStatus.setAttribute('aria-label', 'View Agent error details')"),
    );
    assert.ok(agentsView.includes("statusBadge = document.createElement('span')"));
    assert.ok(agentsView.includes('openError(run, errorStatus)'));
    assert.ok(agentsView.includes("appendReadModal('Agent error'"));
    assert.ok(!agentsView.includes("title: 'Run Agent'"));
    assert.ok(!agentsView.includes('taskInput'));
    const startSource = agentsView.slice(
      agentsView.indexOf('async function startAgent('),
      agentsView.indexOf('async function performRunAction('),
    );
    assert.ok(startSource.includes('/runs`'));
    assert.ok(startSource.includes("method: 'POST'"));
    assert.ok(!startSource.includes('body:'));
    assert.ok(agentsView.includes("agent.assignmentSource === 'file'"));
    assert.ok(agentsView.includes('agent.assignmentFilePath.trim().length === 0'));
    assert.ok(agentsView.includes('agent.assignment.trim().length === 0'));
    assert.ok(agentsView.includes('/runs/latest'));
    assert.ok(agentsView.includes('/events`'));
    assert.ok(agentsView.includes('/errors`'));
    assert.ok(agentsView.includes('setTimeout(async () =>'));
    assert.ok(agentsView.includes('}, 1500)'));
    assert.ok(agentsView.includes('new MutationObserver'));
    assert.ok(agentsView.includes('clearTimeout(pollTimer)'));
    assert.ok(css.includes('.project-agent-status-badge'));
    assert.ok(css.includes('button.project-agent-status-error:focus-visible'));
    assert.ok(css.includes('.project-agent-heading'));
    assert.ok(css.includes('.project-agent-run-log'));
    assert.ok(css.includes('.project-agent-error-log'));
    assert.ok(!agentsView.includes('innerHTML'));
  });

  it('formats terminal latest-run completion timestamps in deterministic client-local time', () => {
    const completedAt = Math.floor(new Date(2026, 8, 12, 22, 43, 57).getTime() / 1000);
    assert.equal(formatAgentCompletedAt(completedAt), '2026-09-12 22:43');
    assert.equal(getAgentCompletionTimestamp('done', completedAt), '2026-09-12 22:43');
    assert.equal(getAgentCompletionTimestamp('error', completedAt), '2026-09-12 22:43');
    assert.equal(getAgentCompletionTimestamp('cancelled', completedAt), '2026-09-12 22:43');
    assert.equal(formatAgentCompletedAt(Number.MAX_VALUE), null);

    const formatterSource = agentsView.slice(
      agentsView.indexOf('export function formatAgentCompletedAt('),
      agentsView.indexOf('export function getAgentCompletionTimestamp('),
    );
    for (const localField of [
      'getFullYear()',
      'getMonth()',
      'getDate()',
      'getHours()',
      'getMinutes()',
    ]) {
      assert.ok(formatterSource.includes(localField));
    }
    assert.ok(formatterSource.includes('completedAt * 1000'));
    assert.ok(!formatterSource.includes('toLocale'));
    assert.ok(!formatAgentCompletedAt(completedAt)?.includes('57'));
  });

  it('omits completion timestamps for active, absent, or incomplete latest runs', () => {
    const completedAt = Math.floor(new Date(2026, 8, 12, 22, 43).getTime() / 1000);
    assert.equal(getAgentCompletionTimestamp('running', completedAt), null);
    assert.equal(getAgentCompletionTimestamp('paused', completedAt), null);
    assert.equal(getAgentCompletionTimestamp(undefined, undefined), null);
    assert.equal(getAgentCompletionTimestamp('done', null), null);
    assert.equal(getAgentCompletionTimestamp('error', undefined), null);
  });

  it('renders latest-run completion time after status and tokens and before existing actions', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('function clearDropIndicators(): void'),
    );
    assert.ok(renderSource.includes('getAgentCompletionTimestamp(run?.status, run?.completedAt)'));
    assert.ok(renderSource.includes("completedTime.className = 'project-agent-completed-at'"));
    assert.ok(renderSource.includes('completedTime.textContent = completionTimestamp'));
    assert.ok(
      renderSource.indexOf('statusRegion.appendChild(statusBadge)') <
        renderSource.indexOf('statusRegion.appendChild(completedTime)'),
    );
    assert.ok(
      renderSource.indexOf('statusRegion.appendChild(tokensBadge)') <
        renderSource.indexOf('statusRegion.appendChild(completedTime)'),
    );
    assert.ok(
      renderSource.indexOf('statusRegion.appendChild(completedTime)') <
        renderSource.indexOf("actions.className = 'project-agent-actions'"),
    );
    assert.ok(renderSource.includes('run.latestTotalTokens !== null'));
    assert.ok(renderSource.includes('`TOKENS ${formatTokenCount(run.latestTotalTokens)}`'));
    assert.ok(renderSource.includes('statusBadge.textContent = runStatus.toUpperCase()'));
    assert.ok(renderSource.includes('item.append(info, statusRegion, actions)'));
    assert.ok(css.includes('.project-agent-completed-at'));
    assert.ok(css.includes('white-space: nowrap'));
  });

  it('keeps completion timestamps on the existing latest-run polling flow', () => {
    const pollingSource = agentsView.slice(
      agentsView.indexOf('async function loadLatestRuns()'),
      agentsView.indexOf('async function loadEditorOptions()'),
    );
    assert.ok(pollingSource.includes('/runs/latest'));
    assert.ok(pollingSource.includes('latestRuns.set(agentId, run)'));
    assert.ok(pollingSource.includes('await loadLatestRuns()'));
    assert.ok(pollingSource.includes('if (draggedAgentId === null) render()'));
    assert.equal((pollingSource.match(/setTimeout/g) ?? []).length, 1);
    assert.ok(pollingSource.includes('}, 1500)'));
  });

  /* ── TASK-0119: overflow menu for agent log actions ── */

  it('renders an accessible three-dot overflow trigger with aria-haspopup and data-agent-actions-id', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(renderSource.includes("overflowButton.className = 'project-agent-actions-trigger'"));
    assert.ok(renderSource.includes("'\\u2026'"));
    assert.ok(renderSource.includes("overflowButton.setAttribute('aria-label', 'Agent actions')"));
    assert.ok(renderSource.includes("overflowButton.setAttribute('aria-haspopup', 'menu')"));
    assert.ok(renderSource.includes("'data-agent-actions-id'"));
  });

  it('keeps Start as a directly visible action button when not active', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(renderSource.includes("if (!active)"));
    assert.ok(renderSource.includes("addAction('Start'"));
  });

  it('keeps Cancel as a directly visible action button when active', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(renderSource.includes("if (active && run)"));
    assert.ok(renderSource.includes("addAction('Cancel'"));
  });

  it('shows Pause only when the agent run is running', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(renderSource.includes("addAction('Pause'"));
    assert.ok(renderSource.includes("run.status === 'running'"));
  });

  it('shows Resume only when the agent run is paused', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(renderSource.includes("addAction('Resume'"));
    assert.ok(renderSource.includes("run.status === 'paused'"));
  });

  it('invokes performRunAction with pause for the Pause button', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(renderSource.includes("performRunAction(agent, run, 'pause')"));
  });

  it('invokes performRunAction with resume for the Resume button', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(renderSource.includes("performRunAction(agent, run, 'resume')"));
  });

  it('invokes performRunAction with cancel for the Cancel button', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(renderSource.includes("performRunAction(agent, run, 'cancel')"));
  });

  it('shows Start when idle and Pause plus Cancel when running', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(renderSource.includes("if (!active)"));
    assert.ok(renderSource.includes("addAction('Start'"));
    assert.ok(renderSource.includes("if (active && run)"));
    assert.ok(renderSource.includes("run.status === 'running'"));
    assert.ok(renderSource.includes("addAction('Pause'"));
  });

  it('shows Resume and Cancel when paused', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(renderSource.includes("run.status === 'paused'"));
    assert.ok(renderSource.includes("addAction('Resume'"));
  });

  it('places Execution Run log and Error log inside the overflow menu', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(renderSource.includes("'Execution'"));
    assert.ok(renderSource.includes("'Run log'"));
    assert.ok(renderSource.includes("'Error log'"));
    assert.ok(renderSource.includes("menu.setAttribute('role', 'menu')"));
    assert.ok(renderSource.includes("'menuitem'"));
  });

  it('closes the overflow menu when a menu item is selected', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(renderSource.includes("openAgentActionsId = null"));
  });

  it('closes the overflow menu on Escape key', () => {
    const escapeHandler = agentsView.slice(
      agentsView.indexOf("document.addEventListener('keydown'"),
      agentsView.indexOf("document.addEventListener('click'"),
    );
    assert.ok(escapeHandler.includes("'Escape'"));
    assert.ok(escapeHandler.includes("openAgentActionsId = null"));
  });

  it('closes the overflow menu on outside click', () => {
    const clickHandler = agentsView.slice(
      agentsView.indexOf("document.addEventListener('click'"),
      agentsView.indexOf("createButton.addEventListener('click'"),
    );
    assert.ok(clickHandler.includes(".project-agent-overflow"));
    assert.ok(clickHandler.includes("openAgentActionsId = null"));
  });

  it('focuses the first menu item when opening the overflow menu', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function render(): void'),
      agentsView.indexOf('async function loadLatestRuns()'),
    );
    assert.ok(renderSource.includes(".project-agent-actions-menu-button"));
    assert.ok(renderSource.includes("?.focus()"));
  });

  it('overflow menu CSS classes and styles are present', () => {
    assert.ok(css.includes('.project-agent-overflow'));
    assert.ok(css.includes('.project-agent-actions-trigger'));
    assert.ok(css.includes('.project-agent-actions-menu'));
    assert.ok(css.includes('.project-agent-actions-menu-button'));
    assert.ok(css.includes('.project-agent-actions-trigger:hover'));
    assert.ok(css.includes('.project-agent-actions-menu-button:hover'));
  });

  it('opens and refreshes a distinct chat-like latest-run Execution transcript', () => {
    const executionSource = agentsView.slice(
      agentsView.indexOf('function renderExecution('),
      agentsView.indexOf('async function openRunLog('),
    );
    assert.ok(agentsView.includes("'Execution'"));
    assert.ok(executionSource.includes("appendReadModal('Execution'"));
    assert.ok(executionSource.includes('/execution`'));
    assert.ok(executionSource.includes("content.setAttribute('aria-live', 'polite')"));
    for (const label of [
      'User task',
      'Provider reasoning',
      'Assistant',
      'Tool call',
      'Tool result',
      'Final result',
    ]) {
      assert.ok(executionSource.includes(`'${label}'`));
    }
    assert.ok(executionSource.includes("fieldLabel.textContent = isCall ? 'Arguments:' : 'Result:'"));
    assert.ok(executionSource.includes("current.status === 'running' || current.status === 'paused'"));
    assert.ok(executionSource.includes('setTimeout(() => void refresh(), 1500)'));
    assert.ok(executionSource.includes('if (!modal.isConnected) return'));
    assert.ok(css.includes('.project-agent-execution-modal-backdrop .confirmation-modal'));
    assert.ok(css.includes('.project-agent-execution-reasoning'));
    assert.ok(css.includes('.project-agent-execution-final-result'));
    assert.ok(css.includes('max-height: 18rem'));
    assert.ok(agentsView.includes("appendReadModal('Run log'"));
    assert.ok(agentsView.includes("appendReadModal('Error log'"));
  });

  it('keeps log clearing in persisted Agent settings, separate from Save and Danger zone', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes('if (agent) {'));
    assert.ok(editorSource.includes("logsSection.className = 'project-agent-logs-section'"));
    assert.ok(editorSource.includes("logsHeading.textContent = 'Logs'"));
    assert.ok(editorSource.includes("clearLogsButton.textContent = 'Clear logs'"));
    assert.ok(editorSource.includes('advancedPanel.appendChild(logsSection)'));
    assert.ok(editorSource.includes("dangerZone.className = 'project-agent-danger-zone'"));
    assert.ok(
      editorSource.indexOf('advancedPanel.appendChild(logsSection)') <
        editorSource.indexOf('advancedPanel.appendChild(dangerZone)'),
    );
    assert.ok(
      editorSource.indexOf('advancedPanel.appendChild(dangerZone)') <
        editorSource.indexOf('createConfirmationModal({'),
    );
    assert.ok(css.includes('.project-agent-logs-section'));
    assert.ok(css.includes('.project-agent-clear-logs-button'));
  });

  it('blocks active log clearing and confirms terminal history deletion before refreshing lifecycle state', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("runStatus === 'running' || runStatus === 'paused'"));
    assert.ok(editorSource.includes('clearLogsButton.disabled = activeRun'));
    assert.ok(
      editorSource.includes(
        "activeRunHelp.textContent = 'Stop or cancel the active run before clearing logs.'",
      ),
    );
    assert.ok(
      editorSource.includes("clearLogsButton.setAttribute('aria-describedby', activeRunHelp.id)"),
    );

    const clearSource = agentsView.slice(
      agentsView.indexOf('function requestClearLogs('),
      agentsView.indexOf("createButton.addEventListener('click'"),
    );
    assert.ok(clearSource.includes("title: 'Clear Agent logs?'"));
    assert.ok(clearSource.includes('completed run history and error logs'));
    assert.ok(clearSource.includes("confirmLabel: 'Clear logs'"));
    assert.ok(clearSource.includes('destructive: true'));
    assert.ok(clearSource.includes('`/api/projects/${projectId}/agents/${agent.id}/runs`'));
    assert.ok(clearSource.includes("method: 'DELETE'"));
    assert.ok(clearSource.includes('await loadLatestRuns()'));
    assert.ok(clearSource.includes('render()'));
    assert.ok(clearSource.includes("setStatus('Agent logs cleared.')"));
    assert.ok(clearSource.includes('canCloseAfterConfirm: () => cleared'));
    assert.ok(
      clearSource.includes('Failed to clear Agent logs. Stop any active run and try again.'),
    );
    assert.ok(!clearSource.includes('latestRuns.set(agent.id, null)'));
  });

  it('collapses accessible chaining and result-file settings and populates same-Project edit values', () => {
    assert.ok(agentsView.includes("'Trigger another agent after successful completion'"));
    assert.ok(agentsView.includes('agent?.triggerNextAgent ?? false'));
    assert.ok(agentsView.includes('nextAgentControls.hidden = !triggerNextAgent.checked'));
    assert.ok(agentsView.includes('agents.filter((candidate) => candidate.id !== agent?.id)'));
    assert.ok(
      agentsView.includes("createField(`agent-next-${id}`, 'Next agent', nextAgentSelect)"),
    );
    assert.ok(agentsView.includes("'Save final result to Project file'"));
    assert.ok(agentsView.includes('agent?.saveResultToFile ?? false'));
    assert.ok(agentsView.includes('resultControls.hidden = !saveResultToFile.checked'));
    assert.ok(agentsView.includes("'Directory'"));
    assert.ok(agentsView.includes("'Filename'"));
    assert.ok(agentsView.includes("setAttribute('aria-controls'"));
    assert.ok(agentsView.includes("setAttribute('aria-expanded'"));
    assert.ok(css.includes('.project-agent-nested-settings[hidden]'));
  });

  it('switches Agent prompt sources without clearing either value and preserves the save payload', () => {
    assert.ok(agentsView.includes("inlineSource.type = 'radio'"));
    assert.ok(agentsView.includes("fileSource.type = 'radio'"));
    assert.ok(agentsView.includes("noneSource.type = 'radio'"));
    assert.ok(agentsView.includes("inlineSourceLabel.textContent = 'Write instructions'"));
    assert.ok(agentsView.includes("fileSourceLabel.textContent = 'Use Project file'"));
    assert.ok(agentsView.includes("noneSourceLabel.textContent = 'Not in use'"));
    assert.ok(agentsView.includes("agent?.instructionSource ?? 'none'"));
    assert.ok(agentsView.includes("agent?.instructionFilePath ?? ''"));
    assert.ok(agentsView.includes('inlineInstructionsField.hidden = !inlineSource.checked'));
    assert.ok(agentsView.includes('instructionFileField.hidden = !fileSource.checked'));
    assert.ok(agentsView.includes('instructionFilePath.required = fileSource.checked'));
    assert.ok(agentsView.includes("agent?.assignmentSource ?? 'inline'"));
    assert.ok(agentsView.includes("agent?.assignmentFilePath ?? ''"));
    assert.ok(agentsView.includes('assignmentField.hidden = usesFile'));
    assert.ok(agentsView.includes('assignmentFileField.hidden = !usesFile'));
    assert.ok(agentsView.includes('assignmentFilePath.required = usesFile'));
    assert.ok(agentsView.includes("inlineSource.addEventListener('change', updateInstructionSource)"));
    assert.ok(agentsView.includes("fileSource.addEventListener('change', updateInstructionSource)"));
    assert.ok(agentsView.includes("noneSource.addEventListener('change', updateInstructionSource)"));
    assert.ok(agentsView.includes("assignmentInlineSource.addEventListener('change', updateAssignmentSource)"));
    assert.ok(agentsView.includes("assignmentFileSource.addEventListener('change', updateAssignmentSource)"));
    assert.ok(agentsView.includes('updateInstructionSource();'));
    assert.ok(agentsView.includes('updateAssignmentSource();'));
    assert.ok(!agentsView.includes("instructionsInput.value = ''"));
    assert.ok(!agentsView.includes("instructionFilePath.value = ''"));
    assert.ok(!agentsView.includes("assignmentInput.value = ''"));
    assert.ok(!agentsView.includes("assignmentFilePath.value = ''"));
    assert.ok(
      agentsView.includes(
        "instructionSource: inlineSource.checked ? 'inline' : fileSource.checked ? 'file' : 'none'",
      ),
    );
    assert.ok(agentsView.includes('instructions: instructionsInput.value.trim()'));
    assert.ok(agentsView.includes('instructionFilePath: instructionFilePath.value.trim()'));
    assert.ok(agentsView.includes("assignmentSource: assignmentFileSource.checked ? 'file' : 'inline'"));
    assert.ok(agentsView.includes('assignment: assignmentInput.value.trim()'));
    assert.ok(agentsView.includes('assignmentFilePath: assignmentFilePath.value.trim()'));
  });

  it('keeps hidden form groups out of the rendered layout despite their flex display rule', () => {
    const hiddenRule = settingsCss.match(/\[hidden\]\s*\{([^}]*)\}/)?.[1] ?? '';
    assert.match(hiddenRule, /display:\s*none\s*!important\s*;/);
    assert.match(settingsCss, /\.settings-form-group\s*\{[^}]*display:\s*flex\s*;/s);
  });

  it('adds SVG browse controls only to Agent Project path fields and keeps manual entry', () => {
    assert.ok(agentsView.includes("createProjectBrowseButton('file')"));
    assert.ok(agentsView.includes("createProjectBrowseButton('directory')"));
    assert.ok(agentsView.includes("'Instruction file'"));
    assert.ok(agentsView.includes("allowedExtensions: ['.md', '.txt']"));
    assert.ok(agentsView.includes("mode: 'file'"));
    assert.ok(agentsView.includes("mode: 'directory'"));
    assert.ok(agentsView.includes('instructionFilePath.value = path'));
    assert.ok(agentsView.includes('resultDirectory.value = path'));
    assert.ok(agentsView.includes("instructionFilePath.type = 'text'"));
    assert.ok(agentsView.includes("resultDirectory.type = 'text'"));
    const filenameField = agentsView.slice(
      agentsView.indexOf("const resultFilename = document.createElement('input')"),
      agentsView.indexOf('function updateConditionalSettings'),
    );
    assert.ok(!filenameField.includes("createProjectBrowseButton('file')"));
  });

  it('provides reusable file/directory picker navigation through the existing Project Files API', () => {
    assert.ok(pathPickerView.includes("mode: 'file' | 'directory'"));
    assert.ok(pathPickerView.includes('allowedExtensions?: readonly string[]'));
    assert.ok(
      pathPickerView.includes(
        '`/api/projects/${options.projectId}/files?path=${encodeURIComponent(currentPath)}`',
      ),
    );
    assert.ok(pathPickerView.includes("entry.type === 'directory'"));
    assert.ok(pathPickerView.includes('navigate(entry.relativePath)'));
    assert.ok(pathPickerView.includes('navigate(getProjectPathPickerParent(currentPath))'));
    assert.ok(pathPickerView.includes("upButton.disabled = currentPath === ''"));
    assert.equal(getProjectPathPickerParent('reports/daily'), 'reports');
    assert.equal(getProjectPathPickerParent('reports'), '');
    assert.equal(getProjectPathPickerParent(''), '');
    assert.equal(getProjectPathPickerParent('../escape'), '');
  });

  it('filters file selection case-insensitively while keeping directories navigable', () => {
    assert.equal(isAllowedProjectPathPickerFile('AGENT.md', ['.md', '.txt']), true);
    assert.equal(isAllowedProjectPathPickerFile('docs.TXT', ['.md', '.txt']), true);
    assert.equal(isAllowedProjectPathPickerFile('config.json', ['.md', '.txt']), false);
    assert.ok(pathPickerView.includes("const selectable = entry.type === 'directory'"));
    assert.ok(pathPickerView.includes("item.classList.add('project-path-picker-entry-disabled')"));
    assert.ok(pathPickerView.includes("row.setAttribute('aria-disabled', 'true')"));
    assert.ok(pathPickerView.includes('selectedFilePath = entry.relativePath'));
  });

  it('returns only safe relative picker paths and represents selected Project root as empty', () => {
    assert.equal(isSafeProjectPickerPath('', true), true);
    assert.equal(isSafeProjectPickerPath('reports/daily', true), true);
    assert.equal(isSafeProjectPickerPath('/absolute', true), false);
    assert.equal(isSafeProjectPickerPath('C:\\temp', true), false);
    assert.equal(isSafeProjectPickerPath('../escape', true), false);
    assert.ok(
      pathPickerView.includes("options.mode === 'directory' ? currentPath : selectedFilePath"),
    );
    assert.ok(pathPickerView.includes('options.onSelect(selection)'));
    assert.ok(!pathPickerView.includes('filesystemRoot'));
    assert.ok(!pathPickerView.includes('innerHTML'));
  });

  it('uses accessible inline SVG picker controls and compact responsive modal styles', () => {
    assert.ok(pathPickerView.includes("button.type = 'button'"));
    assert.ok(pathPickerView.includes("'Browse Project files'"));
    assert.ok(pathPickerView.includes("'Browse Project directories'"));
    assert.ok(pathPickerView.includes("icon.setAttribute('aria-hidden', 'true')"));
    assert.ok(pathPickerView.includes("document.createElementNS(SVG_NAMESPACE, 'svg')"));
    assert.ok(
      pathPickerView.includes(
        "confirmLabel: options.mode === 'file' ? 'Select file' : 'Use this directory'",
      ),
    );
    assert.ok(css.includes('.project-path-picker-backdrop .confirmation-modal'));
    assert.ok(css.includes('.project-path-picker-entry-disabled'));
    assert.ok(css.includes('.project-path-input-row'));
  });

  it('calls all project CRUD APIs with no client-controlled ownership or path fields', () => {
    assert.ok(view.includes("fetch('/api/projects')"));
    assert.ok(view.includes('fetch(`/api/projects/${projectId}`)'));
    assert.ok(view.includes("project ? `/api/projects/${project.id}` : '/api/projects'"));
    assert.ok(view.includes("method: project ? 'PUT' : 'POST'"));
    assert.ok(view.includes("fetch(`/api/projects/${project.id}`, { method: 'DELETE' })"));
    const payloadStart = view.indexOf('const payload = {');
    const payloadEnd = view.indexOf('};', payloadStart);
    const payload = view.slice(payloadStart, payloadEnd);
    assert.ok(payload.includes('name:'));
    assert.ok(payload.includes('description:'));
    assert.ok(!payload.includes('userId'));
    assert.ok(!payload.includes('path'));
  });

  it('confirms deletion and clears stale selected state after success', () => {
    assert.ok(view.includes('createConfirmationModal({'));
    assert.ok(view.includes("title: 'Delete project?'"));
    assert.ok(view.includes('destructive: true'));
    assert.ok(view.includes('projects = projects.filter'));
    assert.ok(view.includes('selectedProjectId = null'));
    assert.ok(!view.includes('confirm('));
    assert.ok(!view.includes('innerHTML'));
  });

  it('has responsive desktop and mobile project layouts', () => {
    assert.ok(css.includes('@media (max-width: 760px)'));
    assert.ok(css.includes('.projects-toolbar'));
    assert.ok(css.includes('.projects-detail'));
    assert.ok(!css.includes('.projects-list-section'));
    assert.ok(!css.includes('.projects-list-button'));
    assert.ok(css.includes('.projects-editor'));
    assert.ok(css.includes('.project-file-editor'));
  });

  it('uses readable scoped Project editor styles and contained modal controls', () => {
    assert.ok(view.includes("'Name', nameInput"));
    assert.ok(view.includes("'Description', descriptionInput, 'Optional'"));
    assert.ok(view.includes("nameInput.placeholder = 'Project name'"));
    assert.ok(css.includes('.projects-editor label'));
    assert.ok(css.includes('.projects-editor .projects-field-help'));
    assert.ok(css.includes('.projects-editor .settings-saved-status-error'));
    assert.ok(css.includes('.projects-editor .settings-input::placeholder'));
    const editorStyles = css.slice(
      css.indexOf('.projects-editor .settings-form-group'),
      css.indexOf('.projects-editor textarea'),
    );
    assert.ok(editorStyles.includes('width: 100%'));
    assert.ok(editorStyles.includes('max-width: 100%'));
    assert.ok(editorStyles.includes('box-sizing: border-box'));
    assert.ok(!css.includes('\nlabel {'));
    assert.ok(!css.includes('\ninput {'));
    assert.ok(!css.includes('\ntextarea {'));
  });

  it('browses directories with a Project-relative breadcrumb that cannot go above root', () => {
    assert.ok(filesView.includes("breadcrumb.setAttribute('aria-label', 'Project file path')"));
    assert.ok(filesView.includes("rootButton.textContent = 'Files'"));
    assert.ok(filesView.includes("upButton.disabled = currentPath === ''"));
    assert.ok(filesView.includes('navigate(parentPath(currentPath))'));
    assert.ok(filesView.includes('isSafeRelativePath(path, true)'));
    assert.ok(filesView.includes('encodeURIComponent(currentPath)'));
    assert.ok(!filesView.includes('innerHTML'));
  });

  it('renders entries and opens and saves UTF-8 text through the Project file API', () => {
    assert.ok(filesView.includes("list.setAttribute('aria-label', 'Project files')"));
    assert.ok(filesView.includes("entry.type === 'directory'"));
    assert.ok(filesView.includes('void openFile(entry.relativePath'));
    assert.ok(filesView.includes("label.textContent = 'File content'"));
    assert.ok(filesView.includes("saveButton.textContent = 'Save'"));
    assert.ok(
      filesView.includes('JSON.stringify({ path: file.relativePath, content: textarea.value })'),
    );
    assert.ok(filesView.includes('fetch(`/api/projects/${projectId}/file`'));
    assert.ok(filesView.includes('pendingOpenPath = file.relativePath;\n        render();'));
  });

  it('formats Project file mtimes with explicit client-local fields and no seconds', () => {
    const modifiedAt = new Date(2026, 8, 13, 11, 42, 57).getTime();
    assert.equal(formatProjectFileModifiedAt(modifiedAt), '2026-09-13 11:42');
    assert.equal(formatProjectFileModifiedAt(undefined), null);
    assert.equal(formatProjectFileModifiedAt(Number.NaN), null);
    assert.equal(formatProjectFileModifiedAt(Number.MAX_VALUE), null);
    assert.ok(!formatProjectFileModifiedAt(modifiedAt)?.includes('57'));

    const formatterSource = filesView.slice(
      filesView.indexOf('export function formatProjectFileModifiedAt('),
      filesView.indexOf('export function getFileMoveUpDestination('),
    );
    for (const localField of [
      'getFullYear()',
      'getMonth()',
      'getDate()',
      'getHours()',
      'getMinutes()',
    ]) {
      assert.ok(formatterSource.includes(localField));
    }
    assert.ok(!formatterSource.includes('toLocale'));
  });

  it('renders file-only modified time between the filename control and overflow menu', () => {
    const rowSource = filesView.slice(
      filesView.indexOf("const openButton = document.createElement('button')"),
      filesView.indexOf('list.appendChild(item);'),
    );
    assert.ok(rowSource.includes("modifiedTime.className = 'project-file-modified-at'"));
    assert.ok(rowSource.includes("entry.type === 'file' ? entry.modifiedAt : undefined"));
    assert.ok(rowSource.indexOf('item.appendChild(openButton)') < rowSource.indexOf('item.appendChild(modifiedTime)'));
    assert.ok(rowSource.indexOf('item.appendChild(modifiedTime)') < rowSource.indexOf('item.appendChild(actions)'));
    assert.ok(rowSource.includes("actionsButton.textContent = '...'"));
    assert.ok(css.includes('.project-file-modified-at'));
    assert.ok(!css.match(/\.project-file-modified-at\s*\{[^}]*width:/s));
  });

  it('tolerates absent or invalid modified metadata without rejecting file rows', () => {
    const parserSource = filesView.slice(
      filesView.indexOf('function parseEntry('),
      filesView.indexOf('function parseListing('),
    );
    assert.ok(parserSource.includes("typeof value.modifiedAt === 'number'"));
    assert.ok(parserSource.includes('Number.isFinite(value.modifiedAt)'));
    assert.ok(parserSource.includes('? { modifiedAt: value.modifiedAt }'));
    assert.ok(!parserSource.includes("typeof value.modifiedAt !== 'number'"));
    assert.ok(filesView.includes('if (modifiedTimestamp && modifiedAt !== undefined)'));
  });

  it('renders distinct decorative folder and file SVGs before their visible labels', () => {
    assert.ok(filesView.includes("document.createElementNS(SVG_NAMESPACE, 'svg')"));
    assert.ok(filesView.includes("icon.setAttribute('aria-hidden', 'true')"));
    assert.ok(filesView.includes("icon.setAttribute('stroke', 'currentColor')"));
    assert.ok(filesView.includes("if (type === 'directory')"));
    assert.ok(filesView.includes("document.createElementNS(SVG_NAMESPACE, 'path')"));
    assert.ok(filesView.includes("document.createElementNS(SVG_NAMESPACE, 'polyline')"));
    assert.ok(filesView.includes('`project-file-icon-${type}`'));
    assert.ok(
      filesView.includes('openButton.append(createProjectFileIcon(entry.type), openLabel)'),
    );
    assert.ok(filesView.includes('openLabel.textContent = entry.name'));
    assert.ok(css.includes('.project-file-icon'));
    assert.ok(css.includes('.project-file-label'));
  });

  it('creates and renames Project-relative files and directories', () => {
    assert.ok(filesView.includes("createFileButton.textContent = 'New text file'"));
    assert.ok(filesView.includes("createDirectoryButton.textContent = 'New directory'"));
    assert.ok(filesView.includes('joinRelativePath(currentPath, nameField.input.value)'));
    assert.ok(filesView.includes('fetch(`/api/projects/${projectId}/directory`'));
    assert.ok(filesView.includes('fetch(`/api/projects/${projectId}/files/rename`'));
    assert.ok(
      filesView.includes('JSON.stringify({ sourcePath: entry.relativePath, destinationPath })'),
    );
  });

  it('uploads or replaces one browser-selected file in the current directory and refreshes safely', () => {
    const uploadSource = filesView.slice(
      filesView.indexOf('async function uploadFile('),
      filesView.indexOf('async function downloadFile('),
    );
    assert.ok(filesView.includes("fileInput.type = 'file'"));
    assert.ok(filesView.includes('fileInput.hidden = true'));
    assert.ok(!filesView.includes('fileInput.multiple = true'));
    assert.ok(filesView.includes("uploadButton.textContent = 'Upload file'"));
    assert.ok(filesView.includes("fileInput.addEventListener('change'"));
    assert.ok(filesView.includes('fileInput.files?.[0]'));
    assert.ok(
      filesView.includes(
        'files/upload?directory=${encodeURIComponent(currentPath)}&filename=${encodeURIComponent(file.name)}',
      ),
    );
    assert.ok(filesView.includes("headers: { 'Content-Type': 'application/octet-stream' }"));
    assert.ok(filesView.includes('body: file'));
    assert.ok(filesView.includes("button.textContent = 'Uploading...'"));
    assert.ok(filesView.includes("setStatus(status, 'A directory with that name already exists.', true)"));
    assert.ok(filesView.includes("setStatus(status, 'Failed to upload file.', true)"));
    assert.ok(filesView.includes("input.value = ''"));
    assert.ok(filesView.includes('const uploadedPath = currentPath ? `${currentPath}/${file.name}` : file.name'));
    assert.ok(filesView.includes('if (activeFilePath === uploadedPath)'));
    assert.ok(filesView.includes('pendingOpenPath = uploadedPath'));
    assert.ok(filesView.includes('render();'));
    assert.ok(filesView.includes('if (pendingOpenPath)'));
    assert.ok(filesView.includes('await openFile(path, editorHost, status)'));
    assert.equal(uploadSource.includes('currentPath ='), false);
    assert.ok(filesView.includes('section.replaceChildren()'));
    assert.ok(filesView.includes('list.appendChild(item)'));
    assert.ok(filesView.includes('modifiedTime.textContent = modifiedTimestamp'));
    assert.ok(filesView.includes('openActionMenu(entry, actions, actionsButton, status)'));
  });

  it('downloads file rows without navigating the SPA and cleans up object URLs', () => {
    assert.ok(filesView.includes("addAction('Download'"));
    assert.ok(filesView.includes("if (entry.type === 'file')"));
    assert.ok(
      filesView.includes(
        'files/download?path=${encodeURIComponent(entry.relativePath)}',
      ),
    );
    assert.ok(filesView.includes('URL.createObjectURL(await response.blob())'));
    assert.ok(filesView.includes('anchor.download = entry.name'));
    assert.ok(filesView.includes('anchor.click()'));
    assert.ok(filesView.includes('anchor.remove()'));
    assert.ok(filesView.includes('URL.revokeObjectURL(objectUrl)'));
    assert.ok(filesView.includes("setStatus(status, 'Failed to download file.', true)"));
    assert.ok(!filesView.includes('window.location'));
  });

  it('keeps supported text editable and blocks obvious binary files from the editor path', () => {
    assert.ok(filesView.includes("'txt'"));
    assert.ok(filesView.includes("'md'"));
    assert.ok(filesView.includes('!isSupportedTextFile(entry.relativePath)'));
    assert.ok(
      filesView.includes(
        "setStatus(status, 'This file cannot be opened as text. Use Download instead.')",
      ),
    );
    assert.ok(filesView.includes('void openFile(entry.relativePath, editorHost, status)'));
    assert.ok(filesView.includes("addAction('Download'"));
  });

  it('drags files onto directories through the existing relative-path rename API', () => {
    assert.ok(filesView.includes("item.draggable = entry.type === 'file'"));
    assert.ok(filesView.includes("if (entry.type === 'file')"));
    assert.ok(filesView.includes("item.addEventListener('dragstart'"));
    assert.ok(filesView.includes("item.addEventListener('dragover'"));
    assert.ok(filesView.includes("item.addEventListener('drop'"));
    assert.ok(filesView.includes('const destinationPath = `${entry.relativePath}/${name}`'));
    assert.ok(filesView.includes('void moveFile(sourcePath, destinationPath, status)'));
    assert.ok(filesView.includes('JSON.stringify({ sourcePath, destinationPath })'));
    assert.ok(filesView.includes('fetch(`/api/projects/${projectId}/files/rename`'));
    assert.ok(filesView.includes("setStatus(status, 'Moving file...')"));
    assert.ok(filesView.includes('render();'));
  });

  it('clears drag state and reports a controlled move failure', () => {
    assert.ok(filesView.includes('function clearDragState(): void'));
    assert.ok(filesView.includes("item.addEventListener('dragend', clearDragState)"));
    assert.ok(filesView.includes("item.classList.remove('project-file-entry-drop-target')"));
    assert.ok(filesView.includes("setStatus(status, 'Failed to move file.', true)"));
    assert.ok(filesView.includes('finally {\n      clearDragState();'));
    assert.ok(filesView.includes('activeFilePath = null'));
    assert.ok(css.includes('.project-file-entry-dragging'));
    assert.ok(css.includes('.project-file-entry-drop-target'));
  });

  it('moves files exactly one directory upward without generating root or traversal paths', () => {
    assert.equal(getFileMoveUpDestination('docs/test/file.txt'), 'docs/file.txt');
    assert.equal(getFileMoveUpDestination('docs/file.txt'), 'file.txt');
    assert.equal(getFileMoveUpDestination('file.txt'), null);
    assert.equal(getFileMoveUpDestination('../file.txt'), null);
    assert.equal(getFileMoveUpDestination('/docs/file.txt'), null);
    assert.equal(getFileMoveUpDestination('docs\\file.txt'), null);
  });

  it('offers file-only Move up through the existing move API and refreshes editor state safely', () => {
    assert.ok(filesView.includes("addAction('Move up'"));
    assert.ok(filesView.includes("if (entry.type === 'file')"));
    assert.ok(filesView.includes('if (moveUpDestination !== null)'));
    assert.ok(filesView.includes('void moveFile(entry.relativePath, moveUpDestination, status)'));
    assert.ok(filesView.includes('!isSafeRelativePath(sourcePath, false)'));
    assert.ok(filesView.includes('!isSafeRelativePath(destinationPath, false)'));
    assert.ok(filesView.includes('fetch(`/api/projects/${projectId}/files/rename`'));
    assert.ok(filesView.includes('JSON.stringify({ sourcePath, destinationPath })'));
    assert.ok(filesView.includes('pendingOpenPath = destinationPath'));
    assert.ok(filesView.includes('render();'));
    assert.ok(filesView.includes("setStatus(status, 'Failed to move file.', true)"));
  });

  it('replaces inline row actions with one accessible three-dot menu trigger', () => {
    assert.ok(filesView.includes("actions.className = 'project-file-actions'"));
    assert.ok(filesView.includes("actionsButton.type = 'button'"));
    assert.ok(filesView.includes("actionsButton.textContent = '...'"));
    assert.ok(filesView.includes("actionsButton.setAttribute('aria-haspopup', 'menu')"));
    assert.ok(filesView.includes("'aria-label',"));
    assert.ok(filesView.includes("'Folder' : 'File'} actions for ${entry.name}"));
    assert.ok(!filesView.includes("renameButton.textContent = 'Rename'"));
    assert.ok(!filesView.includes("deleteButton.textContent = 'Delete'"));
    assert.ok(!filesView.includes("downloadButton.textContent = 'Download'"));
    assert.ok(css.includes('.project-file-actions-trigger'));
    assert.ok(css.includes('.project-file-actions-menu'));
  });

  it('shows only applicable file and folder menu actions', () => {
    assert.ok(filesView.includes("if (entry.type === 'file')"));
    assert.ok(filesView.includes("addAction('Download'"));
    assert.ok(filesView.includes("addAction('Move up'"));
    assert.ok(filesView.includes("addAction('Rename'"));
    assert.ok(filesView.includes("addAction('Delete'"));
    assert.ok(filesView.includes('if (moveUpDestination !== null)'));
    assert.ok(filesView.includes("getFileMoveUpDestination(entry.relativePath)"));
  });

  it('keeps only one menu open and closes it on outside click, Escape, action, and rerender', () => {
    assert.ok(filesView.includes('closeActionMenu();\n    openActionsPath = entry.relativePath'));
    assert.ok(filesView.includes('document.addEventListener(\'click\', handleOutsideClick)'));
    assert.ok(filesView.includes("if (event.key === 'Escape') closeActionMenu(true)"));
    assert.ok(filesView.includes('closeActionMenu();\n        action();'));
    assert.ok(filesView.includes('document.removeEventListener(\'click\', handleOutsideClick)'));
    assert.ok(filesView.includes('document.removeEventListener(\'keydown\', handleEscape)'));
    assert.ok(filesView.includes('function render(): void {'));
    assert.ok(filesView.includes('activeFilePath = null;\n    closeActionMenu();'));
  });

  it('routes menu selections through existing action handlers and remains keyboard accessible', () => {
    assert.ok(filesView.includes('downloadFile(entry, trigger, status)'));
    assert.ok(filesView.includes('moveFile(entry.relativePath, moveUpDestination, status)'));
    assert.ok(filesView.includes('openRename(entry, trigger)'));
    assert.ok(filesView.includes('requestDelete(entry, trigger, status)'));
    assert.ok(filesView.includes("menu.setAttribute('role', 'menu')"));
    assert.ok(filesView.includes("button.setAttribute('role', 'menuitem')"));
    assert.ok(filesView.includes('firstAction.focus()'));
    assert.ok(css.includes('.project-file-actions-delete'));
  });

  it('isolates menu controls from row dragging while preserving file and folder navigation', () => {
    assert.ok(filesView.includes('actions.draggable = false'));
    assert.ok(filesView.includes("actions.addEventListener('mousedown', (event) => event.preventDefault())"));
    assert.ok(filesView.includes("actions.addEventListener('dragstart'"));
    assert.ok(filesView.includes('event.preventDefault();\n          event.stopPropagation();'));
    assert.ok(filesView.includes("item.draggable = entry.type === 'file'"));
    assert.ok(filesView.includes('navigate(entry.relativePath)'));
    assert.ok(filesView.includes('void openFile(entry.relativePath, editorHost, status)'));
  });

  it('contains Project file modal controls and scopes readable dark-modal text styles', () => {
    assert.ok(css.includes('.project-file-dialog-form .settings-input'));
    assert.ok(css.includes('.project-file-dialog-form .settings-form-group'));
    assert.ok(css.includes('.project-file-dialog-form label'));
    assert.ok(css.includes('.project-file-dialog-form .settings-saved-status-error'));
    assert.ok(css.includes('.project-file-dialog-form .settings-input::placeholder'));
    const dialogStyles = css.slice(css.indexOf('.project-file-dialog-form {'));
    assert.ok(dialogStyles.includes('max-width: 100%'));
    assert.ok(dialogStyles.includes('box-sizing: border-box'));
    assert.ok(!css.includes('\ninput {'));
    assert.ok(!css.includes('\ntextarea {'));
  });

  it('requires the reusable confirmation modal before deleting a file or directory', () => {
    assert.ok(filesView.includes('function requestDelete('));
    assert.ok(filesView.includes('createConfirmationModal({'));
    assert.ok(filesView.includes('destructive: true'));
    assert.ok(filesView.includes("method: 'DELETE'"));
    assert.ok(filesView.includes('JSON.stringify({ path: entry.relativePath })'));
    assert.ok(!filesView.includes('confirm('));
  });

  /* ── Agent settings tabs ── */

  it('creates tablist with role and required tab labels in order', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("tabList.setAttribute('role', 'tablist')"));
    const labels = [
      "{ label: 'General'",
      "{ label: 'Prompt'",
      "{ label: 'Model'",
      "{ label: 'Context'",
      "{ label: 'Tools & Skills'",
      "{ label: 'Runtime'",
      "{ label: 'Advanced'",
    ];
    const positions = labels.map((label) => editorSource.indexOf(label));
    assert.ok(positions.every((position) => position >= 0));
    assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  });

  it('shows Advanced tab only for existing agents', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("{ label: 'Advanced'"));
    assert.ok(editorSource.includes('if (agent) {'));
    assert.ok(editorSource.includes("advancedPanel = document.createElement('div')"));
  });

  it('sets General tab as default active panel', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes('activateTab(0)'));
  });

  it('creates tabpanels with role and aria-labelledby', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("generalPanel.setAttribute('role', 'tabpanel')"));
    assert.ok(editorSource.includes("promptPanel.setAttribute('role', 'tabpanel')"));
    assert.ok(editorSource.includes("modelPanel.setAttribute('role', 'tabpanel')"));
    assert.ok(editorSource.includes("contextPanel.setAttribute('role', 'tabpanel')"));
    assert.ok(editorSource.includes("toolsSkillsPanel.setAttribute('role', 'tabpanel')"));
    assert.ok(editorSource.includes("runtimePanel.setAttribute('role', 'tabpanel')"));
  });

  it('sets aria-controls on tab buttons and aria-labelledby on panels', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("button.setAttribute('role', 'tab')"));
    assert.ok(editorSource.includes("button.setAttribute('aria-controls', def.panel.id)"));
    assert.ok(editorSource.includes("generalPanel.setAttribute('aria-labelledby'"));
  });

  it('implements activateTab with aria-selected and roving tabindex', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("tabButtons[i].setAttribute('aria-selected'"));
    assert.ok(editorSource.includes('tabIndex = isActive ? 0 : -1'));
    assert.ok(editorSource.includes('panel.hidden = !isActive'));
  });

  it('clicking a tab button activates its panel', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("tabButtons[i].addEventListener('click'"));
  });

  it('implements ArrowRight ArrowLeft Home End keyboard navigation with wrapping', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("'ArrowRight'"));
    assert.ok(editorSource.includes("'ArrowLeft'"));
    assert.ok(editorSource.includes("'Home'"));
    assert.ok(editorSource.includes("'End'"));
    assert.ok(editorSource.includes('(currentIndex + 1) % tabButtons.length'));
    assert.ok(editorSource.includes('(currentIndex - 1 + tabButtons.length) % tabButtons.length'));
    assert.ok(editorSource.includes('nextIndex = 0'));
    assert.ok(editorSource.includes('nextIndex = tabButtons.length - 1'));
  });

  it('General panel contains only Name and Description', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    const generalAssembly = editorSource.slice(
      editorSource.indexOf('generalPanel.append('),
      editorSource.indexOf("const promptPanel = document.createElement('div')"),
    );
    assert.ok(generalAssembly.includes('nameLabel'));
    assert.ok(generalAssembly.includes('descriptionLabel'));
    assert.ok(!generalAssembly.includes('instructionSourceFieldset'));
    assert.ok(!generalAssembly.includes('inlineInstructionsField'));
    assert.ok(!generalAssembly.includes('instructionFileField'));
    assert.ok(!generalAssembly.includes('assignmentSourceFieldset'));
    assert.ok(!generalAssembly.includes('assignmentField'));
    assert.ok(!generalAssembly.includes('assignmentFileField'));
  });

  it('Prompt panel owns each instruction control and Task Assignment without duplicates', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    const panelAssembly = editorSource.slice(
      editorSource.indexOf('generalPanel.append('),
      editorSource.indexOf("const modelPanel = document.createElement('div')"),
    );
    const promptAssembly = panelAssembly.slice(panelAssembly.indexOf('promptPanel.append('));
    for (const control of [
      'instructionSourceFieldset',
      'inlineInstructionsField',
      'instructionFileField',
      'assignmentSourceFieldset',
      'assignmentField',
      'assignmentFileField',
    ]) {
      assert.equal((panelAssembly.match(new RegExp(control, 'g')) ?? []).length, 1);
      assert.ok(promptAssembly.includes(control));
    }
  });

  it('Model panel contains connection model and allowModelSelection', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("connectionLabel"));
    assert.ok(editorSource.includes("'Model connection'"));
    assert.ok(editorSource.includes("'Model', modelSelect"));
    assert.ok(editorSource.includes("permissionLabel.textContent = 'Allow agent to choose model'"));
  });

  it('Model panel contains unloadModelAfterRun checkbox', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("unloadCheckbox.type = 'checkbox'"));
    assert.ok(editorSource.includes("'Unload model after Agent run'"));
    assert.ok(editorSource.includes("agent?.unloadModelAfterRun ?? false"));
    assert.ok(editorSource.includes("modelPanel.appendChild(unloadPermission)"));
  });

  it('Context panel contains attached project files section', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("contextPanel.appendChild(attachedFilesSection)"));
    assert.ok(editorSource.includes("'Attached project files'"));
  });

  it('Tools & Skills panel contains Tools permissions and Skills', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("toolsSkillsPanel.appendChild(filesystemPermissionsSection)"));
    assert.ok(editorSource.includes("'Project file permissions'"));
    assert.ok(editorSource.includes("skillChecklist.element"));
    assert.ok(editorSource.includes("toolChecklist.element"));
  });

  it('Runtime panel contains chaining and result-file settings', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("'Trigger another agent after successful completion'"));
    assert.ok(editorSource.includes("'Save final result to Project file'"));
  });

  it('Advanced panel contains Logs and Danger zone for existing agents', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("logsSection.className = 'project-agent-logs-section'"));
    assert.ok(editorSource.includes("dangerZone.className = 'project-agent-danger-zone'"));
    assert.ok(editorSource.includes("advancedPanel.appendChild(logsSection)"));
    assert.ok(editorSource.includes("advancedPanel.appendChild(dangerZone)"));
  });

  it('attached-file add and remove behavior remains in Context panel', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("addFileButton.textContent = '+ Add file'"));
    assert.ok(editorSource.includes("'Remove'"));
    assert.ok(editorSource.includes("attachedProjectFiles.filter"));
  });

  it('instruction-source conditional behavior is preserved', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("inlineInstructionsField.hidden = !inlineSource.checked"));
    assert.ok(editorSource.includes("instructionFileField.hidden = !fileSource.checked"));
    assert.ok(editorSource.includes('instructionFilePath.required = fileSource.checked'));
    assert.ok(editorSource.includes("inlineSource.addEventListener('change', updateInstructionSource)"));
    assert.ok(editorSource.includes("fileSource.addEventListener('change', updateInstructionSource)"));
    assert.ok(editorSource.includes("noneSource.addEventListener('change', updateInstructionSource)"));
    const toggleSource = editorSource.slice(
      editorSource.indexOf('function updateInstructionSource()'),
      editorSource.indexOf('function updateAssignmentSource()'),
    );
    assert.ok(!toggleSource.includes('.value ='));
  });

  it('Task Assignment has immediate source-controlled visibility without clearing either value', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("assignmentSourceLegend.textContent = 'Task source'"));
    assert.ok(editorSource.includes("assignmentInlineSourceLabel.textContent = 'Write task'"));
    assert.ok(editorSource.includes("assignmentFileSourceLabel.textContent = 'Use Project file'"));
    assert.ok(editorSource.includes("'Task / Assignment'"));
    assert.ok(editorSource.includes("'Task file'"));
    assert.ok(editorSource.includes('assignmentField.hidden = usesFile'));
    assert.ok(editorSource.includes('assignmentFileField.hidden = !usesFile'));
    assert.ok(editorSource.includes('assignmentFilePath.required = usesFile'));
    assert.ok(editorSource.includes("assignmentInlineSource.addEventListener('change', updateAssignmentSource)"));
    assert.ok(editorSource.includes("assignmentFileSource.addEventListener('change', updateAssignmentSource)"));
    const toggleSource = editorSource.slice(
      editorSource.indexOf('function updateAssignmentSource()'),
      editorSource.indexOf('const nameLabel'),
    );
    assert.ok(!toggleSource.includes('.value ='));
  });

  it('Prompt controls retain unsaved edits when tabs are switched', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    const activateSource = editorSource.slice(
      editorSource.indexOf('function activateTab('),
      editorSource.indexOf('activateTab(0)'),
    );
    assert.ok(activateSource.includes('tabDefinitions[i].panel.hidden = !isActive'));
    assert.ok(!activateSource.includes('replaceChildren'));
    assert.ok(!activateSource.includes('.value ='));
  });

  it('saved Prompt values populate the existing controls', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("instructionsInput.value = agent?.instructions ?? ''"));
    assert.ok(editorSource.includes("assignmentInput.value = agent?.assignment ?? ''"));
    assert.ok(editorSource.includes("const instructionSource = agent?.instructionSource ?? 'none'"));
    assert.ok(editorSource.includes("instructionFilePath.value = agent?.instructionFilePath ?? ''"));
    assert.ok(editorSource.includes("const assignmentSource = agent?.assignmentSource ?? 'inline'"));
    assert.ok(editorSource.includes("assignmentFilePath.value = agent?.assignmentFilePath ?? ''"));
  });

  it('runtime conditional settings expand and collapse correctly', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("nextAgentControls.hidden = !triggerNextAgent.checked"));
    assert.ok(editorSource.includes("resultControls.hidden = !saveResultToFile.checked"));
  });

  it('model loading behavior remains intact', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("connectionSelect.addEventListener('change'"));
    assert.ok(editorSource.includes('loadModels(Number(connectionSelect.value)'));
  });

  it('save payload includes both instruction and assignment source values', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes('name: nameInput.value.trim()'));
    assert.ok(editorSource.includes('description: descriptionInput.value.trim()'));
    assert.ok(
      editorSource.includes(
        "instructionSource: inlineSource.checked ? 'inline' : fileSource.checked ? 'file' : 'none'",
      ),
    );
    assert.ok(editorSource.includes('instructions: instructionsInput.value.trim()'));
    assert.ok(editorSource.includes('instructionFilePath: instructionFilePath.value.trim()'));
    assert.ok(editorSource.includes("assignmentSource: assignmentFileSource.checked ? 'file' : 'inline'"));
    assert.ok(editorSource.includes('assignment: assignmentInput.value.trim()'));
    assert.ok(editorSource.includes('assignmentFilePath: assignmentFilePath.value.trim()'));
    assert.ok(editorSource.includes('attachedProjectFiles: [...attachedProjectFiles]'));
    assert.ok(editorSource.includes('modelConnectionId: Number(connectionSelect.value)'));
    assert.ok(editorSource.includes('modelId: modelSelect.value'));
    assert.ok(editorSource.includes('allowModelSelection: allowModelSelection.checked'));
    assert.ok(editorSource.includes('unloadModelAfterRun: unloadCheckbox.checked'));
    assert.ok(editorSource.includes('triggerNextAgent: triggerNextAgent.checked'));
    assert.ok(editorSource.includes('nextAgentId:'));
    assert.ok(editorSource.includes('saveResultToFile: saveResultToFile.checked'));
    assert.ok(editorSource.includes('resultDirectory: resultDirectory.value.trim()'));
    assert.ok(editorSource.includes('resultFilename: resultFilename.value.trim()'));
    assert.ok(editorSource.includes('projectFilesystemPermissions:'));
    assert.ok(editorSource.includes('skillIds:'));
    assert.ok(editorSource.includes('toolNames:'));
  });

  it('save collects values from all tabs regardless of active tab', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("const payload = {"));
  });

  it('invalid required control in inactive tab activates that tab before validation', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("form.querySelector<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>("));
    assert.ok(editorSource.includes(".project-agent-tab-panel"));
    assert.ok(editorSource.includes('panel.hidden'));
  });

  it('clear logs behavior remains unchanged', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("requestClearLogs(agent, clearLogsButton)"));
  });

  it('delete agent behavior remains unchanged', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("requestDelete(agent, deleteButton, () => modal.remove())"));
  });

  it('project filesystem permission checkboxes are preserved', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("'list'"));
    assert.ok(editorSource.includes("'read'"));
    assert.ok(editorSource.includes("'write'"));
    assert.ok(editorSource.includes("'createDirectory'"));
    assert.ok(editorSource.includes("'rename'"));
    assert.ok(editorSource.includes("'delete'"));
  });

  it('tab CSS classes and styles are present', () => {
    assert.ok(css.includes('.project-agent-tabs'));
    assert.ok(css.includes('.project-agent-tab'));
    assert.ok(css.includes('.project-agent-tab-panel'));
    assert.ok(css.includes(".project-agent-tab[aria-selected='true']"));
    assert.ok(css.includes('.project-agent-tab:focus-visible'));
  });

  it('tab panels use hidden attribute for inactive panels', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("promptPanel.hidden = true"));
    assert.ok(editorSource.includes("modelPanel.hidden = true"));
    assert.ok(editorSource.includes("contextPanel.hidden = true"));
  });

  it('editorError remains outside tab panels for cross-tab visibility', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes('form.append(tabList, tabContent, editorError)'));
  });

  it('Save and Cancel actions remain outside tab content via ConfirmationModal', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("confirmLabel: 'Save'"));
    assert.ok(editorSource.includes("cancelLabel: 'Cancel'"));
  });

  it('keyboard navigation activates the focused tab', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("tabButtons[nextIndex].focus()"));
    assert.ok(editorSource.includes('activateTab(nextIndex)'));
  });

  it('advanced panel tab is appended to tab-content when agent exists', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("if (advancedPanel) tabContent.appendChild(advancedPanel)"));
  });

  it('tab definitions array includes all required tabs in order', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("const tabDefinitions: Array<{ label: string; panel: HTMLDivElement }>"));
  });

  it('no backend API contract changes', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("method: agent ? 'PUT' : 'POST'"));
  });

  it('tab ids are unique per editor instance using agentEditorId', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes('agent-tab-panel-general-'));
    assert.ok(editorSource.includes('agent-tab-panel-prompt-'));
  });

  it('no innerHTML usage in tab implementation', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(!editorSource.includes('innerHTML'));
  });

  it('tab panel css hides inactive panels with display none', () => {
    assert.ok(css.includes('.project-agent-tab-panel[hidden]'));
  });

  /* ── TASK-0115: stable modal layout ── */

  it('agent editor has a dedicated tab-content container wrapping all panels', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("tabContent.className = 'project-agent-tab-content'"));
    const tabContentAssembly = editorSource.slice(
      editorSource.indexOf('tabContent.append('),
      editorSource.indexOf('if (advancedPanel) tabContent.appendChild'),
    );
    assert.ok(tabContentAssembly.includes('generalPanel'));
    assert.ok(tabContentAssembly.includes('promptPanel'));
  });

  it('tablist is outside the scrollable tab-content container', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes('form.append(tabList, tabContent, editorError)'));
  });

  it('all tabpanels are inside the tab-content container', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    const tabContentAssembly = editorSource.slice(
      editorSource.indexOf('tabContent.append('),
      editorSource.indexOf('if (advancedPanel) tabContent.appendChild'),
    );
    for (const panel of [
      'generalPanel',
      'promptPanel',
      'modelPanel',
      'contextPanel',
      'toolsSkillsPanel',
      'runtimePanel',
    ]) {
      assert.ok(tabContentAssembly.includes(panel));
    }
    assert.ok(editorSource.includes('if (advancedPanel) tabContent.appendChild(advancedPanel)'));
  });

  it('editor error region remains outside the scrollable tab-content container', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes('form.append(tabList, tabContent, editorError)'));
  });

  it('tab-content container provides the vertical scroll area', () => {
    assert.ok(css.includes('.project-agent-tab-content'));
    assert.ok(css.includes('overflow-y: auto'));
  });

  it('agent modal uses stable viewport-safe height for consistent sizing across tabs', () => {
    assert.ok(
      css.includes('.project-agent-modal-backdrop .confirmation-modal'),
    );
    const modalStyles = css.slice(
      css.indexOf('.project-agent-modal-backdrop .confirmation-modal {'),
      css.indexOf('}', css.indexOf('.project-agent-modal-backdrop .confirmation-modal {')),
    );
    assert.ok(modalStyles.includes('height:'));
  });

  it('agent editor uses flex column layout without its own scroll', () => {
    const editorStyles = css.slice(
      css.indexOf('.project-agent-editor {'),
      css.indexOf('}', css.indexOf('.project-agent-editor {')),
    );
    assert.ok(editorStyles.includes('flex-direction: column'));
    assert.ok(!editorStyles.includes('overflow-y: auto'));
  });

  it('tabs use flex-shrink-0 so they never shrink below their natural size', () => {
    const tabsStyles = css.slice(
      css.indexOf('.project-agent-tabs {'),
      css.indexOf('}', css.indexOf('.project-agent-tabs {')),
    );
    assert.ok(tabsStyles.includes('flex-shrink: 0'));
  });

  it('permission checklist uses the same visual frame styling as tools and skills checklists', () => {
    assert.ok(css.includes('.project-agent-permission-checklist'));
    const permissionStyles = css.slice(
      css.indexOf('.project-agent-permission-checklist {'),
      css.indexOf('}', css.indexOf('.project-agent-permission-checklist {')),
    );
    assert.ok(permissionStyles.includes('border: 1px solid #6c757d'));
    assert.ok(permissionStyles.includes('border-radius: 0.375rem'));
    assert.ok(permissionStyles.includes('padding: 0.75rem'));
  });

  it('permission check options share the same layout class as regular check options', () => {
    assert.ok(css.includes('.project-agent-check-option,'));
    assert.ok(css.includes('.project-agent-permission-check-option'));
  });

  it('no ConfirmationModal production-code change for TASK-0115', () => {
    const confirmationSource = readFileSync(
      resolve(projectRoot, 'src/client/components/ConfirmationModal.ts'),
      'utf8',
    );
    assert.ok(!confirmationSource.includes('project-agent'));
  });

  /* ── TASK-0116: footer anchoring + attached-files polish ── */

  it('agent modal action row is structurally outside the tab-content scroll region', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("confirmLabel: 'Save'"));
    assert.ok(editorSource.includes("cancelLabel: 'Cancel'"));
    assert.ok(editorSource.includes('createConfirmationModal({'));
    assert.ok(
      editorSource.indexOf('createConfirmationModal({') >
        editorSource.indexOf('tabContent.append(generalPanel'),
    );
  });

  it('agent-specific CSS anchors ConfirmationModal actions to the bottom', () => {
    assert.ok(css.includes('.project-agent-modal-backdrop .confirmation-modal-actions'));
    const actionsStyles = css.slice(
      css.indexOf('.project-agent-modal-backdrop .confirmation-modal-actions {'),
      css.indexOf('}', css.indexOf('.project-agent-modal-backdrop .confirmation-modal-actions {')),
    );
    assert.ok(actionsStyles.includes('margin-top: auto'));
  });

  it('agent editor uses flex so tab content fills available space above anchored footer', () => {
    const editorStyles = css.slice(
      css.indexOf('.project-agent-editor {'),
      css.indexOf('}', css.indexOf('.project-agent-editor {')),
    );
    assert.ok(editorStyles.includes('flex: 1'));
    assert.ok(editorStyles.includes('min-height: 0'));
  });

  it('tab content remains the vertical scroll owner', () => {
    const tabContentStyles = css.slice(
      css.indexOf('.project-agent-tab-content {'),
      css.indexOf('}', css.indexOf('.project-agent-tab-content {')),
    );
    assert.ok(tabContentStyles.includes('overflow-y: auto'));
    assert.ok(tabContentStyles.includes('flex: 1'));
    assert.ok(tabContentStyles.includes('min-height: 0'));
  });

  it('TASK-0115 stable modal sizing CSS remains in place', () => {
    const modalStyles = css.slice(
      css.indexOf('.project-agent-modal-backdrop .confirmation-modal {'),
      css.indexOf('}', css.indexOf('.project-agent-modal-backdrop .confirmation-modal {')),
    );
    assert.ok(modalStyles.includes('height:'));
    assert.ok(modalStyles.includes('flex-direction: column'));
  });

  it('attached-file row has the expected styling hook/class', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("fileEntry.className = 'project-agent-attached-file-entry'"));
  });

  it('Remove button retains text "Remove"', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("removeButton.textContent = 'Remove'"));
  });

  it('Remove button has a dedicated styling hook', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("removeButton.className = 'project-agent-remove-file-button'"));
  });

  it('+ Add file retains text "+ Add file"', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("addFileButton.textContent = '+ Add file'"));
  });

  it('+ Add file has a dedicated styling hook', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("addFileButton.className = 'project-agent-add-file-button'"));
  });

  it('attached-file path remains visible in each row via label element', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("fileLabel.className = 'project-agent-attached-file-label'"));
    assert.ok(editorSource.includes('fileLabel.textContent = filePath'));
  });

  it('empty-state text remains "No files attached."', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("'No files attached.'"));
  });

  it('add-file behavior opens path picker and appends non-duplicate paths', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("createProjectPathPicker({"));
    assert.ok(editorSource.includes('if (!attachedProjectFiles.includes(path))'));
    assert.ok(editorSource.includes('[...attachedProjectFiles, path]'));
  });

  it('duplicate attached paths are still prevented', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes('!attachedProjectFiles.includes(path)'));
  });

  it('remove behavior filters the clicked file from attachedProjectFiles', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("attachedProjectFiles.filter"));
    assert.match(
      editorSource,
      /attachedProjectFiles\s*=\s*attachedProjectFiles\.filter\(\s*\(?candidate\)?\s*=>\s*candidate\s*!==\s*filePath\s*,?\s*\)/,
    );
  });

  it('save payload still includes attachedProjectFiles unchanged', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes('attachedProjectFiles: [...attachedProjectFiles]'));
  });

  it('no backend/API changes for TASK-0116', () => {
    const editorSource = agentsView.slice(
      agentsView.indexOf('async function openEditor('),
      agentsView.indexOf('function requestDelete('),
    );
    assert.ok(editorSource.includes("method: agent ? 'PUT' : 'POST'"));
  });

  it('ConfirmationModal production code remains unchanged for TASK-0116', () => {
    const confirmationSource = readFileSync(
      resolve(projectRoot, 'src/client/components/ConfirmationModal.ts'),
      'utf8',
    );
    assert.ok(!confirmationSource.includes('project-agent'));
  });

  it('attached-files CSS provides row layout with flex and gap', () => {
    const listStyles = css.slice(
      css.indexOf('.project-agent-attached-files-list {'),
      css.indexOf('}', css.indexOf('.project-agent-attached-files-list {')),
    );
    assert.ok(listStyles.includes('display: flex'));
    assert.ok(listStyles.includes('flex-direction: column'));
  });

  it('attached-file-entry CSS provides horizontal row with dark background', () => {
    const entryStyles = css.slice(
      css.indexOf('.project-agent-attached-file-entry {'),
      css.indexOf('}', css.indexOf('.project-agent-attached-file-entry {')),
    );
    assert.ok(entryStyles.includes('display: flex'));
    assert.ok(entryStyles.includes('justify-content: space-between'));
  });

  it('remove button CSS has destructive styling with hover and focus-visible states', () => {
    assert.ok(css.includes('.project-agent-remove-file-button:hover'));
    assert.ok(css.includes('.project-agent-remove-file-button:focus-visible'));
  });

  it('add file button CSS has secondary styling with hover and focus-visible states', () => {
    assert.ok(css.includes('.project-agent-add-file-button:hover'));
    assert.ok(css.includes('.project-agent-add-file-button:focus-visible'));
  });

  it('attached-file label CSS truncates long paths safely', () => {
    const labelStyles = css.slice(
      css.indexOf('.project-agent-attached-file-label {'),
      css.indexOf('}', css.indexOf('.project-agent-attached-file-label {')),
    );
    assert.ok(labelStyles.includes('overflow: hidden'));
    assert.ok(labelStyles.includes('text-overflow: ellipsis'));
  });

  /* ── TASK-0134: inference_cancelled execution event support ── */

  it('parser accepts inference_cancelled event type', () => {
    const parserSource = agentsView.slice(
      agentsView.indexOf('function parseExecutionEvents('),
      agentsView.indexOf('function createField('),
    );
    assert.ok(parserSource.includes("item.eventType === 'inference_cancelled'"));
  });

  it('parser handles clean cancellation with empty data object', () => {
    const parserSource = agentsView.slice(
      agentsView.indexOf('function parseExecutionEvents('),
      agentsView.indexOf('function createField('),
    );
    assert.ok(parserSource.includes("eventType: 'inference_cancelled'"));
  });

  it('parser extracts finishReason from inference_cancelled data', () => {
    const parserSource = agentsView.slice(
      agentsView.indexOf('function parseExecutionEvents('),
      agentsView.indexOf('function createField('),
    );
    assert.ok(parserSource.includes("typeof item.data.finishReason === 'string'"));
  });

  it('parser extracts totalTokens from inference_cancelled data', () => {
    const parserSource = agentsView.slice(
      agentsView.indexOf('function parseExecutionEvents('),
      agentsView.indexOf('function createField('),
    );
    assert.ok(parserSource.includes("item.data.totalTokens"));
  });

  it('parser handles mixed execution payload with inference_cancelled', () => {
    const parserSource = agentsView.slice(
      agentsView.indexOf('function parseExecutionEvents('),
      agentsView.indexOf('function createField('),
    );
    assert.ok(parserSource.includes("item.eventType === 'user_task'"));
    assert.ok(parserSource.includes("item.eventType === 'reasoning'"));
    assert.ok(parserSource.includes("item.eventType === 'assistant_message'"));
    assert.ok(parserSource.includes("item.eventType === 'inference_cancelled'"));
  });

  it('inference_cancelled parser does not access tool fields', () => {
    const cancelledParserStart = agentsView.indexOf("item.eventType === 'inference_cancelled'");
    const nextBlockEnd = agentsView.indexOf("item.eventType !== 'tool_result'", cancelledParserStart);
    const cancelledBlock = agentsView.slice(cancelledParserStart, nextBlockEnd);
    assert.ok(!cancelledBlock.includes('toolCallId'));
    assert.ok(!cancelledBlock.includes('arguments'));
  });

  it('renderer labels inference_cancelled as "Inference cancelled"', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function renderExecution('),
      agentsView.indexOf('async function openRunLog('),
    );
    assert.ok(renderSource.includes("inference_cancelled: 'Inference cancelled'"));
  });

  it('renderer does not JSON.parse inference_cancelled data', () => {
    const renderCancelledBlock = agentsView.slice(
      agentsView.indexOf("event.eventType === 'inference_cancelled'"),
      agentsView.indexOf("'final_result'", agentsView.indexOf("event.eventType === 'inference_cancelled'")),
    );
    assert.ok(!renderCancelledBlock.includes('JSON.parse'));
  });

  it('renderer does not produce "Failed to load" for inference_cancelled', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf("event.eventType === 'inference_cancelled'"),
      agentsView.indexOf("'final_result'", agentsView.indexOf("event.eventType === 'inference_cancelled'")),
    );
    assert.ok(!renderSource.includes('Failed to load'));
  });

  it('existing execution event parsing remains unchanged for standard events', () => {
    const parserSource = agentsView.slice(
      agentsView.indexOf('function parseExecutionEvents('),
      agentsView.indexOf('function createField('),
    );
    assert.ok(parserSource.includes("item.eventType === 'user_task'"));
    assert.ok(parserSource.includes("item.eventType === 'reasoning'"));
    assert.ok(parserSource.includes("item.eventType === 'assistant_message'"));
    assert.ok(parserSource.includes("item.eventType === 'final_result'"));
    assert.ok(parserSource.includes("item.eventType === 'tool_call'"));
    assert.ok(parserSource.includes("item.eventType !== 'tool_result'"));
  });

  /* TASK-0136: pre-run execution and error observability */

  it('parses dedicated pre-run call and result events without tool-call IDs', () => {
    const parserSource = agentsView.slice(
      agentsView.indexOf('function parseExecutionEvents('),
      agentsView.indexOf('function createField('),
    );
    assert.ok(parserSource.includes("item.eventType === 'pre_run_tool_call'"));
    assert.ok(parserSource.includes("item.eventType === 'pre_run_tool_result'"));
    assert.ok(parserSource.includes("typeof item.data.inputFile !== 'string'"));
    assert.ok(parserSource.includes('Number(item.data.callIndex) <= 0'));
    const preRunBlock = parserSource.slice(
      parserSource.indexOf("item.eventType === 'pre_run_tool_call'"),
      parserSource.indexOf("item.eventType === 'inference_cancelled'"),
    );
    assert.equal(preRunBlock.includes('toolCallId'), false);
  });

  it('renders pre-run labels and debugging metadata separately from model tool events', () => {
    const renderSource = agentsView.slice(
      agentsView.indexOf('function renderExecution('),
      agentsView.indexOf('async function openRunLog('),
    );
    assert.ok(renderSource.includes("pre_run_tool_call: 'Pre-run tool call'"));
    assert.ok(renderSource.includes("pre_run_tool_result: 'Pre-run tool result'"));
    assert.ok(renderSource.includes('`Input file: ${event.data.inputFile}, Call ${event.data.callIndex}`'));
    assert.ok(renderSource.includes("event.eventType === 'tool_call' || event.eventType === 'pre_run_tool_call'"));
    assert.ok(renderSource.includes('structured.textContent = JSON.stringify(JSON.parse(json) as unknown, null, 2)'));
  });

  it('parses and renders optional pre-run diagnostics through the existing Agent error log', () => {
    const errorSource = agentsView.slice(
      agentsView.indexOf('async function openErrorLog('),
      agentsView.indexOf('async function startAgent('),
    );
    for (const field of [
      'toolName',
      'inputFile',
      'callIndex',
      'arguments',
      'errorCode',
      'errorName',
      'errorMessage',
    ]) {
      assert.ok(errorSource.includes(`value.${field}`));
      assert.ok(errorSource.includes(`error.${field}`));
    }
    assert.ok(errorSource.includes("['Tool', error.toolName]"));
    assert.ok(errorSource.includes("['Input file', error.inputFile]"));
    assert.ok(errorSource.includes("['Call', error.callIndex]"));
  });
});
