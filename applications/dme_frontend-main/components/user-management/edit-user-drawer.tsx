'use client';

import { useState, type FormEvent } from 'react';
import { DrawerField } from '@/components/shared/drawer-field';
import { useI18n } from '@/lib/i18n/i18n-context';
import type { ManagedUser } from '@/types/auth';

export function EditUserDrawer({
  user,
  onClose,
  onSubmit,
}: {
  user: ManagedUser;
  onClose: () => void;
  onSubmit: (input: {
    firstName: string;
    lastName: string;
    phone: string | null;
  }) => Promise<void>;
}) {
  const { messages } = useI18n();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  function handleClose() {
    setIsClosing(true);
    setTimeout(() => onClose(), 350);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
      });
      handleClose();
    } catch {
      // error is surfaced by the parent via the notice/error banner
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className={`drawer-backdrop${isClosing ? ' backdrop-closing' : ''}`}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <aside
        className={`user-drawer${isClosing ? ' drawer-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-user-drawer-title"
      >
        <button
          className="drawer-close"
          type="button"
          onClick={handleClose}
          aria-label={messages.userManagement.drawerClose}
        >
          ×
        </button>
        <h2 id="edit-user-drawer-title">
          {messages.userManagement.editDrawerTitle}
        </h2>
        <p>{messages.userManagement.editDrawerSubtitle}</p>
        <hr />
        <form onSubmit={submit}>
          <DrawerField label={messages.userManagement.drawerNameLabel} required>
            <div className="drawer-name-fields">
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder={messages.userManagement.drawerFirstNamePlaceholder}
                required
              />
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder={messages.userManagement.drawerLastNamePlaceholder}
                required
              />
            </div>
          </DrawerField>
          <DrawerField label={messages.userManagement.drawerPhoneLabel}>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={messages.userManagement.drawerPhonePlaceholder}
            />
          </DrawerField>
          <div className="drawer-actions">
            <button
              className="outline-button"
              type="button"
              onClick={handleClose}
            >
              {messages.userManagement.drawerCancel}
            </button>
            <button
              className="orange-button"
              type="submit"
              disabled={isSubmitting || !firstName.trim() || !lastName.trim()}
            >
              {isSubmitting
                ? messages.userManagement.editDrawerSubmitting
                : messages.userManagement.editDrawerSubmit}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
