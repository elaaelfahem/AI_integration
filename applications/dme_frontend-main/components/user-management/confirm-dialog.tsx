'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useI18n } from '@/lib/i18n/i18n-context';

export interface ConfirmDialogState {
  title: string;
  message: string;
  actionLabel: string;
  tone?: 'danger' | 'default';
  variant?:
    | 'block'
    | 'unblock'
    | 'delete'
    | 'password-reset-request'
    | 'password-reset'
    | 'cancel-invitation';
  email?: string;
  user?: { firstName: string; lastName: string; role: string };
  onConfirm: () => Promise<void>;
}

export function ConfirmDialog({
  dialog,
  isWorking,
  onClose,
}: {
  dialog: ConfirmDialogState | null;
  isWorking: boolean;
  onClose: () => void;
}) {
  const { messages } = useI18n();
  const [isClosing, setIsClosing] = useState(false);
  const [prevDialog, setPrevDialog] = useState(dialog);

  if (dialog !== prevDialog) {
    setPrevDialog(dialog);
    if (dialog && !prevDialog) {
      setIsClosing(false);
    }
  }

  if (!dialog) return null;

  function handleClose() {
    if (isWorking) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }

  async function handleConfirm() {
    if (!dialog) return;
    await dialog.onConfirm();
  }

  const isPasswordReset = dialog.variant === 'password-reset';
  const isPasswordResetRequest = dialog.variant === 'password-reset-request';
  const isDelete = dialog.variant === 'delete';
  const title =
    dialog.variant === 'block'
      ? messages.userManagement.dialogBlockTitle
      : dialog.variant === 'unblock'
        ? messages.userManagement.dialogUnblockTitle
        : dialog.title;
  const subtitle =
    dialog.variant === 'block'
      ? messages.confirmDialog.blockSubtitle
      : dialog.variant === 'unblock'
        ? messages.confirmDialog.unblockSubtitle
        : dialog.variant === 'cancel-invitation'
          ? messages.confirmDialog.cancelInvitationSubtitle
          : null;
  const dialogClass = isPasswordReset
    ? 'b2b-modal-password-reset'
    : isPasswordResetRequest
      ? 'b2b-modal-password-reset-request'
      : isDelete
        ? 'b2b-modal-delete'
        : 'b2b-modal-confirmation';

  return (
    <div
      className={`b2b-modal-backdrop${isClosing ? ' backdrop-closing' : ''}`}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isWorking) handleClose();
      }}
    >
      <section
        className={`b2b-modal ${dialogClass}${isClosing ? ' modal-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <button
          className="b2b-modal-close"
          type="button"
          onClick={handleClose}
          disabled={isWorking}
          aria-label={messages.confirmDialog.close}
        >
          ×
        </button>
        {isPasswordReset ? (
          <Image
            className="b2b-modal-envelope"
            src="/envelope.svg"
            alt=""
            width={96}
            height={99}
            aria-hidden="true"
          />
        ) : null}
        <h3 id="confirm-dialog-title">{title}</h3>
        {isDelete ? (
          <>
            <p className="b2b-modal-subtitle">
              {messages.confirmDialog.deleteSubtitle}
            </p>
            <p className="b2b-modal-message">
              {messages.confirmDialog.deleteMessage}
            </p>
            <hr />
            <div className="b2b-reset-form">
              <label>
                <span>{messages.confirmDialog.nameLabel}</span>
                <input
                  value={
                    dialog.user
                      ? `${dialog.user.firstName} ${dialog.user.lastName}`
                      : ''
                  }
                  readOnly
                />
              </label>
              <label>
                <span>{messages.confirmDialog.emailLabel}</span>
                <input value={dialog.email ?? ''} readOnly />
              </label>
              <label>
                <span>{messages.confirmDialog.roleLabel}</span>
                <input
                  value={
                    dialog.user?.role === 'MANAGER'
                      ? messages.confirmDialog.roleManager
                      : (dialog.user?.role ?? '')
                  }
                  readOnly
                />
              </label>
            </div>
            <div className="b2b-delete-warning">
              <span aria-hidden="true">⚠</span>
              <div>
                {messages.confirmDialog.deleteWarningIntro}
                <ul>
                  <li>{messages.confirmDialog.deleteWarningReassign}</li>
                  <li>{messages.confirmDialog.deleteWarningHistory}</li>
                </ul>
              </div>
            </div>
            <div className="b2b-reset-actions">
              <button
                className="b2b-button b2b-button-secondary"
                type="button"
                onClick={handleClose}
                disabled={isWorking}
              >
                {messages.confirmDialog.cancelAction}
              </button>
              <button
                className="b2b-button b2b-button-danger"
                type="button"
                onClick={() => void handleConfirm()}
                disabled={isWorking}
              >
                {isWorking
                  ? messages.confirmDialog.deleting
                  : messages.confirmDialog.deleteAction}
              </button>
            </div>
          </>
        ) : isPasswordResetRequest ? (
          <>
            <p className="b2b-modal-subtitle">
              {messages.confirmDialog.passwordResetRequestSubtitle}
            </p>
            <p className="b2b-modal-message">
              {messages.confirmDialog.passwordResetRequestMessage}
            </p>
            <hr />
            <div className="b2b-reset-form">
              <label>
                <span>{messages.confirmDialog.nameLabel}</span>
                <input
                  value={
                    dialog.user
                      ? `${dialog.user.firstName} ${dialog.user.lastName}`
                      : ''
                  }
                  readOnly
                />
              </label>
              <label>
                <span>{messages.confirmDialog.emailLabel}</span>
                <input value={dialog.email ?? ''} readOnly />
              </label>
              <label>
                <span>{messages.confirmDialog.roleLabel}</span>
                <input
                  value={
                    dialog.user?.role === 'MANAGER'
                      ? messages.confirmDialog.roleManager
                      : (dialog.user?.role ?? '')
                  }
                  readOnly
                />
              </label>
              <label className="b2b-reset-check">
                <input type="checkbox" defaultChecked />{' '}
                <span>{messages.confirmDialog.sendImmediately}</span>
              </label>
              <label className="b2b-reset-check">
                <input type="checkbox" defaultChecked />{' '}
                <span>{messages.confirmDialog.forceChangeNextLogin}</span>
              </label>
            </div>
            <div className="b2b-reset-actions">
              <button
                className="b2b-button b2b-button-secondary"
                type="button"
                onClick={handleClose}
                disabled={isWorking}
              >
                {messages.confirmDialog.cancelAction}
              </button>
              <button
                className="b2b-button b2b-button-primary"
                type="button"
                onClick={() => void handleConfirm()}
                disabled={isWorking}
              >
                {isWorking
                  ? messages.confirmDialog.sending
                  : messages.confirmDialog.sendLink}
              </button>
            </div>
          </>
        ) : (
          <>
            {subtitle ? <p className="b2b-modal-subtitle">{subtitle}</p> : null}
            <p className="b2b-modal-message">
              {isPasswordReset && dialog.email ? (
                <>
                  {messages.confirmDialog.emailSentPrefix}
                  <br />
                  <strong>{dialog.email}</strong>{' '}
                  {messages.confirmDialog.emailSentMiddle}
                  <br />
                  {messages.confirmDialog.emailSentSuffix}
                </>
              ) : (
                dialog.message
              )}
            </p>
            <hr />
            {isPasswordReset ? (
              <>
                <button
                  className="b2b-button b2b-button-primary"
                  type="button"
                  onClick={handleClose}
                >
                  {messages.confirmDialog.backToDashboard}
                </button>
                <p className="b2b-modal-resend">
                  {messages.confirmDialog.noCodeReceived}
                  <button
                    type="button"
                    onClick={() => void handleConfirm()}
                    disabled={isWorking}
                  >
                    {messages.confirmDialog.resend}
                  </button>
                </p>
              </>
            ) : (
              <div className="b2b-modal-actions">
                <button
                  className={`b2b-button ${dialog.tone === 'danger' || dialog.variant === 'block' || dialog.variant === 'cancel-invitation' ? 'b2b-button-danger' : 'b2b-button-primary'}`}
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={isWorking}
                >
                  {isWorking
                    ? messages.confirmDialog.processing
                    : dialog.actionLabel}
                </button>
                <button
                  className="b2b-button b2b-button-secondary"
                  type="button"
                  onClick={handleClose}
                  disabled={isWorking}
                >
                  {messages.confirmDialog.cancelAction}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
