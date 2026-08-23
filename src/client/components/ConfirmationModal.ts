export interface ConfirmationModalOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  returnFocusTo?: HTMLElement;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

let confirmationModalId = 0;

export function createConfirmationModal(options: ConfirmationModalOptions): HTMLElement {
  const titleId = `confirmation-modal-title-${++confirmationModalId}`;
  const backdrop = document.createElement('div');
  const dialog = document.createElement('section');
  const title = document.createElement('h2');
  const message = document.createElement('p');
  const actions = document.createElement('div');
  const cancelButton = document.createElement('button');
  const confirmButton = document.createElement('button');
  const returnFocusTo = options.returnFocusTo ?? document.activeElement;
  let confirmationInProgress = false;

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

  cancelButton.type = 'button';
  cancelButton.className = 'confirmation-modal-button confirmation-modal-cancel';
  cancelButton.textContent = options.cancelLabel;

  confirmButton.type = 'button';
  confirmButton.className = options.destructive
    ? 'confirmation-modal-button confirmation-modal-confirm confirmation-modal-confirm-destructive'
    : 'confirmation-modal-button confirmation-modal-confirm';
  confirmButton.textContent = options.confirmLabel;

  function close(cancelled: boolean): void {
    document.removeEventListener('keydown', handleKeydown);
    backdrop.remove();
    if (cancelled) {
      options.onCancel();
    }
    if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) {
      returnFocusTo.focus();
    }
  }

  function cancel(): void {
    if (!confirmationInProgress) {
      close(true);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  }

  async function confirm(): Promise<void> {
    if (confirmationInProgress) {
      return;
    }

    confirmationInProgress = true;
    cancelButton.disabled = true;
    confirmButton.disabled = true;

    try {
      await options.onConfirm();
      close(false);
    } finally {
      confirmationInProgress = false;
      cancelButton.disabled = false;
      confirmButton.disabled = false;
    }
  }

  cancelButton.addEventListener('click', cancel);
  confirmButton.addEventListener('click', () => void confirm());
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      cancel();
    }
  });
  document.addEventListener('keydown', handleKeydown);

  actions.appendChild(cancelButton);
  actions.appendChild(confirmButton);
  dialog.appendChild(title);
  dialog.appendChild(message);
  dialog.appendChild(actions);
  backdrop.appendChild(dialog);

  queueMicrotask(() => {
    if (cancelButton.isConnected) {
      cancelButton.focus();
    }
  });

  return backdrop;
}
