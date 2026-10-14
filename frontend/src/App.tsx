import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'

/* ------------------------------------------------------------------ */
/* ROUTE SHELLS (F1). Page workers own the real screens — these are    */
/* mounts only. UX laws apply to every shell owner: no dead ends,      */
/* every screen names its next action, nothing demo/mock/fake.         */
/* ------------------------------------------------------------------ */

/** Landing page mount — owned by the landing worker (§5 of the prompt). */
function LandingShell() {
  return (
    <div className="min-h-screen bg-ink font-body text-text">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-4xl font-bold tracking-tight md:text-6xl">
          Give your agent a <span className="text-amber">hall pass</span> — not your keys.
        </p>
        <p className="mt-6 max-w-xl text-lg text-text/70">
          Landing page scaffold. The landing worker owns this route — 12 sections,
          custom imagery, live proof. This is a placeholder until then.
        </p>
        <Link
          to="/app"
          className="mt-10 rounded-full bg-amber px-8 py-4 font-display text-lg font-bold text-ink transition-transform hover:scale-105"
        >
          Launch app
        </Link>
      </div>
    </div>
  )
}

/**
 * Dashboard layout shell — owned by the dashboard worker (§6 of the prompt).
 * Max 5 screens live under /app/*: connect, accounts, marketplace, policy,
 * activity. Each screen must mount here and keep the next action visible.
 */
function DashboardLayout() {
  return (
    <div className="min-h-screen bg-ink font-body text-text">
      <header className="border-b border-text/10 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link to="/" className="font-display text-xl font-bold">
            HALL<span className="text-amber">PASS</span>
          </Link>
          <nav className="flex gap-5 text-sm text-text/70">
            <Link to="/app" className="hover:text-amber">
              Connect
            </Link>
            <Link to="/app/accounts" className="hover:text-amber">
              Accounts
            </Link>
            <Link to="/app/marketplace" className="hover:text-amber">
              Marketplace
            </Link>
            <Link to="/app/policy" className="hover:text-amber">
              Policy
            </Link>
            <Link to="/app/activity" className="hover:text-amber">
              Activity
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}

/** Generic placeholder for a dashboard screen not yet built by its owner. */
function ScreenPlaceholder({ name, next }: { name: string; next: string }) {
  return (
    <div className="rounded-2xl border border-text/10 bg-cream p-10 text-ink">
      <h1 className="font-display text-3xl font-bold">{name}</h1>
      <p className="mt-3 text-ink/70">
        Screen placeholder. The owning worker builds this as a real on-chain flow —
        no mock data, no demo mode, every executable button runs a real transaction.
      </p>
      <p className="mt-4 text-sm font-medium">Next action: {next}</p>
    </div>
  )
}

/** 404 — never a dead end: route the user somewhere useful. */
function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ink px-6 text-center text-text">
      <p className="font-display text-6xl font-bold text-amber">404</p>
      <p className="text-text/70">That page doesn't exist. Head back where things are real.</p>
      <Link
        to="/"
        className="rounded-full bg-amber px-8 py-3 font-display font-bold text-ink transition-transform hover:scale-105"
      >
        Back home
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingShell />} />
      <Route path="/app" element={<DashboardLayout />}>
        {/* (a) Connect — one enormous, obvious connect button */}
        <Route index element={<ScreenPlaceholder name="Connect" next="connect your wallet to begin" />} />
        {/* (b) My accounts — smart accounts + installed plugins with status */}
        <Route path="accounts" element={<ScreenPlaceholder name="My accounts" next="pick an account to manage its hall passes" />} />
        {/* (c) Plugin marketplace — install/uninstall via real on-chain userOps */}
        <Route
          path="marketplace"
          element={<ScreenPlaceholder name="Plugin marketplace" next="install your first hall pass" />}
        />
        {/* (d) Policy editor — sliders + live "what this allows" preview */}
        <Route path="policy" element={<ScreenPlaceholder name="Policy editor" next="set caps, window, expiry, destinations" />} />
        {/* (e) Activity — every spend attempt: allowed (amber) or blocked (why + fix) */}
        <Route
          path="activity"
          element={<ScreenPlaceholder name="Activity" next="review what your agent did — and what got stopped" />}
        />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
