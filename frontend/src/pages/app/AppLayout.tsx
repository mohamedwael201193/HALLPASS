// Dashboard shell v2 — relay "TAPE" style app shell.
//
// Layout (relay reference):
//   Left sidebar:  logo at top, session status card, icon+label nav
//                  (Accounts, Marketplace, Policies, Activity) with the ACTIVE
//                  item highlighted in amber, bottom: network indicator
//                  ("Arc · 5042") + CONNECT button.
//   Top bar:       current page title, status pill, connect button.
//
// Wallet state always comes from src/lib via useHallpass() inside
// HallpassGate boundaries — never a fake connected state, never a crash when
// the provider stack is down (no Reown project id → honest panel).

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAppKit } from '@reown/appkit/react';
import type { UseHallpass } from '../../lib/useHallpass';
import { WALLET_SETUP_ERROR } from '../../lib/wagmi';
import {
  ARC_CHAIN_ID,
  HallpassGate,
  truncateAddress,
} from './shared';
import { useDashboardStats } from './useDashboardStats';

/* ------------------------------------------------------------------ */
/* Nav                                                                 */
/* ------------------------------------------------------------------ */

const NAV = [
  {
    to: '/app/accounts',
    label: 'Accounts',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="6" width="18" height="13" rx="3" />
        <path d="M3 10h18" />
        <circle cx="16.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    to: '/app/marketplace',
    label: 'Marketplace',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 7l1.5-4h13L20 7" />
        <path d="M4 7h16v3a3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-4 0 3 3 0 0 1-3 3 3 3 0 0 1-3-3V7z" />
        <path d="M6 13v7h12v-7" />
      </svg>
    ),
  },
  {
    to: '/app/policy',
    label: 'Policies',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 7h14M5 12h14M5 17h14" />
        <circle cx="10" cy="7" r="2.2" fill="#121110" />
        <circle cx="16" cy="12" r="2.2" fill="#121110" />
        <circle cx="8" cy="17" r="2.2" fill="#121110" />
      </svg>
    ),
  },
  {
    to: '/app/activity',
    label: 'Activity',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
];

const PAGE_TITLES: Record<string, string> = {
  '/app': 'Connect',
  '/app/accounts': 'Accounts',
  '/app/session-keys': 'Session keys',
  '/app/marketplace': 'Marketplace',
  '/app/policy': 'Policies',
  '/app/policy-audit': 'Policy audit',
  '/app/activity': 'Activity',
};

/* ------------------------------------------------------------------ */
/* Status card — live session/plugin state, honest when unavailable     */
/* ------------------------------------------------------------------ */

function StatusCard() {
  return (
    <HallpassGate
      render={(hp) => <StatusCardLive hp={hp} />}
      fallback={
        <div className="rounded-2xl border border-amber/25 bg-amber/[0.05] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber">
            Session status
          </p>
          <p className="mt-2 text-sm leading-relaxed text-text/60">
            Wallet setup incomplete — sessions can't be read yet.
          </p>
        </div>
      }
    />
  );
}

function StatusCardLive({ hp }: { hp: UseHallpass }) {
  const stats = useDashboardStats();

  if (!hp.isConnected) {
    return (
      <div className="rounded-2xl border border-text/10 bg-text/[0.03] p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-text/45">
          Session status
        </p>
        <p className="mt-2 text-sm leading-relaxed text-text/60">
          No wallet connected. Your passes appear here once you connect.
        </p>
      </div>
    );
  }

  const body =
    stats.state === 'locked' || stats.state === 'loading' ? (
      <p className="mt-2 font-display text-3xl font-extrabold text-text/40">—</p>
    ) : stats.state === 'error' ? (
      <p className="mt-2 text-sm text-text/60">
        Couldn't read sessions from the chain.
      </p>
    ) : (
      <>
        <p className="mt-2 font-display text-3xl font-extrabold text-text">
          {stats.activeSessions === null ? '—' : stats.activeSessions}
        </p>
        <p className="mt-1 text-xs text-text/50">
          {stats.accountsTotal === 0
            ? 'no accounts tracked'
            : `${stats.accountsRead} of ${stats.accountsTotal} accounts read`}
        </p>
      </>
    );

  return (
    <div className="rounded-2xl border border-amber/25 bg-amber/[0.05] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber">
        Active passes
      </p>
      {body}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Network indicator + connect cluster                                 */
/* ------------------------------------------------------------------ */

function NetworkIndicator() {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold text-text/55">
      <span className="h-2 w-2 rounded-full bg-amber" aria-hidden />
      Arc · {ARC_CHAIN_ID}
    </span>
  );
}

function StatusPill({ hp }: { hp: UseHallpass }) {
  if (!hp.isConnected) {
    return (
      <span
        title="Target network: Arc (chain 5042). Connect a wallet to verify."
        className="hidden items-center gap-2 rounded-full border border-text/15 px-3 py-1.5 text-xs font-semibold text-text/50 sm:inline-flex"
      >
        <span className="h-2 w-2 rounded-full bg-text/30" aria-hidden />
        Arc · {ARC_CHAIN_ID}
      </span>
    );
  }
  if (!hp.isArc) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#B0523C]/50 bg-[#B0523C]/10 px-3 py-1.5 text-xs font-bold text-[#E08A73]">
          <span className="h-2 w-2 rounded-full bg-[#E08A73]" aria-hidden />
          Wrong network
        </span>
        <button
          type="button"
          onClick={hp.switchToArc}
          className="min-h-[44px] rounded-full border border-amber/50 px-4 text-xs font-bold text-amber"
        >
          Switch to Arc
        </button>
      </span>
    );
  }
  return (
    <span className="hidden items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1.5 text-xs font-bold text-amber sm:inline-flex">
      <span className="h-2 w-2 rounded-full bg-amber" aria-hidden />
      Arc · {ARC_CHAIN_ID}
    </span>
  );
}

function ConnectButton({ hp, fullWidth = false }: { hp: UseHallpass; fullWidth?: boolean }) {
  const { open } = useAppKit();
  const cls = fullWidth ? 'w-full justify-center' : '';

  if (!hp.isConnected) {
    return (
      <button
        type="button"
        onClick={hp.connect}
        title={
          hp.walletSetupError ??
          'Connect a wallet to manage your hall passes.'
        }
        className={`inline-flex min-h-[48px] items-center rounded-full bg-amber px-6 font-display text-sm font-extrabold text-ink transition-transform duration-200 hover:scale-[1.03] active:scale-[0.99] ${cls}`}
      >
        Connect
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => open({ view: 'Account' })}
      title="Open wallet details"
      className={`inline-flex min-h-[48px] items-center gap-2 rounded-full border border-text/20 px-4 font-mono text-sm text-text transition-colors hover:border-amber/60 hover:text-amber ${cls}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${hp.isArc ? 'bg-amber' : 'bg-[#E08A73]'}`}
        aria-hidden
      />
      {truncateAddress(hp.address ?? '')}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `relative flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors ${
              isActive
                ? 'bg-amber/10 text-amber'
                : 'text-text/65 hover:bg-text/[0.06] hover:text-text'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-amber"
                  aria-hidden
                />
              )}
              <span className={isActive ? 'text-amber' : ''}>{item.icon}</span>
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Compact wallet-down state for the sidebar footer (the full
 * WalletDownState panel is too large for the sidebar). */
function SidebarWalletFallback() {
  return (
    <div className="flex flex-col gap-3">
      <NetworkIndicator />
      <button
        type="button"
        disabled
        title={
          WALLET_SETUP_ERROR ??
          'Wallet connection is still being wired up.'
        }
        className="inline-flex min-h-[48px] w-full cursor-not-allowed items-center justify-center rounded-full bg-text/10 px-6 font-display text-sm font-extrabold text-text/40"
      >
        Connect
      </button>
      <p className="text-xs leading-relaxed text-text/45">
        {WALLET_SETUP_ERROR
          ? 'Connect is unavailable until the deploy sets the Reown project ID.'
          : 'Wallet connection is still being wired up.'}{' '}
        Nothing here is simulated.
      </p>
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <Link
        to="/"
        onClick={onNavigate}
        className="font-display text-xl font-extrabold tracking-tight text-text"
        aria-label="HALLPASS home"
      >
        HALL<span className="text-amber">PASS</span>
      </Link>

      <div className="mt-6">
        <StatusCard />
      </div>

      <div className="mt-6">
        <SidebarNav onNavigate={onNavigate} />
      </div>

      <div className="mt-auto border-t border-text/10 pt-4">
        <HallpassGate
          render={(hp) => (
            <div className="flex flex-col gap-3">
              <NetworkIndicator />
              <ConnectButton hp={hp} fullWidth />
              {!hp.isConnected && hp.walletSetupError ? (
                <p className="text-xs leading-relaxed text-text/45">
                  Connect is unavailable until the deploy sets the Reown
                  project ID — nothing here is simulated.
                </p>
              ) : null}
            </div>
          )}
          fallback={<SidebarWalletFallback />}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export default function AppLayout() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sheetOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSheetOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const title = PAGE_TITLES[location.pathname] ?? 'Dashboard';

  return (
    <div className="min-h-screen bg-ink font-body text-text">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-text/10 bg-ink/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-6">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Open navigation"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-text/70 hover:bg-text/10 md:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <h1 className="font-display text-lg font-extrabold tracking-tight text-text md:text-xl">
            {title}
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <HallpassGate
              render={(hp) => (
                <>
                  <StatusPill hp={hp} />
                  <ConnectButton hp={hp} />
                </>
              )}
              fallback={
                <span className="hidden items-center gap-2 rounded-full border border-text/15 px-3 py-1.5 text-xs font-semibold text-text/50 sm:inline-flex">
                  <span className="h-2 w-2 rounded-full bg-text/30" aria-hidden />
                  Arc · {ARC_CHAIN_ID}
                </span>
              }
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* Desktop sidebar — relay style */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col border-r border-text/10 px-4 py-6 md:flex">
          <SidebarBody />
        </aside>

        {/* Page */}
        <main className="min-w-0 flex-1 px-4 py-8 md:px-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile sheet */}
      {sheetOpen ? (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-ink/70"
          />
          <div className="absolute inset-y-0 left-0 flex w-80 max-w-[88vw] flex-col bg-[#171512] px-5 py-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close navigation"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-text/70 hover:bg-text/10"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="flex-1">
              <SidebarBody onNavigate={() => setSheetOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
