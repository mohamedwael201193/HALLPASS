import { Link, Outlet } from 'react-router-dom'

/**
 * Dashboard layout shell — max 5 screens under /app/*.
 * Mobile: nav scrolls horizontally, never clips; ≥44px tap targets.
 */
export default function DashboardLayout() {
  return (
    <div className="min-h-[100dvh] bg-ink font-body text-text">
      <header className="border-b border-text/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/"
            className="shrink-0 font-display text-xl font-extrabold tracking-tight"
            aria-label="Hall Pass home"
          >
            HALL<span className="text-amber">PASS</span>
          </Link>
          <nav
            className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 text-sm text-text/70 sm:gap-2"
            aria-label="Dashboard"
          >
            {[
              { to: '/app', label: 'Connect' },
              { to: '/app/accounts', label: 'Accounts' },
              { to: '/app/marketplace', label: 'Marketplace' },
              { to: '/app/policy', label: 'Policy' },
              { to: '/app/activity', label: 'Activity' },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="whitespace-nowrap rounded-full px-3 py-2.5 transition-colors hover:bg-text/5 hover:text-amber"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  )
}
