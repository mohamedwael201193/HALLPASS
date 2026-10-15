import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import RouteFallback from './shells/RouteFallback'
import { RootErrorBoundary } from './shells/RootErrorBoundary'

/* ------------------------------------------------------------------ */
/* ROUTE-LEVEL CODE SPLITTING (F10/F1). Every route is a lazy chunk so */
/* the first paint ships the smallest possible bundle.                 */
/*                                                                     */
/* B1: `/` mounts the finished landing (pages/Landing.tsx).            */
/* B2: dashboard routes mount the real screens (pages/app/*).          */
/* `/app` index (Connect) stays a placeholder until F9 wires the real  */
/* Reown AppKit provider (B4) — that is a separate blocker.            */
/* ------------------------------------------------------------------ */

/** B1 — the finished 12-section landing page. */
const Landing = lazy(() => import('./pages/Landing'))
/** Dashboard layout shell — max 5 screens under /app/*. */
const DashboardLayout = lazy(() => import('./shells/DashboardLayout'))
/** (a) Connect — one obvious connect button lives here (F9 wires the real flow). */
const ConnectScreen = lazy(() =>
  import('./shells/Screens').then((m) => ({ default: m.ConnectScreen })),
)
/** B2 — (b) My accounts: the hall passes on one smart account. */
const AccountsScreen = lazy(() => import('./pages/app/Accounts'))
/** B2 — (b2) Session keys: the hall passes on one smart account. */
const SessionKeysScreen = lazy(() => import('./pages/app/SessionKeys'))
/** B2 — (c) Plugin marketplace: install/uninstall via real on-chain userOps. */
const MarketplaceScreen = lazy(() => import('./pages/app/Marketplace'))
/** B2 — (d) Policies screen: plain-language enforcement panel + editor. */
const PoliciesScreen = lazy(() => import('./pages/app/PoliciesScreen'))
/** Policy audit: committed hash, session rollups, CSV export. Read-only. */
const PolicyAuditPage = lazy(() => import('./pages/app/PolicyPage'))
/** B2 — (e) Activity: every spend attempt — allowed (amber) or blocked (why + fix). */
const ActivityScreen = lazy(() => import('./pages/app/Activity'))
/** 404 — never a dead end: route the user somewhere useful. */
const NotFound = lazy(() => import('./shells/NotFound'))

export default function App() {
  return (
    <RootErrorBoundary>
      <MotionConfig reducedMotion="user">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<DashboardLayout />}>
            {/* (a) Connect — one enormous, obvious connect button (F9, B4) */}
            <Route index element={<ConnectScreen />} />
            {/* (b) My accounts — smart accounts + installed plugins with status */}
            <Route path="accounts" element={<AccountsScreen />} />
            {/* Session keys — stable deep-link alias (Activity CTAs land here) */}
            <Route path="session-keys" element={<SessionKeysScreen />} />
            {/* (c) Plugin marketplace — install/uninstall via real on-chain userOps */}
            <Route path="marketplace" element={<MarketplaceScreen />} />
            {/* (d) Policies — what the plugin enforces (plain language) + editor */}
            <Route path="policy" element={<PoliciesScreen />} />
            {/* Policy audit — committed hash, session rollups, CSV from events */}
            <Route path="policy-audit" element={<PolicyAuditPage />} />
            {/* (e) Activity — every spend attempt: allowed (amber) or blocked (why + fix) */}
            <Route path="activity" element={<ActivityScreen />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </MotionConfig>
    </RootErrorBoundary>
  )
}
