import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import ErrorState from '../../components/ErrorState'
import TapeEmptyState, { TapePrimaryAction } from '../../components/TapeEmptyState'
import TokenIcon, { type TokenKind } from '../../components/TokenIcon'

/** Official mark for the row's token (the feed currently reports USDC amounts). */
function rowToken(item: ApiItem): TokenKind {
  return item.amount?.unit === 'EURC' ? 'EURC' : 'USDC'
}

/* ============================================================================
 * Activity — every spend attempt on one smart account.
 * - Rows come ONLY from GET /api/v1/accounts/{address}/activity (CONTRACT.md
 *   §4.3 — indexer cache of chain events + relay-observed reverts).
 *   Nothing is invented. Cursor pagination via the API's opaque nextCursor.
 * - The backend ships each blocked row with a plain-words reasonText; the
 *   frontend adds the FIX derived from the reason code. Blocked rows always
 *   state that nothing was spent.
 * - Filters are client-side over loaded rows; counts describe what is
 *   loaded, not the whole history.
 * ========================================================================== */

const EXPLORER_TX = 'https://explorer.arc.io/tx/'
const API_BASE: string = import.meta.env.VITE_API_BASE_URL || ''
const PAGE_LIMIT = 25

type Filter = 'all' | 'allowed' | 'blocked'

interface ApiItem {
  allowed: boolean
  headline: string
  detail: string
  account: string
  sessionKey: string | null
  to: string | null
  amount: { raw: string; formatted: string; unit: string } | null
  tx: string
  txUrl: string
  block: number
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

/** Plain-words fix derived from the backend's own human sentence. */
function fixForBlocked(detail: string): string {
  const d = detail.toLowerCase()
  if (d.includes('per-payment cap'))
    return 'Raise the per-payment cap, or split the payment into smaller pieces.'
  if (d.includes('rolling-window budget'))
    return 'Raise the window cap, or wait for the window to reset.'
  if (d.includes('not on the allowlist'))
    return 'Add the recipient to the allowlist, or use a key with an open destination list.'
  if (d.includes('has expired'))
    return 'Extend the expiry, or register a new session key in the policy editor.'
  if (d.includes('was revoked'))
    return "Create a new session key — a revoked key can't be brought back."
  return 'Check the bounds set for this key in the policy editor.'
}

function cleanHeadline(item: ApiItem): string {
  // Backend blocked headlines start with "BLOCKED: " — the card already
  // carries the blocked styling, so the shout is redundant.
  return item.headline.replace(/^BLOCKED:\s*/i, '')
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

/* --------------------------------- page ----------------------------------- */

export default function Activity({ accountAddress }: ActivityProps) {
  const [searchParams] = useSearchParams()
  const account = accountAddress ?? searchParams.get('account') ?? ''

  const [filter, setFilter] = useState<Filter>('all')
  const [keyFilter, setKeyFilter] = useState<string>('all')
  const [items, setItems] = useState<ApiItem[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [errorDetail, setErrorDetail] = useState('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [asOfBlock, setAsOfBlock] = useState<number | null>(null)
  const [feedNote, setFeedNote] = useState<string | null>(null)

  /** Map a CONTRACT.md §4.3 row onto the local ApiItem model. */
  function mapRow(r: any): ApiItem | null {
    if (!r || (r.kind !== 'allowed' && r.kind !== 'blocked')) return null
    const allowed = r.kind === 'allowed'
    const amountRaw = typeof r.amountRaw === 'string' ? r.amountRaw : '0'
    const amountFmt = typeof r.amount === 'string' ? r.amount : amountRaw
    const to = typeof r.to === 'string' ? r.to : null
    const sessionKey = typeof r.sessionKey === 'string' ? r.sessionKey : null
    const tx = typeof r.txHash === 'string' ? r.txHash : ''
    const headline = allowed
      ? `${amountFmt} USDC → ${truncate(to)} — within policy`
      : `BLOCKED: ${amountFmt} USDC → ${truncate(to)}`
    const detail = allowed
      ? `Session ${truncate(sessionKey)} spent ${amountFmt} USDC within policy.`
      : typeof r.reasonText === 'string' && r.reasonText.length > 0
        ? r.reasonText
        : 'Blocked by policy. Nothing was spent.'
    return {
      allowed,
      headline,
      detail,
      account: account ?? '',
      sessionKey,
      to,
      amount: { raw: amountRaw, formatted: amountFmt, unit: 'USDC' },
      tx,
      txUrl: tx ? `${EXPLORER_TX}${tx}` : '',
      block: typeof r.blockNumber === 'number' ? r.blockNumber : 0,
    }
  }

  const loadPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (!account) return
      if (append) setLoadingMore(true)
      else {
        setState('loading')
        setErrorDetail('')
      }
      try {
        const q = new URLSearchParams({ limit: String(PAGE_LIMIT) })
        if (cursor) q.set('cursor', cursor)
        const res = await fetch(`${API_BASE}/api/v1/accounts/${account}/activity?${q.toString()}`)
        if (!res.ok) {
          let detail = `API responded ${res.status}`
          try {
            const body = await res.json()
            if (body?.error?.message) detail = `${detail}: ${body.error.message}`
          } catch {
            /* keep status-only detail */
          }
          throw new Error(detail)
        }
        const body = await res.json()
        const rawItems: any[] = Array.isArray(body?.items) ? body.items : []
        const list: ApiItem[] = rawItems
          .map(mapRow)
          .filter((x): x is ApiItem => x !== null)
        setItems((prev) => (append ? [...prev, ...list] : list))
        setNextCursor(typeof body?.nextCursor === 'string' ? body.nextCursor : null)
        setAsOfBlock(typeof body?.asOfBlock === 'number' ? body.asOfBlock : null)
        setFeedNote(
          body?.source === 'indexer'
            ? 'From the indexer event cache — the chain remains the source of truth.'
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
    [account],
  )

  // Fresh load whenever the account changes.
  useEffect(() => {
    setItems([])
    setNextCursor(null)
    void loadPage(null, false)
  }, [account, loadPage])

  const sessionKeys = useMemo(() => {
    const set = new Set<string>()
    for (const r of items) if (r.sessionKey) set.add(r.sessionKey)
    return [...set].sort()
  }, [items])

  const visible = useMemo(() => {
    return items.filter((r) => {
      if (filter === 'allowed' && !r.allowed) return false
      if (filter === 'blocked' && r.allowed) return false
      if (keyFilter !== 'all' && r.sessionKey !== keyFilter) return false
      return true
    })
  }, [items, filter, keyFilter])

  const counts = useMemo(() => {
    let allowed = 0
    let blocked = 0
    for (const r of items) {
      if (r.allowed) allowed += 1
      else blocked += 1
    }
    return { allowed, blocked }
  }, [items])

  if (!account) {
    return (
      <div>
        <PageHeader />
        <TapeEmptyState
          title="No account selected."
          copy="Activity is tracked per account — install, spend, and revoke events for one smart account. Pick one of yours first."
          action={
            <TapePrimaryAction to="/app/accounts">
              Go to my accounts
            </TapePrimaryAction>
          }
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader account={account} />

      <p className="mb-4 font-body text-xs text-text/40">
        Allowed rows are on-chain events; blocked rows are attempts the relay observed before any
        money moved. Nothing blocked ever left your account.
      </p>

      {/* Filters — client-side over loaded rows */}
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

        <span className="font-body text-xs text-text/40">
          {items.length > 0 ? `${items.length} loaded` : 'Loading…'}
        </span>
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
          onRetry={() => void loadPage(null, false)}
        />
      )}

      {state === 'ready' && items.length === 0 && (
        <TapeEmptyState
          title="No activity yet."
          copy={
            feedNote ??
            'Nothing here yet. When your agent spends — or when the hall pass stops it — the event shows up here, straight from the chain.'
          }
          action={
            <TapePrimaryAction to={`/app/session-keys?account=${account}`}>
              Review session keys
            </TapePrimaryAction>
          }
        />
      )}

      {state === 'ready' && items.length > 0 && visible.length === 0 && (
        <TapeEmptyState
          title={filter === 'blocked' ? 'Nothing blocked.' : filter === 'allowed' ? 'No allowed spends.' : 'No matches.'}
          copy={
            filter === 'blocked'
              ? 'Nothing has been blocked in the loaded activity. When the hall pass stops a spend, the reason and the fix show up here.'
              : 'No rows match the current filters in the loaded activity. Try widening them, or load older rows.'
          }
          action={
            <TapePrimaryAction
              onClick={() => {
                setFilter('all')
                setKeyFilter('all')
              }}
            >
              Clear filters
            </TapePrimaryAction>
          }
        />
      )}

      {state === 'ready' && visible.length > 0 && (
        <div className="flex flex-col gap-3">
          {visible.map((item, i) => (
            <ActivityCard
              key={`${item.tx}-${item.block}-${i}`}
              item={item}
              index={i}
            />
          ))}

          {nextCursor && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadPage(nextCursor, true)}
              className="mx-auto mt-2 rounded-full border border-text/20 px-6 py-2.5 font-body text-sm font-semibold text-text transition-colors hover:border-amber/60 hover:text-amber disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Show older activity'}
            </button>
          )}
          <p className="text-center font-body text-xs text-text/40">
            {feedNote ?? 'Latest first.'}
            {asOfBlock != null && <> Indexer at block {asOfBlock.toLocaleString()}.</>}
          </p>
        </div>
      )}
    </div>
  )
}

/* --------------------------------- rows ----------------------------------- */

function ActivityCard({ item, index }: { item: ApiItem; index: number }) {
  if (!item.allowed) return <BlockedCard item={item} index={index} />
  return <AllowedCard item={item} index={index} />
}

function AllowedCard({ item, index }: { item: ApiItem; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.24) }}
      className="rounded-2xl border border-amber/20 bg-text/[0.03] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber/15 text-amber" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12.5l5 5L20 6.5" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 font-body text-sm font-semibold text-text sm:text-base">
            <span className="text-amber">Allowed</span>
            <TokenIcon token={rowToken(item)} size={18} />
            <span>{cleanHeadline(item)}</span>
          </p>
          <p className="mt-1 font-body text-xs text-text/50 sm:text-sm">{item.detail}</p>
          <RowFooter item={item} />
        </div>
      </div>
    </motion.div>
  )
}

function BlockedCard({ item, index }: { item: ApiItem; index: number }) {
  const fix = fixForBlocked(item.detail)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.24) }}
      className="rounded-2xl border border-red-400/25 bg-red-400/[0.04] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-400/15 text-red-300" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 font-body text-sm font-semibold text-text sm:text-base">
            <span className="text-red-300">Blocked</span>
            <TokenIcon token={rowToken(item)} size={18} />
            <span>{cleanHeadline(item)}</span>
          </p>
          <p className="mt-1.5 font-body text-xs text-red-200/90 sm:text-sm">
            <span className="font-semibold">Why:</span> {item.detail}
          </p>
          <p className="mt-1 font-body text-xs text-text/60 sm:text-sm">
            <span className="font-semibold text-amber">How to fix:</span> {fix}
          </p>
          <RowFooter item={item} />
        </div>
      </div>
    </motion.div>
  )
}

function RowFooter({ item }: { item: ApiItem }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {item.sessionKey && (
        <span className="font-body text-[11px] text-text/50">
          Key <span className="font-mono">{truncate(item.sessionKey)}</span>
          <CopyButton value={item.sessionKey} label="session key address" />
        </span>
      )}
      {item.block != null && (
        <span className="font-body text-[11px] text-text/40">Block {item.block.toLocaleString()}</span>
      )}
      {item.tx && (
        <span className="font-body text-[11px]">
          <a
            href={item.txUrl || `${EXPLORER_TX}${item.tx}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-text/50 underline decoration-dotted underline-offset-4 transition-colors hover:text-amber"
          >
            {truncate(item.tx, 10, 6)}
          </a>
          <CopyButton value={item.tx} label="transaction hash" />
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
