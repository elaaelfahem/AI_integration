'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authApi } from '@/lib/api';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';
import { relativeTime } from '@/lib/relative-time';
import {
  NOTIFICATIONS_CHANGED_EVENT,
  type AppNotification,
} from '@/types/notifications';

/** How often the badge refreshes while the tab is visible. */
const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const { messages, locale } = useI18n();
  const t = messages.notifications;
  const [isOpen, setIsOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const refreshCount = useCallback(() => {
    authApi
      .getUnreadNotificationCount()
      .then(({ count }) => setUnread(count))
      .catch(() => undefined);
  }, []);

  const loadPage = useCallback((cursor?: string) => {
    setIsLoading(true);
    setHasError(false);
    authApi
      .listNotifications({ cursor })
      .then((page) => {
        setItems((current) =>
          cursor ? [...current, ...page.items] : page.items,
        );
        setNextCursor(page.nextCursor);
        setUnread(page.unreadCount);
      })
      .catch(() => setHasError(true))
      .finally(() => setIsLoading(false));
  }, []);

  // Badge: on mount, every minute while visible, and when the tab regains focus.
  useEffect(() => {
    refreshCount();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshCount();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshCount();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refreshCount);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refreshCount);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!isOpen) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  function toggle() {
    const next = !isOpen;
    setIsOpen(next);
    if (next) loadPage();
  }

  function open(notification: AppNotification) {
    if (!notification.readAt) {
      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, readAt } : item,
        ),
      );
      setUnread((count) => Math.max(0, count - 1));
      authApi
        .markNotificationRead(notification.id)
        .then(({ unreadCount }) => setUnread(unreadCount))
        .catch(() => undefined);
    }
    if (notification.link) {
      setIsOpen(false);
      router.push(notification.link);
    }
  }

  function markAllRead() {
    const readAt = new Date().toISOString();
    setItems((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt })),
    );
    setUnread(0);
    authApi.markAllNotificationsRead().catch(() => refreshCount());
  }

  const label =
    unread > 0
      ? interpolate(t.bellLabelUnread, { count: unread })
      : t.bellLabel;

  return (
    <div className="b2b-notifications" ref={rootRef}>
      <button
        className="b2b-notifications-button"
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        onClick={toggle}
      >
        <Image
          className="b2b-notification-icon"
          src="/notif.svg"
          alt=""
          width={22}
          height={27}
          aria-hidden="true"
        />
        {unread > 0 ? (
          <span className="b2b-notifications-badge" aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          className="b2b-notifications-panel"
          role="dialog"
          aria-label={t.title}
        >
          <div className="b2b-notifications-header">
            <h2>{t.title}</h2>
            {unread > 0 ? (
              <button type="button" onClick={markAllRead}>
                {t.markAllRead}
              </button>
            ) : null}
          </div>

          {hasError && items.length === 0 ? (
            <div className="b2b-notifications-state">
              <p>{t.loadError}</p>
              <button type="button" onClick={() => loadPage()}>
                {t.retry}
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="b2b-notifications-state">
              {isLoading ? t.loading : t.empty}
            </p>
          ) : (
            <ul className="b2b-notifications-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`b2b-notifications-item${item.readAt ? '' : ' b2b-notifications-item-unread'}`}
                    onClick={() => open(item)}
                  >
                    <span className="b2b-notifications-item-title">
                      {item.readAt ? null : (
                        <span
                          className="b2b-notifications-dot"
                          aria-label={t.unreadDot}
                        />
                      )}
                      {item.title}
                    </span>
                    <span className="b2b-notifications-item-body">
                      {item.body}
                    </span>
                    <time
                      className="b2b-notifications-item-time"
                      dateTime={item.createdAt}
                    >
                      {relativeTime(item.createdAt, locale, t.justNow)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {nextCursor && items.length > 0 ? (
            <button
              type="button"
              className="b2b-notifications-more"
              disabled={isLoading}
              onClick={() => loadPage(nextCursor)}
            >
              {isLoading ? t.loading : t.loadMore}
            </button>
          ) : null}
          <Link
            className="b2b-notifications-all"
            href="/settings/notifications"
            onClick={() => setIsOpen(false)}
          >
            {t.viewAll}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
