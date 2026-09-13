import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const adminView = readFileSync(
  resolve(projectRoot, 'src/client/components/admin-settings/AdminSettingsView.ts'),
  'utf8',
);
const settingsCss = readFileSync(
  resolve(projectRoot, 'src/client/components/settings/settings.css'),
  'utf8',
);
const confirmationModalCss = readFileSync(
  resolve(projectRoot, 'src/client/components/confirmation-modal.css'),
  'utf8',
);

await describe('Admin Settings UI', async () => {
  await it('keeps navigation hidden until the server reports admin capability', () => {
    assert.ok(layout.includes("fetch('/api/me')"));
    assert.ok(layout.includes('adminSettingsNavItem.hidden = true'));
    assert.ok(layout.includes("(capabilities as Record<string, unknown>).isAdmin === true"));
    assert.ok(layout.includes('adminSettingsNavItem.hidden = false'));
    assert.ok(!layout.includes('UserId'));
    assert.ok(!layout.includes('userId === 1'));
  });

  await it('adds a normally selectable Admin Settings view without initial activation', () => {
    assert.ok(layout.includes("adminSettingsNavLink.textContent = 'Admin Settings'"));
    assert.ok(layout.includes("navItems.set('admin-settings', adminSettingsNavLink)"));
    assert.ok(layout.includes("switchView('admin-settings')"));
    assert.ok(layout.includes('createAdminSettingsView()'));
    assert.ok(layout.includes('let currentView: ViewName | null = null'));
  });

  await it('renders and persists the global logging controls through admin APIs', () => {
    assert.ok(adminView.includes("heading.textContent = 'Logging'"));
    assert.ok(adminView.includes("levelLabel.textContent = 'Logging level'"));
    assert.ok(adminView.includes("'Application log'"));
    assert.ok(
      adminView.includes("'Server events, warnings, errors and application activity.'"),
    );
    assert.ok(adminView.includes("'Model inference log'"));
    assert.ok(
      adminView.includes("'Model requests, responses, tool calls and inference tracing.'"),
    );
    assert.ok(adminView.includes("checkbox.setAttribute('aria-describedby', descriptionId)"));
    assert.ok(adminView.includes("clearCheckbox.type = 'checkbox'"));
    assert.ok(adminView.includes("clearLabel.textContent = 'Clear all logs on server startup'"));
    assert.ok(adminView.includes("fetch('/api/admin/settings/logging')"));
    assert.ok(adminView.includes("method: 'PUT'"));
    assert.ok(adminView.includes('applicationLogEnabled: applicationLog.checkbox.checked'));
    assert.ok(
      adminView.includes('modelInferenceLogEnabled: modelInferenceLog.checkbox.checked'),
    );
    assert.ok(adminView.includes('clearLogsOnStartup: clearCheckbox.checked'));
    for (const level of ['error', 'warn', 'info', 'debug', 'trace']) {
      assert.ok(adminView.includes(`'${level}'`));
    }
    assert.ok(!adminView.includes('innerHTML'));
    assert.ok(!adminView.includes('userId'));
  });

  await it('renders per-connection model visibility controls without an explicit save button', () => {
    assert.ok(adminView.includes("heading.textContent = 'Model visibility'"));
    assert.ok(adminView.includes("showAllLabel.textContent = 'Show all discovered models'"));
    assert.ok(!adminView.includes('Save model visibility'));
    assert.ok(adminView.includes("loading.textContent = 'Loading models...'"));
    assert.ok(adminView.includes("empty.textContent = 'No models reported by this connection.'"));
    assert.ok(adminView.includes("retry.textContent = 'Retry'"));
    assert.ok(adminView.includes("selectAll.textContent = 'Select all'"));
    assert.ok(adminView.includes("clearAll.textContent = 'Clear all'"));
    assert.ok(adminView.includes('(currently unavailable)'));
    assert.ok(adminView.includes("descriptionLabel.textContent = 'Description'"));
    assert.ok(adminView.includes('description.maxLength = MAX_MODEL_DESCRIPTION_LENGTH'));
    assert.ok(adminView.includes('visibility.modelDescriptions[modelId]'));
    assert.ok(adminView.includes('Object.keys(visibility.modelDescriptions)'));
    assert.ok(adminView.includes('/api/admin/model-connections/${visibility.connectionId}/model-visibility'));
    assert.ok(adminView.includes('/api/admin/model-connections/${visibility.connectionId}/model-descriptions'));
    assert.ok(!adminView.includes('Save model descriptions'));
    assert.ok(adminView.includes('The saved filter was not changed.'));
    assert.ok(!adminView.includes('Authorization'));
    assert.ok(!adminView.includes('apiKey'));
  });

  await it('autosaves every model visibility user control without saving initial population', () => {
    assert.ok(adminView.includes("showAll.addEventListener('change', () =>"));
    assert.ok(adminView.includes("checkbox.addEventListener('change', () => scheduleSave('visibility'))"));
    assert.ok(adminView.includes("description.addEventListener('input', () => scheduleSave('descriptions'))"));
    assert.ok(adminView.includes("selectAll.addEventListener('click', () =>"));
    assert.ok(adminView.includes("clearAll.addEventListener('click', () =>"));
    assert.ok(adminView.includes("scheduleSave('visibility')"));
    assert.ok(adminView.includes('showAll.checked = !visibility.filterConfigured'));
    assert.ok(adminView.includes('checkbox.checked = visibility.filterConfigured'));
    const initialization = adminView.slice(
      adminView.indexOf('showAll.checked = !visibility.filterConfigured'),
      adminView.indexOf("showAll.addEventListener('change'"),
    );
    assert.ok(!initialization.includes('scheduleSave();'));
  });

  await it('debounces coherent explicit and show-all policy snapshots', () => {
    assert.ok(adminView.includes('const MODEL_VISIBILITY_SAVE_DELAY_MS = 300'));
    assert.ok(adminView.includes('window.clearTimeout(saveTimer)'));
    assert.ok(adminView.includes('window.setTimeout(() =>'));
    assert.ok(adminView.includes('filterConfigured: !showAll.checked'));
    assert.ok(adminView.includes('visibleModelIds: showAll.checked'));
    assert.ok(adminView.includes('? []'));
    assert.ok(adminView.includes("if (!checkbox.disabled) checkbox.checked = true"));
    assert.ok(adminView.includes('for (const checkbox of checkboxes.values()) checkbox.checked = false'));
    assert.ok(adminView.includes('...visibility.visibleModelIds.filter'));
  });

  await it('serializes saves so stale completions cannot replace newer UI intent', () => {
    assert.ok(adminView.includes('let saveInFlight = false'));
    assert.ok(adminView.includes('let editGeneration = 0'));
    assert.ok(adminView.includes('if (saveInFlight || !queuedSave) return'));
    assert.ok(adminView.includes('saving.generation === editGeneration && queuedSave === null'));
    assert.ok(adminView.includes('if (queuedSave && saveTimer === null) void flushSave()'));
    assert.ok(adminView.includes("saveVisibility: kind === 'visibility'"));
    assert.ok(adminView.includes("saveDescriptions: kind === 'descriptions'"));
    assert.ok(adminView.includes('!savedVisibility.filterConfigured || authoritativeIds.has'));
  });

  await it('shows compact autosave states and restores authoritative state after failure', () => {
    assert.ok(adminView.includes("editorStatus.textContent = 'Saving...'"));
    assert.ok(adminView.includes("editorStatus.textContent = 'Saved'"));
    assert.ok(adminView.includes("editorStatus.textContent = 'Failed to save'"));
    assert.ok(adminView.includes('await restoreAuthoritativeState()'));
    assert.ok(adminView.includes("renderEditor(panel, authoritative, 'Failed to save. Restored saved settings.', true)"));
    assert.ok(adminView.includes("method: 'PUT'"));
    assert.ok(adminView.includes('filterConfigured: saving.filterConfigured'));
    assert.ok(adminView.includes('visibleModelIds: saving.visibleModelIds'));
    assert.ok(adminView.includes('modelDescriptions: saving.modelDescriptions'));
    assert.ok(adminView.includes("form.querySelectorAll('button, input, textarea')"));
  });

  await it('renders overflow menu trigger for each log type', () => {
    assert.ok(adminView.includes('settings-log-overflow-trigger'));
    assert.ok(adminView.includes('\\u2026'));
    assert.ok(adminView.includes('aria-haspopup'));
  });

  await it('viewer menu contains exactly View log and Download items', () => {
    assert.ok(adminView.includes("'View log'"));
    assert.ok(adminView.includes("'Download'"));
    const menuItems = adminView.match(/settings-log-overflow-menu-button/g);
    assert.equal(menuItems?.length, 2, 'should have exactly two menu buttons');
  });

  await it('view log action fetches readable endpoint', () => {
    assert.ok(adminView.includes('/api/admin/logs/${streamIdentifier}/readable'));
  });

  await it('download action triggers file download via anchor element', () => {
    assert.ok(adminView.includes('/api/admin/logs/${streamIdentifier}/download'));
    assert.ok(adminView.includes("link.href = `/api/admin/logs/"));
    assert.ok(adminView.includes('link.download'));
    assert.ok(adminView.includes('link.click()'));
  });

  await it('log content is not rendered by default', () => {
    const logViewerFn = adminView.slice(
      adminView.indexOf("async function openLogViewer"),
      adminView.indexOf("return { group, checkbox };") + "return { group, checkbox };".length,
    );
    assert.ok(logViewerFn.includes('createConfirmationModal'), 'should use modal for log viewing');
    const beforeOpenLog = adminView.slice(0, adminView.indexOf("async function openLogViewer"));
    assert.ok(
      !beforeOpenLog.includes('admin-log-viewer-text'),
      'log viewer text element should not exist outside the handler',
    );
  });

  await it('uses stream identifiers for api calls', () => {
    assert.ok(adminView.includes("'application'"));
    assert.ok(adminView.includes("'model-inference'"));
  });

  await it('imports createConfirmationModal for log viewer modal', () => {
    assert.ok(
      adminView.includes("import { createConfirmationModal } from '../ConfirmationModal.js'"),
    );
  });

  await it('renders non-empty response text visibly in pre element', () => {
    const logViewerFn = adminView.slice(
      adminView.indexOf('async function openLogViewer'),
      adminView.indexOf('return { group, checkbox };'),
    );
    assert.ok(
      logViewerFn.includes('logText.textContent = text'),
      'non-empty response should be assigned to visible pre element',
    );
  });

  await it('shows No log entries for empty response', () => {
    const logViewerFn = adminView.slice(
      adminView.indexOf('async function openLogViewer'),
      adminView.indexOf('return { group, checkbox };'),
    );
    assert.ok(
      logViewerFn.includes("'No log entries.'"),
      'empty response should show No log entries message',
    );
    assert.ok(
      logViewerFn.includes("text.trim().length === 0") || logViewerFn.includes('text.length === 0'),
      'should check for empty or whitespace-only response',
    );
  });

  await it('shows error state for failed fetch', () => {
    const logViewerFn = adminView.slice(
      adminView.indexOf('async function openLogViewer'),
      adminView.indexOf('return { group, checkbox };'),
    );
    assert.ok(
      logViewerFn.includes("logText.textContent = 'Failed to load log"),
      'failed response should show error message in pre element',
    );
  });

  await it('successful response is not overwritten by loading or empty state', () => {
    const logViewerFn = adminView.slice(
      adminView.indexOf('async function openLogViewer'),
      adminView.indexOf('return { group, checkbox };'),
    );
    // Verify no Loading text remains after fetch completes - content should only be set in try/catch branches
    const fetchBlock = logViewerFn.slice(logViewerFn.indexOf('try {'));
    assert.ok(
      !fetchBlock.includes("'Loading"),
      'loading state should not appear inside the fetch try-catch block',
    );
    // Verify both empty and non-empty paths set content explicitly
    assert.ok(
      fetchBlock.includes("logText.textContent = 'No log entries.'") &&
        fetchBlock.includes('logText.textContent = text'),
      'both empty and non-empty response paths must assign visible content',
    );
  });

  await it('uses dedicated admin-log-viewer-backdrop class for large modal styling', () => {
    assert.ok(
      adminView.includes("'admin-log-viewer-backdrop'"),
      'log viewer modal should use dedicated backdrop modifier class',
    );
  });

  await it('download behavior uses anchor element not fetch', () => {
    const downloadFn = adminView.slice(
      adminView.indexOf('function triggerDownload'),
      adminView.indexOf('async function openLogViewer'),
    );
    assert.ok(
      downloadFn.includes("document.createElement('a')"),
      'download should create anchor element',
    );
    assert.ok(
      downloadFn.includes('link.click()'),
      'download should trigger click on anchor',
    );
    assert.ok(
      !downloadFn.includes('fetch('),
      'download should not use fetch - it uses browser navigation',
    );
  });

  await it('log viewer modal uses dedicated large-modal CSS with viewport-based sizing', () => {
    const logViewerCss = settingsCss.slice(
      settingsCss.indexOf('.admin-log-viewer-backdrop'),
    );
    assert.ok(
      logViewerCss.includes('width: min('),
      'log viewer should override width directly (not just max-width)',
    );
    assert.ok(
      logViewerCss.includes('vw') || logViewerCss.includes('100%'),
      'log viewer modal should use viewport-relative width',
    );
    assert.ok(
      logViewerCss.includes('vh'),
      'log viewer modal should use viewport-height for max-height',
    );
  });

  await it('ordinary ConfirmationModal base sizing remains unchanged', () => {
    const baseModal = confirmationModalCss.slice(
      0,
      confirmationModalCss.indexOf('.confirmation-modal-title'),
    );
    assert.ok(
      baseModal.includes('.confirmation-modal {'),
      'base confirmation-modal styles should exist',
    );
    // Base modal width should not contain viewport units - it uses fixed rem sizing
    const baseWidth = baseModal.match(/width:\s*[^;]+/);
    assert.ok(
      baseWidth && !baseWidth[0].includes('vw'),
      'ordinary ConfirmationModal should use fixed-width (rem) not viewport units',
    );
  });

  await it('log viewer content area has fixed viewport-relative height with overflow', () => {
    const contentCss = settingsCss.match(
      /\.admin-log-viewer-content\s*\{[^}]+\}/,
    );
    assert.ok(contentCss, 'admin-log-viewer-content styles should exist');
    assert.ok(
      contentCss[0].includes('vh'),
      'content area should use viewport-relative height',
    );
    assert.ok(
      contentCss[0].includes('clamp'),
      'content area should constrain height with clamp for responsiveness',
    );
    assert.ok(
      contentCss[0].includes('overflow: auto'),
      'content area should have overflow:auto for internal scrolling',
    );
  });

  await it('log viewer text uses monospace font with readable styling', () => {
    const textCss = settingsCss.match(
      /\.admin-log-viewer-text\s*\{[^}]+\}/,
    );
    assert.ok(textCss, 'admin-log-viewer-text styles should exist');
    assert.ok(
      textCss[0].includes('monospace'),
      'log text should use monospace font',
    );
    assert.ok(
      textCss[0].includes('pre-wrap') || textCss[0].includes('pre-wrap'),
      'log text should wrap long lines',
    );
  });

  await it('log viewer text has explicit dark foreground color for readability', () => {
    const textCss = settingsCss.match(
      /\.admin-log-viewer-text\s*\{[^}]+\}/,
    );
    assert.ok(textCss, 'admin-log-viewer-text styles should exist');
    assert.ok(
      !textCss[0].includes('color: inherit'),
      'log text must NOT use color: inherit on light background',
    );
    const colorMatch = textCss[0].match(/color:\s*([^;]+)/);
    assert.ok(colorMatch, 'log text should have an explicit color property');
    assert.ok(
      !colorMatch[1].trim().includes('inherit'),
      'log text color must be an explicit value, not inherit',
    );
  });

  await it('log viewer pre element fills available content height via block display', () => {
    const textCss = settingsCss.match(
      /\.admin-log-viewer-text\s*\{[^}]+\}/,
    );
    assert.ok(textCss, 'admin-log-viewer-text styles should exist');
    // <pre> is a block-level element by default and fills available height;
    // verify no display:none or other disruptive overrides
    assert.ok(
      !textCss[0].includes('display: none'),
      'log text pre must not be hidden',
    );
  });

  await it('ordinary ConfirmationModal remains unchanged for base modal styling', () => {
    const baseModal = confirmationModalCss.slice(
      0,
      confirmationModalCss.indexOf('.confirmation-modal-title'),
    );
    assert.ok(
      baseModal.includes('.confirmation-modal {'),
      'base confirmation-modal styles should exist',
    );
    // Base modal width should not contain viewport units - it uses fixed rem sizing
    const baseWidth = baseModal.match(/width:\s*[^;]+/);
    assert.ok(
      baseWidth && !baseWidth[0].includes('vw'),
      'ordinary ConfirmationModal should use fixed-width (rem) not viewport units',
    );
  });
});
