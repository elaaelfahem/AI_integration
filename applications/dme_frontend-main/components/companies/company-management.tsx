'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ApiError, authApi } from '@/lib/api';
import type { Company, ManagedUser } from '@/types/auth';
import { FilterDropdown } from '@/components/shared/filter-dropdown';
import { Pagination } from '@/components/shared/pagination';
import {
  ConfirmDialog,
  type ConfirmDialogState,
} from '@/components/user-management/confirm-dialog';
import { Toast } from '@/components/auth/toast';
import { useAuth } from '@/components/auth/auth-provider';
import {
  CategoryIcon,
  CategoryPill,
  CLIENT_CATEGORIES,
  CompanyDrawer,
  categoryLabel,
} from '@/components/companies/company-shared';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';

export function CompanyManagement() {
  const { messages } = useI18n();
  const router = useRouter();
  const { account } = useAuth();
  const canAdd = account?.role === 'SUPERADMIN';
  const canScheduleVisit =
    account?.role === 'SUPERADMIN' || account?.role === 'MANAGER';
  const [companies, setCompanies] = useState<Company[]>([]);
  const [managers, setManagers] = useState<
    Array<{ id: string; firstName: string; lastName: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [governorateFilter, setGovernorateFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<
    { id: number; variant: 'success' | 'warning'; message: string }[]
  >([]);
  const toastIdRef = useRef(0);
  const pushToast = useCallback(
    (variant: 'success' | 'warning', message: string) => {
      const id = toastIdRef.current++;
      setToasts((current) => [...current, { id, variant, message }]);
    },
    [],
  );
  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [companiesPerPage, setCompaniesPerPage] = useState(10);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const templateMenuRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const refreshCompanies = useCallback(async () => {
    try {
      const [companyResult, users] = await Promise.all([
        authApi.listCompanies(),
        canAdd ? authApi.listUsers() : Promise.resolve<ManagedUser[]>([]),
      ]);
      setCompanies(companyResult);
      setManagers(
        users
          .filter((user) => user.role === 'MANAGER' && user.status === 'ACTIVE')
          .map((user) => ({
            id: user.accountId ?? user.id,
            firstName: user.firstName,
            lastName: user.lastName,
          })),
      );
    } catch (reason) {
      setError(
        getCompanyError(reason, messages.companies.errorCompaniesUnavailable),
      );
    }
  }, [canAdd, messages]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshCompanies().finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshCompanies]);

  useEffect(() => {
    if (!openActionId) return;
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as HTMLElement | null;
      if (
        !target?.closest('.row-menu-panel') &&
        !target?.closest('.row-menu-trigger')
      ) {
        setOpenActionId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [openActionId]);

  useEffect(() => {
    if (!isExportMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExportMenuOpen]);

  useEffect(() => {
    if (!isTemplateMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (!templateMenuRef.current?.contains(event.target as Node)) {
        setIsTemplateMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isTemplateMenuOpen]);

  const governorateOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        companies
          .map((c) => c.governorate)
          .filter((v): v is string => Boolean(v)),
      ),
    ).sort();
    return [
      { value: 'ALL', label: messages.companies.allGovernorates },
      ...values.map((v) => ({ value: v, label: v })),
    ];
  }, [companies, messages]);

  const categoryOptions = useMemo(
    () => [
      { value: 'ALL', label: messages.companies.allCategories },
      ...CLIENT_CATEGORIES.map((c) => ({
        value: c,
        label: (
          <span
            className={`filter-option-category b2b-status-${c.toLowerCase()}`}
          >
            <CategoryIcon category={c} />
            {categoryLabel(c, messages)}
          </span>
        ),
      })),
    ],
    [messages],
  );

  const visibleCompanies = useMemo(() => {
    const query = search.trim().toLowerCase();
    return companies.filter((company) => {
      const matchesQuery =
        !query ||
        `${company.name} ${company.contact_name ?? ''} ${company.governorate ?? ''}`
          .toLowerCase()
          .includes(query);
      const matchesGovernorate =
        governorateFilter === 'ALL' ||
        company.governorate === governorateFilter;
      const matchesCategory =
        categoryFilter === 'ALL' || company.client_category === categoryFilter;
      return matchesQuery && matchesGovernorate && matchesCategory;
    });
  }, [companies, search, governorateFilter, categoryFilter]);

  const pageCount = Math.max(
    1,
    Math.ceil(visibleCompanies.length / companiesPerPage),
  );
  const currentPage = Math.min(page, pageCount);
  const paginatedCompanies = useMemo(
    () =>
      visibleCompanies.slice(
        (currentPage - 1) * companiesPerPage,
        currentPage * companiesPerPage,
      ),
    [visibleCompanies, currentPage, companiesPerPage],
  );

  const stats = [
    {
      value: companies.length,
      label: messages.companies.statTotal,
      color: 'blue',
    },
    {
      value: companies.filter((c) => (c._count?.assignments ?? 0) > 0).length,
      label: messages.companies.statAssigned,
      color: 'green',
    },
    {
      value: companies.filter((c) => (c._count?.assignments ?? 0) === 0).length,
      label: messages.companies.statUnassigned,
      color: 'purple',
    },
    {
      value: companies.reduce(
        (total, c) => total + (c._count?.assignments ?? 0),
        0,
      ),
      label: messages.companies.statAssignments,
      color: 'red',
    },
  ];

  async function handleExport(format: 'csv' | 'xlsx') {
    setIsExportMenuOpen(false);
    setError(null);
    setIsExporting(true);
    try {
      const { blob, filename } = await authApi.exportCompanies(format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(getCompanyError(reason, messages.companies.errorExportFailed));
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDownloadTemplate(format: 'csv' | 'xlsx') {
    setIsTemplateMenuOpen(false);
    setError(null);
    setIsDownloadingTemplate(true);
    try {
      const { blob, filename } =
        await authApi.getCompaniesImportTemplate(format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(getCompanyError(reason, messages.companies.errorTemplateFailed));
    } finally {
      setIsDownloadingTemplate(false);
    }
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError(null);
    setIsImporting(true);
    try {
      const result = await authApi.importCompanies(file);
      await refreshCompanies();
      if (result.created > 0) {
        pushToast(
          'success',
          interpolate(messages.companies.noticeImportCreated, {
            count: String(result.created),
          }),
        );
      }
      if (result.duplicates > 0) {
        pushToast(
          'warning',
          interpolate(messages.companies.noticeImportDuplicates, {
            count: String(result.duplicates),
          }),
        );
      }
      if (result.created === 0 && result.duplicates === 0) {
        pushToast('warning', messages.companies.noticeImportNothing);
      }
    } catch (reason) {
      setError(getCompanyError(reason, messages.companies.errorImportFailed));
    } finally {
      setIsImporting(false);
    }
  }

  function confirmArchive(company: Company) {
    setDialog({
      title: messages.companies.dialogArchiveTitle,
      message: messages.companies.dialogArchiveMessage,
      actionLabel: messages.companies.dialogArchiveAction,
      tone: 'danger',
      onConfirm: async () => {
        setWorkingId(company.id);
        try {
          await authApi.archiveCompany(company.id);
          await refreshCompanies();
          pushToast(
            'success',
            interpolate(messages.companies.noticeCompanyArchived, {
              name: company.name,
            }),
          );
          setDialog(null);
        } catch (reason) {
          setError(
            getCompanyError(reason, messages.companies.errorArchiveFailed),
          );
        } finally {
          setWorkingId(null);
        }
      },
    });
  }

  return (
    <section
      className="users-page"
      id="companies"
      aria-labelledby="companies-title"
    >
      <div className="users-page-header">
        <div>
          <h1 id="companies-title">
            <strong>{messages.companies.titleStrong}</strong>
            {messages.companies.titleRest}
          </h1>
          <p className="users-page-subtitle">{messages.companies.subtitle}</p>
        </div>
        <div className="users-page-actions">
          <div className="export-menu" ref={exportMenuRef}>
            <button
              className="outline-button export-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={isExportMenuOpen}
              disabled={isExporting}
              onClick={() => setIsExportMenuOpen((current) => !current)}
            >
              {isExporting
                ? messages.companies.exporting
                : messages.companies.export}{' '}
              <Image
                src="/down_arrow.svg"
                alt=""
                width={14}
                height={7}
                aria-hidden="true"
              />
            </button>
            {isExportMenuOpen ? (
              <div className="row-menu-panel export-menu-panel" role="menu">
                <button type="button" onClick={() => void handleExport('csv')}>
                  {messages.companies.exportCsv}
                </button>
                <button type="button" onClick={() => void handleExport('xlsx')}>
                  {messages.companies.exportExcel}
                </button>
              </div>
            ) : null}
          </div>
          {canAdd ? (
            <div className="export-menu" ref={templateMenuRef}>
              <button
                className="outline-button export-button"
                type="button"
                aria-haspopup="menu"
                aria-expanded={isTemplateMenuOpen}
                disabled={isImporting || isDownloadingTemplate}
                onClick={() => setIsTemplateMenuOpen((current) => !current)}
              >
                {isImporting
                  ? messages.companies.importing
                  : messages.companies.import}{' '}
                <Image
                  src="/down_arrow.svg"
                  alt=""
                  width={14}
                  height={7}
                  aria-hidden="true"
                />
              </button>
              {isTemplateMenuOpen ? (
                <div className="row-menu-panel export-menu-panel" role="menu">
                  <button
                    type="button"
                    onClick={() => {
                      setIsTemplateMenuOpen(false);
                      importInputRef.current?.click();
                    }}
                  >
                    {messages.companies.import}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadTemplate('csv')}
                  >
                    {messages.companies.downloadTemplateCsv}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadTemplate('xlsx')}
                  >
                    {messages.companies.downloadTemplateExcel}
                  </button>
                </div>
              ) : null}
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,.xlsx"
                style={{ display: 'none' }}
                onChange={(event) => void handleImportFile(event)}
              />
            </div>
          ) : null}
          {canAdd ? (
            <>
              <button
                className="orange-button"
                type="button"
                onClick={() => {
                  setEditingCompany(null);
                  setError(null);
                  setDrawerOpen(true);
                }}
              >
                <span aria-hidden="true">+</span>{' '}
                {messages.companies.addCompany}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          variant={toast.variant}
          message={toast.message}
          offset={index * 4.5}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
      {error ? (
        <p className="users-error" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className="users-stat-strip"
        aria-label={messages.companies.titleStrong}
      >
        {stats.map((stat) => (
          <div className="users-stat" key={stat.label}>
            <div>
              <strong>
                {isLoading ? (
                  <span
                    className="skeleton-box"
                    style={{
                      width: '2.5rem',
                      height: '1.7rem',
                      display: 'inline-block',
                    }}
                  />
                ) : (
                  stat.value
                )}
              </strong>
              <span>{stat.label}</span>
            </div>
            <span className={`users-stat-icon users-stat-icon-${stat.color}`}>
              <Image
                src="/enterprise.svg"
                alt=""
                width={22}
                height={22}
                aria-hidden="true"
              />
            </span>
          </div>
        ))}
      </div>

      <div className="users-toolbar">
        <label className="users-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={messages.companies.searchPlaceholder}
            aria-label={messages.companies.searchAriaLabel}
          />
        </label>
        <FilterDropdown
          ariaLabel={messages.companies.governorateFilterAriaLabel}
          value={governorateFilter}
          options={governorateOptions}
          onChange={(value) => {
            setGovernorateFilter(value);
            setPage(1);
          }}
        />
        <FilterDropdown
          ariaLabel={messages.companies.categoryFilterAriaLabel}
          value={categoryFilter}
          options={categoryOptions}
          onChange={(value) => {
            setCategoryFilter(value);
            setPage(1);
          }}
        />
      </div>

      <section
        className="users-table-section"
        key={`${isLoading}-${paginatedCompanies.length}`}
      >
        <div className="users-table-wrap">
          <table className="users-table companies-table">
            <thead>
              <tr>
                <th>{messages.companies.colCompany}</th>
                <th>{messages.companies.colLocation}</th>
                <th>{messages.companies.colCategory}</th>
                <th>{messages.companies.colAssignments}</th>
                <th>{messages.companies.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCompanies.map((company) => (
                <tr key={company.id}>
                  <td data-label={messages.companies.colCompany}>
                    <strong className="cell-truncate" title={company.name}>
                      {company.name}
                    </strong>
                  </td>
                  <td
                    data-label={messages.companies.colLocation}
                    title={
                      [company.delegation, company.governorate]
                        .filter(Boolean)
                        .join(', ') || undefined
                    }
                  >
                    {[company.delegation, company.governorate]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </td>
                  <td data-label={messages.companies.colCategory}>
                    {company.client_category ? (
                      <CategoryPill category={company.client_category} />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td data-label={messages.companies.colAssignments}>
                    {company._count?.assignments ?? 0}
                  </td>
                  <td data-label={messages.companies.colActions}>
                    <div className="row-menu">
                      <button
                        className="row-menu-trigger"
                        type="button"
                        aria-label={interpolate(messages.companies.actionsFor, {
                          name: company.name,
                        })}
                        aria-expanded={openActionId === company.id}
                        onClick={() =>
                          setOpenActionId(
                            openActionId === company.id ? null : company.id,
                          )
                        }
                      >
                        <span aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                      </button>
                      {openActionId === company.id ? (
                        <div className="row-menu-panel">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenActionId(null);
                              router.push(`/companies/${company.id}`);
                            }}
                          >
                            {messages.companies.viewDetails}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenActionId(null);
                              setEditingCompany(company);
                              setError(null);
                              setDrawerOpen(true);
                            }}
                          >
                            {messages.companies.edit}
                          </button>
                          {canScheduleVisit ? (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionId(null);
                                router.push(
                                  `/assignments?companyId=${company.id}`,
                                );
                              }}
                            >
                              {messages.companies.assign}
                            </button>
                          ) : null}
                          {canAdd ? (
                            <button
                              type="button"
                              className="danger-action"
                              disabled={Boolean(workingId)}
                              onClick={() => {
                                setOpenActionId(null);
                                confirmArchive(company);
                              }}
                            >
                              {messages.companies.archive}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && !paginatedCompanies.length ? (
          <div className="users-empty">{messages.companies.emptyState}</div>
        ) : null}
        {visibleCompanies.length > 0 ? (
          <Pagination
            page={currentPage}
            pageCount={pageCount}
            onPageChange={setPage}
            pageSize={companiesPerPage}
            onPageSizeChange={(size) => {
              setCompaniesPerPage(size);
              setPage(1);
            }}
            ariaLabel={messages.pagination.ariaLabel}
            prevLabel={messages.pagination.prev}
            nextLabel={messages.pagination.next}
            rowsPerPageLabel={messages.pagination.rowsPerPage}
          />
        ) : null}
      </section>

      {drawerOpen ? (
        <CompanyDrawer
          company={editingCompany}
          managers={managers}
          onClose={() => setDrawerOpen(false)}
          onSubmit={async (input) => {
            try {
              if (editingCompany) {
                await authApi.updateCompany(editingCompany.id, input);
                pushToast(
                  'success',
                  interpolate(messages.companies.noticeCompanyUpdated, {
                    name: input.name ?? editingCompany.name,
                  }),
                );
              } else {
                await authApi.createCompany(input);
                pushToast(
                  'success',
                  interpolate(messages.companies.noticeCompanyCreated, {
                    name: input.name ?? '',
                  }),
                );
              }
              await refreshCompanies();
            } catch (reason) {
              setError(
                getCompanyError(
                  reason,
                  editingCompany
                    ? messages.companies.errorUpdateFailed
                    : messages.companies.errorCreateFailed,
                ),
              );
              throw reason;
            }
          }}
        />
      ) : null}

      {dialog ? (
        <ConfirmDialog
          dialog={dialog}
          isWorking={Boolean(workingId)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </section>
  );
}

function getCompanyError(reason: unknown, fallback: string) {
  return reason instanceof ApiError ? reason.message : fallback;
}
