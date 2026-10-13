'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { AppShell } from '@/components/workspace/app-shell';
import { CompanyAiAssistant } from '@/components/companies/company-ai-assistant';
import { useAuth } from '@/components/auth/auth-provider';
import { Toast } from '@/components/auth/toast';
import {
  CriteriaDialog,
  SparkleIcon,
} from '@/components/prospection/criteria-dialog';
import { ApiError, authApi } from '@/lib/api';
import { FilterDropdown } from '@/components/shared/filter-dropdown';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate, type Messages } from '@/lib/i18n/messages';
import { INTL_LOCALES } from '@/lib/i18n/config';
import type {
  Prospect,
  ProspectingCriteria,
  ProspectingRun,
} from '@/types/auth';

type ProspectionCopy = Messages['prospectionPage'];
type PotentialLevel = 'veryHigh' | 'high' | 'medium';

// Same thresholds as the backend (prospecting.constants.ts).
function potentialLevel(score: number): PotentialLevel {
  if (score >= 75) return 'veryHigh';
  if (score >= 50) return 'high';
  return 'medium';
}

const POTENTIAL_PILL_CLASS: Record<PotentialLevel, string> = {
  veryHigh: 'potential-very-high',
  high: 'potential-high',
  medium: 'potential-medium',
};

// The backend stores these default sentences in French; anything else is an
// agent-written note and is shown as written.
const DEFAULT_RECOMMENDATIONS: Record<
  string,
  keyof ProspectionCopy['recommendation']
> = {
  'Cible prioritaire selon le score IA actuel.': 'priority',
  'Opportunité à qualifier avec un agent.': 'qualify',
  'Profil à examiner avant toute prise de contact.': 'review',
};

const BACKEND_PLACEHOLDERS = new Set(['Non renseigné', 'Non renseignée']);

function recommendationText(t: ProspectionCopy, value: string) {
  const key = DEFAULT_RECOMMENDATIONS[value];
  return key ? t.recommendation[key] : value;
}

function displayValue(t: ProspectionCopy, value: string) {
  return BACKEND_PLACEHOLDERS.has(value) ? t.notProvided : value;
}

type Tab = 'opportunities' | 'shortlist' | 'history';
type AvailableAgent = {
  id: string;
  account: { id: string };
  first_name: string;
  last_name: string;
  email: string;
  status?: 'PENDING' | 'ACTIVE' | 'BLOCKED';
  manager_id?: string | null;
  manager_account_id?: string | null;
};

export default function ProspectionPage() {
  const { account } = useAuth();
  const { messages, locale } = useI18n();
  const t = messages.prospectionPage;
  const [tab, setTab] = useState<Tab>('opportunities');
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      return (
        window.location.search.includes('start=true') ||
        sessionStorage.getItem('dme_start_prospection') === 'true'
      );
    }
    return false;
  });
  const [hasResults, setHasResults] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [historyItems, setHistoryItems] = useState<ProspectingRun[]>([]);
  const [pageError, setPageError] = useState('');
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [selectedRun, setSelectedRun] = useState<ProspectingRun | null>(null);
  const [assigning, setAssigning] = useState<Prospect | null>(null);
  const [agents, setAgents] = useState<AvailableAgent[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [confirming, setConfirming] = useState<Prospect | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const toastIdRef = useRef(0);

  const pushToast = useCallback((message: string) => {
    const id = toastIdRef.current++;
    setToasts((current) => [...current, { id, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const [query, setQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [scoreFilter, setScoreFilter] = useState('');
  const [potentialFilter, setPotentialFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [filterNow] = useState(() => Date.now());

  const loadProspection = useCallback(async () => {
    setPageError('');
    try {
      const [nextProspects, nextHistory] = await Promise.all([
        authApi.listProspects(),
        authApi.listProspectingHistory(),
      ]);
      setProspects(nextProspects);
      setHistoryItems(nextHistory);
      setHasResults(nextProspects.length > 0);
    } catch (reason) {
      setPageError(reason instanceof ApiError ? reason.message : t.loadError);
    }
  }, [t.loadError]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProspection(), 0);
    return () => window.clearTimeout(timer);
  }, [loadProspection]);

  const filteredProspects = useMemo(() => {
    const value = query.trim().toLowerCase();
    return prospects.filter((prospect) => {
      const matchesQuery =
        `${prospect.company} ${prospect.sector} ${prospect.location}`
          .toLowerCase()
          .includes(value);
      const matchesSector = !sectorFilter || prospect.sector === sectorFilter;
      const matchesLocation =
        !locationFilter || prospect.location.includes(locationFilter);
      const matchesScore =
        !scoreFilter ||
        (scoreFilter === '75' ? prospect.score >= 75 : prospect.score >= 50);
      const matchesPotential =
        !potentialFilter || potentialLevel(prospect.score) === potentialFilter;
      const matchesStatus = !statusFilter || prospect.status === statusFilter;
      const matchesDate =
        !dateFilter ||
        new Date(prospect.addedAt).getTime() >=
          filterNow - Number(dateFilter) * 24 * 60 * 60 * 1000;
      return (
        matchesQuery &&
        matchesSector &&
        matchesLocation &&
        matchesScore &&
        matchesPotential &&
        matchesStatus &&
        matchesDate
      );
    });
  }, [
    dateFilter,
    filterNow,
    locationFilter,
    potentialFilter,
    prospects,
    query,
    scoreFilter,
    sectorFilter,
    statusFilter,
  ]);

  useEffect(() => {
    const hasSearch =
      typeof window !== 'undefined' &&
      window.location.search.includes('start=true');
    const hasStorage =
      typeof window !== 'undefined' &&
      sessionStorage.getItem('dme_start_prospection') === 'true';

    if (hasSearch || hasStorage) {
      const timer = window.setTimeout(() => {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('dme_start_prospection');
          if (window.location.search.includes('start=true')) {
            window.history.replaceState({}, '', '/prospection');
          }
        }
        setLoading(false);
        void loadProspection();
      }, 1500);

      return () => window.clearTimeout(timer);
    }
  }, [loadProspection]);

  async function runProspection(criteria: ProspectingCriteria) {
    setCriteriaOpen(false);
    setTab('opportunities');
    setLoading(true);
    setPageError('');
    try {
      const result = await authApi.startProspecting(criteria);
      await loadProspection();
      if (result.discoveredCount === 0) {
        pushToast(locale === 'fr'
          ? 'Aucune entreprise trouvée. Essayez un autre secteur ou une autre région.'
          : 'No companies found. Try another sector or region.');
      }
    } catch (reason) {
      await loadProspection();
      const message = reason instanceof ApiError ? reason.message : t.launchError;
      setPageError(locale === 'fr' && message.startsWith('Discovery sources')
        ? 'Les sources de recherche sont temporairement indisponibles. Réessayez plus tard.'
        : message);
    } finally {
      setLoading(false);
    }
  }

  function addToShortlist(prospect: Prospect) {
    setConfirming(prospect);
  }

  function confirmShortlist() {
    if (!confirming) return;
    void authApi
      .shortlistProspect(confirming.id)
      .then(async () => {
        await loadProspection();
        setConfirming(null);
        pushToast(
          interpolate(t.toastShortlisted, { company: confirming.company }),
        );
      })
      .catch((reason: unknown) => {
        setPageError(
          reason instanceof ApiError ? reason.message : t.shortlistError,
        );
        setConfirming(null);
      });
  }

  async function removeFromShortlist(prospect: Prospect) {
    try {
      await authApi.removeProspectFromShortlist(prospect.id);
      await loadProspection();
      pushToast(interpolate(t.toastRemoved, { company: prospect.company }));
    } catch (reason) {
      setPageError(
        reason instanceof ApiError ? reason.message : t.shortlistError,
      );
    }
  }

  async function openAssignment(prospect: Prospect) {
    setPageError('');
    try {
      const availableAgents = await authApi.listAgents();
      setAgents(availableAgents.filter((agent) => agent.status === 'ACTIVE'));
      setAssigning(prospect);
    } catch (reason) {
      setPageError(
        reason instanceof ApiError ? reason.message : t.agentsLoadError,
      );
    }
  }

  async function assignProspect(agentId: string, scheduledAt: string) {
    if (!assigning) return;
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) return;
    setAssignLoading(true);
    try {
      await authApi.assignProspect(assigning.id, {
        agentId: agent.account.id,
        ...(account?.role === 'SUPERADMIN' && agent.manager_account_id
          ? { managerId: agent.manager_account_id }
          : {}),
        scheduledAt: new Date(scheduledAt).toISOString(),
      });
      await loadProspection();
      setAssigning(null);
      pushToast(
        interpolate(t.toastAssigned, {
          company: assigning.company,
          agent: `${agent.first_name} ${agent.last_name}`,
        }),
      );
    } catch (reason) {
      setPageError(reason instanceof ApiError ? reason.message : t.assignError);
    } finally {
      setAssignLoading(false);
    }
  }

  return (
    <AppShell>
      <section
        className="prospection-page users-page"
        id="prospection"
        aria-labelledby="prospection-title"
      >
        <div className="prospection-header">
          <div>
            {tab !== 'opportunities' && (
              <p className="prospection-breadcrumb">
                {t.breadcrumbRoot}{' '}
                <span
                  style={{
                    color: '#aaa',
                    margin: '0 0.6rem',
                    fontWeight: 400,
                    fontSize: '1.2rem',
                    verticalAlign: 'middle',
                  }}
                >
                  ›
                </span>{' '}
                <span style={{ color: 'var(--orange)' }}>
                  {tab === 'history' ? t.tabHistory : t.tabShortlist}
                </span>
              </p>
            )}
            <h1 id="prospection-title">
              {tab === 'history' ? (
                <>
                  <strong>{t.titleHistoryStrong}</strong>
                  {t.titleHistoryRest}
                </>
              ) : tab === 'shortlist' ? (
                <>
                  <strong>{t.titleShortlistStrong}</strong>
                  {t.titleShortlistRest}
                </>
              ) : (
                <>
                  <strong>{t.titleOpportunitiesStrong}</strong>
                  {t.titleOpportunitiesRest}
                </>
              )}
            </h1>
          </div>
          <div className="prospection-header-actions">
            <div
              className="prospection-tabs"
              role="tablist"
              aria-label={t.tabsAriaLabel}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'opportunities'}
                onClick={() => setTab('opportunities')}
              >
                {t.tabOpportunities}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'shortlist'}
                onClick={() => setTab('shortlist')}
              >
                {t.tabShortlist}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'history'}
                onClick={() => setTab('history')}
              >
                {t.tabHistory}
              </button>
            </div>
            {tab === 'opportunities' &&
              hasResults &&
              account?.role !== 'AGENT' && (
                <button
                  className="orange-button"
                  type="button"
                  onClick={() => setCriteriaOpen(true)}
                >
                  <SparkleIcon />
                  {t.launch}
                </button>
              )}
          </div>
        </div>

        {toasts.map((toast, index) => (
          <Toast
            key={toast.id}
            variant="success"
            message={toast.message}
            offset={index * 4.5}
            onDismiss={() => dismissToast(toast.id)}
          />
        ))}

        {pageError ? (
          <p className="users-error" role="alert">
            {pageError}
          </p>
        ) : null}

        <div className="table-animate-wrapper table-change-animate" key={tab}>
          {tab === 'history' ? (
            <HistoryView items={historyItems} onView={setSelectedRun} t={t} />
          ) : tab === 'shortlist' ? (
            <ShortlistView
              t={t}
              prospects={prospects.filter((item) => item.shortlisted)}
              onRemove={(prospect) => void removeFromShortlist(prospect)}
              onAssign={
                account?.role === 'AGENT'
                  ? undefined
                  : (prospect) => void openAssignment(prospect)
              }
            />
          ) : (
            <>
              {!hasResults && !loading && account?.role !== 'AGENT' ? (
                <EmptyProspection
                  t={t}
                  onLaunch={() => setCriteriaOpen(true)}
                />
              ) : null}
              {loading ? <ProspectionSkeleton t={t} /> : null}
              {hasResults && !loading ? (
                <ProspectionResults
                  t={t}
                  prospects={filteredProspects}
                  query={query}
                  onQueryChange={setQuery}
                  shortlist={prospects
                    .filter((item) => item.shortlisted)
                    .map((item) => item.id)}
                  selected={selected}
                  onSelect={setSelected}
                  onShortlist={addToShortlist}
                  onRemove={(id) => {
                    const prospect = prospects.find((item) => item.id === id);
                    if (prospect) void removeFromShortlist(prospect);
                  }}
                  onCloseDrawer={() => setSelected(null)}
                  sectorFilter={sectorFilter}
                  locationFilter={locationFilter}
                  scoreFilter={scoreFilter}
                  potentialFilter={potentialFilter}
                  statusFilter={statusFilter}
                  onSectorFilterChange={setSectorFilter}
                  onLocationFilterChange={setLocationFilter}
                  onScoreFilterChange={setScoreFilter}
                  onPotentialFilterChange={setPotentialFilter}
                  onStatusFilterChange={setStatusFilter}
                  dateFilter={dateFilter}
                  onDateFilterChange={setDateFilter}
                />
              ) : null}
            </>
          )}
        </div>
      </section>

      {criteriaOpen ? (
        <CriteriaDialog
          onClose={() => setCriteriaOpen(false)}
          onSubmit={runProspection}
        />
      ) : null}
      {confirming ? (
        <ShortlistDialog
          t={t}
          prospect={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={confirmShortlist}
        />
      ) : null}
      {selectedRun ? (
        <RunDetailsDialog
          t={t}
          run={selectedRun}
          onClose={() => setSelectedRun(null)}
        />
      ) : null}
      {assigning ? (
        <AssignmentDialog
          t={t}
          prospect={assigning}
          agents={agents}
          loading={assignLoading}
          onClose={() => setAssigning(null)}
          onSubmit={assignProspect}
        />
      ) : null}
    </AppShell>
  );
}

function EmptyProspection({
  t,
  onLaunch,
}: {
  t: ProspectionCopy;
  onLaunch: () => void;
}) {
  return (
    <div className="prospection-empty">
      <Image
        className="prospection-empty-asset"
        src="/prospection-frame.svg"
        alt=""
        width={203}
        height={191}
        priority
      />
      <button className="orange-button" type="button" onClick={onLaunch}>
        {t.launch}
      </button>
    </div>
  );
}

function ProspectionSkeleton({ t }: { t: ProspectionCopy }) {
  return (
    <div className="prospection-results" aria-busy="true">
      <div className="users-toolbar prospection-toolbar-override">
        <div
          className="skeleton-box"
          style={{ width: '22rem', height: '2.5rem', borderRadius: 4 }}
        />
        <div
          className="skeleton-box"
          style={{ width: '8.5rem', height: '2.5rem', borderRadius: 4 }}
        />
        <div
          className="skeleton-box"
          style={{ width: '8.5rem', height: '2.5rem', borderRadius: 4 }}
        />
        <div
          className="skeleton-box"
          style={{ width: '8.5rem', height: '2.5rem', borderRadius: 4 }}
        />
      </div>
      <div className="prospection-results-title">
        <h2>{t.skeletonTitle}</h2>
        <span
          className="prospection-badge-pill"
          style={{ background: '#fff0d9', color: '#c66a00' }}
        >
          {t.skeletonBadge}
        </span>
      </div>
      <div className="users-table-wrap">
        <table className="users-table prospection-table">
          <thead>
            <tr>
              <th>{t.colCompany}</th>
              <th>{t.colSector}</th>
              <th>{t.colLocation}</th>
              <th>{t.colScore}</th>
              <th>{t.colPotential}</th>
              <th>{t.colRecommendation}</th>
              <th>{t.colAction}</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6].map((row) => (
              <tr key={row} aria-hidden="true">
                <td>
                  <span
                    className="skeleton-box"
                    style={{ width: '10rem', height: 16, display: 'block' }}
                  />
                </td>
                <td>
                  <span
                    className="skeleton-box"
                    style={{ width: '7rem', height: 14, display: 'block' }}
                  />
                </td>
                <td>
                  <span
                    className="skeleton-box"
                    style={{ width: '6rem', height: 14, display: 'block' }}
                  />
                </td>
                <td>
                  <span
                    className="skeleton-box"
                    style={{ width: '3.5rem', height: 16, display: 'block' }}
                  />
                </td>
                <td>
                  <span
                    className="skeleton-box"
                    style={{ width: '5.5rem', height: 16, display: 'block' }}
                  />
                </td>
                <td>
                  <span
                    className="skeleton-box"
                    style={{ width: '14rem', height: 14, display: 'block' }}
                  />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span
                    className="skeleton-box"
                    style={{
                      width: '5rem',
                      height: 28,
                      borderRadius: 4,
                      display: 'inline-block',
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProspectionResults({
  t,
  prospects: items,
  query,
  onQueryChange,
  shortlist,
  selected,
  onSelect,
  onShortlist,
  onRemove,
  onCloseDrawer,
  sectorFilter,
  locationFilter,
  scoreFilter,
  potentialFilter,
  statusFilter,
  onSectorFilterChange,
  onLocationFilterChange,
  onScoreFilterChange,
  onPotentialFilterChange,
  onStatusFilterChange,
  dateFilter,
  onDateFilterChange,
}: {
  t: ProspectionCopy;
  prospects: Prospect[];
  query: string;
  onQueryChange: (value: string) => void;
  shortlist: string[];
  selected: Prospect | null;
  onSelect: (prospect: Prospect) => void;
  onShortlist: (prospect: Prospect) => void;
  onRemove: (id: string) => void;
  onCloseDrawer: () => void;
  sectorFilter: string;
  locationFilter: string;
  scoreFilter: string;
  potentialFilter: string;
  statusFilter: string;
  onSectorFilterChange: (value: string) => void;
  onLocationFilterChange: (value: string) => void;
  onScoreFilterChange: (value: string) => void;
  onPotentialFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  dateFilter: string;
  onDateFilterChange: (value: string) => void;
}) {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const prospectToRemove = items.find((p) => p.id === removingId);
  return (
    <div className="prospection-results">
      <div className="users-toolbar prospection-toolbar-override">
        <label className="users-search">
          <span aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchAriaLabel}
          />
        </label>
        <FilterDropdown
          ariaLabel={t.filterSector}
          value={sectorFilter}
          onChange={onSectorFilterChange}
          options={[
            { value: '', label: t.filterSector },
            ...Array.from(new Set(items.map((item) => item.sector))).map(
              (sector) => ({ value: sector, label: displayValue(t, sector) }),
            ),
          ]}
        />
        <FilterDropdown
          ariaLabel={t.filterGovernorate}
          value={locationFilter}
          onChange={onLocationFilterChange}
          options={[
            { value: '', label: t.filterGovernorate },
            ...Array.from(new Set(items.map((item) => item.location))).map(
              (location) => ({
                value: location,
                label: displayValue(t, location),
              }),
            ),
          ]}
        />
        <FilterDropdown
          ariaLabel={t.filterScore}
          value={scoreFilter}
          onChange={onScoreFilterChange}
          options={[
            { value: '', label: t.filterScore },
            { value: '50', label: t.filterScoreQualified },
            { value: '75', label: t.filterScorePriority },
          ]}
        />
        <FilterDropdown
          ariaLabel={t.filterPotential}
          value={potentialFilter}
          onChange={onPotentialFilterChange}
          options={[
            { value: '', label: t.filterPotential },
            { value: 'veryHigh', label: t.potential.veryHigh },
            { value: 'high', label: t.potential.high },
            { value: 'medium', label: t.potential.medium },
          ]}
        />
        <FilterDropdown
          ariaLabel={t.filterStatus}
          value={statusFilter}
          onChange={onStatusFilterChange}
          options={[
            { value: '', label: t.filterStatus },
            { value: 'SURFACED', label: t.entryStatus.SURFACED },
            { value: 'SHORTLISTED', label: t.entryStatus.SHORTLISTED },
            { value: 'ASSIGNED', label: t.entryStatus.ASSIGNED },
          ]}
        />
        <FilterDropdown
          ariaLabel={t.filterDate}
          value={dateFilter}
          onChange={onDateFilterChange}
          options={[
            { value: '', label: t.filterDate },
            { value: '7', label: t.filterLast7Days },
            { value: '30', label: t.filterLast30Days },
          ]}
        />
      </div>
      <div className="prospection-results-title">
        <h2>{t.resultsTitle}</h2>
        <span className="prospection-badge-pill">
          {interpolate(
            items.length === 1 ? t.qualifiedCountOne : t.qualifiedCountOther,
            { count: items.length },
          )}
        </span>
      </div>
      <div className={`prospection-layout ${selected ? 'drawer-open' : ''}`}>
        <div className="prospection-table-area">
          <div className="users-table-wrap">
            <table className="users-table prospection-table">
              <thead>
                <tr>
                  <th>{t.colCompany}</th>
                  <th>{t.colSector}</th>
                  <th>{t.colLocation}</th>
                  <th>{t.colScore}</th>
                  <th>{t.colPotential}</th>
                  <th>{t.colRecommendation}</th>
                  <th>{t.colAction}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((prospect) => (
                  <tr key={prospect.id} onClick={() => onSelect(prospect)}>
                    <td data-label={t.colCompany}>
                      <strong>{prospect.company}</strong>
                    </td>
                    <td data-label={t.colSector}>
                      {displayValue(t, prospect.sector)}
                    </td>
                    <td data-label={t.colLocation}>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          color: '#555',
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {displayValue(t, prospect.location)}
                      </span>
                    </td>
                    <td data-label={t.colScore}>
                      <span className="prospection-score">
                        {prospect.score}%
                      </span>
                    </td>
                    <td data-label={t.colPotential}>
                      <span
                        className={`prospection-potential-pill ${POTENTIAL_PILL_CLASS[potentialLevel(prospect.score)]}`}
                      >
                        {t.potential[potentialLevel(prospect.score)]}
                      </span>
                    </td>
                    <td
                      className="prospection-recommendation"
                      data-label={t.colRecommendation}
                    >
                      {recommendationText(t, prospect.recommendation)}
                    </td>
                    <td data-label={t.colAction}>
                      <div className="prospection-actions-cell">
                        <button
                          type="button"
                          className="prospection-action-link"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(prospect);
                          }}
                          style={{ color: '#111' }}
                        >
                          {t.view}
                        </button>
                        {shortlist.includes(prospect.id) ? (
                          <button
                            type="button"
                            className="prospection-action-link"
                            onClick={(event) => {
                              event.stopPropagation();
                              setRemovingId(prospect.id);
                            }}
                            style={{ color: '#ef4444' }}
                          >
                            {t.removeAction}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="prospection-action-link"
                            onClick={(event) => {
                              event.stopPropagation();
                              onShortlist(prospect);
                            }}
                          >
                            {t.shortlistAction}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <ProspectDrawerWrapper
          t={t}
          selected={selected}
          shortlist={shortlist}
          onClose={onCloseDrawer}
          onShortlist={onShortlist}
        />
      </div>
      {removingId && prospectToRemove && (
        <RemoveConfirmationDialog
          t={t}
          prospectName={prospectToRemove.company}
          onClose={() => setRemovingId(null)}
          onConfirm={() => {
            onRemove(removingId);
            setRemovingId(null);
          }}
        />
      )}
    </div>
  );
}

function HistoryView({
  t,
  items,
  onView,
}: {
  t: ProspectionCopy;
  items: ProspectingRun[];
  onView: (run: ProspectingRun) => void;
}) {
  const { locale } = useI18n();
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleItems = items.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <div className="prospection-results">
      <div
        className="users-table-wrap"
        style={{ paddingBottom: 0, borderRadius: '0.35rem' }}
      >
        <table className="users-table prospection-table prospection-history-table">
          <thead>
            <tr>
              <th>{t.colDate}</th>
              <th>{t.colCriteria}</th>
              <th>{t.colFound}</th>
              <th>{t.colQualified}</th>
              <th>{t.colStatus}</th>
              <th>{t.colAction}</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id}>
                <td
                  data-label={t.colDate}
                  style={{ fontWeight: 500, color: '#333' }}
                >
                  {formatDate(item.created_at, locale)}
                </td>
                <td
                  data-label={t.colCriteria}
                  style={{
                    whiteSpace: 'pre-wrap',
                    color: '#777',
                    fontSize: '0.75rem',
                    lineHeight: 1.45,
                  }}
                >
                  {formatCriteria(t, item.criteria)}
                </td>
                <td data-label={t.colFound} style={{ textAlign: 'center' }}>
                  <strong>{item.discovered_count}</strong>
                </td>
                <td
                  data-label={t.colQualified}
                  style={{
                    textAlign: 'center',
                    color: 'var(--orange-active)',
                    fontWeight: 700,
                  }}
                >
                  {item.qualified_count}
                </td>
                <td data-label={t.colStatus}>
                  <span
                    className={`prospection-status-pill status-${item.status === 'COMPLETED' ? 'done' : item.status === 'FAILED' ? 'failed' : 'pending'}`}
                  >
                    {t.runStatus[item.status]}
                  </span>
                </td>
                <td data-label={t.colAction}>
                  <button
                    className="prospection-action-link"
                    type="button"
                    onClick={() => onView(item)}
                  >
                    {t.view}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="prospection-pagination">
        <button
          className="page-btn page-arrow"
          type="button"
          aria-label={t.previous}
          disabled={currentPage === 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          &lt;
        </button>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map(
          (pageNumber) => (
            <button
              key={pageNumber}
              className={`page-btn ${pageNumber === currentPage ? 'active' : ''}`}
              type="button"
              aria-label={interpolate(t.pageLabel, { page: pageNumber })}
              aria-current={pageNumber === currentPage ? 'page' : undefined}
              onClick={() => setPage(pageNumber)}
            >
              {pageNumber}
            </button>
          ),
        )}
        <button
          className="page-btn page-arrow"
          type="button"
          aria-label={t.next}
          disabled={currentPage === pageCount}
          onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
        >
          &gt;
        </button>
      </div>
    </div>
  );
}

function formatDate(value: string, locale: keyof typeof INTL_LOCALES) {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatCriteria(
  t: ProspectionCopy,
  criteria: ProspectingRun['criteria'],
) {
  if (!criteria) return t.noCriteria;
  return (
    [
      criteria.sector &&
        interpolate(t.criteriaSector, { value: criteria.sector }),
      criteria.governorate &&
        interpolate(t.criteriaZone, { value: criteria.governorate }),
      criteria.employeeRange &&
        interpolate(t.criteriaEmployees, { value: criteria.employeeRange }),
      criteria.query && interpolate(t.criteriaQuery, { value: criteria.query }),
    ]
      .filter(Boolean)
      .join(', ') || t.noCriteria
  );
}

// Renders a sentence containing {{company}} with the name in bold.
function withCompany(template: string, company: string) {
  const [before, after = ''] = template.split('{{company}}');
  return (
    <>
      {before}
      <strong>{company}</strong>
      {after}
    </>
  );
}

function RemoveConfirmationDialog({
  t,
  prospectName,
  onClose,
  onConfirm,
}: {
  t: ProspectionCopy;
  prospectName: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [isClosing, setIsClosing] = useState(false);

  function handleClose() {
    setIsClosing(true);
    setTimeout(onClose, 200);
  }

  function handleConfirm() {
    setIsClosing(true);
    setTimeout(onConfirm, 200);
  }

  return createPortal(
    <div
      className={`prospection-overlay ${isClosing ? 'closing' : ''}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="prospection-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-shortlist-title"
      >
        <h2 id="remove-shortlist-title">{t.removeTitle}</h2>
        <p>{withCompany(t.removeMessage, prospectName)}</p>
        <button
          className="orange-button"
          style={{ background: '#ef4444', borderColor: '#ef4444' }}
          type="button"
          onClick={handleConfirm}
        >
          {t.removeConfirm}
        </button>
        <button className="outline-button" type="button" onClick={handleClose}>
          {t.cancel}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function ShortlistView({
  t,
  prospects: items,
  onRemove,
  onAssign,
}: {
  t: ProspectionCopy;
  prospects: Prospect[];
  onRemove: (prospect: Prospect) => void;
  onAssign?: (prospect: Prospect) => void;
}) {
  const { locale } = useI18n();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const prospectToRemove = items.find((p) => p.id === removingId);

  return (
    <div className="prospection-results">
      {items.length === 0 ? (
        <div className="prospection-list-empty">{t.shortlistEmpty}</div>
      ) : (
        <div
          className="users-table-wrap"
          style={{ paddingBottom: 0, borderRadius: '0.35rem' }}
        >
          <table className="users-table prospection-table prospection-shortlist-table">
            <thead>
              <tr>
                <th>{t.colCompany}</th>
                <th>{t.colScore}</th>
                <th>{t.colPotential}</th>
                <th>{t.colAddedAt}</th>
                <th>{t.colRecommendation}</th>
                <th>{t.colAction}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td data-label={t.colCompany}>
                    <strong>{item.company}</strong>
                  </td>
                  <td data-label={t.colScore}>
                    <span className="prospection-score">{item.score}%</span>
                  </td>
                  <td data-label={t.colPotential}>
                    <span
                      className={`prospection-potential-pill ${POTENTIAL_PILL_CLASS[potentialLevel(item.score)]}`}
                    >
                      {t.potential[potentialLevel(item.score)]}
                    </span>
                  </td>
                  <td data-label={t.colAddedAt}>
                    {formatDate(item.addedAt, locale)}
                  </td>
                  <td
                    data-label={t.colRecommendation}
                    className="prospection-recommendation"
                    style={{
                      whiteSpace: 'normal',
                      color: '#777',
                      fontSize: '0.8rem',
                      lineHeight: 1.45,
                      paddingRight: '2rem',
                    }}
                  >
                    {recommendationText(t, item.recommendation)}
                  </td>
                  <td data-label={t.colAction} style={{ whiteSpace: 'nowrap' }}>
                    {onAssign ? (
                      <button
                        className="prospection-action-link"
                        style={{ color: '#10b981', fontWeight: 600 }}
                        type="button"
                        onClick={() => onAssign(item)}
                      >
                        {t.assign}
                      </button>
                    ) : null}
                    <button
                      className="prospection-action-link"
                      style={{
                        color: '#ef4444',
                        fontWeight: 600,
                        marginLeft: '0.65rem',
                      }}
                      type="button"
                      onClick={() => setRemovingId(item.id)}
                    >
                      {t.removeAction}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {removingId && prospectToRemove && (
        <RemoveConfirmationDialog
          t={t}
          prospectName={prospectToRemove.company}
          onClose={() => setRemovingId(null)}
          onConfirm={() => {
            const prospect = items.find((item) => item.id === removingId);
            if (prospect) onRemove(prospect);
            setRemovingId(null);
          }}
        />
      )}
    </div>
  );
}

function RunDetailsDialog({
  t,
  run,
  onClose,
}: {
  t: ProspectionCopy;
  run: ProspectingRun;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="prospection-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="prospection-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prospection-run-title"
      >
        <button
          className="prospection-dialog-close"
          type="button"
          onClick={onClose}
          aria-label={t.close}
        >
          ×
        </button>
        <h2 id="prospection-run-title">{t.runDetailsTitle}</h2>
        <p>{formatCriteria(t, run.criteria)}</p>
        <dl className="prospection-run-summary">
          <div>
            <dt>{t.colFound}</dt>
            <dd>{run.discovered_count}</dd>
          </div>
          <div>
            <dt>{t.colQualified}</dt>
            <dd>{run.qualified_count}</dd>
          </div>
          <div>
            <dt>{t.colStatus}</dt>
            <dd>{t.runStatus[run.status]}</dd>
          </div>
        </dl>
        {run.failure_message ? (
          <p className="users-error">{run.failure_message}</p>
        ) : null}
        {run.status === 'COMPLETED' ? (
          <>
            <h3 style={{ fontSize: '0.9rem', margin: '1rem 0 0.5rem' }}>
              {t.runCompaniesTitle}
            </h3>
            {run.companies.length ? (
              <ul
                style={{
                  maxHeight: '14rem',
                  overflowY: 'auto',
                  margin: '0 0 1rem',
                  paddingLeft: '1.1rem',
                  fontSize: '0.8rem',
                  lineHeight: 1.6,
                }}
              >
                {run.companies.map((company) => (
                  <li key={company.id}>
                    <strong>{company.name}</strong>
                    {company.score === null ? '' : ` — ${company.score}/100`}
                    <span style={{ color: '#777' }}>
                      {[company.sector, company.governorate]
                        .filter(Boolean)
                        .map((value) => ` · ${value}`)
                        .join('')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: '#777', fontSize: '0.8rem' }}>
                {t.runNoNewCompanies}
              </p>
            )}
          </>
        ) : null}
        <button className="outline-button" type="button" onClick={onClose}>
          {t.close}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function AssignmentDialog({
  t,
  prospect,
  agents,
  loading,
  onClose,
  onSubmit,
}: {
  t: ProspectionCopy;
  prospect: Prospect;
  agents: AvailableAgent[];
  loading: boolean;
  onClose: () => void;
  onSubmit: (agentId: string, scheduledAt: string) => void;
}) {
  const [agentId, setAgentId] = useState(agents[0]?.account.id ?? '');
  const [scheduledAt, setScheduledAt] = useState(defaultAssignmentDate());

  return createPortal(
    <div
      className="prospection-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div
        className="prospection-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prospection-assignment-title"
      >
        <button
          className="prospection-dialog-close"
          type="button"
          onClick={onClose}
          aria-label={t.close}
          disabled={loading}
        >
          ×
        </button>
        <h2 id="prospection-assignment-title">{t.assignTitle}</h2>
        <p>{interpolate(t.assignIntro, { company: prospect.company })}</p>
        <label className="prospection-dialog-field">
          {t.agentLabel}
          <select
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            disabled={loading}
          >
            <option value="">{t.selectAgent}</option>
            {agents.map((agent) => (
              <option key={agent.account.id} value={agent.account.id}>
                {interpolate(t.agentOption, {
                  name: `${agent.first_name} ${agent.last_name}`,
                  email: agent.email,
                })}
              </option>
            ))}
          </select>
        </label>
        <label className="prospection-dialog-field">
          {t.dateTimeLabel}
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
            disabled={loading}
          />
        </label>
        {!agents.length ? <p className="users-error">{t.noAgents}</p> : null}
        <div className="prospection-dialog-actions">
          <button
            className="outline-button"
            type="button"
            onClick={onClose}
            disabled={loading}
          >
            {t.cancel}
          </button>
          <button
            className="orange-button"
            type="button"
            onClick={() => onSubmit(agentId, scheduledAt)}
            disabled={loading || !agentId || !scheduledAt}
          >
            {loading ? t.assigning : t.assign}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function defaultAssignmentDate() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ProspectDrawerWrapper({
  t,
  selected,
  shortlist,
  onClose,
  onShortlist,
}: {
  t: ProspectionCopy;
  selected: Prospect | null;
  shortlist: string[];
  onClose: () => void;
  onShortlist: (p: Prospect) => void;
}) {
  const [prevSelected, setPrevSelected] = useState<Prospect | null>(selected);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        if (selected) setPrevSelected(selected);
        else if (prevSelected) setPrevSelected(null);
      },
      selected ? 0 : 400,
    );
    return () => clearTimeout(timer);
  }, [selected, prevSelected]);

  const prospectToRender = selected || prevSelected;

  return (
    <div className="prospection-side-panel-wrapper">
      {prospectToRender ? (
        <div
          className={`prospection-side-panel-inner ${selected ? 'is-open' : 'is-closing'}`}
        >
          <ProspectDrawer
            t={t}
            prospect={prospectToRender}
            shortlisted={shortlist.includes(prospectToRender.id)}
            onClose={onClose}
            onShortlist={() => onShortlist(prospectToRender)}
          />
        </div>
      ) : null}
    </div>
  );
}

function ShortlistDialog({
  t,
  prospect,
  onCancel,
  onConfirm,
}: {
  t: ProspectionCopy;
  prospect: Prospect;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [isClosing, setIsClosing] = useState(false);

  function handleClose() {
    setIsClosing(true);
    setTimeout(onCancel, 200);
  }

  function handleConfirm() {
    setIsClosing(true);
    setTimeout(onConfirm, 200);
  }

  return createPortal(
    <div
      className={`prospection-overlay ${isClosing ? 'closing' : ''}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="prospection-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortlist-title"
      >
        <h2 id="shortlist-title">{t.shortlistTitle}</h2>
        <p>{withCompany(t.shortlistMessage, prospect.company)}</p>
        <button className="orange-button" type="button" onClick={handleConfirm}>
          {t.shortlistConfirm}
        </button>
        <button className="outline-button" type="button" onClick={handleClose}>
          {t.cancel}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function ProspectDrawer({
  t,
  prospect,
  shortlisted,
  onClose,
  onShortlist,
}: {
  t: ProspectionCopy;
  prospect: Prospect;
  shortlisted: boolean;
  onClose: () => void;
  onShortlist: () => void;
}) {
  return (
    <aside
      className="prospection-drawer"
      aria-labelledby="prospect-drawer-title"
    >
      <button
        className="prospection-drawer-close"
        type="button"
        onClick={onClose}
        aria-label={t.close}
      >
        ×
      </button>

      <div className="prospection-drawer-header">
        <h2 id="prospect-drawer-title">
          <SparkleIcon style={{ color: 'var(--orange)' }} />
          {interpolate(t.drawerTitle, { company: prospect.company })}
        </h2>
        <p className="prospection-drawer-subtitle">
          {interpolate(t.drawerSector, {
            sector: displayValue(t, prospect.sector),
          })}
        </p>
      </div>

      <div className="prospection-score-card-inline">
        <div className="prospection-gauge-wrap">
          <svg viewBox="0 0 36 36" className="prospection-gauge">
            <path
              className="gauge-bg"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="gauge-fill"
              strokeDasharray={`${prospect.score}, 100`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="gauge-text">
            <strong>{prospect.score}</strong>
            <small>/100</small>
          </div>
        </div>
        <div className="prospection-score-stats">
          <div className="score-stat-row">
            <span>{t.commercialPotential}</span>
            <span
              className={`prospection-potential-pill ${POTENTIAL_PILL_CLASS[potentialLevel(prospect.score)]}`}
            >
              {t.potential[potentialLevel(prospect.score)]}
            </span>
          </div>
        </div>
      </div>

      <div className="prospection-drawer-section">
        <h3>{t.summaryTitle}</h3>
        <p className="prospection-summary-text">
          {recommendationText(t, prospect.recommendation)}
        </p>
      </div>

      <button
        className="orange-button add-shortlist-btn"
        type="button"
        onClick={onShortlist}
        disabled={shortlisted}
      >
        {shortlisted ? t.alreadyShortlisted : t.addToShortlist}
      </button>
      <CompanyAiAssistant key={prospect.id} companyId={prospect.id} />
    </aside>
  );
}
