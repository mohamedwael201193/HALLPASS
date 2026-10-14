import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useHallpass } from '../../lib/useHallpass'
import EmptyState from '../../components/EmptyState'
import ErrorState from '../../components/ErrorState'

/* ============================================================================
 * SessionKeys — the hall passes on one smart account.
 * - Rows come ONLY from GET /api/accounts/{address}/policies (indexer cache;
 *   the chain is truth). Amounts use the API's `formatted` USDC strings —
 *   raw values are 6-decimal Arc USDC, NOT 18-decimal wei.
 * - The on-chain overlay (owner, live window spend) comes from
 *   useHallpass().getPolicy — the chain, not the cache.
 * - Revoke is a REAL on-chain transaction via useHallpass().revokeSession
 *   with a plain-words confirm dialog. Disabled buttons always name the
 *   reason inline.
 * ========================================================================== */

const EXPLORER_TX = 'https://explorer.arc.io/tx/'
const API_BASE: string = import.meta.env.VITE_API_BASE_URL || ''

interface ApiAmount {
  raw: string
  formatted: string
  unit: string
}

interface ApiSession {
  sessionKey: string | null
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED'
  perTxCap: ApiAmount
  windowCap: ApiAmount
  expiry: number | null
  expiresInSeconds: number | null
  allowlist: string[]
  allowlistOpen: boolean
  updatedAtBlock: number
  updatedInTx: string
  revokedAtBlock?: number
  revokedInTx?: string
}

interface OnChainPolicy {
  sessionKey: string
  owner: string
  windowSpent: bigint
  windowCapWei: bigint
  windowSecs: bigint
  revoked: boolean
}

type LoadState = 'loading' | 'ready' | 'empty' | 'error'

export interface SessionKeysProps {
  /** Smart account to show keys for. Falls back to ?account= in the URL. */
  accountAddress?: string
}

/* ------------------------------- helpers --------------------------------- */

function truncate(addr?: string, head = 6, tail = 4): string {
  if (!addr) return '—'
  if (addr.length <= head + tail + 3) return addr
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`
}

function fmtWindow(secs: bigint | number): string {
  const s = Number(secs)
  if (!s || s <= 0) return ''
  if (s % 86400 === 0) {
    const d = s / 86400
    return `per ${d === 1 ? 'day' : `${d} days`}`
  }
  if (s % 3600 === 0) {
    const h = s / 3600
    return `per ${h === 1 ? 'hour' : `${h} hours`}`
  }
  if (s % 60 === 0) {
    const m = s / 60
    return `per ${m === 1 ? 'minute' : `${m} minutes`}`
  }
  return `per ${s} seconds`
}

/** Remaining seconds from the API's expiresInSeconds snapshot + local clock. */
function remainingSecs(s: ApiSession, fetchedAtMs: number, nowMs: number): number | null {
  if (s.expiresInSeconds == null) return null
  return Math.max(0, Math.round(s.expiresInSeconds - (nowMs - fetchedAtMs) / 1000))
}

function fmtCountdown(rem: number | null): { text: string; urgent: boolean } | null {
  if (rem == null) return null
  if (rem <= 0) return { text: 'Expired', urgent: false }
  const d = Math.floor(rem / 86400)
  const h = Math.floor((rem % 86400) / 3600)
  const m = Math.floor((rem % 3600) / 60)
  let text: string
  if (d > 0) text = `Expires in ${d}d ${h}h`
  else if (h > 0) text = `Expires in ${h}h ${m}m`
  else if (m > 0) text = `Expires in ${m}m`
  else text = 'Expires in under a minute'
  return { text, urgent: rem < 3600 }
}

/* ------------------------------ primitives -------------------------------- */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
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

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'amber' | 'red' | 'dim' }) {
  const tones: Record<string, string> = {
    neutral: 'border-text/15 bg-text/5 text-text/80',
    amber: 'border-amber/30 bg-amber/10 text-amber',
    red: 'border-red-400/30 bg-red-400/10 text-red-300',
    dim: 'border-text/10 bg-transparent text-text/50',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-body text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

function StatusChip({ status }: { status: ApiSession['status'] }) {
  if (status === 'REVOKED')
    return (
      <Chip tone="red">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        Revoked
      </Chip>
    )
  if (status === 'EXPIRED')
    return (
      <Chip tone="dim">
        <span className="h-1.5 w-1.5 rounded-full bg-text/40" />
        Expired
      </Chip>
    )
  return (
    <Chip tone="amber">
      <span className="h-1.5 w-1.5 rounded-full bg-amber" />
      Active
    </Chip>
  )
}

function KeySkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-text/10 bg-text/[0.03] p-5 sm:p-6" aria-hidden="true">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-5 w-40 rounded bg-text/10" />
        <div className="h-6 w-20 rounded-full bg-text/10" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="h-7 w-32 rounded-full bg-text/10" />
        <div className="h-7 w-36 rounded-full bg-text/10" />
        <div className="h-7 w-28 rounded-full bg-text/10" />
      </div>
      <div className="mt-4 h-10 w-28 rounded-full bg-text/10" />
    </div>
  )
}

/* --------------------------------- page ----------------------------------- */

export default function SessionKeys({ accountAddress }: SessionKeysProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const account = accountAddress ?? searchParams.get('account') ?? ''

  const {
    walletReady,
    walletSetupError,
    address: connectedAddress,
    isConnected,
    isArc,
    getPolicy,
    revokeSession,
    formatNativeUsdc,
  } = useHallpass()

  const [state, setState] = useState<LoadState>('loading')
  const [sessions, setSessions] = useState<ApiSession[]>([])
  const [fetchedAtMs, setFetchedAtMs] = useState(0)
  const [asOfBlock, setAsOfBlock] = useState<number | null>(null)
  const [listNote, setListNote] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string>('')
  const [now, setNow] = useState(Date.now())

  const [onChain, setOnChain] = useState<OnChainPolicy | null>(null)
  const [onChainError, setOnChainError] = useState<string | null>(null)

  const [confirmKey, setConfirmKey] = useState<ApiSession | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [revokedTx, setRevokedTx] = useState<{ key: string; txHash: string } | null>(null)

  const fetchSessions = useCallback(async () => {
    if (!account) {
      setState('empty')
      return
    }
    setState('loading')
    setErrorDetail('')
    try {
      const res = await fetch(`${API_BASE}/api/accounts/${account}/policies`)
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
      const list: ApiSession[] = Array.isArray(body?.data?.sessions) ? body.data.sessions : []
      setSessions(list)
      setFetchedAtMs(Date.now())
      setAsOfBlock(typeof body?.asOfBlock === 'number' ? body.asOfBlock : null)
      setListNote(typeof body?.data?.note === 'string' ? body.data.note : null)
      setState(list.length === 0 ? 'empty' : 'ready')
    } catch (e: any) {
      setErrorDetail(e?.message ?? 'Network error')
      setState('error')
    }
  }, [account])

  const fetchOnChain = useCallback(async () => {
    if (!account) return
    setOnChainError(null)
    try {
      const p = await getPolicy(account as `0x${string}`)
      setOnChain({
        sessionKey: p.sessionKey,
        owner: p.owner,
        windowSpent: p.windowSpent,
        windowCapWei: p.windowCapWei,
        windowSecs: p.windowSecs,
        revoked: p.revoked,
      })
    } catch (e: any) {
      setOnChain(null)
      setOnChainError(e?.message ?? 'Could not read the on-chain policy.')
    }
  }, [account, getPolicy])

  useEffect(() => {
    void fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    void fetchOnChain()
  }, [fetchOnChain])

  // Keep expiry countdowns honest while the page is open.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  function revokeDisabledReason(s: ApiSession): string | null {
    if (s.status === 'REVOKED') return 'Already revoked — there is nothing left to stop.'
    if (s.status === 'EXPIRED') return 'The pass already expired — there is nothing left to revoke.'
    if (!walletReady || walletSetupError)
      return 'Wallet setup is incomplete, so revoking is disabled. The app deploy must set the Reown project ID.'
    if (!isConnected) return 'Connect the owner wallet to revoke a key.'
    if (!isArc) return 'Switch to the Arc network (chain 5042) to revoke.'
    if (onChainError) return "Couldn't read the on-chain policy — reload the list and try again."
    if (onChain && s.sessionKey && onChain.sessionKey.toLowerCase() !== s.sessionKey.toLowerCase())
      return "The chain's active key for this account is different — this entry is stale."
    if (onChain && connectedAddress && onChain.owner.toLowerCase() !== connectedAddress.toLowerCase())
      return 'Only the account owner can revoke this key.'
    return null
  }

  async function doRevoke(s: ApiSession) {
    if (!s.sessionKey) return
    setRevoking(true)
    setRevokeError(null)
    try {
      // Real on-chain transaction: owner calls revokeSession through the
      // account fallback. Money never moves — the pass just dies.
      const txHash = await revokeSession(account as `0x${string}`)
      setRevokedTx({ key: s.sessionKey, txHash })
      setConfirmKey(null)
      // Re-read: the chain is truth, the list follows it.
      void fetchSessions()
      void fetchOnChain()
    } catch (e: any) {
      const msg: string = e?.shortMessage ?? e?.message ?? 'The transaction did not go through.'
      setRevokeError(
        /user rejected|rejected/i.test(msg)
          ? 'You rejected the transaction in your wallet — nothing changed.'
          : msg,
      )
    } finally {
      setRevoking(false)
    }
  }

  /* -------------------------------- render -------------------------------- */

  if (!account) {
    return (
      <div>
        <PageHeader />
        <EmptyState
          title="No account selected"
          description="Pick one of your smart accounts first — session keys live on a specific account."
          actionLabel="Go to my accounts"
          onAction={() => navigate('/app/accounts')}
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader account={account} />

      {revokedTx && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-2xl border border-amber/30 bg-amber/10 p-4 font-body text-sm text-text"
          role="status"
        >
          <span className="font-semibold text-amber">Key revoked.</span> The agent can no longer
          spend with <span className="font-mono">{truncate(revokedTx.key)}</span>. Funds stay in
          your account — nothing moved.{' '}
          <a
            href={`${EXPLORER_TX}${revokedTx.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-amber underline decoration-dotted underline-offset-4 hover:text-amber/80"
          >
            View on explorer
          </a>
          <button
            type="button"
            onClick={() => setRevokedTx(null)}
            className="float-right text-text/50 hover:text-text"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </motion.div>
      )}

      {state === 'loading' && (
        <div className="flex flex-col gap-4" aria-label="Loading session keys">
          <KeySkeleton />
          <KeySkeleton />
          <KeySkeleton />
        </div>
      )}

      {state === 'error' && (
        <ErrorState
          title="Couldn't load session keys"
          message="The key list comes from the indexer, and it didn't answer. Your keys and money are still on-chain — this is just a display problem."
          technicalDetail={errorDetail || undefined}
          retryLabel="Try again"
          onRetry={() => {
            void fetchSessions()
            void fetchOnChain()
          }}
        />
      )}

      {state === 'empty' && (
        <EmptyState
          title="No session keys yet"
          description="A session key is a hall pass for your agent: it can spend, but only within the bounds you set. Create one to get started."
          actionLabel="Set up your first hall pass"
          onAction={() => navigate(`/app/policy?account=${account}`)}
        />
      )}

      {state === 'ready' && (
        <>
          <div className="flex flex-col gap-4">
            {sessions.map((s, i) => {
              const rem = remainingSecs(s, fetchedAtMs, now)
              const cd = fmtCountdown(rem)
              const reason = revokeDisabledReason(s)
              // Live window spend — only when the chain's active key is this card.
              const liveSpend =
                onChain &&
                s.sessionKey &&
                onChain.sessionKey.toLowerCase() === s.sessionKey.toLowerCase() &&
                !onChain.revoked
                  ? onChain
                  : null
              const spentPct = (() => {
                if (!liveSpend || liveSpend.windowCapWei === 0n) return 0
                const pct = Number((liveSpend.windowSpent * 100n) / liveSpend.windowCapWei)
                return Math.min(100, Math.max(0, pct))
              })()

              return (
                <motion.div
                  key={s.sessionKey ?? `session-${i}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i * 0.06, 0.3) }}
                  className={`rounded-2xl border p-5 sm:p-6 ${
                    s.status === 'REVOKED'
                      ? 'border-red-400/20 bg-text/[0.02]'
                      : 'border-text/10 bg-text/[0.03]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-body text-xs uppercase tracking-wider text-text/40">Session key</p>
                      <p className="mt-1 font-mono text-lg font-semibold text-text">
                        {truncate(s.sessionKey ?? undefined)}
                        {s.sessionKey && <CopyButton value={s.sessionKey} label="session key address" />}
                      </p>
                    </div>
                    <StatusChip status={s.status} />
                  </div>

                  {/* Policy summary chips: cap · expiry countdown · destinations */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Chip tone="amber">≤ {s.perTxCap.formatted} USDC per payment</Chip>
                    <Chip>≤ {s.windowCap.formatted} USDC per window</Chip>
                    {cd && (
                      <Chip tone={cd.urgent ? 'red' : 'neutral'}>
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                        {cd.text}
                      </Chip>
                    )}
                    <Chip>
                      {s.allowlistOpen ? (
                        <span>Any destination — caps still apply</span>
                      ) : (
                        <span>
                          {s.allowlist.length} {s.allowlist.length === 1 ? 'destination' : 'destinations'}
                        </span>
                      )}
                    </Chip>
                  </div>

                  {/* Live window spend — chain truth, only for the active key */}
                  {liveSpend && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between font-body text-xs text-text/50">
                        <span>
                          {formatNativeUsdc(liveSpend.windowSpent)} of{' '}
                          {formatNativeUsdc(liveSpend.windowCapWei)} USDC used this window{' '}
                          {fmtWindow(liveSpend.windowSecs)}
                        </span>
                        <span>{spentPct}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-text/10">
                        <div
                          className="h-full rounded-full bg-amber transition-all duration-500"
                          style={{ width: `${spentPct}%` }}
                        />
                      </div>
                      <p className="mt-1.5 font-body text-[11px] text-text/40">
                        Live from the chain — the indexer cache can lag behind.
                      </p>
                    </div>
                  )}

                  {/* Revoke */}
                  <div className="mt-5">
                    <button
                      type="button"
                      disabled={reason !== null}
                      onClick={() => {
                        setRevokeError(null)
                        setConfirmKey(s)
                      }}
                      className={`rounded-full px-5 py-2.5 font-body text-sm font-semibold transition-all duration-200 ${
                        reason !== null
                          ? 'cursor-not-allowed bg-text/10 text-text/40'
                          : 'border border-red-400/40 text-red-300 hover:bg-red-400/10 active:scale-[0.97]'
                      }`}
                    >
                      Revoke
                    </button>
                    {reason && (
                      <p className="mt-2 max-w-md font-body text-xs text-text/50">{reason}</p>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>

          <p className="mt-6 font-body text-xs text-text/40">
            {listNote ?? 'Latest policy per session key, with revocation overlaid.'}
            {asOfBlock != null && <> Indexer at block {asOfBlock.toLocaleString()}.</>}
          </p>
        </>
      )}

      {/* Confirm dialog — plain words, no jargon (design standard: AlertDialog
          anatomy for destructive actions; undo path = a new key can be issued) */}
      <AnimatePresence>
        {confirmKey && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm revoke"
            onClick={() => !revoking && setConfirmKey(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-md rounded-2xl border border-text/10 bg-cream p-6 text-ink sm:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-display text-2xl font-bold">Revoke this hall pass?</h2>
              <p className="mt-3 font-body text-sm leading-relaxed text-ink/70">
                This immediately stops the agent from spending with{' '}
                <span className="font-mono font-semibold">{truncate(confirmKey.sessionKey ?? undefined)}</span>.
                Anything left in your account stays there — revoking moves no money. This can't be
                undone; to give the agent access again you'll need a new key.
              </p>
              {revokeError && (
                <p className="mt-3 rounded-lg bg-red-400/10 p-3 font-body text-sm text-red-700" role="alert">
                  {revokeError}
                </p>
              )}
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={revoking}
                  onClick={() => setConfirmKey(null)}
                  className="rounded-full border border-ink/20 px-6 py-3 font-body text-sm font-semibold text-ink transition-colors hover:border-ink/40 disabled:opacity-50"
                >
                  Keep the key
                </button>
                <button
                  type="button"
                  disabled={revoking}
                  onClick={() => void doRevoke(confirmKey)}
                  className="rounded-full bg-red-700 px-6 py-3 font-body text-sm font-semibold text-white transition-all hover:bg-red-800 active:scale-[0.97] disabled:opacity-60"
                >
                  {revoking ? 'Revoking — confirm in your wallet…' : 'Revoke now'}
                </button>
              </div>
              {revoking && (
                <p className="mt-3 text-center font-body text-xs text-ink/50">
                  Waiting for your wallet signature, then the chain. The list refreshes from
                  on-chain state afterward.
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PageHeader({ account }: { account?: string }) {
  return (
    <div className="mb-8">
      <p className="font-body text-sm text-text/50">
        <Link to="/app/accounts" className="text-amber hover:text-amber/80">
          My accounts
        </Link>
        <span className="mx-2">/</span>Session keys
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Session keys</h1>
      <p className="mt-2 max-w-2xl font-body text-sm text-text/60 sm:text-base">
        Each key is a hall pass: your agent may spend, but only within the bounds on-chain.
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
