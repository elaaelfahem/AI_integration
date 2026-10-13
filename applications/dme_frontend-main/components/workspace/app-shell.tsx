'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { DevelopmentSessionTimer } from '@/components/workspace/development-session-timer';
import { NotificationBell } from '@/components/workspace/notification-bell';
import { useI18n } from '@/lib/i18n/i18n-context';

export function AppShell({ children }: { children: ReactNode }) {
  const { account, sessionTiming, logout, status, setAccountLanguage } =
    useAuth();
  const { messages, locale, setLocale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node))
        setIsMenuOpen(false);
    }
    window.addEventListener('mousedown', closeMenu);
    return () => window.removeEventListener('mousedown', closeMenu);
  }, []);

  // Keep the page still while the mobile drawer is open.
  useEffect(() => {
    if (!isNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isNavOpen]);

  useEffect(() => {
    if (status === 'anonymous' || (status !== 'loading' && !account)) {
      router.replace('/login');
    }
  }, [status, account, router]);

  if (status === 'loading' || status === 'anonymous' || !account) {
    return (
      <main
        className="loading-screen"
        aria-busy="true"
        aria-label={messages.appShell.verifyingAria}
      >
        <Image
          className="brand-logo"
          src="/logo-orange-b2b.png"
          alt="Orange B2B"
          width={3276}
          height={800}
          priority
        />
        <div className="loading-line" />
        <p
          style={{
            marginTop: '1.2rem',
            color: '#555',
            fontSize: '0.95rem',
            fontWeight: 600,
          }}
        >
          {messages.appShell.sessionLoading}
        </p>
      </main>
    );
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      router.replace('/login');
    }
  }

  const isDashboardActive = pathname === '/dashboard' || pathname === '/';
  const isUsersActive = pathname.startsWith('/users');
  const isProfileActive = pathname === '/profile';
  const isCompaniesActive = pathname.startsWith('/companies');
  const isAssignmentsActive = pathname.startsWith('/assignments');
  const isMeetingsActive = pathname.startsWith('/meetings');
  const isTicketsActive = pathname.startsWith('/tickets');
  const isVisitReportsActive = pathname.startsWith('/visit-reports');
  const isSettingsActive = pathname.startsWith('/settings');
  const isAgentsActive = pathname.startsWith('/agents');
  const isProspectionActive = pathname.startsWith('/prospection');
  const isDataSourcesActive = pathname.startsWith('/data-sources');

  return (
    <main className="b2b-shell">
      {isNavOpen ? (
        <div
          className="b2b-sidebar-backdrop"
          role="presentation"
          onClick={() => setIsNavOpen(false)}
        />
      ) : null}
      <aside
        className={`b2b-sidebar${isNavOpen ? ' b2b-sidebar-open' : ''}`}
        aria-label={messages.appShell.navPrimaryLabel}
      >
        <Link
          className="b2b-brand"
          href="/dashboard"
          onClick={() => setIsNavOpen(false)}
        >
          <Image
            className="b2b-brand-logo"
            src="/logo-orange-b2b.png"
            alt="Orange B2B"
            width={3276}
            height={800}
            priority
          />
        </Link>
        <nav
          className="b2b-nav"
          aria-label={messages.appShell.workspaceNavLabel}
        >
          <div className="b2b-nav-group">
            <span className="b2b-nav-group-label">
              {messages.appShell.navGroupOverview}
            </span>
            <ul>
              <li>
                <Link
                  className={`b2b-nav-item${isDashboardActive ? ' b2b-nav-item-active' : ''}`}
                  href="/dashboard"
                  aria-current={isDashboardActive ? 'page' : undefined}
                  onClick={() => setIsNavOpen(false)}
                >
                  <NavIcon src="/table.svg" />
                  {messages.appShell.navDashboard}
                </Link>
              </li>
            </ul>
          </div>

          <div className="b2b-nav-group">
            <span className="b2b-nav-group-label">
              {messages.appShell.navGroupManagement}
            </span>
            <ul>
              {account.role === 'SUPERADMIN' ? (
                <li>
                  <Link
                    className={`b2b-nav-item${isUsersActive ? ' b2b-nav-item-active' : ''}`}
                    href="/users"
                    aria-current={isUsersActive ? 'page' : undefined}
                    onClick={() => setIsNavOpen(false)}
                  >
                    <NavIcon src="/users.svg" />
                    {messages.appShell.navUsers}
                  </Link>
                </li>
              ) : null}
              {account.role === 'MANAGER' ? (
                <li>
                  <Link
                    className={`b2b-nav-item${isAgentsActive ? ' b2b-nav-item-active' : ''}`}
                    href="/agents"
                    aria-current={isAgentsActive ? 'page' : undefined}
                    onClick={() => setIsNavOpen(false)}
                  >
                    <NavIcon src="/users.svg" />
                    {messages.appShell.navAgents}
                  </Link>
                </li>
              ) : null}
              <li>
                <Link
                  className={`b2b-nav-item${isCompaniesActive ? ' b2b-nav-item-active' : ''}`}
                  href="/companies"
                  onClick={() => setIsNavOpen(false)}
                >
                  <NavIcon src="/enterprise.svg" />
                  {messages.appShell.navCompanies}
                </Link>
              </li>
              {account.role === 'SUPERADMIN' ? (
                <li>
                  <Link
                    className={`b2b-nav-item${isDataSourcesActive ? ' b2b-nav-item-active' : ''}`}
                    href="/data-sources"
                    aria-current={isDataSourcesActive ? 'page' : undefined}
                    onClick={() => setIsNavOpen(false)}
                  >
                    <NavIcon src="/data-sources.svg" />
                    {messages.appShell.navDataSources}
                  </Link>
                </li>
              ) : null}
              <li>
                <Link
                  className={`b2b-nav-item${isProspectionActive ? ' b2b-nav-item-active' : ''}`}
                  href="/prospection"
                  aria-current={isProspectionActive ? 'page' : undefined}
                  onClick={() => setIsNavOpen(false)}
                >
                  <NavIcon src="/chatbot.svg" />
                  {messages.appShell.navProspection}
                </Link>
              </li>
              {account.role === 'SUPERADMIN' || account.role === 'MANAGER' ? (
                <li>
                  <Link
                    className={`b2b-nav-item${isAssignmentsActive ? ' b2b-nav-item-active' : ''}`}
                    href="/assignments"
                    onClick={() => setIsNavOpen(false)}
                  >
                    <NavIcon src="/assign.svg" />
                    {messages.appShell.navAssignments}
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>

          <div className="b2b-nav-group">
            <span className="b2b-nav-group-label">
              {messages.appShell.navGroupActivity}
            </span>
            <ul>
              <li>
                <Link
                  className={`b2b-nav-item${isMeetingsActive ? ' b2b-nav-item-active' : ''}`}
                  href="/meetings"
                  aria-current={isMeetingsActive ? 'page' : undefined}
                  onClick={() => setIsNavOpen(false)}
                >
                  <NavIcon src="/calendar.svg" />
                  {messages.appShell.navCalendar}
                </Link>
              </li>
              <li>
                <Link
                  className={`b2b-nav-item${isVisitReportsActive ? ' b2b-nav-item-active' : ''}`}
                  href="/visit-reports"
                  aria-current={isVisitReportsActive ? 'page' : undefined}
                  onClick={() => setIsNavOpen(false)}
                >
                  <NavIcon src="/file.svg" />
                  {messages.appShell.navVisitReports}
                </Link>
              </li>
              <li>
                <Link
                  className={`b2b-nav-item${isTicketsActive ? ' b2b-nav-item-active' : ''}`}
                  href="/tickets"
                  aria-current={isTicketsActive ? 'page' : undefined}
                  onClick={() => setIsNavOpen(false)}
                >
                  <NavIcon src="/reports.svg" />
                  {messages.appShell.navTickets}
                </Link>
              </li>
            </ul>
          </div>
        </nav>
        <div
          className="b2b-sidebar-footer"
          aria-label={messages.appShell.accountActionsLabel}
        >
          <Link
            className={`b2b-nav-item${isSettingsActive ? ' b2b-nav-item-active' : ''}`}
            href="/settings"
            aria-current={isSettingsActive ? 'page' : undefined}
            onClick={() => setIsNavOpen(false)}
          >
            <NavIcon src="/gear.svg" />
            {messages.appShell.navSettings}
          </Link>
          <button
            className="b2b-logout-link"
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
          >
            <NavIcon src="/out.svg" preserveColor />
            {isLoggingOut
              ? messages.appShell.loggingOut
              : messages.appShell.logout}
          </button>
        </div>
      </aside>
      <div className="b2b-main">
        <header className="b2b-topbar">
          <button
            className="b2b-hamburger"
            type="button"
            aria-label={messages.appShell.workspaceNavLabel}
            aria-expanded={isNavOpen}
            onClick={() => setIsNavOpen((current) => !current)}
          >
            <span className="b2b-hamburger-icon" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
          {process.env.NODE_ENV === 'development' ? (
            <DevelopmentSessionTimer timing={sessionTiming} />
          ) : null}
          <div className="b2b-topbar-actions">
            <button
              className="b2b-lang-toggle"
              type="button"
              onClick={() => {
                const next = locale === 'fr' ? 'en' : 'fr';
                setLocale(next);
                void setAccountLanguage(next);
              }}
              aria-label={messages.languageSwitcher.label}
              title={messages.languageSwitcher.label}
            >
              <Image
                className="b2b-lang-toggle-icon"
                src="/globe.svg"
                alt=""
                width={16}
                height={16}
                aria-hidden="true"
              />
              <span>{locale.toUpperCase()}</span>
            </button>
            <NotificationBell />
            <div className="b2b-account-menu" ref={menuRef}>
              <button
                className="b2b-account-button"
                type="button"
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                aria-label={messages.appShell.accountMenuLabel}
                onClick={() => setIsMenuOpen((current) => !current)}
              >
                <Image
                  className={`b2b-account-user-icon${isProfileActive ? ' b2b-account-user-icon-active' : ''}`}
                  src="/user.svg"
                  alt={messages.appShell.accountAlt}
                  width={24}
                  height={24}
                />
                <Image
                  className="b2b-account-chevron"
                  src="/down_arrow_outline.svg"
                  alt=""
                  width={9}
                  height={5}
                  aria-hidden="true"
                />
              </button>
              {isMenuOpen ? (
                <div className="b2b-account-dropdown" role="menu">
                  <p>{account.email}</p>
                  <Link
                    href="/profile"
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {messages.appShell.viewProfile}
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleLogout()}
                    disabled={isLoggingOut}
                  >
                    {isLoggingOut
                      ? messages.appShell.loggingOut
                      : messages.appShell.signOutMenuItem}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <div className="b2b-content">{children}</div>
      </div>
    </main>
  );
}

function NavIcon({
  src,
  preserveColor = false,
}: {
  src: string;
  preserveColor?: boolean;
}) {
  return (
    <span
      className={`b2b-nav-icon${preserveColor ? ' b2b-nav-icon-preserve' : ''}`}
    >
      <Image src={src} alt="" width={24} height={24} aria-hidden="true" />
    </span>
  );
}
