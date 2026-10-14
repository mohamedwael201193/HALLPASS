import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import EmptyState from '../../components/EmptyState'
import ErrorState from '../../components/ErrorState'

/* ============================================================================
 * Activity — every spend attempt on one smart account.
 * - Rows come ONLY from GET /api/accounts/{address}/activity (indexer cache of
 *   chain events + relay-observed reverts). Nothing is invented.
 * - Allowed rows: green/amber "Allowed — 0.5 USDC to 0x…".
 * - Blocked rows: red "Blocked — tried X, cap Y" with WHY in human words and
 *   exactly how to fix it. Their source ("observed attempt", never an
 *   on-chain event) is labelled honestly — money never moved.
 * ========================================================================== */

const EXPLORER_TX = 'https://explorer.arc.io/tx/'
const API_BASE: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL) || ''
const PAGE_LIMIT = 50

type ActivityKind = 'allowed' | 'blocked'
type Filter = 'all' | 'allowed' | 'blocked'

interface ActivityRow {
  kind: ActivityKind
  source?: 'on_chain_event' | 'observed_revert'
  sessionKey?: string
  to?: string
  amountWei?: string
  amountUsdc?: string
  windowUsedWei?: string
  windowUsedUsdc?: string
  policyHash?: string
  txHash?: string
  blockNumber?: number
  logIndex?: number
  reason?: string
  attemptedWei?: string
  attemptedUsdc?: string
  capWei?: string
  capUsdc?: string
  plainLanguage?: string
}

type LoadState = 'loading' | 'ready' | 'error'

export interface ActivityProps {
  /** Smart account to show activity for. Falls back to ?account= in the URL. */
  accountAddress?: string
}

/* ------------------------------- helpers --------------------------------- */

function truncate(addr?: string, head = 6, tail = 4): string {
  if (!addr) return '—'
  if (addr.length <= head + tail + 3) return addr
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`
}

function weiToUsdc(wei?: string): string {
  if (!wei) return '0'
  try {
    const v = BigInt(wei)
    const unit = 1_000_000_000_000_000_000n
    const whole = v / unit
    let frac = (v % unit).toString().padStart(18, '0').slice(0, 6)
    frac = frac.replace(/0+$/, '')
    return frac ? `${whole}.${frac}` : `${whole}`
  } catch {
    return '0'
  }
}

function usdcDisplay(display?: string, wei?: string): string {
  if (display && display.trim() !== '') return display
  return weiToUsdc(wei)
}

/* ------------------------------ primitives -------------------------------- */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={(e) => {
        e.stopPropagation()
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
      className="ml-1.5 inline-flex items-center rounded p-0.5 text-text/40 transition-colors hover:text-amber"
    >
      {copied ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12.5l5 5L20 6.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15V5a2 2 0 012-2h10" />
        </svg>
      )}
    </button>
  )
}

function SourceBadge({ source }: { source?: string }) {
  if (source === 'observed_revert') {
    return (
      <span
        title="This attempt never reached the chain — it was stopped before any money moved. The record comes from the relay, not an on-chain event."
        className="inline-flex cursor-help items-center rounded-full border border-text/15 bg-text/5 px-2.5 py-0.5 font-body text-[11px] text-text/60"
      >
        Observed attempt — not on-chain
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full border border-amber/25 bg-amber/10 px-2.5 py-0.5 font-body text-[11px] text-amber">
      On-chain record
    </span>
  )
}

function RowSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-text/10 bg-text/[0.03] p-5" aria-hidden="true">
      <div className="flex items-center gap-4">
        <div className="h-9 w-9 rounded-full bg-text/10" />
        <div className="flex-1">
          <div className="h-4 w-2/3 rounded bg-text/10" />
          <div className="mt-2 h-3 w-1/3 rounded bg-text/10" />
        </div>
      </div>
    </div>
  )
}

/* ------------------------- blocked-reason decoding ------------------------ */
/* Primary source is the API's `plainLanguage` (the indexer decodes the plugin's
 * custom errors). This map is the honest fallback for a reason code we know. */

interface DecodedReason {
  why: string
  fix: string
}

const REASON_DECODE: Record<string, DecodedReason> = {
  PerTxCapExceeded: {
    why: 'it exceeds the per-payment cap',
    fix: 'raise the per-payment cap, or split the payment into smaller pieces',
  },
  WindowCapExceeded: {
    why: 'it exceeds the spending-window cap',
    fix: 'raise the window cap, or wait for the window to reset',
  },
  NotAllowlisted: {
    why: "the recipient isn't on this key's allowed list",
    fix: 'add the recipient to the allowlist, or use a key with an open destination list',
  },
  SessionExpired: {
    why: 'the hall pass has expired',
    fix: 'extend the expiry in the policy editor',
  },
  SessionRevoked: {
    why: 'this session key was revoked',
    fix: "create a new session key — a revoked key can't be brought back",
  },
}

function decodeReason(row: ActivityRow): { why: string; fix: string } {
  if (row.plainLanguage && row.plainLanguage.trim() !== '') {
    // API-provided human sentence; fix appended from the decoded map when known.
    const mapped = row.reason ? REASON_DECODE[row.reason] : undefined
    return {
      why: row.plainLanguage,
      fix: mapped ? `How to fix: ${mapped.fix}.` : '',
    }
  }
  const mapped = row.reason ? REASON_DECODE[row.reason] : undefined
  if (mapped) return { why: mapped.why, fix: `How to fix: ${mapped.fix}.` }
  return {
    why: 'the hall pass said no',
    fix: 'How to fix: check the bounds set for this key in the policy editor.',
  }
}

/* --------------------------------- page ----------------------------------- */

export default function Activity({ accountAddress }: ActivityProps) {
  const [searchParams] = useSearchParams()
  const account = accountAddress ?? searchParams.get('account') ?? ''

  const [filter, setFilter] = useState<Filter>('all')
  const [keyFilter, setKeyFilter] = useState<string>('all')
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [errorDetail, setErrorDetail] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [beforeCursor, setBeforeCursor] = useState<string | null>(null)

  const buildUrl = useCallback(
    (before?: string | null) => {
      const q = new URLSearchParams()
      if (filter !== 'all') q.set('filter', filter)
      if (keyFilter !== 'all') q.set('sessionKey', keyFilter)
      q.set('limit', String(PAGE_LIMIT))
      if (before) q.set('before', before)
      return `${API_BASE}/api/accounts/${account}/activity?${q.toString()}`
    },
    [account, filter, keyFilter],
  )

  const load = useCallback(
    async (append: boolean) => {
      if (!account) return
      if (append) setLoadingMore(true)
      else {
        setState('loading')
        setErrorDetail('')
      }
      try {
        const res = await fetch(buildUrl(append ? beforeCursor : null))
        if (res.status === 404) {
          setRows([])
          setState('ready')
          setHasMore(false)
          return
        }
        if (!res.ok) throw new Error(`API responded ${res.status}`)
        const data = await res.json()
        const list: ActivityRow[] = Array.isArray(data.rows) ? data.rows : []
        setRows((prev) => (append ? [...prev, ...list] : list))
        setHasMore(list.length === PAGE_LIMIT)
        const last = list[list.length - 1]
        setBeforeCursor(
          last && last.blockNumber != null && last.logIndex != null
            ? `${last.blockNumber}:${last.logIndex}`
            : null,
        )
        setState('ready')
      } catch (e: any) {
        setErrorDetail(e?.message ?? 'Network error')
        if (!append) setState('error')
      } finally {
        setLoadingMore(false)
      }
    },
    [account, buildUrl, beforeCursor],
  )

  // Refetch whenever the account or filters change (filters are server-side).
  useEffect(() => {
    setBeforeCursor(null)
    setHasMore(false)
    void load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, filter, keyFilter])

  const sessionKeys = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.sessionKey) set.add(r.sessionKey)
    return [...set].sort()
  }, [rows])

  const counts = useMemo(() => {
    let allowed = 0
    let blocked = 0
    for (const r of rows) {
      if (r.kind === 'allowed') allowed += 1
      else blocked += 1
    }
    return { allowed, blocked }
  }, [rows])

  if (!account) {
    return (
      <div>
        <PageHeader />
        <EmptyState
          title="No account selected"
          description="Pick one of your smart accounts first — activity is tracked per account."
          actionLabel="Go to my accounts"
          onAction={() => (window.location.href = '/app/accounts')}
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader account={account} />

      {/* Filters — applied server-side via query params */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-text/15 bg-text/[0.03] p-1" role="tablist" aria-label="Filter activity">
          {(['all', 'allowed', 'blocked'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 font-body text-sm font-medium transition-colors ${
                filter === f ? 'bg-amber text-ink' : 'text-text/60 hover:text-text'
              }`}
            >
              {f === 'all' ? 'All' : f === 'allowed' ? `Allowed (${counts.allowed})` : `Blocked (${counts.blocked})`}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 font-body text-sm text-text/60">
          Session key
          <select
            value={keyFilter}
            onChange={(e) => setKeyFilter(e.target.value)}
            className="rounded-full border border-text/15 bg-ink px-3 py-1.5 font-body text-sm text-text focus:border-amber/50 focus:outline-none"
          >
            <option value="all">All keys</option>
            {sessionKeys.map((k) => (
              <option key={k} value={k}>
                {truncate(k)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state === 'loading' && (
        <div className="flex flex-col gap-3" aria-label="Loading activity">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      )}

      {state === 'error' && (
        <ErrorState
          title="Couldn't load activity"
          message="The feed comes from the indexer, and it didn't answer. Your on-chain history is unaffected — this is just a display problem."
          technicalDetail={errorDetail || undefined}
          retryLabel="Try again"
          onRetry={() => void load(false)}
        />
      )}

      {state === 'ready' && rows.length === 0 && (
        <EmptyState
          title="No activity yet"
          description={
            filter === 'blocked'
              ? 'Nothing has been blocked yet. When the hall pass stops a spend, the reason and the fix show up here.'
              : filter === 'allowed'
                ? 'No spends yet. When your agent spends within its bounds, each one shows up here.'
                : 'Nothing here yet. When your agent spends — or when the hall pass stops it — it shows up here.'
          }
          actionLabel="Review session keys"
          onAction={() => (window.location.href = `/app/session-keys?account=${account}`)}
        />
      )}

      {state === 'ready' && rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <ActivityCard key={`${row.txHash ?? 'row'}-${row.blockNumber ?? 0}-${row.logIndex ?? i}`} row={row} index={i} />
          ))}

          {hasMore && (
            <button
              type="button"
              disabled={loadingMore || !beforeCursor}
              onClick={() => void load(true)}
              className="mx-auto mt-2 rounded-full border border-text/20 px-6 py-2.5 font-body text-sm font-semibold text-text transition-colors hover:border-amber/60 hover:text-amber disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Show older activity'}
            </button>
          )}
          {hasMore && !beforeCursor && (
            <p className="text-center font-body text-xs text-text/40">
              The feed didn't provide a position for older rows — showing the latest {rows.length}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* --------------------------------- rows ----------------------------------- */

function ActivityCard({ row, index }: { row: ActivityRow; index: number }) {
  if (row.kind === 'blocked') return <BlockedCard row={row} index={index} />
  return <AllowedCard row={row} index={index} />
}

function AllowedCard({ row, index }: { row: ActivityRow; index: number }) {
  const amount = usdcDisplay(row.amountUsdc, row.amountWei)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.24) }}
      className="rounded-2xl border border-amber/20 bg-text/[0.03] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amber">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12.5l5 5L20 6.5" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-body text-sm font-semibold text-text sm:text-base">
            Allowed — {amount} USDC to{' '}
            <span className="font-mono font-medium">{truncate(row.to)}</span>
            {row.to && <CopyButton value={row.to} label="recipient address" />}
          </p>
          <p className="mt-1 font-body text-xs text-text/50 sm:text-sm">
            Within policy
            {row.windowUsedUsdc || row.windowUsedWei ? (
              <>
                {' '}· {usdcDisplay(row.windowUsedUsdc, row.windowUsedWei)} USDC used in the window after this spend
              </>
            ) : null}
            {row.sessionKey ? (
              <>
                {' '}· key <span className="font-mono">{truncate(row.sessionKey)}</span>
                <CopyButton value={row.sessionKey} label="session key address" />
              </>
            ) : null}
          </p>
          <RowFooter row={row} />
        </div>
      </div>
    </motion.div>
  )
}

function BlockedCard({ row, index }: { row: ActivityRow; index: number }) {
  const { why, fix } = decodeReason(row)
  const attempted = usdcDisplay(row.attemptedUsdc, row.attemptedWei)
  const cap = row.capUsdc || row.capWei ? usdcDisplay(row.capUsdc, row.capWei) : null
  const isPlain = !!(row.plainLanguage && row.plainLanguage.trim() !== '')

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.24) }}
      className="rounded-2xl border border-red-400/25 bg-red-400/[0.04] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-400/15 text-red-300">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-body text-sm font-semibold text-text sm:text-base">
            Blocked — {attempted} USDC{row.to ? (
              <>
                {' '}to <span className="font-mono font-medium">{truncate(row.to)}</span>
                <CopyButton value={row.to} label="recipient address" />
              </>
            ) : null}
          </p>
          <p className="mt-1.5 font-body text-xs text-red-200/90 sm:text-sm">
            <span className="font-semibold">Why:</span>{' '}
            {isPlain ? (
              why
            ) : (
              <>
                {why}
                {row.attemptedUsdc || row.attemptedWei ? ` (tried ${attempted}` : ''}
                {cap ? `, cap ${cap}` : ''}
                {(row.attemptedUsdc || row.attemptedWei) && ')'}.{' '}
                <span className="text-text/60">Nothing was spent.</span>
              </>
            )}
          </p>
          {fix && (
            <p className="mt-1 font-body text-xs text-text/60 sm:text-sm">
              <span className="font-semibold text-amber">How to fix:</span> {fix.replace(/^How to fix:\s*/i, '')}
            </p>
          )}
          {row.sessionKey && (
            <p className="mt-1 font-body text-xs text-text/50">
              Key <span className="font-mono">{truncate(row.sessionKey)}</span>
              <CopyButton value={row.sessionKey} label="session key address" />
            </p>
          )}
          <RowFooter row={row} />
        </div>
      </div>
    </motion.div>
  )
}

function RowFooter({ row }: { row: ActivityRow }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <SourceBadge source={row.source} />
      {row.blockNumber != null && (
        <span className="font-body text-[11px] text-text/40">Block {row.blockNumber.toLocaleString()}</span>
      )}
      {row.txHash && (
        <span className="font-body text-[11px]">
          <a
            href={`${EXPLORER_TX}${row.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-text/50 underline decoration-dotted underline-offset-4 transition-colors hover:text-amber"
          >
            {truncate(row.txHash, 10, 6)}
          </a>
          <CopyButton value={row.txHash} label="transaction hash" />
        </span>
      )}
      {row.reason && !row.plainLanguage && (
        <span className="font-mono text-[11px] text-text/30" title="On-chain revert reason">
          {row.reason}
        </span>
      )}
    </div>
  )
}

function PageHeader({ account }: { account?: string }) {
  return (
    <div className="mb-6">
      <p className="font-body text-sm text-text/50">
        <Link to="/app/accounts" className="text-amber hover:text-amber/80">
          My accounts
        </Link>
        <span className="mx-2">/</span>Activity
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Activity</h1>
      <p className="mt-2 max-w-2xl font-body text-sm text-text/60 sm:text-base">
        Every spend attempt, allowed or stopped. When the hall pass says no, you get the reason
        in plain words — and how to fix it.
        {account && (
          <>
            {' '}Account <span className="font-mono">{truncate(account)}</span>
            <CopyButton value={account} label="account address" />
          </>
        )}
      </p>
    </div>
  )
}
