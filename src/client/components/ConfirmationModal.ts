export interface ConfirmationModalOptions {
  title: string;
  message: string;
  content?: HTMLElement;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  returnFocusTo?: HTMLElement;
  onConfirm: () => void | Promise<void>;
  canCloseAfterConfirm?: () => boolean;
  onCancel?: () => void | Promise<void>;
}

let confirmationModalId = 0;

export function createConfirmationModal(options: ConfirmationModalOptions): HTMLElement {
  const titleId = `confirmation-modal-title-${++confirmationModalId}`;
  const backdrop = document.createElement('div');
  const dialog = document.createElement('section');
  const title = document.createElement('h2');
  const message = document.createElement('p');
  const actions = document.createElement('div');
  const confirmButton = document.createElement('button');
  const returnFocusTo = options.returnFocusTo ?? document.activeElement;
  let confirmationInProgress = false;
  let cancelButton: HTMLButtonElement | undefined;

  backdrop.className = 'confirmation-modal-backdrop';
  dialog.className = 'confirmation-modal';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);

  title.id = titleId;
  title.className = 'confirmation-modal-title';
  title.textContent = options.title;

  message.className = 'confirmation-modal-message';
  message.textContent = options.message;

  actions.className = 'confirmation-modal-actions';

  confirmButton.type = 'button';
  confirmButton.className = options.destructive
    ? 'confirmation-modal-button confirmation-modal-confirm confirmation-modal-confirm-destructive'
    : 'confirmation-modal-button confirmation-modal-confirm';
  confirmButton.textContent = options.confirmLabel;

  function close(): void {
    document.removeEventListener('keydown', handleKeydown);
    backdrop.remove();

    if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) {
      returnFocusTo.focus();
    }
  }

  async function cancel(): Promise<void> {
    if (options.onCancel) {
      await options.onCancel();
    }

    close();
  }

  if (options.cancelLabel) {
    cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'confirmation-modal-button confirmation-modal-cancel';
    cancelButton.textContent = options.cancelLabel;
    cancelButton.addEventListener('click', cancel);
    actions.appendChild(cancelButton);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      void cancel();
    }
  }

  async function confirm(): Promise<void> {
    if (confirmationInProgress) {
      return;
    }

    confirmationInProgress = true;
    if (cancelButton) cancelButton.disabled = true;
    confirmButton.disabled = true;

    try {
      await options.onConfirm();
      if (!options.canCloseAfterConfirm || options.canCloseAfterConfirm()) {
        close();
      }
    } catch {
      close();
    } finally {
      confirmationInProgress = false;
      if (cancelButton) cancelButton.disabled = false;
      confirmButton.disabled = false;
    }
  }

  confirmButton.addEventListener('click', () => {
    void confirm();
  });

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      void cancel();
    }
  });

  document.addEventListener('keydown', handleKeydown);

  actions.appendChild(confirmButton);
  dialog.appendChild(title);

  if (options.message) {
    dialog.appendChild(message);
  }

  if (options.content) {
    dialog.appendChild(options.content);
  }

  dialog.appendChild(actions);
  backdrop.appendChild(dialog);

  queueMicrotask(() => {
    if (dialog.isConnected) {
      const firstField = options.content?.querySelector<HTMLElement>('input, select, textarea');

      if (firstField) {
        firstField.focus();
      } else if (cancelButton) {
        cancelButton.focus();
      } else {
        confirmButton.focus();
      }
    }
  });

  return backdrop;
}