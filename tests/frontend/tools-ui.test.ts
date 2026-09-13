import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findProjectRoot(startDir: string): string | null {
  let current = startDir;
  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'package.json'))) return current;
    current = dirname(current);
  }
  return null;
}

const projectRoot = findProjectRoot(__dirname);
assert.ok(projectRoot);
const layout = readFileSync(resolve(projectRoot, 'src/client/components/layout.ts'), 'utf8');
const sidebarCss = readFileSync(
  resolve(projectRoot, 'src/client/components/chat/chat.css'),
  'utf8',
);
const settingsView = readFileSync(
  resolve(projectRoot, 'src/client/components/settings/SettingsView.ts'),
  'utf8',
);
const toolsView = readFileSync(
  resolve(projectRoot, 'src/client/components/tools/ToolsView.ts'),
  'utf8',
);
const agentView = readFileSync(
  resolve(projectRoot, 'src/client/components/projects/ProjectAgentsSection.ts'),
  'utf8',
);
const toolRegistry = readFileSync(
  resolve(projectRoot, 'src/server/tools/tool-registry.ts'),
  'utf8',
);
const server = readFileSync(resolve(projectRoot, 'src/server.ts'), 'utf8');

await describe('Sidebar and Tools UI', async () => {
  await it('keeps upper navigation scrollable and Settings navigation structurally anchored', () => {
    assert.ok(layout.includes("upperNavList.className = 'chat-sidebar-navigation'"));
    assert.ok(layout.includes("bottomNavList.className = 'chat-sidebar-bottom'"));
    assert.ok(layout.includes('bottomNavList.appendChild(settingsNavItem)'));
    assert.ok(layout.includes('bottomNavList.appendChild(adminSettingsNavItem)'));
    assert.ok(layout.includes('upperNavList.appendChild(projectsListPanel)'));
    assert.ok(sidebarCss.includes('.chat-sidebar .chat-sidebar-navigation'));
    assert.ok(sidebarCss.includes('flex: 1 1 auto'));
    assert.ok(sidebarCss.includes('overflow-y: auto'));
    assert.ok(sidebarCss.includes('.chat-sidebar .chat-sidebar-bottom'));
    assert.ok(sidebarCss.includes('flex: 0 0 auto'));
  });

  await it('keeps admin gating without a placeholder and groups authorized Admin Settings at bottom', () => {
    assert.ok(layout.includes('adminSettingsNavItem.hidden = true'));
    assert.ok(layout.includes('adminSettingsNavItem.hidden = false'));
    assert.ok(layout.includes("(capabilities as Record<string, unknown>).isAdmin === true"));
    assert.ok(!layout.includes('adminSettingsNavItem.disabled'));
  });

  await it('preserves Chat, expandable Projects, Tools, and Skills in upper navigation order', () => {
    const chat = layout.indexOf('upperNavList.appendChild(chatNavItem)');
    const projects = layout.indexOf('upperNavList.appendChild(projectsNavItem)');
    const tools = layout.indexOf('upperNavList.appendChild(toolsNavItem)');
    const skills = layout.indexOf('upperNavList.appendChild(skillsNavItem)');
    assert.ok(chat >= 0 && chat < projects && projects < tools && tools < skills);
    assert.ok(layout.includes("projectsSectionToggle.setAttribute('aria-expanded', 'false')"));
    assert.ok(layout.includes('projectsListPanel.hidden = !isProjectsSectionExpanded'));
    assert.ok(layout.includes("toolsNavLink.textContent = 'Tools'"));
    assert.ok(layout.includes("skillsNavLink.textContent = 'Skills'"));
  });

  await it('routes Tools directly and activates only the selected top-level item', () => {
    assert.ok(layout.includes("toolsNavLink.href = '/tools'"));
    assert.ok(layout.includes("window.history.pushState({}, '', '/tools')"));
    assert.ok(layout.includes("window.location.pathname === '/tools'"));
    assert.ok(layout.includes("switchView('tools')"));
    assert.ok(layout.includes('createToolsView()'));
    assert.ok(layout.includes("navItems.set('tools', toolsNavLink)"));
    assert.ok(layout.includes("item.classList.add('chat-sidebar-item-active')"));
    assert.ok(layout.includes("item.classList.remove('chat-sidebar-item-active')"));
    assert.ok(server.includes("app.get('/tools'"));
  });

  await it('retains Settings and Admin Settings active-state switching', () => {
    assert.ok(layout.includes("navItems.set('settings', settingsNavLink)"));
    assert.ok(layout.includes("navItems.set('admin-settings', adminSettingsNavLink)"));
    assert.ok(layout.includes("switchView('settings')"));
    assert.ok(layout.includes("switchView('admin-settings')"));
  });

  await it('owns the existing tool configuration only in the standalone Tools view', () => {
    assert.ok(toolsView.includes('export function createToolsView'));
    assert.ok(toolsView.includes("toolsDescription.textContent = 'Configure available tools.'"));
    assert.ok(toolsView.includes("fetch('/api/tools')"));
    assert.ok(toolsView.includes('tool.settings.enabledForChat'));
    assert.ok(toolsView.includes('`/api/tools/${tool.name}/settings`'));
    assert.ok(toolsView.includes("method: 'PUT'"));
    assert.ok(toolsView.includes('body: JSON.stringify(updatedSettings)'));
    assert.ok(!settingsView.includes("fetch('/api/tools')"));
    assert.ok(!settingsView.includes("toolsTitle.textContent = 'Tools'"));
  });

  await it('leaves Agent tool selection and ToolRegistry execution semantics intact', () => {
    assert.ok(agentView.includes("fetch('/api/tools')"));
    assert.ok(agentView.includes('new Set(agent?.toolNames ?? [])'));
    assert.ok(agentView.includes('toolNames: [...toolChecklist.inputs]'));
    assert.ok(toolRegistry.includes('this.tools = new Map(tools.map((tool) => [tool.name, tool]))'));
    assert.ok(toolRegistry.includes('return tool.execute(argumentsValue, settings, signal, context)'));
    assert.ok(toolsView.includes('payload.filter((tool) => !tool.agentOnly)'));
  });

  await it('recognizes yahoo_finance_data as a valid ToolMetadata variant', () => {
    assert.ok(toolsView.includes("name: 'yahoo_finance_data'"));
    assert.ok(toolsView.includes('interface YahooFinanceDataToolSettings'));
    assert.ok(toolsView.includes("metadata.name === 'yahoo_finance_data'"));
  });

  await it('accepts yahoo_finance_data with enabledForChat boolean settings', () => {
    const yahooStart = toolsView.indexOf('interface YahooFinanceDataToolSettings');
    const yahooEnd = toolsView.indexOf('}', yahooStart) + 1;
    const yahooInterfaceBlock = toolsView.substring(yahooStart, yahooEnd);
    assert.ok(yahooInterfaceBlock.includes('enabledForChat'));
    assert.ok(!yahooInterfaceBlock.includes('pageSize'));
    assert.ok(!yahooInterfaceBlock.includes('contentLimit'));
  });

  await it('validates yahoo_finance_data through isToolMetadata type guard', () => {
    const guardSection = toolsView.substring(
      toolsView.indexOf("metadata.name === 'fred_data'"),
      toolsView.indexOf("metadata.name === 'visit_website'") + 40,
    );
    assert.ok(guardSection.includes("metadata.name === 'yahoo_finance_data'"));
    const yahooGuard = guardSection.substring(
      guardSection.indexOf("metadata.name === 'yahoo_finance_data'"),
      guardSection.indexOf("metadata.name === 'yahoo_finance_data'") + 80,
    );
    assert.ok(yahooGuard.includes('return true'));
  });

  await it('rejects malformed yahoo_finance_data settings without enabledForChat', () => {
    const enabledCheck = toolsView.substring(
      toolsView.indexOf("typeof settings.enabledForChat !== 'boolean'"),
      toolsView.indexOf("typeof settings.enabledForChat !== 'boolean'") + 60,
    );
    assert.ok(enabledCheck.includes('return false'));
  });

  await it('preserves fred_data parsing alongside yahoo_finance_data', () => {
    assert.ok(toolsView.includes("metadata.name === 'fred_data'"));
    const fredYahooSection = toolsView.substring(
      toolsView.indexOf("metadata.name === 'fred_data'"),
      toolsView.indexOf("metadata.name === 'yahoo_finance_data'") + 40,
    );
    assert.ok(fredYahooSection.includes("metadata.name === 'fred_data'"));
    assert.ok(fredYahooSection.includes("metadata.name === 'yahoo_finance_data'"));
  });

  await it('preserves duckduckgo_search parsing with full settings validation', () => {
    assert.ok(toolsView.includes("metadata.name === 'duckduckgo_search'"));
    assert.ok(toolsView.includes('settings.pageSize'));
    assert.ok(toolsView.includes('settings.safeSearch'));
    assert.ok(toolsView.includes('settings.requestDelayMs'));
    assert.ok(toolsView.includes('settings.cooldownAfter202Ms'));
  });

  await it('preserves visit_website parsing with full settings validation', () => {
    assert.ok(toolsView.includes("metadata.name === 'visit_website'"));
    assert.ok(toolsView.includes('settings.contentLimit'));
    assert.ok(toolsView.includes('settings.maxLinks'));
    assert.ok(toolsView.includes('settings.maxImages'));
  });

  await it('includes yahoo_finance_data in updatedSettings type union', () => {
    const settingsTypeLine = toolsView.split('\n').find((line) => line.includes('YahooFinanceDataToolSettings') && line.includes('updatedSettings'));
    assert.ok(settingsTypeLine);
  });

  await it('handles yahoo_finance_data in post-save settings update chain', () => {
    const saveChain = toolsView.substring(
      toolsView.indexOf("tool.name === 'duckduckgo_search' && 'pageSize'"),
      toolsView.indexOf("trigger.textContent") + 30,
    );
    assert.ok(saveChain.includes("'yahoo_finance_data'"));
  });
});
