'use client';

import { CompanyAiAssistant } from './company-ai-assistant';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ApiError, authApi } from '@/lib/api';
import type { Company } from '@/types/auth';
import { useAuth } from '@/components/auth/auth-provider';
import { Toast } from '@/components/auth/toast';
import {
  ConfirmDialog,
  type ConfirmDialogState,
} from '@/components/user-management/confirm-dialog';
import { CompanyMap } from '@/components/meetings/company-map-loader';
import {
  CategoryPill,
  CompanyDrawer,
} from '@/components/companies/company-shared';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';
import { INTL_LOCALES } from '@/lib/i18n/config';

export function CompanyDetails({ companyId }: { companyId: string }) {
  const router = useRouter();
  const { messages, locale } = useI18n();
  const { account } = useAuth();
  const canManage = account?.role === 'SUPERADMIN';
  const canScheduleVisit =
    account?.role === 'SUPERADMIN' || account?.role === 'MANAGER';
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);

  useEffect(() => {
    void authApi
      .getCompany(companyId)
      .then(setCompany)
      .catch(() => setError(messages.companies.errorDetailsUnavailable));
  }, [companyId, messages]);

  function confirmArchive() {
    if (!company) return;
    setDialog({
      title: messages.companies.dialogArchiveTitle,
      message: messages.companies.dialogArchiveMessage,
      actionLabel: messages.companies.dialogArchiveAction,
      tone: 'danger',
      onConfirm: async () => {
        setIsWorking(true);
        try {
          await authApi.archiveCompany(company.id);
          setDialog(null);
          router.push('/companies');
        } catch {
          setError(messages.companies.errorArchiveFailed);
          setDialog(null);
        } finally {
          setIsWorking(false);
        }
      },
    });
  }

  if (error)
    return (
      <section className="profile-error" role="alert">
        {error}
        <button type="button" onClick={() => router.back()}>
          {messages.profile.back}
        </button>
      </section>
    );

  if (!company) return <CompanyDetailsSkeleton router={router} />;

  const location = [company.delegation, company.governorate]
    .filter(Boolean)
    .join(', ');
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    company.address || `${location}, Tunisie`,
  )}`;

  return (
    <section
      className="user-profile-page"
      aria-labelledby="company-details-title"
    >
      {notice ? (
        <div className="profile-notice" role="status">
          {notice}
        </div>
      ) : null}
      <div className="profile-breadcrumb">
        <button type="button" onClick={() => router.push('/companies')}>
          {messages.companies.breadcrumbCompanies}
        </button>
        <span>›</span>
        <strong>{messages.companies.breadcrumbDetails}</strong>
      </div>
      <div className="profile-heading">
        <h1 id="company-details-title">
          <strong>{messages.companies.titleStrong}</strong>{' '}
          {messages.companies.breadcrumbDetails}
        </h1>
        <div className="profile-actions">
          {canScheduleVisit ? (
            <button
              type="button"
              className="profile-outline"
              onClick={() =>
                router.push(`/assignments?companyId=${company.id}`)
              }
            >
              {messages.companies.scheduleVisit}
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              className="profile-outline profile-danger"
              onClick={confirmArchive}
              disabled={isWorking}
            >
              {messages.companies.archive}
            </button>
          ) : null}
          <button
            type="button"
            className="profile-primary"
            disabled={isWorking}
            onClick={() => setDrawerOpen(true)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="profile-edit-icon"
              aria-hidden="true"
            >
              <path
                d="M11.7.3c-.4 0-.8.1-1.1.4L2.3 8.9c-.2.2-.3.4-.4.7l-1 3.5c-.1.3 0 .7.3.9.2.2.5.3.8.3h.2l3.5-1c.3-.1.5-.2.7-.4L14.7 4.6c.6-.6.6-1.6 0-2.2L13.5.7C13 .3 12.4.3 11.7.3zm0 1.5 1.8 1.8-1.5 1.5-1.8-1.8 1.5-1.5zM9 4.3l1.8 1.8-6.1 6.1-2 .6.6-2L9 4.3z"
                fill="currentColor"
              />
            </svg>
            <span>{messages.companies.edit}</span>
          </button>
        </div>
      </div>
      <article className="profile-identity company-identity">
        <div className="profile-avatar-wrap">
          <div className="profile-avatar">
            <Image
              src="/enterprise.svg"
              alt=""
              width={28}
              height={28}
              aria-hidden="true"
            />
          </div>
        </div>
        <div className="profile-identity-info">
          <div className="profile-name-row">
            <h2>{company.name}</h2>
            {company.client_category ? (
              <CategoryPill category={company.client_category} />
            ) : null}
          </div>
          <div className="profile-meta">
            <span>
              <Image
                src="/pin.svg"
                alt=""
                width={15}
                height={15}
                aria-hidden="true"
              />
              {location || messages.companies.noLocationOnFile}
            </span>
          </div>
          <div className="company-quick-actions">
            {company.phone ? (
              <a href={`tel:${company.phone.replace(/\s+/g, '')}`}>
                {messages.companies.actionCall}
              </a>
            ) : null}
            {company.email ? (
              <a href={`mailto:${company.email}`}>
                {messages.companies.actionEmail}
              </a>
            ) : null}
            {location || company.address ? (
              <a href={directionsUrl} target="_blank" rel="noreferrer">
                {messages.companies.actionDirections}
              </a>
            ) : null}
          </div>
        </div>
        <dl className="company-identity-stats">
          <div>
            <dt>{messages.companies.drawerMobileLinesLabel}</dt>
            <dd>{company.mobile_lines ?? '—'}</dd>
          </div>
          <div>
            <dt>{messages.companies.colAssignments}</dt>
            <dd>{company._count?.assignments ?? 0}</dd>
          </div>
          <div>
            <dt>{messages.companies.drawerSectorLabel}</dt>
            <dd>{company.sector || '—'}</dd>
          </div>
        </dl>
      </article>
      <div className="profile-grid company-details-grid">
        <div className="profile-grid-left">
          <section className="profile-card company-details-map">
            <h2>
              <Image
                src="/pin.svg"
                alt=""
                width={20}
                height={20}
                className="profile-h2-icon"
                aria-hidden="true"
              />
              <span>{messages.companies.mapCardTitle}</span>
            </h2>
            <CompanyMap company={company} compact />
          </section>
          {company.notes ? (
            <section className="profile-card">
              <h2>
                <span>{messages.companies.drawerNotesLabel}</span>
              </h2>
              <p className="company-details-notes">{company.notes}</p>
            </section>
          ) : null}
          <section className="profile-card">
            <h2>
              <span>{messages.shared.companyHistoryTitle}</span>
            </h2>
            {company.history?.length ? (
              <div className="company-provenance-list">
                {company.history.map((entry) => (
                  <div key={entry.id} className="company-provenance-item">
                    <strong>{entry.summary}</strong>
                    <span>
                      {messages.shared.companyHistoryAction[entry.action]}
                    </span>
                    <small>
                      {new Intl.DateTimeFormat(INTL_LOCALES[locale], {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(entry.created_at))}
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="profile-empty-copy">
                {messages.shared.companyNoHistory}
              </p>
            )}
          </section>
        </div>
        <div className="profile-grid-right">
          <section className="profile-card">
            <h2>
              <Image
                src="/user-2.svg"
                alt=""
                width={20}
                height={20}
                className="profile-h2-icon"
                aria-hidden="true"
              />
              <span>{messages.companies.contactCardTitle}</span>
            </h2>
            <CompanyField
              label={messages.companies.drawerContactLabel}
              value={company.contact_name}
            />
            <CompanyField
              label={messages.companies.drawerPhoneLabel}
              value={company.phone}
            />
            <CompanyField
              label={messages.companies.drawerEmailLabel}
              value={company.email}
            />
            <CompanyField
              label={messages.companies.drawerAddressLabel}
              value={company.address}
            />
          </section>
          <section className="profile-card">
            <h2>
              <Image
                src="/enterprise.svg"
                alt=""
                width={20}
                height={20}
                className="profile-h2-icon"
                aria-hidden="true"
              />
              <span>{messages.companies.prospectingCardTitle}</span>
            </h2>
            <CompanyField
              label={messages.companies.drawerSectorLabel}
              value={company.sector}
            />
            <CompanyField
              label={messages.companies.drawerGovernorateLabel}
              value={company.governorate}
            />
            <CompanyField
              label={messages.companies.drawerDelegationLabel}
              value={company.delegation}
            />
            <CompanyField
              label={messages.companies.drawerMobileLinesLabel}
              value={
                company.mobile_lines !== null
                  ? String(company.mobile_lines)
                  : null
              }
            />
          </section>
          <CompanyAiAssistant key={companyId} companyId={companyId} />
          <section className="profile-card">
            <h2>
              <span>{messages.shared.companyEvidenceTitle}</span>
            </h2>
            {company.source_evidence?.length ? (
              <div className="company-provenance-list">
                {company.source_evidence.map((evidence) => (
                  <div key={evidence.id} className="company-provenance-item">
                    <strong>{evidence.data_source.name}</strong>
                    <span>
                      {evidence.reference_label ?? evidence.field_name}
                    </span>
                    <small>
                      {new Intl.DateTimeFormat(INTL_LOCALES[locale], {
                        dateStyle: 'medium',
                      }).format(new Date(evidence.collected_at))}
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="profile-empty-copy">
                {messages.shared.companyNoEvidence}
              </p>
            )}
          </section>
        </div>
      </div>
      {dialog ? (
        <ConfirmDialog
          dialog={dialog}
          isWorking={isWorking}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {drawerOpen ? (
        <CompanyDrawer
          company={company}
          managers={[]}
          onClose={() => setDrawerOpen(false)}
          onSubmit={async (input) => {
            try {
              const updated = await authApi.updateCompany(company.id, input);
              setCompany(updated);
              setNotice(
                interpolate(messages.companies.noticeCompanyUpdated, {
                  name: updated.name,
                }),
              );
            } catch (reason) {
              setError(
                reason instanceof ApiError
                  ? reason.message
                  : messages.companies.errorUpdateFailed,
              );
              throw reason;
            }
          }}
        />
      ) : null}
      {notice ? (
        <Toast
          variant="success"
          message={notice}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
    </section>
  );
}

/** Like ProfileField, but shows a muted placeholder when the value is missing. */
function CompanyField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const { messages } = useI18n();
  return (
    <div className="profile-field">
      <small>{label}</small>
      {value ? (
        <strong>{value}</strong>
      ) : (
        <strong className="profile-field-empty">
          {messages.companies.notOnFile}
        </strong>
      )}
    </div>
  );
}

function CompanyDetailsSkeleton({
  router,
}: {
  router: { push: (url: string) => void };
}) {
  const { messages } = useI18n();
  return (
    <section
      className="user-profile-page"
      aria-labelledby="company-details-title-skel"
    >
      <div className="profile-breadcrumb">
        <button type="button" onClick={() => router.push('/companies')}>
          {messages.companies.breadcrumbCompanies}
        </button>
        <span>›</span>
        <strong>{messages.companies.breadcrumbDetails}</strong>
      </div>
      <article className="profile-identity">
        <div className="profile-avatar-wrap">
          <div
            className="profile-avatar skeleton-circle"
            style={{ background: 'transparent' }}
          >
            <span
              className="skeleton-circle"
              style={{ width: 84, height: 84 }}
            />
          </div>
        </div>
        <div className="profile-identity-info">
          <div className="profile-name-row">
            <h2>
              <span
                className="skeleton-box"
                style={{ width: 200, height: 26 }}
              />
            </h2>
          </div>
        </div>
      </article>
    </section>
  );
}
