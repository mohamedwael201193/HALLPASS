import AppLayout from '../pages/app/AppLayout'

/**
 * Dashboard layout shell — max 5 screens under /app/*.
 * The real shell (sidebar + top bar + connect + chain badge) is owned by
 * F5 in src/pages/app/AppLayout.tsx; this file is the lazy mount only.
 */
export default function DashboardLayout() {
  return <AppLayout />
}
