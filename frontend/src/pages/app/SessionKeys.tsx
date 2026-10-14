import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import EmptyState from '../../components/EmptyState'
import ErrorState from '../../components/ErrorState'

/* ============================================================================
 * SessionKeys — the hall passes on one smart account.
 * - Rows come ONLY from GET /api/accounts/{address}/policies (chain-derived
 *   indexer cache). Nothing is invented; if the API is unreachable we show
 *   the error, not placeholders.
 * - Revoke goes through worker F9's real on-chain module when it lands.
 *   Until then the button is disabled WITH the reason shown inline
 *   (hard rule: a control that looks live must be live or disabled-with-reason).
 * ========================================================================== */

const EXPLORER_TX = 'https://explorer.arc.io/tx/'
const API_BASE: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL) || ''

interface Policy {
  sessionKey: string
  owner: string
  perTxCapWei: string
  perTxCapUsdc?: string
  windowCapWei: string
  windowCapUsdc?: string
  windowSecs: number
  windowStart: number
  windowSpentWei: string
  windowSpentUsdc?: string
  expiry: number
  allowlist: string[]
  revoked: boolean
  policyHash?: string
  installedTx?: string
}

type LoadState = 'loading' | 'ready' | 'empty' | 'error'

export interface SessionKeysProps {
  /** Smart account to show keys for. Falls back to ?account= in the URL. */
  accountAddress?: string
  /** Connected owner wallet (wired by F9's wallet provider when it lands). */
  connectedAddress?: string
}

/* ------------------------------- helpers --------------------------------- */

function truncate(addr?: string, head = 6, tail = 4): string {
  if (!addr) return '—'
  if (addr.length <= head + tail + 3) return addr
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`
}

/** BigInt-safe wei (18dp) -> trimmed USDC string. No float precision loss. */
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

function fmtWindow(secs: number): string {
  if (!secs || secs <= 0) return ''
  if (secs % 86400 === 0) {
    const d = secs / 86400
    return `per ${d === 1 ? 'day' : `${d} days`}`
  }
  if (secs % 3600 === 0) {
    const h = secs / 3600
    return `per ${h === 1 ? 'hour' : `${h} hours`}`
  }
  if (secs % 60 === 0) {
    const m = secs / 60
    return `per ${m === 1 ? 'minute' : `${m} minutes`}`
  }
  return `per ${secs} seconds`
}

function fmtCountdown(expiry: number, now: number): { text: string; expired: boolean; urgent: boolean } {
  const diff = expiry - Math.floor(now / 1000)
  if (diff <= 0) return { text: 'Expired', expired: true, urgent: false }
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  let text: string
  if (d > 0) text = `Expires in ${d}d ${h}h`
  else if (h > 0) text = `Expires in ${h}h ${m}m`
  else if (m > 0) text = `Expires in ${m}m`
  else text = 'Expires in under a minute'
  return { text, expired: false, urgent: diff < 3600 }
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

type KeyStatus = 'active' | 'expired' | 'revoked'

function StatusChip({ status }: { status: KeyStatus }) {
  if (status === 'revoked')
    return (
      <Chip tone="red">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        Revoked
      </Chip>
    )
  if (status === 'expired')
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
    <div className="animate-pulse rounded-2xl border border-text/10 bg-text/[0.03] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-5 w-40 rounded bg-text/10" />
        <div className="h-6 w-20 rounded-full bg-text/10" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="h-7 w-32 rounded-full bg-text/10" />
        <div className="h-7 w-36 rounded-full bg-text/10" />
        <div className="h-7 w-28 rounded-full bg-text/10" />
      </div>
      <div className="mt-4 h-2 w-full rounded-full bg-text/10" />
      <div className="mt-4 h-10 w-28 rounded-full bg-text/10" />
    </div>
  )
}

/* ----------------------- revoke wiring (F9 module) ------------------------ */
/* Worker F9 owns the wallet stack (Reown AppKit + wagmi) and the real
 * revokeSessionKey() implementation. We dynamic-import so the page renders
 * (with Revoke disabled + reason) before that module exists.              */

interface RevokeRequest {
  account: string
  sessionKey: string
  policyHash?: string
  ownerAddress: string
}
type RevokeFn = (req: RevokeRequest) => Promise<{ txHash: string }>

const REVOKE_MODULE_PATHS = [
  '../../lib/sessionKeyOps',
  '../lib/sessionKeyOps',
  '../../lib/revoke',
  '../lib/revoke',
]

async function loadRevokeModule(): Promise<RevokeFn | null> {
  for (const p of REVOKE_MODULE_PATHS) {
    try {
      const mod: any = await import(/* @vite-ignore */ p)
      if (typeof mod?.revokeSessionKey === 'function') return mod.revokeSessionKey as RevokeFn
      if (typeof mod?.default === 'function') return mod.default as RevokeFn
    } catch {
      /* module not landed yet — try next candidate */
    }
  }
  return null
}

/* --------------------------------- page ----------------------------------- */

export default function SessionKeys({ accountAddress, connectedAddress }: SessionKeysProps) {
  const [searchParams] = useSearchParams()
  const account = accountAddress ?? searchParams.get('account') ?? ''

  const [state, setState] = useState<LoadState>('loading')
  const [policies, setPolicies] = useState<Policy[]>([])
  const [errorDetail, setErrorDetail] = useState<string>('')
  const [now, setNow] = useState(Date.now())

  const [revokeWired, setRevokeWired] = useState(false)
  const [confirmKey, setConfirmKey] = useState<Policy | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [revokedTx, setRevokedTx] = useState<{ key: string; txHash: string } | null>(null)
  const revokeRef = useRef<RevokeFn | null>(null)

  const fetchPolicies = useCallback(async () => {
    if (!account) {
      setState('empty')
      return
    }
    setState('loading')
    setErrorDetail('')
    try {
      const res = await fetch(`${API_BASE}/api/accounts/${account}/policies`)
      if (res.status === 404) {
        setPolicies([])
        setState('empty')
        return
      }
      if (!res.ok) throw new Error(`API responded ${res.status}`)
      const data = await res.json()
      const list: Policy[] = Array.isArray(data.policies) ? data.policies : []
      setPolicies(list)
      setState(list.length === 0 ? 'empty' : 'ready')
    } catch (e: any) {
      setErrorDetail(e?.message ?? 'Network error')
      setState('error')
    }
  }, [account])

  useEffect(() => {
    void fetchPolicies()
  }, [fetchPolicies])

  // Keep expiry countdowns honest while the page is open.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Probe for F9's revoke module (disabled-with-reason until it lands).
  useEffect(() => {
    let cancelled = false
    void loadRevokeModule().then((fn) => {
      if (cancelled) return
      revokeRef.current = fn
      setRevokeWired(fn !== null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function keyStatus(p: Policy): KeyStatus {
    if (p.revoked) return 'revoked'
    if (p.expiry > 0 && p.expiry <= Math.floor(now / 1000)) return 'expired'
    return 'active'
  }

  function revokeDisabledReason(p: Policy): string | null {
    const status = keyStatus(p)
    if (status === 'revoked') return 'Already revoked — there is nothing left to stop.'
    if (status === 'expired') return 'The pass already expired — there is nothing left to revoke.'
    if (!revokeWired || !revokeRef.current) return 'Revoking is still being wired to a real on-chain transaction — it stays disabled until the wallet module lands.'
    if (!connectedAddress) return 'Connect the owner wallet to revoke a key.'
    if (connectedAddress.toLowerCase() !== p.owner.toLowerCase())
      return 'Only the account owner can revoke this key.'
    return null
  }

  async function doRevoke(p: Policy) {
    const fn = revokeRef.current
    if (!fn || !connectedAddress) return
    setRevoking(true)
    setRevokeError(null)
    try {
      const { txHash } = await fn({
        account,
        sessionKey: p.sessionKey,
        policyHash: p.policyHash,
        ownerAddress: connectedAddress,
      })
      setRevokedTx({ key: p.sessionKey, txHash })
      setConfirmKey(null)
      void fetchPolicies() // re-read from chain — the chain is truth
    } catch (e: any) {
      setRevokeError(e?.shortMessage ?? e?.message ?? 'The transaction did not go through.')
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
          onAction={() => (window.location.href = '/app/accounts')}
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
          onRetry={() => void fetchPolicies()}
        />
      )}

      {state === 'empty' && (
        <EmptyState
          title="No session keys yet"
          description="A session key is a hall pass for your agent: it can spend, but only within the bounds you set. Create one to get started."
          actionLabel="Set up your first hall pass"
          onAction={() => (window.location.href = `/app/policy?account=${account}`)}
        />
      )}

      {state === 'ready' && (
        <div className="flex flex-col gap-4">
          {policies.map((p, i) => {
            const status = keyStatus(p)
            const cd = p.expiry > 0 ? fmtCountdown(p.expiry, now) : null
            const cap = usdcDisplay(p.perTxCapUsdc, p.perTxCapWei)
            const windowCap = usdcDisplay(p.windowCapUsdc, p.windowCapWei)
            const spent = usdcDisplay(p.windowSpentUsdc, p.windowSpentWei)
            const reason = revokeDisabledReason(p)
            const spentPct = (() => {
              try {
                const used = BigInt(p.windowSpentWei || '0')
                const capW = BigInt(p.windowCapWei || '0')
                if (capW === 0n) return 0
                const pct = Number((used * 100n) / capW)
                return Math.min(100, Math.max(0, pct))
              } catch {
                return 0
              }
            })()

            return (
              <motion.div
                key={p.sessionKey}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.06, 0.3) }}
                className={`rounded-2xl border p-5 sm:p-6 ${
                  status === 'revoked'
                    ? 'border-red-400/20 bg-text/[0.02]'
                    : 'border-text/10 bg-text/[0.03]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-body text-xs uppercase tracking-wider text-text/40">Session key</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-text">
                      {truncate(p.sessionKey)}
                      <CopyButton value={p.sessionKey} label="session key address" />
                    </p>
                  </div>
                  <StatusChip status={status} />
                </div>

                {/* Policy summary chips: cap · expiry countdown · destinations */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Chip tone="amber">
                    ≤ {cap} USDC per payment
                  </Chip>
                  <Chip>
                    ≤ {windowCap} USDC {fmtWindow(p.windowSecs)}
                  </Chip>
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
                    {p.allowlist.length === 0 ? (
                      <span>Any destination — caps still apply</span>
                    ) : (
                      <span>
                        {p.allowlist.length} {p.allowlist.length === 1 ? 'destination' : 'destinations'}
                      </span>
                    )}
                  </Chip>
                </div>

                {/* Window spend */}
                <div className="mt-4">
                  <div className="flex items-center justify-between font-body text-xs text-text/50">
                    <span>
                      {spent} of {windowCap} USDC used this window
                    </span>
                    <span>{spentPct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-text/10">
                    <div
                      className="h-full rounded-full bg-amber transition-all duration-500"
                      style={{ width: `${spentPct}%` }}
                    />
                  </div>
                </div>

                {p.policyHash && (
                  <p className="mt-3 font-body text-xs text-text/40">
                    Policy committed on-chain:{' '}
                    <span className="font-mono">{truncate(p.policyHash)}</span>
                    <CopyButton value={p.policyHash} label="policy hash" />
                  </p>
                )}

                {/* Revoke */}
                <div className="mt-5">
                  <button
                    type="button"
                    disabled={reason !== null}
                    onClick={() => {
                      setRevokeError(null)
                      setConfirmKey(p)
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
      )}

      {/* Confirm dialog — plain words, no jargon */}
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
                <span className="font-mono font-semibold">{truncate(confirmKey.sessionKey)}</span>.
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
