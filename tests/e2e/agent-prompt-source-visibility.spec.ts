import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const APP_ORIGIN = 'http://agent-prompt.test';
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
};

const permissions = {
  list: true,
  read: true,
  write: false,
  createDirectory: false,
  rename: false,
  delete: false,
};

function createAgent(id: number, source: 'inline' | 'file') {
  return {
    id,
    projectId: 1,
    sortOrder: id - 1,
    name: source === 'inline' ? 'Inline Agent' : 'File Agent',
    description: `${source} prompt source`,
    instructionSource: source,
    instructions: `${source} saved instructions`,
    instructionFilePath: `${source}-instructions.md`,
    assignmentSource: source,
    assignment: `${source} saved task`,
    assignmentFilePath: `${source}-task.md`,
    modelConnectionId: 1,
    modelId: 'test-model',
    allowModelSelection: false,
    triggerNextAgent: false,
    nextAgentId: null,
    saveResultToFile: false,
    resultDirectory: '',
    resultFilename: '',
    projectFilesystemPermissions: permissions,
    attachedProjectFiles: [],
    unloadModelAfterRun: false,
    skillIds: [],
    toolNames: [],
    toolConfigurations: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

async function installRoutes(page: Page): Promise<{ savedPayloads: unknown[] }> {
  const agents = [createAgent(1, 'inline'), createAgent(2, 'file')];
  const savedPayloads: unknown[] = [];

  await page.route(`${APP_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/test.html') {
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html>
          <link rel="stylesheet" href="/components/confirmation-modal.css">
          <link rel="stylesheet" href="/components/settings/settings.css">
          <link rel="stylesheet" href="/components/projects/projects.css">
          <script type="module">
            import { createProjectAgentsSection } from '/components/projects/ProjectAgentsSection.js';
            document.body.append(createProjectAgentsSection(1));
          </script>`,
      });
      return;
    }
    if (pathname === '/api/projects/1/agents' && request.method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(agents) });
      return;
    }
    if (pathname === '/api/projects/1/agents' && request.method() === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      savedPayloads.push(payload);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...createAgent(3, 'inline'), ...payload }),
      });
      return;
    }
    if (/^\/api\/projects\/1\/agents\/\d+\/runs\/latest$/.test(pathname)) {
      await route.fulfill({ contentType: 'application/json', body: 'null' });
      return;
    }
    if (pathname === '/api/model-connections') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{ id: 1, data: { name: 'Test connection' } }]),
      });
      return;
    }
    if (pathname === '/api/model-connections/1/models') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ models: [{ id: 'test-model', description: null }] }),
      });
      return;
    }
    if (pathname === '/api/skills' || pathname === '/api/tools') {
      await route.fulfill({ contentType: 'application/json', body: '[]' });
      return;
    }
    const saveMatch = pathname.match(/^\/api\/projects\/1\/agents\/(\d+)$/);
    if (saveMatch && request.method() === 'PUT') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      savedPayloads.push(payload);
      const agent = agents.find((candidate) => candidate.id === Number(saveMatch[1]));
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...agent, ...payload, updatedAt: 2 }),
      });
      return;
    }

    const filePath = resolve('dist/client', pathname.slice(1));
    await route.fulfill({
      contentType: MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      body: await readFile(filePath),
    });
  });

  return { savedPayloads };
}

test('Agent Prompt source fields have real visibility, preserve values, and keep the save payload', async ({
  page,
}) => {
  const { savedPayloads } = await installRoutes(page);
  await page.goto(`${APP_ORIGIN}/test.html`);

  await page.getByRole('button', { name: '+ New agent' }).click();
  const newModal = page.getByRole('dialog');
  await newModal.getByRole('textbox', { name: 'Name', exact: true }).fill('New none Agent');
  await newModal.getByRole('tab', { name: 'Prompt' }).click();
  const newInstructionSource = newModal.getByRole('group', { name: 'Instructions' });
  const newInlineInstructions = newModal.getByLabel('Inline instructions');
  const newInstructionFile = newModal.getByLabel('Instruction file');
  await expect(newInstructionSource.getByLabel('Write instructions')).not.toBeChecked();
  await expect(newInstructionSource.getByLabel('Use Project file')).not.toBeChecked();
  await expect(newInstructionSource.getByLabel('Not in use')).toBeChecked();
  await expect(newInlineInstructions).toBeHidden();
  await expect(newInstructionFile).toBeHidden();
  await newInstructionSource.getByLabel('Write instructions').check();
  await newInlineInstructions.fill('preserved new inline instructions');
  await newInstructionSource.getByLabel('Use Project file').check();
  await newInstructionFile.fill('preserved-new-file.md');
  await newInstructionSource.getByLabel('Not in use').check();
  await expect(newInlineInstructions).toBeHidden();
  await expect(newInstructionFile).toBeHidden();
  await newModal.getByRole('button', { name: 'Save' }).click();
  await expect(newModal).toBeHidden();
  expect(savedPayloads[0]).toMatchObject({
    instructionSource: 'none',
    instructions: 'preserved new inline instructions',
    instructionFilePath: 'preserved-new-file.md',
  });

  await page.getByRole('button', { name: /^Inline Agent inline prompt source/ }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('tab', { name: 'Prompt' }).click();

  const instructions = modal.getByLabel('Inline instructions');
  const instructionFile = modal.getByLabel('Instruction file');
  const assignment = modal.getByLabel('Task / Assignment');
  const assignmentFile = modal.getByLabel('Task file');
  const instructionSource = modal.getByRole('group', { name: 'Instructions' });
  const assignmentSource = modal.getByRole('group', { name: 'Task source' });

  await expect(instructions).toBeVisible();
  await expect(instructionFile).toBeHidden();
  await expect(assignment).toBeVisible();
  await expect(assignmentFile).toBeHidden();
  expect(await instructionFile.evaluate((element) => element.parentElement?.getBoundingClientRect().height)).toBe(0);
  expect(await assignmentFile.evaluate((element) => element.parentElement?.getBoundingClientRect().height)).toBe(0);

  await instructions.fill('unsaved inline instructions');
  await assignment.fill('unsaved inline task');
  await instructionSource.getByLabel('Not in use').check();
  await expect(instructions).toBeHidden();
  await expect(instructionFile).toBeHidden();
  await instructionSource.getByLabel('Write instructions').check();
  await expect(instructions).toHaveValue('unsaved inline instructions');
  await instructionSource.getByLabel('Use Project file').check();
  await assignmentSource.getByLabel('Use Project file').check();
  await expect(instructions).toBeHidden();
  await expect(instructionFile).toBeVisible();
  await expect(assignment).toBeHidden();
  await expect(assignmentFile).toBeVisible();

  await instructionFile.fill('unsaved-instructions.md');
  await assignmentFile.fill('unsaved-task.md');
  await instructionSource.getByLabel('Not in use').check();
  await expect(instructions).toBeHidden();
  await expect(instructionFile).toBeHidden();
  await instructionSource.getByLabel('Use Project file').check();
  await expect(instructionFile).toHaveValue('unsaved-instructions.md');
  await instructionSource.getByLabel('Write instructions').check();
  await assignmentSource.getByLabel('Write task').check();
  await expect(instructions).toHaveValue('unsaved inline instructions');
  await expect(assignment).toHaveValue('unsaved inline task');
  await instructionSource.getByLabel('Use Project file').check();
  await assignmentSource.getByLabel('Use Project file').check();
  await expect(instructionFile).toHaveValue('unsaved-instructions.md');
  await expect(assignmentFile).toHaveValue('unsaved-task.md');

  await modal.getByRole('tab', { name: 'General' }).click();
  await modal.getByRole('tab', { name: 'Prompt' }).click();
  await expect(instructions).toBeHidden();
  await expect(instructionFile).toBeVisible();
  await expect(assignment).toBeHidden();
  await expect(assignmentFile).toBeVisible();
  await expect(instructionFile).toHaveValue('unsaved-instructions.md');
  await expect(assignmentFile).toHaveValue('unsaved-task.md');

  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(modal).toBeHidden();
  expect(savedPayloads).toHaveLength(2);
  expect(savedPayloads[1]).toMatchObject({
    instructionSource: 'file',
    instructions: 'unsaved inline instructions',
    instructionFilePath: 'unsaved-instructions.md',
    assignmentSource: 'file',
    assignment: 'unsaved inline task',
    assignmentFilePath: 'unsaved-task.md',
  });

  await page.getByRole('button', { name: /^File Agent file prompt source/ }).click();
  const fileModal = page.getByRole('dialog');
  await fileModal.getByRole('tab', { name: 'Prompt' }).click();
  await expect(fileModal.getByLabel('Inline instructions')).toBeHidden();
  await expect(fileModal.getByLabel('Instruction file')).toBeVisible();
  await expect(fileModal.getByLabel('Task / Assignment')).toBeHidden();
  await expect(fileModal.getByLabel('Task file')).toBeVisible();
});
