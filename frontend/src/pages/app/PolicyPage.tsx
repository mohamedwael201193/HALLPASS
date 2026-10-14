/**
 * PolicyPage — the policy-audit page (route pending: /app/policy-audit).
 *
 * Hosts the PolicyHashPanel: committed policy hash, session rollups, and
 * client-side CSV export of the account's policy events. Read-only — no
 * wallet required, so this page is NOT wrapped in HallpassGate (the reads
 * go through the public viem client). The plugin address still comes from
 * VITE_PLUGIN_ADDRESS (env only); when unset the panel says so honestly.
 *
 * ROUTE WIRING (not done — App.tsx is owned by the dashboard-v2 worker):
 *   import PolicyPage from './pages/app/PolicyPage'
 *   const PolicyPage = lazy(() => import('./pages/app/PolicyPage'))
 *   <Route path="policy-audit" element={<PolicyPage />} />
 */

import { Link, useSearchParams } from 'react-router-dom';
import { isAddress, type Address } from 'viem';
import PolicyHashPanel from '../../components/app/PolicyHashPanel';
import { CopyButton, truncateAddress } from './shared';
import TapeEmptyState, {
  TapePrimaryAction,
} from '../../components/TapeEmptyState';

export default function PolicyPage() {
  const [searchParams] = useSearchParams();
  const accountParam = searchParams.get('account') ?? '';
  const account: Address | null =
    accountParam && isAddress(accountParam)
      ? (accountParam as Address)
      : null;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <p className="font-body text-sm text-text/50">
        <Link to="/app/accounts" className="text-amber hover:text-amber/80">
          My accounts
        </Link>
        <span className="mx-2">/</span>Policy audit
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">
        Policy audit
      </h1>
      <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-text/60 sm:text-base">
        The policy commitment hash, the session&apos;s live rollups, and a
        CSV of every policy event — all read straight from the chain, nothing
        stored or simulated.
      </p>

      {!account ? (
        <div className="mt-6">
          <TapeEmptyState
            title="Choose an account first."
            copy="Policies live on a specific smart account. Pick one and its commitment hash, rollups and event history appear here."
            action={
              <TapePrimaryAction to="/app/accounts">
                Go to my accounts
              </TapePrimaryAction>
            }
          />
        </div>
      ) : (
        <>
          <p className="mt-4 flex flex-wrap items-center gap-1 font-body text-sm text-text/60">
            <span>Account</span>
            <span className="font-mono">{truncateAddress(account)}</span>
            <CopyButton value={account} label="Copy account address" />
          </p>
          <div className="mt-6">
            <PolicyHashPanel account={account} />
          </div>
        </>
      )}
    </div>
  );
}
