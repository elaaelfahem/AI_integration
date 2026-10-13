'use client';

import { useState, type FormEvent } from 'react';
import { DrawerField } from '@/components/shared/drawer-field';
import { useI18n } from '@/lib/i18n/i18n-context';
import type { Messages } from '@/lib/i18n/messages';
import type { ClientCategory, Company } from '@/types/auth';

export const TUNISIA_GOVERNORATES = [
  'Tunis',
  'Ariana',
  'Ben Arous',
  'Manouba',
  'Nabeul',
  'Zaghouan',
  'Bizerte',
  'Béja',
  'Jendouba',
  'Le Kef',
  'Siliana',
  'Kairouan',
  'Kasserine',
  'Sidi Bouzid',
  'Sousse',
  'Monastir',
  'Mahdia',
  'Sfax',
  'Gafsa',
  'Tozeur',
  'Kébili',
  'Gabès',
  'Médenine',
  'Tataouine',
];

export const CLIENT_CATEGORIES: ClientCategory[] = [
  'BRONZE',
  'SILVER',
  'GOLD',
  'DIAMOND',
];

export function categoryLabel(category: ClientCategory, messages: Messages) {
  return {
    BRONZE: messages.companies.categoryBronze,
    SILVER: messages.companies.categorySilver,
    GOLD: messages.companies.categoryGold,
    DIAMOND: messages.companies.categoryDiamond,
  }[category];
}

export function CategoryIcon({ category }: { category: ClientCategory }) {
  return (
    <svg
      className={`category-icon category-icon-${category.toLowerCase()}`}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 0 L10 4 L5 10 L0 4 Z" fill="currentColor" />
    </svg>
  );
}

export function CategoryPill({ category }: { category: ClientCategory }) {
  const { messages } = useI18n();
  return (
    <span className={`b2b-status b2b-status-${category.toLowerCase()}`}>
      <CategoryIcon category={category} />
      {categoryLabel(category, messages)}
    </span>
  );
}

export type CompanyFormInput = Partial<Company> & { name: string };

export function CompanyDrawer({
  company,
  managers,
  onClose,
  onSubmit,
}: {
  company: Company | null;
  managers: Array<{ id: string; firstName: string; lastName: string }>;
  onClose: () => void;
  onSubmit: (input: CompanyFormInput) => Promise<void>;
}) {
  const { messages } = useI18n();
  const [name, setName] = useState(company?.name ?? '');
  const [sector, setSector] = useState(company?.sector ?? '');
  const [contactName, setContactName] = useState(company?.contact_name ?? '');
  const [phone, setPhone] = useState(company?.phone ?? '');
  const [email, setEmail] = useState(company?.email ?? '');
  const [address, setAddress] = useState(company?.address ?? '');
  const [governorate, setGovernorate] = useState(company?.governorate ?? '');
  const [delegation, setDelegation] = useState(company?.delegation ?? '');
  const [clientCategory, setClientCategory] = useState<ClientCategory | ''>(
    company?.client_category ?? '',
  );
  const [mobileLines, setMobileLines] = useState(
    company?.mobile_lines !== null && company?.mobile_lines !== undefined
      ? String(company.mobile_lines)
      : '',
  );
  const [notes, setNotes] = useState(company?.notes ?? '');
  const [managerId, setManagerId] = useState(company?.manager_id ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const managerOptions = [
    ...managers,
    ...(company?.manager &&
    !managers.some((item) => item.id === company.manager_id)
      ? [
          {
            id: company.manager.id,
            firstName: company.manager.first_name,
            lastName: company.manager.last_name,
          },
        ]
      : []),
  ];

  function handleClose() {
    setIsClosing(true);
    setTimeout(() => onClose(), 350);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        sector: sector.trim() || null,
        contact_name: contactName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        governorate: governorate || null,
        delegation: delegation.trim() || null,
        client_category: clientCategory || null,
        mobile_lines: mobileLines.trim() ? Number(mobileLines) : null,
        manager_id: managerId || null,
        notes: notes.trim() || null,
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
        aria-labelledby="company-drawer-title"
      >
        <button
          className="drawer-close"
          type="button"
          onClick={handleClose}
          aria-label={messages.companies.drawerClose}
        >
          ×
        </button>
        <h2 id="company-drawer-title">
          {company
            ? messages.companies.drawerTitleEdit
            : messages.companies.drawerTitleAdd}
        </h2>
        <p>{messages.companies.drawerSubtitle}</p>
        <hr />
        <form onSubmit={submit}>
          <DrawerField label={messages.companies.drawerNameLabel} required>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={messages.companies.drawerNamePlaceholder}
              required
            />
          </DrawerField>
          <DrawerField label={messages.companies.drawerSectorLabel}>
            <input
              value={sector}
              onChange={(event) => setSector(event.target.value)}
              placeholder={messages.companies.drawerSectorPlaceholder}
            />
          </DrawerField>
          <DrawerField label={messages.companies.drawerContactLabel}>
            <input
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              placeholder={messages.companies.drawerContactPlaceholder}
            />
          </DrawerField>
          <DrawerField label={messages.companies.drawerPhoneLabel}>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={messages.companies.drawerPhonePlaceholder}
            />
          </DrawerField>
          <DrawerField label={messages.companies.drawerEmailLabel}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={messages.companies.drawerEmailPlaceholder}
            />
          </DrawerField>
          <DrawerField label={messages.companies.drawerGovernorateLabel}>
            <select
              value={governorate}
              onChange={(event) => setGovernorate(event.target.value)}
            >
              <option value="">—</option>
              {TUNISIA_GOVERNORATES.map((gov) => (
                <option key={gov} value={gov}>
                  {gov}
                </option>
              ))}
            </select>
          </DrawerField>
          <DrawerField label={messages.companies.drawerDelegationLabel}>
            <input
              value={delegation}
              onChange={(event) => setDelegation(event.target.value)}
              placeholder={messages.companies.drawerDelegationPlaceholder}
            />
          </DrawerField>
          <DrawerField label={messages.companies.drawerAddressLabel}>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={messages.companies.drawerAddressPlaceholder}
            />
          </DrawerField>
          <DrawerField label={messages.companies.drawerCategoryLabel}>
            <select
              value={clientCategory}
              onChange={(event) =>
                setClientCategory(event.target.value as ClientCategory | '')
              }
            >
              <option value="">—</option>
              {CLIENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category, messages)}
                </option>
              ))}
            </select>
          </DrawerField>
          <DrawerField label={messages.companies.drawerMobileLinesLabel}>
            <input
              type="number"
              min={0}
              value={mobileLines}
              onChange={(event) => setMobileLines(event.target.value)}
            />
          </DrawerField>
          <DrawerField label={messages.companies.drawerManagerLabel}>
            <select
              value={managerId}
              onChange={(event) => setManagerId(event.target.value)}
              disabled={!managers.length && !company?.manager}
            >
              <option value="">
                {messages.companies.drawerManagerUnassigned}
              </option>
              {managerOptions.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.firstName} {manager.lastName}
                </option>
              ))}
            </select>
          </DrawerField>
          <DrawerField label={messages.companies.drawerNotesLabel}>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={messages.companies.drawerNotesPlaceholder}
              rows={3}
            />
          </DrawerField>
          <div className="drawer-actions">
            <button
              className="outline-button"
              type="button"
              onClick={handleClose}
            >
              {messages.companies.drawerCancel}
            </button>
            <button
              className="orange-button"
              type="submit"
              disabled={isSubmitting || !name.trim()}
            >
              {isSubmitting
                ? messages.companies.drawerSubmitting
                : messages.companies.drawerSubmit}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
