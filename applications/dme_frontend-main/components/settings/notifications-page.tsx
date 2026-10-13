'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilterDropdown } from '@/components/shared/filter-dropdown';
import { authApi } from '@/lib/api';
import { INTL_LOCALES } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';
import { relativeTime } from '@/lib/relative-time';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATIONS_CHANGED_EVENT,
  type AppNotification,
  type NotificationCategory,
  type NotificationFilters,
} from '@/types/notifications';

const PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 300;

type StatusFilter = NonNullable<NotificationFilters['status']>;
type PendingDelete = { kind: 'selected' } | { kind: 'read' } | null;

/** Which filter category a notification type belongs to (mirrors the backend). */
const TYPE_CATEGORY: Record<string, NotificationCategory> = {
  PASSWORD_CHANGED: 'security',
  PASSWORD_RESET_REQUIRED: 'security',
  ACCOUNT_BLOCKED: 'security',
  ACCOUNT_UNBLOCKED: 'security',
  TWO_FACTOR_ENABLED: 'security',
  TWO_FACTOR_DISABLED: 'security',
  NEW_DEVICE_LOGIN: 'security',
  INVITATION_ACCEPTED: 'team',
  COLLECTION_JOB_FAILED: 'data',
  VISIT_REPORT_SUBMITTED: 'reports',
  VISIT_REPORT_VALIDATED: 'reports',
  REPORT_ANALYZED: 'reports',
  WEEKLY_DIGEST: 'reports',
  VISIT_REPORT_NOTE_ADDED: 'reports',
  REPORT_DUE: 'reports',
};

function categoryOf(type: string): NotificationCategory {
  if (TYPE_CATEGORY[type]) return TYPE_CATEGORY[type];
  if (type.startsWith('TICKET_')) return 'tickets';
  return 'visits';
}

function notifyBell() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export function NotificationsPage() {
  const router = useRouter();
  const { messages, locale } = useI18n();
  const t = messages.notificationsPage;

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<NotificationCategory | 'all'>('all');
  const [items, setItems] = useState<AppNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Debounce the search box.
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(search), SEARCH_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [search]);

  const filters = useMemo<NotificationFilters>(
    () => ({
      limit: PAGE_SIZE,
      q: query,
      status,
      category: category === 'all' ? undefined : category,
    }),
    [query, status, category],
  );

  const filtersKey = JSON.stringify(filters);

  /** Fetches a page; state is only touched once the request settles. */
  const fetchPage = useCallback(
    (cursor?: string) =>
      authApi
        .listNotifications({ ...filters, cursor })
        .then((page) => {
          setItems((current) =>
            cursor ? [...current, ...page.items] : page.items,
          );
          setNextCursor(page.nextCursor);
          setTotal(page.total);
          setUnreadCount(page.unreadCount);
          setHasError(false);
          if (!cursor) setSelected(new Set());
        })
        .catch(() => setHasError(true))
        .finally(() => setLoadedKey(filtersKey)),
    [filters, filtersKey],
  );

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const isLoading = loadedKey !== filtersKey || isLoadingMore;

  function load(cursor?: string) {
    if (cursor) setIsLoadingMore(true);
    return fetchPage(cursor).finally(() => setIsLoadingMore(false));
  }

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(INTL_LOCALES[locale], {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const allSelected =
    items.length > 0 && items.every((item) => selected.has(item.id));
  const hasFilters =
    query.trim() !== '' || status !== 'all' || category !== 'all';

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  }

  async function run(action: () => Promise<unknown>, success?: string) {
    setIsWorking(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (success) setNotice(success);
      notifyBell();
      await load();
    } catch {
      setError(t.actionFailed);
    } finally {
      setIsWorking(false);
    }
  }

  function deletedNotice(count: number) {
    return count === 1
      ? t.noticeDeletedOne
      : interpolate(t.noticeDeleted, { count });
  }

  function markOneRead(item: AppNotification) {
    const readAt = new Date().toISOString();
    setItems((current) =>
      current.map((row) => (row.id === item.id ? { ...row, readAt } : row)),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    void run(() => authApi.markNotificationRead(item.id));
  }

  function deleteOne(item: AppNotification) {
    void run(async () => {
      await authApi.deleteNotification(item.id);
    }, deletedNotice(1));
  }

  function openItem(item: AppNotification) {
    if (!item.link) return;
    if (!item.readAt) {
      void authApi.markNotificationRead(item.id).then(notifyBell);
    }
    router.push(item.link);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const ids = [...selected];
    await run(async () => {
      const result =
        pendingDelete.kind === 'selected'
          ? await authApi.deleteNotifications(ids)
          : await authApi.deleteReadNotifications();
      setNotice(deletedNotice(result.deleted));
    });
    setPendingDelete(null);
  }

  const countLabel =
    total === 1
      ? t.resultsCountOne
      : interpolate(t.resultsCount, { count: total });

  return (
    <section className="users-page notifications-page" id="notifications">
      <div className="users-page-header">
        <div>
          <Link className="notifications-back" href="/settings">
            {t.backToSettings}
          </Link>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="notifications-header-actions">
          <button
            type="button"
            className="b2b-button b2b-button-secondary"
            disabled={isWorking || unreadCount === 0}
            onClick={() => void run(() => authApi.markAllNotificationsRead())}
          >
            {t.markAllRead}
          </button>
          <button
            type="button"
            className="b2b-button b2b-button-secondary"
            disabled={isWorking}
            onClick={() => setPendingDelete({ kind: 'read' })}
          >
            {t.deleteRead}
          </button>
        </div>
      </div>

      <div className="users-toolbar notifications-toolbar">
        <label className="users-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
          />
        </label>
        <FilterDropdown
          ariaLabel={t.statusAll}
          value={status}
          onChange={(value) => setStatus(value as StatusFilter)}
          options={[
            { value: 'all', label: t.statusAll },
            { value: 'unread', label: t.statusUnread },
            { value: 'read', label: t.statusRead },
          ]}
        />
        <FilterDropdown
          ariaLabel={t.categoryAll}
          value={category}
          onChange={(value) =>
            setCategory(value as NotificationCategory | 'all')
          }
          options={[
            { value: 'all', label: t.categoryAll },
            ...NOTIFICATION_CATEGORIES.map((value) => ({
              value,
              label: t.categories[value],
            })),
          ]}
        />
      </div>

      {notice ? (
        <p className="notifications-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="notifications-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="notifications-card">
        <div className="notifications-bulkbar">
          <label className="notifications-check">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={items.length === 0}
              onChange={toggleAll}
            />
            <span>
              {selected.size > 0
                ? interpolate(t.selectedCount, { count: selected.size })
                : t.selectAll}
            </span>
          </label>
          {selected.size > 0 ? (
            <div className="notifications-bulk-actions">
              <button
                type="button"
                disabled={isWorking}
                onClick={() =>
                  void run(() => authApi.markNotificationsRead([...selected]))
                }
              >
                {t.markSelectedRead}
              </button>
              <button
                type="button"
                className="notifications-danger"
                disabled={isWorking}
                onClick={() => setPendingDelete({ kind: 'selected' })}
              >
                {t.deleteSelected}
              </button>
            </div>
          ) : (
            <span className="notifications-count">{countLabel}</span>
          )}
        </div>

        {hasError && items.length === 0 ? (
          <div className="notifications-empty">
            <p>{t.loadError}</p>
            <button type="button" onClick={() => void load()}>
              {t.retry}
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="notifications-empty">
            {isLoading ? t.loading : hasFilters ? t.emptyFiltered : t.empty}
          </p>
        ) : (
          <ul className="notifications-list">
            {items.map((item) => (
              <li
                key={item.id}
                className={`notifications-row${item.readAt ? '' : ' notifications-row-unread'}`}
              >
                <input
                  type="checkbox"
                  aria-label={`${t.selectItem} : ${item.title}`}
                  checked={selected.has(item.id)}
                  onChange={() => toggleOne(item.id)}
                />
                <div className="notifications-row-main">
                  <div className="notifications-row-top">
                    <span className="notifications-tag">
                      {t.categories[categoryOf(item.type)]}
                    </span>
                    <time
                      dateTime={item.createdAt}
                      title={dateFormat.format(new Date(item.createdAt))}
                    >
                      {relativeTime(
                        item.createdAt,
                        locale,
                        messages.notifications.justNow,
                      )}
                    </time>
                  </div>
                  <h2>
                    {item.readAt ? null : (
                      <span
                        className="b2b-notifications-dot"
                        aria-label={messages.notifications.unreadDot}
                      />
                    )}
                    {item.title}
                  </h2>
                  <p>{item.body}</p>
                </div>
                <div className="notifications-row-actions">
                  {item.link ? (
                    <button type="button" onClick={() => openItem(item)}>
                      {t.open}
                    </button>
                  ) : null}
                  {item.readAt ? null : (
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => markOneRead(item)}
                    >
                      {t.markRead}
                    </button>
                  )}
                  <button
                    type="button"
                    className="notifications-danger"
                    disabled={isWorking}
                    onClick={() => deleteOne(item)}
                  >
                    {t.delete}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {nextCursor && items.length > 0 ? (
          <button
            type="button"
            className="notifications-more"
            disabled={isLoading}
            onClick={() => void load(nextCursor)}
          >
            {isLoading ? t.loading : t.loadMore}
          </button>
        ) : null}
      </div>

      {pendingDelete ? (
        <div
          className="b2b-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isWorking) {
              setPendingDelete(null);
            }
          }}
        >
          <section
            className="b2b-modal b2b-modal-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notifications-delete-title"
          >
            <button
              className="b2b-modal-close"
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={isWorking}
              aria-label={t.cancel}
            >
              ×
            </button>
            <h3 id="notifications-delete-title">{t.confirmDeleteTitle}</h3>
            <p className="b2b-modal-message">
              {pendingDelete.kind === 'selected'
                ? interpolate(t.confirmDeleteSelected, {
                    count: selected.size,
                  })
                : t.confirmDeleteRead}
            </p>
            <hr />
            <div className="b2b-modal-actions">
              <button
                className="b2b-button b2b-button-danger"
                type="button"
                disabled={isWorking}
                onClick={() => void confirmDelete()}
              >
                {isWorking ? t.deleting : t.confirmDelete}
              </button>
              <button
                className="b2b-button b2b-button-secondary"
                type="button"
                disabled={isWorking}
                onClick={() => setPendingDelete(null)}
              >
                {t.cancel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
