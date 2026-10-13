'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Toast } from '@/components/auth/toast';
import { DrawerField } from '@/components/shared/drawer-field';
import { FilterDropdown } from '@/components/shared/filter-dropdown';
import { Pagination } from '@/components/shared/pagination';
import {
  ConfirmDialog,
  type ConfirmDialogState,
} from '@/components/user-management/confirm-dialog';
import { useAuth } from '@/components/auth/auth-provider';
import {
  CriteriaDialog,
  SparkleIcon,
} from '@/components/prospection/criteria-dialog';
import { SourceLogo } from './source-logo';
import { SEEDED_DATA_SOURCES } from '@/lib/data-sources-seed';
import { ApiError, authApi } from '@/lib/api';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate, type Messages } from '@/lib/i18n/messages';
import { INTL_LOCALES } from '@/lib/i18n/config';
import type {
  CollectionJob,
  CollectionJobDetail,
  CollectionMethod,
  DataSource,
  DataSourceType,
} from '@/types/auth';

type DataSourcesCopy = Messages['dataSourcesPage'];

const SOURCE_TYPES: DataSourceType[] = [
  'OFFICIAL_REGISTRY',
  'BUSINESS_DIRECTORY',
  'MAPS',
  'SOCIAL_NETWORK',
  'COMPANY_WEBSITE',
  'JOB_PLATFORM',
  'OTHER',
];

const METHODS: CollectionMethod[] = ['API', 'CRAWLING', 'IMPORT', 'MANUAL'];

function GridIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 9v12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function DataSourceManagement() {
  const { account, status: authStatus } = useAuth();
  const { messages, locale } = useI18n();
  const t = messages.dataSourcesPage;
  const router = useRouter();
  const [layoutMode, setLayoutMode] = useState<'grid' | 'table'>('grid');
  const [sources, setSources] = useState<DataSource[]>([]);
  const [jobs, setJobs] = useState<CollectionJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<CollectionJobDetail | null>(
    null,
  );
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<'source' | null>(null);
  const [prospectionOpen, setProspectionOpen] = useState(false);
  const [prospectingBusy, setProspectingBusy] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [editing, setEditing] = useState<DataSource | null>(null);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<
    Array<{ id: number; message: string; variant: 'success' | 'error' }>
  >([]);
  const toastId = useRef(0);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.row-menu')) return;
      setOpenActionId(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [openActionId]);

  const refresh = useCallback(async () => {
    const [nextSources, nextJobs] = await Promise.all([
      authApi.listDataSources(),
      authApi.listCollectionJobs(),
    ]);
    if (nextSources && nextSources.length > 0) {
      const enriched = nextSources.map((source) => {
        const seedMatch = SEEDED_DATA_SOURCES.find(
          (s) =>
            s.id === source.id ||
            s.name.toLowerCase() === source.name.toLowerCase() ||
            (s.name.includes('RNE') && source.name.includes('RNE')),
        );
        return {
          ...source,
          description: source.description || seedMatch?.description,
          logo: source.logo || seedMatch?.logo,
          logo_url: source.logo_url || seedMatch?.logo_url,
        };
      });
      const rneIdx = enriched.findIndex(
        (s) =>
          s.name.toLowerCase().includes('rne') ||
          s.name.toLowerCase().includes('registre national'),
      );
      if (rneIdx > 0) {
        const [rne] = enriched.splice(rneIdx, 1);
        enriched.unshift(rne);
      }
      const orangeDmeIdx = enriched.findIndex(
        (s) =>
          s.name.toLowerCase().includes('orange dme') ||
          s.name.toLowerCase().includes('historical data'),
      );
      if (orangeDmeIdx > 1) {
        const [orangeDme] = enriched.splice(orangeDmeIdx, 1);
        enriched.splice(1, 0, orangeDme);
      }
      setSources(enriched);
    } else {
      setSources([]);
    }
    setJobs(nextJobs);
  }, []);

  useEffect(() => {
    if (account?.role && account.role !== 'SUPERADMIN')
      router.replace('/dashboard');
  }, [account?.role, router]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || account?.role !== 'SUPERADMIN') {
      return;
    }

    const timer = window.setTimeout(() => {
      void refresh()
        .catch((reason) => setError(messageFrom(reason, t.loadError)))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [account?.role, authStatus, refresh, t.loadError]);

  useEffect(() => {
    const hasActiveJob = jobs.some(
      (job) => job.status === 'QUEUED' || job.status === 'RUNNING',
    );
    if (!hasActiveJob) return;

    const interval = window.setInterval(() => {
      void refresh().catch((reason) => {
        setError(messageFrom(reason, t.refreshError));
      });
    }, 2_000);

    return () => window.clearInterval(interval);
  }, [jobs, refresh, t.refreshError]);

  const notify = useCallback(
    (variant: 'success' | 'error', message: string) => {
      const id = toastId.current++;
      setToasts((current) => [...current, { id, variant, message }]);
    },
    [],
  );

  const visibleSources = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = sources.filter((source) => {
      const matchesSearch =
        !query ||
        `${source.name} ${source.configuration_reference ?? ''} ${source.description ?? ''}`
          .toLowerCase()
          .includes(query);
      const matchesStatus =
        status === 'ALL' ||
        (status === 'ACTIVE' ? source.enabled : !source.enabled);
      const matchesType = type === 'ALL' || source.type === type;
      return matchesSearch && matchesStatus && matchesType;
    });

    const rneIdx = filtered.findIndex(
      (s) =>
        s.name.toLowerCase().includes('rne') ||
        s.name.toLowerCase().includes('registre national'),
    );
    if (rneIdx > 0) {
      const [rne] = filtered.splice(rneIdx, 1);
      filtered.unshift(rne);
    }
    const orangeDmeIdx = filtered.findIndex(
      (s) =>
        s.name.toLowerCase().includes('orange dme') ||
        s.name.toLowerCase().includes('historical data'),
    );
    if (orangeDmeIdx > 1) {
      const [orangeDme] = filtered.splice(orangeDmeIdx, 1);
      filtered.splice(1, 0, orangeDme);
    }
    return filtered;
  }, [search, sources, status, type]);
  const pageCount = Math.max(1, Math.ceil(visibleSources.length / 10));
  const currentPage = Math.min(page, pageCount);
  const rows = visibleSources.slice((currentPage - 1) * 10, currentPage * 10);

  const stats = [
    {
      value: sources.length,
      label: t.statTotal,
      color: 'blue',
      icon: '/data-sources.svg',
    },
    {
      value: sources.filter((source) => source.enabled).length,
      label: t.statActive,
      color: 'green',
      icon: '/check-simple.svg',
    },
    {
      value: jobs.filter(
        (job) => job.status === 'RUNNING' || job.status === 'QUEUED',
      ).length,
      label: t.statRunning,
      color: 'purple',
      icon: '/sync-jobs.svg',
    },
    {
      value: jobs.reduce((total, job) => total + job.discovered_count, 0),
      label: t.statDiscovered,
      color: 'red',
      icon: '/enterprise.svg',
    },
  ];

  function closeToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  async function openJob(job: CollectionJob) {
    setJobLoading(true);
    setJobError('');
    try {
      setSelectedJob(await authApi.getCollectionJob(job.id));
    } catch (reason) {
      setJobError(messageFrom(reason, t.jobLoadError));
    } finally {
      setJobLoading(false);
    }
  }

  async function saveSource(input: {
    name: string;
    type: string;
    collectionMethod: string;
    configurationReference?: string;
    logoUrl?: string;
    description?: string;
    enabled?: boolean;
  }) {
    setWorking(true);
    setError(null);
    try {
      if (editing) {
        await authApi.updateDataSource(editing.id, input);
        setSources((current) =>
          current.map((s) =>
            s.id === editing.id
              ? {
                  ...s,
                  name: input.name,
                  type: input.type as DataSourceType,
                  collection_method: input.collectionMethod as CollectionMethod,
                  configuration_reference: input.configurationReference ?? null,
                  logo_url: input.logoUrl ?? s.logo_url,
                  description: input.description ?? s.description,
                  enabled: input.enabled ?? s.enabled,
                }
              : s,
          ),
        );
      } else {
        const created = await authApi.createDataSource(input);
        if (created) {
          setSources((current) => [created, ...current]);
        }
      }
      await refresh();
      setDrawer(null);
      notify('success', editing ? t.saved : t.created);
    } catch (reason) {
      const message = messageFrom(reason, t.saveError);
      setError(message);
      notify('error', message);
    } finally {
      setWorking(false);
    }
  }

  function confirmToggle(source: DataSource) {
    setDialog({
      title: source.enabled ? t.disableTitle : t.enableTitle,
      message: source.enabled ? t.disableMessage : t.enableMessage,
      actionLabel: source.enabled ? t.disable : t.enable,
      tone: source.enabled ? 'danger' : 'default',
      onConfirm: async () => {
        setWorking(true);
        try {
          await authApi.setDataSourceEnabled(source.id, !source.enabled);
          await refresh();
          setDialog(null);
          notify('success', source.enabled ? t.disabled : t.enabled);
        } catch (reason) {
          const message = messageFrom(reason, t.actionFailed);
          setError(message);
          notify('error', message);
        } finally {
          setWorking(false);
        }
      },
    });
  }

  function confirmRetire(source: DataSource) {
    setDialog({
      title: t.deleteTitle,
      message: t.deleteMessage,
      actionLabel: t.delete,
      tone: 'danger',
      onConfirm: async () => {
        setWorking(true);
        try {
          await authApi.retireDataSource(source.id);
          setSources((current) =>
            current.filter((s) => s.id !== source.id && s.name !== source.name),
          );
          await refresh();
          setDialog(null);
          notify('success', t.deleted);
        } catch (reason) {
          const msg = messageFrom(reason, '');
          if (
            msg.toLowerCase().includes('not found') ||
            msg.toLowerCase().includes('introuvable')
          ) {
            setSources((current) =>
              current.filter(
                (s) => s.id !== source.id && s.name !== source.name,
              ),
            );
            setDialog(null);
            notify('success', t.deleted);
            return;
          }
          const message = messageFrom(reason, t.deleteError);
          setError(message);
          notify('error', message);
        } finally {
          setWorking(false);
        }
      },
    });
  }

  if (account?.role && account.role !== 'SUPERADMIN') return null;

  return (
    <section
      className="users-page data-sources-page"
      id="data-sources"
      aria-labelledby="data-sources-title"
    >
      <div className="users-page-header">
        <div>
          <h1 id="data-sources-title">
            <strong>{t.titleStrong}</strong>
            {t.titleRest}
          </h1>
          <p className="users-page-subtitle">{t.subtitle}</p>
        </div>
        <div className="data-sources-header-actions">
          <button
            className="outline-button"
            type="button"
            onClick={() => {
              setEditing(null);
              setDrawer('source');
            }}
          >
            <span aria-hidden="true">+</span> {t.addSource}
          </button>
          <button
            className="outline-button"
            type="button"
            onClick={() => setCollectionOpen(true)}
          >
            {t.startCollection}
          </button>
          <button
            className="orange-button"
            type="button"
            disabled={prospectingBusy}
            onClick={() => setProspectionOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              justifyContent: 'center',
            }}
          >
            <SparkleIcon />
            {t.startProspection}
          </button>
        </div>
      </div>

      <div className="users-stat-strip" aria-label={t.statsAriaLabel}>
        {stats.map((stat) => (
          <div className="users-stat" key={stat.label}>
            <div>
              <strong>
                {loading ? (
                  <span
                    className="skeleton-box"
                    style={{
                      width: '2.5rem',
                      height: '1.7rem',
                      display: 'inline-block',
                    }}
                  />
                ) : (
                  new Intl.NumberFormat(INTL_LOCALES[locale]).format(stat.value)
                )}
              </strong>
              <span>{stat.label}</span>
            </div>
            <span className={`users-stat-icon users-stat-icon-${stat.color}`}>
              <Image
                src={stat.icon}
                alt=""
                width={22}
                height={22}
                aria-hidden="true"
              />
            </span>
          </div>
        ))}
      </div>

      {error ? (
        <div className="users-error-banner" role="alert">
          {error}
        </div>
      ) : null}

      <div className="users-toolbar data-sources-toolbar">
        <label className="users-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
          />
        </label>
        <FilterDropdown
          ariaLabel={t.filterStatusAria}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: 'ALL', label: t.allStatuses },
            { value: 'ACTIVE', label: t.statusActive },
            { value: 'DISABLED', label: t.statusDisabled },
          ]}
        />
        <FilterDropdown
          ariaLabel={t.filterTypeAria}
          value={type}
          onChange={(value) => {
            setType(value);
            setPage(1);
          }}
          options={[
            { value: 'ALL', label: t.allTypes },
            ...SOURCE_TYPES.map((value) => ({
              value,
              label: t.sourceTypes[value],
            })),
          ]}
        />
        <div
          className="view-mode-toggle"
          role="group"
          aria-label={t.viewModeAria}
        >
          <button
            type="button"
            className={`view-mode-btn ${layoutMode === 'grid' ? 'active' : ''}`}
            onClick={() => setLayoutMode('grid')}
            title={t.viewGrid}
            aria-pressed={layoutMode === 'grid'}
            aria-label={t.viewGrid}
          >
            <GridIcon />
          </button>
          <button
            type="button"
            className={`view-mode-btn ${layoutMode === 'table' ? 'active' : ''}`}
            onClick={() => setLayoutMode('table')}
            title={t.viewTable}
            aria-pressed={layoutMode === 'table'}
            aria-label={t.viewTable}
          >
            <TableIcon />
          </button>
        </div>
      </div>

      <section
        className={`users-table-section ${layoutMode === 'grid' ? 'sources-grid-section' : ''}`}
        key={`${loading}-${layoutMode}-${rows.length}`}
      >
        {layoutMode === 'grid' ? (
          <>
            {loading ? (
              <CardsSkeleton count={6} />
            ) : rows.length ? (
              <div className="data-sources-grid">
                {rows.map((source) => {
                  return (
                    <div key={source.id} className="data-source-card">
                      <div className="data-source-card-header">
                        <SourceLogo
                          logoUrl={source.logo_url}
                          name={source.name}
                          size={44}
                        />
                        <div className="data-source-card-title-group">
                          <h3 className="data-source-card-title">
                            {source.name}
                          </h3>
                          {source.configuration_reference ? (
                            <a
                              href={source.configuration_reference}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="data-source-card-link"
                              title={source.configuration_reference}
                            >
                              <span>{source.configuration_reference}</span>
                              <ExternalLinkIcon />
                            </a>
                          ) : (
                            <span
                              className="data-source-card-link"
                              style={{ color: '#94a3b8' }}
                            >
                              {t.noPublicReference}
                            </span>
                          )}
                        </div>
                        <div className="row-menu">
                          <button
                            className="row-menu-trigger"
                            type="button"
                            aria-label={interpolate(t.actionsFor, {
                              name: source.name,
                            })}
                            aria-expanded={openActionId === source.id}
                            onClick={() =>
                              setOpenActionId(
                                openActionId === source.id ? null : source.id,
                              )
                            }
                          >
                            <span aria-hidden="true">
                              <i />
                              <i />
                              <i />
                            </span>
                          </button>
                          {openActionId === source.id ? (
                            <div className="row-menu-panel">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionId(null);
                                  setEditing(source);
                                  setDrawer('source');
                                }}
                              >
                                {t.edit}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionId(null);
                                  confirmToggle(source);
                                }}
                              >
                                {source.enabled ? t.disable : t.enable}
                              </button>
                              <button
                                type="button"
                                className="danger-action"
                                onClick={() => {
                                  setOpenActionId(null);
                                  confirmRetire(source);
                                }}
                              >
                                {t.delete}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {source.description ? (
                        <div className="data-source-card-about">
                          <p className="data-source-about-text">
                            {source.description}
                          </p>
                        </div>
                      ) : null}

                      <div className="data-source-card-meta-list">
                        <div className="data-source-card-meta-row">
                          <span className="data-source-meta-label">
                            {t.colType}
                          </span>
                          <span className="data-source-meta-val">
                            {t.sourceTypes[source.type] ?? source.type}
                          </span>
                        </div>
                        <div className="data-source-card-meta-row">
                          <span className="data-source-meta-label">
                            {t.colMethod}
                          </span>
                          <span className="data-source-meta-val">
                            {methodLabel(t, source.collection_method)}
                          </span>
                        </div>
                        <div className="data-source-card-meta-row">
                          <span className="data-source-meta-label">
                            {t.colStatus}
                          </span>
                          <span className="data-source-meta-val">
                            <StatusPill enabled={source.enabled} />
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : (
          <div className="users-table-wrap">
            <table className="users-table data-sources-table">
              <thead>
                <tr>
                  <th>{t.colSource}</th>
                  <th>{t.colType}</th>
                  <th>{t.colMethod}</th>
                  <th>{t.colStatus}</th>
                  <th>{t.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SourceSkeleton columns={5} />
                ) : rows.length ? (
                  rows.map((source) => (
                    <tr key={source.id}>
                      <td data-label={t.colSource}>
                        <div className="data-source-table-cell">
                          <SourceLogo
                            logoUrl={source.logo_url}
                            name={source.name}
                            size={36}
                          />
                          <div>
                            <strong>{source.name}</strong>
                            <small>
                              {source.configuration_reference ??
                                t.noPublicReference}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td data-label={t.colType}>
                        {t.sourceTypes[source.type] ?? source.type}
                      </td>
                      <td data-label={t.colMethod}>
                        {methodLabel(t, source.collection_method)}
                      </td>
                      <td data-label={t.colStatus}>
                        <StatusPill enabled={source.enabled} />
                      </td>
                      <td data-label={t.colActions}>
                        <div className="row-menu">
                          <button
                            className="row-menu-trigger"
                            type="button"
                            aria-label={interpolate(t.actionsFor, {
                              name: source.name,
                            })}
                            aria-expanded={openActionId === source.id}
                            onClick={() =>
                              setOpenActionId(
                                openActionId === source.id ? null : source.id,
                              )
                            }
                          >
                            <span aria-hidden="true">
                              <i />
                              <i />
                              <i />
                            </span>
                          </button>
                          {openActionId === source.id ? (
                            <div className="row-menu-panel">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionId(null);
                                  setEditing(source);
                                  setDrawer('source');
                                }}
                              >
                                {t.edit}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionId(null);
                                  confirmToggle(source);
                                }}
                              >
                                {source.enabled ? t.disable : t.enable}
                              </button>
                              <button
                                type="button"
                                className="danger-action"
                                onClick={() => {
                                  setOpenActionId(null);
                                  confirmRetire(source);
                                }}
                              >
                                {t.delete}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !rows.length ? (
          <div className="users-empty">{t.noResults}</div>
        ) : null}
        {visibleSources.length > 0 ? (
          <Pagination
            page={currentPage}
            pageCount={pageCount}
            onPageChange={setPage}
            pageSize={10}
            onPageSizeChange={() => undefined}
            pageSizeOptions={[10]}
            ariaLabel={t.paginationAria}
            prevLabel={t.previous}
            nextLabel={t.next}
            rowsPerPageLabel={t.perPage}
          />
        ) : null}
      </section>

      {drawer === 'source' ? (
        <SourceDrawer
          source={editing}
          working={working}
          onClose={() => setDrawer(null)}
          onSubmit={saveSource}
        />
      ) : null}
      {prospectingBusy && <p role="status">Prospection…</p>}
      {prospectionOpen ? (
        <CriteriaDialog
          onClose={() => setProspectionOpen(false)}
          onSubmit={async (criteria) => {
            setProspectionOpen(false);
            setProspectingBusy(true);
            try {
              await authApi.startProspecting(criteria);
              notify('success', t.prospectionStarted);
              router.push('/prospection');
            } catch (reason) {
              const message = messageFrom(reason, t.prospectionError);
              setError(message);
              notify('error', message);
            } finally {
              setProspectingBusy(false);
            }
          }}
        />
      ) : null}

      <section className="users-table-section data-sources-jobs-section">
        <div className="users-page-header data-sources-jobs-header">
          <div>
            <h2>{t.jobsTitle}</h2>
            <p className="users-page-subtitle">{t.jobsSubtitle}</p>
          </div>
        </div>
        <div className="users-table-wrap">
          <table className="users-table data-sources-jobs-table">
            <thead>
              <tr>
                <th>{t.colStatus}</th>
                <th>{t.colSources}</th>
                <th>{t.colResults}</th>
                <th>{t.colDate}</th>
                <th>{t.colAction}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SourceSkeleton columns={5} />
              ) : jobs.length ? (
                jobs.map((job) => (
                  <tr key={job.id}>
                    <td data-label={t.colStatus}>
                      <JobStatusPill status={job.status} />
                    </td>
                    <td data-label={t.colSources}>
                      {job.sources
                        .map(({ data_source }) => data_source.name)
                        .join(', ')}
                    </td>
                    <td data-label={t.colResults}>
                      <strong>{job.discovered_count}</strong> {t.discovered}
                      <small>
                        {interpolate(t.createdEnriched, {
                          created: job.created_count,
                          enriched: job.enriched_count,
                        })}
                      </small>
                    </td>
                    <td data-label={t.colDate}>
                      {new Date(job.created_at).toLocaleString(
                        INTL_LOCALES[locale],
                      )}
                    </td>
                    <td data-label={t.colAction}>
                      <button
                        type="button"
                        className="outline-button compact-action-button"
                        onClick={() => void openJob(job)}
                        disabled={jobLoading}
                      >
                        {t.details}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="users-empty-cell">
                    {t.noJobs}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {collectionOpen ? (
        <CollectionDialog
          sources={sources}
          onClose={() => setCollectionOpen(false)}
          onSubmit={async (input) => {
            await authApi.startCollectionJob(input);
            setCollectionOpen(false);
            notify('success', t.collectionStarted);
            await refresh();
          }}
        />
      ) : null}
      {dialog ? (
        <ConfirmDialog
          dialog={dialog}
          isWorking={working}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {selectedJob || jobLoading || jobError ? (
        <CollectionJobDrawer
          job={selectedJob}
          loading={jobLoading}
          error={jobError}
          onClose={() => {
            if (!jobLoading) {
              setSelectedJob(null);
              setJobError('');
            }
          }}
        />
      ) : null}
      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          variant={toast.variant}
          message={toast.message}
          offset={index * 4}
          onDismiss={() => closeToast(toast.id)}
        />
      ))}
    </section>
  );
}

function SourceDrawer({
  source,
  working,
  onClose,
  onSubmit,
}: {
  source: DataSource | null;
  working: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    type: string;
    collectionMethod: string;
    configurationReference?: string;
    logoUrl?: string;
    description?: string;
    enabled?: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(source?.name ?? '');
  const [type, setType] = useState(source?.type ?? 'BUSINESS_DIRECTORY');
  const [method, setMethod] = useState(source?.collection_method ?? 'API');
  const [reference, setReference] = useState(
    source?.configuration_reference ?? '',
  );
  const [logoUrl, setLogoUrl] = useState(source?.logo_url ?? '');
  const [description, setDescription] = useState(source?.description ?? '');
  const [enabled, setEnabled] = useState(source?.enabled ?? true);
  const [closing, setClosing] = useState(false);
  const t = useI18n().messages.dataSourcesPage;

  function close() {
    setClosing(true);
    window.setTimeout(onClose, 350);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      name: name.trim(),
      type,
      collectionMethod: method,
      configurationReference: reference.trim() || undefined,
      logoUrl: logoUrl.trim() || undefined,
      description: description.trim() || undefined,
      enabled,
    });
  }

  return (
    <div
      className={`drawer-backdrop${closing ? ' backdrop-closing' : ''}`}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside
        className={`user-drawer${closing ? ' drawer-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-drawer-title"
      >
        <button
          className="drawer-close"
          type="button"
          onClick={close}
          aria-label={t.close}
        >
          ×
        </button>
        <h2 id="source-drawer-title">
          {source ? t.drawerEditTitle : t.drawerAddTitle}
        </h2>
        <p>{t.drawerIntro}</p>
        <hr />
        <form onSubmit={(event) => void submit(event)}>
          <DrawerField label={t.fieldName} required>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t.fieldNamePlaceholder}
            />
          </DrawerField>

          <DrawerField label={t.fieldLogo}>
            <div
              style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}
            >
              <SourceLogo
                logoUrl={logoUrl.trim() || null}
                name={name || 'Source'}
                size={40}
              />
              <input
                type="url"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                placeholder="https://.../logo.png"
                style={{ flex: 1 }}
              />
            </div>
          </DrawerField>

          <DrawerField label={t.fieldType} required>
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as DataSourceType)
              }
            >
              {SOURCE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t.sourceTypes[value]}
                </option>
              ))}
            </select>
          </DrawerField>

          <DrawerField label={t.fieldMethod} required>
            <select
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as CollectionMethod)
              }
            >
              {METHODS.map((value) => (
                <option key={value} value={value}>
                  {t.methods[value]}
                </option>
              ))}
            </select>
          </DrawerField>

          <DrawerField label={t.fieldReference}>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder={t.fieldReferencePlaceholder}
            />
          </DrawerField>

          <DrawerField label={t.fieldDescription}>
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t.fieldDescriptionPlaceholder}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </DrawerField>

          <DrawerField label={t.fieldStatus}>
            <select
              value={enabled ? 'ACTIVE' : 'INACTIVE'}
              onChange={(event) => setEnabled(event.target.value === 'ACTIVE')}
            >
              <option value="ACTIVE">{t.statusActiveOption}</option>
              <option value="INACTIVE">{t.statusInactiveOption}</option>
            </select>
          </DrawerField>

          <div className="drawer-actions">
            <button
              className="outline-button"
              type="button"
              onClick={close}
              disabled={working}
            >
              {t.cancel}
            </button>
            <button className="orange-button" type="submit" disabled={working}>
              {working ? t.saving : t.save}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function SourceSkeleton({ columns = 6 }: { columns?: number }) {
  return (
    <>
      {Array.from({ length: 5 }, (_, index) => (
        <tr key={index}>
          {Array.from({ length: columns }, (_, cell) => (
            <td key={cell}>
              <span
                className="skeleton-box"
                style={{
                  display: 'block',
                  height: 16,
                  width: cell === 0 ? '75%' : '58%',
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
function CardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="data-sources-grid">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="data-source-card" style={{ opacity: 0.7 }}>
          <div className="data-source-card-header">
            <span
              className="skeleton-box"
              style={{
                width: 46,
                height: 46,
                borderRadius: 8,
                flexShrink: 0,
                display: 'block',
              }}
            />
            <div className="data-source-card-title-group">
              <span
                className="skeleton-box"
                style={{
                  width: '80%',
                  height: 18,
                  marginBottom: 8,
                  display: 'block',
                }}
              />
              <span
                className="skeleton-box"
                style={{ width: '50%', height: 12, display: 'block' }}
              />
            </div>
          </div>
          <div
            className="data-source-card-badges"
            style={{ gap: '0.5rem', marginBottom: '1rem' }}
          >
            <span
              className="skeleton-box"
              style={{
                width: 60,
                height: 20,
                borderRadius: 4,
                display: 'inline-block',
              }}
            />
            <span
              className="skeleton-box"
              style={{
                width: 90,
                height: 20,
                borderRadius: 4,
                display: 'inline-block',
              }}
            />
          </div>
          <div className="data-source-card-about" style={{ minHeight: 70 }}>
            <span
              className="skeleton-box"
              style={{
                width: '100%',
                height: 14,
                marginBottom: 6,
                display: 'block',
              }}
            />
            <span
              className="skeleton-box"
              style={{ width: '80%', height: 14, display: 'block' }}
            />
          </div>
          <div className="data-source-card-footer">
            <span
              className="skeleton-box"
              style={{ width: 80, height: 24, display: 'inline-block' }}
            />
            <span
              className="skeleton-box"
              style={{
                width: 70,
                height: 28,
                borderRadius: 4,
                display: 'inline-block',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
function StatusPill({ enabled }: { enabled: boolean }) {
  const t = useI18n().messages.dataSourcesPage;
  return (
    <span className={`data-source-status ${enabled ? 'enabled' : 'disabled'}`}>
      {enabled ? t.statusActive : t.statusDisabled}
    </span>
  );
}

function JobStatusPill({ status }: { status: CollectionJob['status'] }) {
  const t = useI18n().messages.dataSourcesPage;
  return (
    <span className={`data-source-status job-${status.toLowerCase()}`}>
      {t.jobStatus[status]}
    </span>
  );
}

function CollectionJobDrawer({
  job,
  loading,
  error,
  onClose,
}: {
  job: CollectionJobDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const t = useI18n().messages.dataSourcesPage;

  function close() {
    if (loading || closing) return;
    setClosing(true);
    window.setTimeout(onClose, 350);
  }

  return (
    <div
      className={`drawer-backdrop${closing ? ' backdrop-closing' : ''}`}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside
        className={`user-drawer${closing ? ' drawer-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-job-title"
      >
        <button
          className="drawer-close"
          type="button"
          onClick={close}
          disabled={loading}
          aria-label={t.close}
        >
          ×
        </button>
        <h2 id="collection-job-title">{t.jobTitle}</h2>
        {loading ? <p role="status">{t.jobLoading}</p> : null}
        {error ? (
          <p className="users-error" role="alert">
            {error}
          </p>
        ) : null}
        {job ? (
          <>
            <p className="profile-notice">
              {interpolate(t.jobSummary, {
                discovered: job.discovered_count,
                created: job.created_count,
                enriched: job.enriched_count,
              })}
            </p>
            {job.failure_message ? (
              <p className="users-error" role="alert">
                {job.failure_message}
              </p>
            ) : null}
            <h3>{t.evidenceTitle}</h3>
            {job.evidence.length ? (
              <div className="collection-job-evidence-list">
                {job.evidence.map((evidence) => (
                  <article
                    key={evidence.id}
                    className="collection-job-evidence"
                  >
                    <strong>{evidence.company.name}</strong>
                    <span>{evidence.data_source.name}</span>
                    <small>{evidence.field_value ?? evidence.field_name}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p>{t.noEvidence}</p>
            )}
          </>
        ) : null}
      </aside>
    </div>
  );
}

function methodLabel(t: DataSourcesCopy, value: string) {
  return t.methods[value as CollectionMethod] ?? value;
}
function messageFrom(reason: unknown, fallback: string) {
  return reason instanceof ApiError ? reason.message : fallback;
}

function CollectionDialog({
  sources,
  onClose,
  onSubmit,
}: {
  sources: DataSource[];
  onClose: () => void;
  onSubmit: (input: {
    sourceIds: string[];
    sector?: string;
    governorate?: string;
    query?: string;
  }) => Promise<void>;
}) {
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(
    sources.filter((source) => source.enabled).map((source) => source.id),
  );
  const [sector, setSector] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const enabledSources = sources.filter((source) => source.enabled);
  const t = useI18n().messages.dataSourcesPage;

  function close() {
    if (saving || closing) return;
    setClosing(true);
    window.setTimeout(onClose, 350);
  }

  function toggleSource(id: string) {
    setSelectedSourceIds((current) =>
      current.includes(id)
        ? current.filter((sourceId) => sourceId !== id)
        : [...current, id],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSourceIds.length) {
      setError(t.selectSourceError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        sourceIds: selectedSourceIds,
        ...(sector.trim() && { sector: sector.trim() }),
        ...(governorate.trim() && { governorate: governorate.trim() }),
        ...(query.trim() && { query: query.trim() }),
      });
    } catch (reason) {
      setError(messageFrom(reason, t.collectionError));
      setSaving(false);
    }
  }

  return (
    <div
      className={`drawer-backdrop${closing ? ' backdrop-closing' : ''}`}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <aside
        className={`user-drawer${closing ? ' drawer-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-dialog-title"
      >
        <button
          className="drawer-close"
          type="button"
          onClick={close}
          disabled={saving}
          aria-label={t.close}
        >
          ×
        </button>
        <h2 id="collection-dialog-title">{t.collectionTitle}</h2>
        <p>{t.collectionIntro}</p>
        {!enabledSources.length ? (
          <p className="users-error" role="alert">
            {t.noActiveSources}
          </p>
        ) : (
          <form onSubmit={submit}>
            <fieldset className="collection-source-list">
              <legend>{t.activeSources}</legend>
              {enabledSources.map((source) => (
                <label key={source.id} className="collection-source-option">
                  <input
                    type="checkbox"
                    checked={selectedSourceIds.includes(source.id)}
                    onChange={() => toggleSource(source.id)}
                    disabled={saving}
                  />
                  <span>{source.name}</span>
                </label>
              ))}
            </fieldset>
            <label className="drawer-field">
              <span>{t.fieldSector}</span>
              <input
                value={sector}
                onChange={(event) => setSector(event.target.value)}
                placeholder={t.fieldSectorPlaceholder}
                disabled={saving}
              />
            </label>
            <label className="drawer-field">
              <span>{t.fieldGovernorate}</span>
              <input
                value={governorate}
                onChange={(event) => setGovernorate(event.target.value)}
                placeholder={t.fieldGovernoratePlaceholder}
                disabled={saving}
              />
            </label>
            <label className="drawer-field">
              <span>{t.fieldQuery}</span>
              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.fieldQueryPlaceholder}
                disabled={saving}
              />
            </label>
            {error ? (
              <p className="users-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="drawer-actions">
              <button
                className="outline-button"
                type="button"
                onClick={close}
                disabled={saving}
              >
                {t.cancel}
              </button>
              <button className="orange-button" type="submit" disabled={saving}>
                {saving ? t.launching : t.launchCollection}
              </button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}
