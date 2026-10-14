// F5 — dashboard shell: sidebar + top bar.
//
// Sidebar: Accounts, Marketplace, Policies, Activity (≤5 items, collapsible
// on desktop, sheet on mobile). Top bar: logo, Arc chain badge, connect
// button — all live from src/lib via useHallpass(). No wallet logic of
// our own; the wallet-stack-down case renders an honest fallback.

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAppKit } from '@reown/appkit/react';
import type { UseHallpass } from '../../lib/useHallpass';
import {
  ARC_CHAIN_ID,
  HallpassGate,
  WalletDownState,
  truncateAddress,
} from './shared';

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

/* ------------------------------------------------------------------ */
/* Top-bar wallet cluster (live)                                       */
/* ------------------------------------------------------------------ */

function ChainBadge({ hp }: { hp: UseHallpass }) {
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

function WalletCluster({ hp }: { hp: UseHallpass }) {
  const { open } = useAppKit();

  if (!hp.isConnected) {
    return (
      <button
        type="button"
        onClick={hp.connect}
        className="inline-flex min-h-[44px] items-center rounded-full bg-amber px-6 font-display text-sm font-extrabold text-ink transition-transform duration-200 hover:scale-[1.03]"
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
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-text/20 px-4 font-mono text-sm text-text transition-colors hover:border-amber/60 hover:text-amber"
    >
      <span
        className={`h-2 w-2 rounded-full ${hp.isArc ? 'bg-amber' : 'bg-[#E08A73]'}`}
        aria-hidden
      />
      {truncateAddress(hp.address ?? '')}
    </button>
  );
}

function TopBarWallet() {
  return (
    <HallpassGate
      render={(hp) => (
        <div className="flex items-center gap-3">
          <ChainBadge hp={hp} />
          <WalletCluster hp={hp} />
        </div>
      )}
      fallback={
        <span
          title="Wallet connection is still loading."
          className="hidden items-center gap-2 rounded-full border border-text/15 px-3 py-1.5 text-xs font-semibold text-text/50 sm:inline-flex"
        >
          <span className="h-2 w-2 rounded-full bg-text/30" aria-hidden />
          Arc · {ARC_CHAIN_ID}
        </span>
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-1 p-3">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            `flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors ${
              isActive
                ? 'bg-amber/10 text-amber'
                : 'text-text/65 hover:bg-text/[0.06] hover:text-text'
            } ${collapsed ? 'justify-center px-0' : ''}`
          }
        >
          {({ isActive }) => (
            <>
              <span className={isActive ? 'text-amber' : ''}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && isActive && (
                <span
                  className="ml-auto h-5 w-1 rounded-full bg-amber"
                  aria-hidden
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export default function AppLayout() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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

  return (
    <div className="min-h-screen bg-ink font-body text-text">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-text/10 bg-ink/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-6">
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
          <Link to="/" className="font-display text-xl font-extrabold tracking-tight">
            HALL<span className="text-amber">PASS</span>
          </Link>
          <div className="ml-auto">
            <TopBarWallet />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl">
        {/* Desktop sidebar */}
        <aside
          className={`sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col border-r border-text/10 md:flex ${
            collapsed ? 'w-[76px]' : 'w-60'
          }`}
        >
          <div className="flex-1 overflow-y-auto">
            <SidebarNav collapsed={collapsed} />
          </div>
          <div className="border-t border-text/10 p-3">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex min-h-[44px] w-full items-center justify-center rounded-xl text-text/50 hover:bg-text/[0.06] hover:text-text"
            >
              <svg
                viewBox="0 0 24 24"
                className={`h-5 w-5 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </div>
        </aside>

        {/* Page */}
        <main className="min-w-0 flex-1 px-4 py-8 md:px-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile sheet */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-ink/70"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[#171512] shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-text/10 px-4">
              <span className="font-display text-lg font-extrabold">
                HALL<span className="text-amber">PASS</span>
              </span>
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
            <div className="flex-1 overflow-y-auto">
              <SidebarNav collapsed={false} onNavigate={() => setSheetOpen(false)} />
            </div>
            <div className="border-t border-text/10 p-4">
              <HallpassGate
                render={(hp) => (
                  <div className="flex items-center gap-3">
                    <ChainBadge hp={hp} />
                    <div className="ml-auto">
                      <WalletCluster hp={hp} />
                    </div>
                  </div>
                )}
                fallback={<WalletDownState />}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
