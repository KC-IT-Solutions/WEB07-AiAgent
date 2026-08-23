import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
assert.ok(projectRoot, 'Project root should be found');

const modalPath = resolve(
  projectRoot,
  'src/client/components/ConfirmationModal.ts',
);
const modal = readFileSync(modalPath, 'utf-8');

function extractSection(startMarker: string, endMarker: string): string {
  const start = modal.indexOf(startMarker);
  assert.notStrictEqual(start, -1, `Marker should exist: ${startMarker}`);
  const end = modal.indexOf(endMarker, start);
  assert.ok(end > start, `Marker should exist after previous marker: ${endMarker}`);
  return modal.substring(start, end);
}

await describe('confirmation modal', async () => {
  await it('has an explicit reusable confirmation API', () => {
    assert.ok(modal.includes('title: string'));
    assert.ok(modal.includes('message: string'));
    assert.ok(modal.includes('confirmLabel: string'));
    assert.ok(modal.includes('cancelLabel: string'));
    assert.ok(modal.includes('destructive?: boolean'));
    assert.ok(modal.includes('onConfirm: () => void | Promise<void>'));
    assert.ok(modal.includes('onCancel: () => void'));
    assert.ok(!modal.toLowerCase().includes('chat'));
  });

  await it('provides an accessible named dialog and moves focus into it', () => {
    assert.ok(modal.includes("dialog.setAttribute('role', 'dialog')"));
    assert.ok(modal.includes("dialog.setAttribute('aria-modal', 'true')"));
    assert.ok(
      modal.includes("dialog.setAttribute('aria-labelledby', titleId)"),
    );
    assert.ok(modal.includes('title.textContent = options.title'));
    assert.ok(modal.includes('cancelButton.focus()'));
  });

  await it('cancels without confirming from the Cancel action', () => {
    const cancelSection = extractSection('function cancel()', 'function handleKeydown');
    assert.ok(cancelSection.includes('close(true)'));
    assert.ok(!cancelSection.includes('options.onConfirm'));
    assert.ok(modal.includes("cancelButton.addEventListener('click', cancel)"));
  });

  await it('cancels without confirming when Escape is pressed', () => {
    const keydownSection = extractSection('function handleKeydown', 'async function confirm');
    assert.ok(keydownSection.includes("event.key === 'Escape'"));
    assert.ok(keydownSection.includes('cancel()'));
    assert.ok(!keydownSection.includes('options.onConfirm'));
  });

  await it('cancels without confirming when the backdrop is clicked', () => {
    const backdropSection = extractSection(
      "backdrop.addEventListener('click'",
      "document.addEventListener('keydown'",
    );
    assert.ok(backdropSection.includes('event.target === backdrop'));
    assert.ok(backdropSection.includes('cancel()'));
    assert.ok(!backdropSection.includes('options.onConfirm'));
  });

  await it('disables both actions while confirmation proceeds', () => {
    const confirmSection = extractSection(
      'async function confirm',
      "cancelButton.addEventListener('click'",
    );
    assert.ok(confirmSection.includes('cancelButton.disabled = true'));
    assert.ok(confirmSection.includes('confirmButton.disabled = true'));
    assert.ok(confirmSection.includes('await options.onConfirm()'));
    assert.ok(confirmSection.includes('close(false)'));
  });

  await it('supports destructive styling and restores focus after closing', () => {
    assert.ok(modal.includes('options.destructive'));
    assert.ok(modal.includes('confirmation-modal-confirm-destructive'));
    assert.ok(modal.includes('returnFocusTo.isConnected'));
    assert.ok(modal.includes('returnFocusTo.focus()'));
  });
});
