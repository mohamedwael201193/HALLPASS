/**
 * StatsStrip — the relay "TAPE" stats strip for the HALLPASS dashboard.
 *
 * Cells: ACTIVE SESSIONS / TOTAL SPEND CAPS / USDC / EURC (real token icons) /
 * REVOKED — every number from Arc mainnet via useDashboardStats, aggregated
 * across tracked accounts. A cell the chain cannot answer renders "—",
 * never a placeholder number. No export buttons: none would be real.
 */

import TokenIcon from './TokenIcon';
import CountUp from './vendor/magicui/CountUp';
import { formatEurc, formatNativeUsdc } from '../lib/contracts';
import { HallpassGate, WalletDownState } from '../pages/app/shared';
import { useDashboardStats } from '../pages/app/useDashboardStats';

/** Decimals that preserve the value exactly (up to 6) — never fake precision. */
function decimalsFor(v: number): number {
  for (let d = 0; d <= 6; d++) {
    const r = Number(v.toFixed(d));
    if (Math.abs(r - v) < 1e-9) return d;
  }
  return 6;
}

/** CountUp is a reveal animation only: values beyond safe float range render as plain text. */
function AnimatedNumber({
  wei,
  perUnit,
  label,
}: {
  wei: bigint;
  perUnit: number;
  label: string;
}) {
  const v = Number(wei) / perUnit;
  if (!Number.isFinite(v) || Math.abs(Number(wei)) > 1e21) {
    return <span>{label}</span>;
  }
  return <CountUp value={v} decimals={decimalsFor(v)} label={label} />;
}

function Cell({
  label,
  value,
  sub,
  icon,
  animated,
}: {
  label: string;
  /** null → "—" (loading, locked, unavailable). Honest, never faked. */
  value: string | null;
  sub?: string;
  icon?: React.ReactNode;
  /** Animated reveal of the same real value (CountUp). Falls back to value. */
  animated?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-text/10 bg-text/[0.03] px-4 py-4">
      <p className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-text/50">
        {label}
      </p>
      <p className="mt-2 flex min-h-[2.25rem] items-center gap-2 font-display text-xl font-extrabold text-text md:text-2xl">
        {icon}
        <span className="truncate" title={value ?? '—'}>
          {value === null ? '—' : (animated ?? value)}
        </span>
      </p>
      {sub ? (
        <p className="mt-1 truncate text-xs text-text/45">{sub}</p>
      ) : null}
    </div>
  );
}

function StatsStripLive() {
  const stats = useDashboardStats();

  return (
    <section aria-label="Session stats" className="mb-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Cell
          label="Active sessions"
          value={
            stats.activeSessions === null ? null : String(stats.activeSessions)
          }
          animated={
            stats.activeSessions === null ? undefined : (
              <CountUp
                value={stats.activeSessions}
                label={`${stats.activeSessions} active sessions`}
              />
            )
          }
          sub={
            stats.accountsTotal === 0
              ? 'no accounts tracked'
              : `${stats.accountsRead} of ${stats.accountsTotal} accounts read`
          }
        />
        <Cell
          label="Total spend caps"
          value={
            stats.totalSpendCapsWei === null
              ? null
              : `${formatNativeUsdc(stats.totalSpendCapsWei)}`
          }
          animated={
            stats.totalSpendCapsWei === null ? undefined : (
              <AnimatedNumber
                wei={stats.totalSpendCapsWei}
                perUnit={1e18}
                label={`${formatNativeUsdc(stats.totalSpendCapsWei)} USDC total spend caps`}
              />
            )
          }
          sub="sum of window caps · USDC"
        />
        <Cell
          label="USDC"
          icon={<TokenIcon token="USDC" size={22} />}
          value={stats.usdcWei === null ? null : formatNativeUsdc(stats.usdcWei)}
          animated={
            stats.usdcWei === null ? undefined : (
              <AnimatedNumber
                wei={stats.usdcWei}
                perUnit={1e18}
                label={`${formatNativeUsdc(stats.usdcWei)} USDC total balance`}
              />
            )
          }
          sub="total balance · 18 decimals"
        />
        <Cell
          label="EURC"
          icon={<TokenIcon token="EURC" size={22} />}
          value={stats.eurcUnits === null ? null : formatEurc(stats.eurcUnits)}
          animated={
            stats.eurcUnits === null ? undefined : (
              <AnimatedNumber
                wei={stats.eurcUnits}
                perUnit={1e6}
                label={`${formatEurc(stats.eurcUnits)} EURC total balance`}
              />
            )
          }
          sub="total balance · 6 decimals"
        />
        <Cell
          label="Revoked"
          value={stats.revoked === null ? null : String(stats.revoked)}
          animated={
            stats.revoked === null ? undefined : (
              <CountUp
                value={stats.revoked}
                label={`${stats.revoked} revoked sessions`}
              />
            )
          }
          sub="passes killed by owner"
        />
      </div>
      {stats.note ? (
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text/50">
          {stats.note}
        </p>
      ) : null}
      {stats.state === 'error' ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-[#E08A73]">
            {stats.error ?? 'The chain reads failed.'} Balances and sessions are
            still on-chain — this is a display problem.
          </p>
          <button
            type="button"
            onClick={stats.reload}
            className="min-h-[44px] rounded-full border border-text/25 px-5 text-sm font-semibold text-text transition-colors hover:border-amber/60 hover:text-amber"
          >
            Try again
          </button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The strip needs wallet state (useHallpass throws when the provider stack is
 * down); the gate keeps that an honest state instead of a crash. The strip
 * itself shows "—" when locked — never invented numbers.
 */
export default function StatsStrip() {
  return (
    <HallpassGate
      render={() => <StatsStripLive />}
      fallback={
        <section aria-label="Session stats" className="mb-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {['Active sessions', 'Total spend caps', 'USDC', 'EURC', 'Revoked'].map(
              (label) => (
                <Cell key={label} label={label} value={null} />
              ),
            )}
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text/50">
            <WalletDownState />
          </p>
        </section>
      }
    />
  );
}
