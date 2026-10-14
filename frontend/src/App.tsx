import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import RouteFallback from './shells/RouteFallback'

/* ------------------------------------------------------------------ */
/* ROUTE-LEVEL CODE SPLITTING (F10). Every route is a lazy chunk so    */
/* the first paint ships the smallest possible bundle. The landing    */
/* and dashboard screens load on demand. Page workers own the real     */
/* screens — these shells are mounts only. UX laws apply to every      */
/* shell owner: no dead ends, every screen names its next action,      */
/* nothing demo/mock/fake.                                            */
/* ------------------------------------------------------------------ */

/** Landing page mount — owned by the landing worker (§5 of the prompt). */
const LandingShell = lazy(() => import('./shells/LandingShell'))
/** Dashboard layout shell — owned by the dashboard worker (§6 of the prompt). */
const DashboardLayout = lazy(() => import('./shells/DashboardLayout'))
/** Dashboard screens (max 5: connect, accounts, marketplace, policy, activity). */
/* Named exports mapped to default so each route splits into its own chunk. */
const ConnectScreen = lazy(() =>
  import('./shells/Screens').then((m) => ({ default: m.ConnectScreen })),
)
const AccountsScreen = lazy(() =>
  import('./shells/Screens').then((m) => ({ default: m.AccountsScreen })),
)
const MarketplaceScreen = lazy(() =>
  import('./shells/Screens').then((m) => ({ default: m.MarketplaceScreen })),
)
const PolicyScreen = lazy(() =>
  import('./shells/Screens').then((m) => ({ default: m.PolicyScreen })),
)
const ActivityScreen = lazy(() =>
  import('./shells/Screens').then((m) => ({ default: m.ActivityScreen })),
)
/** 404 — never a dead end: route the user somewhere useful. */
const NotFound = lazy(() => import('./shells/NotFound'))

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingShell />} />
          <Route path="/app" element={<DashboardLayout />}>
            {/* (a) Connect — one enormous, obvious connect button */}
            <Route index element={<ConnectScreen />} />
            {/* (b) My accounts — smart accounts + installed plugins with status */}
            <Route path="accounts" element={<AccountsScreen />} />
            {/* (c) Plugin marketplace — install/uninstall via real on-chain userOps */}
            <Route path="marketplace" element={<MarketplaceScreen />} />
            {/* (d) Policy editor — sliders + live "what this allows" preview */}
            <Route path="policy" element={<PolicyScreen />} />
            {/* (e) Activity — every spend attempt: allowed (amber) or blocked (why + fix) */}
            <Route path="activity" element={<ActivityScreen />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </MotionConfig>
  )
}
