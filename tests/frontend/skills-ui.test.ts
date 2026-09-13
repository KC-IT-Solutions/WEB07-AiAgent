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
const view = readFileSync(
  resolve(projectRoot, 'src/client/components/skills/SkillsView.ts'),
  'utf8',
);
const css = readFileSync(resolve(projectRoot, 'src/client/components/skills/skills.css'), 'utf8');

await describe('Skills Admin UI', async () => {
  await it('shows Skills navigation only from the server admin capability', () => {
    assert.ok(layout.includes("skillsNavLink.textContent = 'Skills'"));
    assert.ok(layout.includes('skillsNavItem.hidden = true'));
    assert.ok(layout.includes('(capabilities as Record<string, unknown>).isAdmin === true'));
    assert.ok(layout.includes('skillsNavItem.hidden = false'));
    assert.ok(layout.includes('skillsNavItem.hidden = true'));
    assert.ok(!layout.includes('userId === 1'));
  });

  await it('renders list, create/edit fields, and server-provided tool choices', () => {
    assert.ok(view.includes("fetch('/api/admin/skills')"));
    assert.ok(view.includes("fetch('/api/tools')"));
    assert.ok(view.includes("createButton.textContent = 'Create Skill'"));
    assert.ok(view.includes("'Name', nameInput"));
    assert.ok(view.includes("'Command name', commandInput"));
    assert.ok(view.includes("'Markdown', markdownInput"));
    assert.ok(view.includes("legend.textContent = 'Required tools'"));
    assert.ok(view.includes('skill?.requiredTools.includes(tool.name)'));
    assert.ok(view.includes('nameInput.value = skill?.name'));
    assert.ok(view.includes('markdownInput.value = skill?.markdown'));
    assert.ok(view.includes('requiredTools.join'));
  });

  await it('uses the reusable confirmation flow and safe DOM output', () => {
    assert.ok(view.includes('createConfirmationModal({'));
    assert.ok(view.includes("title: 'Delete Skill?'"));
    assert.ok(view.includes('destructive: true'));
    assert.ok(!view.includes('confirm('));
    assert.ok(!view.includes('innerHTML'));
    assert.ok(!view.includes('React'));
    assert.ok(!view.includes('jsx'));
  });

  await it('contains editor controls within the modal content width', () => {
    assert.ok(css.includes('.skills-editor .settings-form-group'));
    assert.ok(css.includes('.skills-editor .settings-input'));
    assert.ok(css.includes('.skills-editor .skills-tool-fieldset'));
    assert.ok(css.includes('width: 100%'));
    assert.ok(css.includes('max-width: 100%'));
    assert.ok(css.includes('box-sizing: border-box'));
    assert.ok(css.includes('resize: vertical'));
    assert.ok(css.includes('@media (max-width: 640px)'));
  });
});
