/**
 * PolicyEditor — F7.
 *
 * Screen (d) of the dashboard (frontend prompt §6): edit ONE session key's
 * policy — per-transaction cap, expiry, destination allowlist — with a live
 * "what this allows" preview that updates as you type.
 *
 * Spec sources: build bible §4.2 (policy amounts are native wei, 18 decimals;
 * `updatePolicy` is an installed execution function called through the account
 * fallback) and §8.4 (plain-language controls, exact-values row, validation).
 *
 * HARD RULES honoured here:
 * - Save NEVER fakes success. Until F9 wires the real on-chain update, the
 *   Save button is disabled with the exact reason shown inline. When wired,
 *   it reports the real tx hash + explorer link, or the real error.
 * - Every value shown comes from props (read from chain by the parent screen).
 * - Plain words, zero jargon. Amber accents. Mobile-usable.
 *
 * WIRING (for F9 / the dashboard worker): pass `onSave` — a function that
 * submits the real `updatePolicy(...)` transaction through the account and
 * resolves with `{ txHash }`. Leave it out and the button stays disabled with
 * the reason below. Mount at `/app/policy` (F1 owns App.tsx routes).
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAddress, isAddress, parseUnits } from 'viem'
import { EmptyState } from '../../components/EmptyState'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface AllowlistEntry {
  address: string
  label: string
}

export interface SessionPolicyDraft {
  perTxCapUsdc: string
  /** Local "YYYY-MM-DDTHH:mm" from a datetime-local input. */
  expiryLocal: string
  allowlist: AllowlistEntry[]
}

export interface OnChainPolicyValues {
  perTxCapWei: bigint
  expiryUnix: bigint
  allowlist: string[]
}

export interface PolicyEditorProps {
  /** The session key (agent's hot key) this policy belongs to. */
  sessionKeyAddress?: string
  /** Current on-chain policy, to pre-fill the form. Amounts in native wei (18 decimals). */
  initialPolicy?: {
    perTxCapWei?: bigint
    expiryUnix?: bigint
    allowlist?: Array<{ address: string; label?: string }>
  }
  /**
   * F9's wiring point. When present AND the form is valid, Save is enabled and
   * calls this with the exact on-chain values. Must submit the REAL
   * `updatePolicy(...)` tx through the account and resolve with the real hash.
   * Omit it and Save stays disabled with `saveDisabledReason` shown.
   */
  onSave?: (policy: OnChainPolicyValues) => Promise<{ txHash: string }>
  /** Why Save is unavailable while unwired (shown inline). */
  saveDisabledReason?: string
}

const EXPLORER_TX = 'https://explorer.arc.io/tx/'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function truncateAddress(a: string): string {
  return a.length > 13 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

function formatUsdc(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  // Up to 6 decimals (ERC-20 USDC), no trailing zeros.
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

function toUnixSeconds(local: string): number | null {
  if (!local) return null
  const ms = new Date(local).getTime()
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000)
}

function toLocalInputValue(unix: bigint): string {
  const d = new Date(Number(unix) * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function isValidAddress(v: string): boolean {
  return isAddress(v.trim())
}

function checksummed(v: string): string {
  try {
    return getAddress(v.trim())
  } catch {
    return v.trim()
  }
}

/* ------------------------------------------------------------------ */
/* Field components                                                    */
/* ------------------------------------------------------------------ */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-body text-sm font-semibold text-ink">{children}</p>
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 font-body text-xs text-ink/55">{children}</p>
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-1 font-body text-xs font-medium text-[#b0523c]">
      {children}
    </p>
  )
}

/* ------------------------------------------------------------------ */
/* The editor                                                          */
/* ------------------------------------------------------------------ */

export function PolicyEditor({
  sessionKeyAddress,
  initialPolicy,
  onSave,
  saveDisabledReason = 'Saving is still being connected to the on-chain policy contract — nothing will be sent until the connection is live.',
}: PolicyEditorProps) {
  const [draft, setDraft] = useState<SessionPolicyDraft>(() => ({
    perTxCapUsdc:
      initialPolicy?.perTxCapWei !== undefined
        ? (Number(initialPolicy.perTxCapWei) / 1e18).toString()
        : '0.10',
    expiryLocal:
      initialPolicy?.expiryUnix !== undefined && initialPolicy.expiryUnix > 0n
        ? toLocalInputValue(initialPolicy.expiryUnix)
        : '',
    allowlist: (initialPolicy?.allowlist ?? []).map((e) => ({
      address: e.address,
      label: e.label ?? '',
    })),
  }))
  const [copied, setCopied] = useState(false)
  const [showExact, setShowExact] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedTx, setSavedTx] = useState<string | null>(null)

  /* ---------------- validation (human words, never raw errors) ---------------- */

  const capNum = Number(draft.perTxCapUsdc)
  const capError =
    draft.perTxCapUsdc.trim() === '' || !Number.isFinite(capNum) || capNum <= 0
      ? 'Cap must be more than 0 — type an amount like 0.10.'
      : null

  const expiryUnix = toUnixSeconds(draft.expiryLocal)
  const expiryError = !draft.expiryLocal
    ? 'Pick a date and time for the expiry.'
    : expiryUnix === null
      ? 'That date and time could not be read — pick it from the calendar.'
      : expiryUnix * 1000 <= Date.now()
        ? 'Expiry must be in the future — a hall pass that already ended protects nothing.'
        : null

  const allowlistErrors: Record<number, string> = {}
  draft.allowlist.forEach((row, i) => {
    if (!row.address.trim()) {
      allowlistErrors[i] = 'Paste the destination address here.'
    } else if (!isValidAddress(row.address)) {
      allowlistErrors[i] = 'That address doesn’t look right — it should start with 0x and be 42 characters long.'
    }
  })
  const formValid = !capError && !expiryError && Object.keys(allowlistErrors).length === 0

  /* ---------------- on-chain values (exact, for the collapsible row) ---------------- */

  const onChain: OnChainPolicyValues | null = useMemo(() => {
    if (!formValid || expiryUnix === null) return null
    let wei: bigint
    try {
      wei = parseUnits(draft.perTxCapUsdc.trim(), 18)
    } catch {
      return null
    }
    return {
      perTxCapWei: wei,
      expiryUnix: BigInt(expiryUnix),
      allowlist: draft.allowlist.map((r) => checksummed(r.address)),
    }
  }, [draft, formValid, expiryUnix])

  /* ---------------- live preview sentence ---------------- */

  const preview = useMemo(() => {
    const capPart = capError ? 'an unset per-payment amount' : `up to ${formatUsdc(draft.perTxCapUsdc.trim())} USDC per payment`
    let destPart: string
    if (draft.allowlist.length === 0) {
      destPart = 'to anyone — there are no destination limits'
    } else {
      const labels = draft.allowlist
        .map((r) => r.label.trim() || truncateAddress(r.address))
        .filter(Boolean)
      const n = draft.allowlist.length
      destPart = `only to ${n === 1 ? 'this 1 destination' : `these ${n} destinations`}${labels.length ? ` (${labels.join(', ')})` : ''}`
    }
    const expiryPart = expiryError || expiryUnix === null
      ? 'with no valid expiry set yet'
      : `until ${formatDateTime(new Date(expiryUnix * 1000))}`
    return `Your agent may spend ${capPart}, ${destPart}, ${expiryPart}.`
  }, [draft, capError, expiryError, expiryUnix])

  /* ---------------- save (real tx only — never faked) ---------------- */

  const saveBlocker: string | null =
    !sessionKeyAddress
      ? 'Select a session key first — there is nothing to save a policy for.'
      : !formValid
        ? 'Fix the problems marked above before saving.'
        : !onSave
          ? saveDisabledReason
          : null

  async function handleSave() {
    if (saveBlocker || !onSave || !onChain) return
    setSaving(true)
    setSaveError(null)
    setSavedTx(null)
    try {
      const { txHash } = await onSave(onChain)
      if (!txHash || !txHash.startsWith('0x')) {
        throw new Error('The transaction did not return a hash — it may not have been sent.')
      }
      setSavedTx(txHash)
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? `The policy could not be saved: ${e.message}`
          : 'The policy could not be saved. Nothing changed on-chain — your old policy is still in force.',
      )
    } finally {
      setSaving(false)
    }
  }

  /* ---------------- no session key → named next action, no dead end ---------------- */

  const navigate = useNavigate()
  if (!sessionKeyAddress) {
    return (
      <EmptyState
        title="No session key selected"
        description="A policy belongs to one session key. Pick the key first, then set its bounds here."
        actionLabel="Go to my accounts"
        onAction={() => navigate('/app/accounts')}
      />
    )
  }

  const key = sessionKeyAddress

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-body text-xs font-semibold uppercase tracking-widest text-amber">
            Hall pass policy
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-text sm:text-4xl">
            Set this key’s hall pass
          </h1>
        </div>
        <Link
          to="/app/accounts"
          className="rounded-full border border-text/20 px-5 py-2.5 font-body text-sm font-semibold text-text transition-colors hover:border-amber hover:text-amber"
        >
          ← All keys
        </Link>
      </div>

      {/* Session key identity */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-text/10 bg-text/5 px-5 py-4">
        <span className="inline-block h-3 w-3 rounded-full bg-amber" aria-hidden />
        <div className="min-w-0">
          <p className="font-body text-xs text-text/50">Session key (the agent’s hot key)</p>
          <p className="font-mono text-sm text-text sm:text-base" title={key}>
            {key}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(key)
              .then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
              .catch(() => undefined)
          }}
          className="ml-auto rounded-full border border-text/20 px-4 py-2 font-body text-xs font-semibold text-text transition-colors hover:border-amber hover:text-amber"
          aria-label="Copy session key address"
        >
          {copied ? 'Copied ✓' : 'Copy address'}
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* ---------------- Editor card ---------------- */}
        <section
          aria-label="Policy editor"
          className="rounded-2xl bg-cream p-6 text-ink sm:p-8"
        >
          {/* Per-transaction cap */}
          <div>
            <FieldLabel>Max per payment</FieldLabel>
            <FieldHint>
              The most the agent can spend in one payment. Slide, or type any amount.
            </FieldHint>
            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.005}
                value={Number.isFinite(capNum) ? Math.min(Math.max(capNum, 0), 1) : 0}
                onChange={(e) => setDraft((d) => ({ ...d, perTxCapUsdc: e.target.value }))}
                aria-label="Max per payment slider, 0 to 1 USDC"
                className="h-2 w-full min-h-[44px] cursor-pointer accent-[#ffb224]"
              />
              <div className="relative w-32 shrink-0">
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.perTxCapUsdc}
                  onChange={(e) => setDraft((d) => ({ ...d, perTxCapUsdc: e.target.value }))}
                  aria-label="Max per payment in USDC"
                  className="w-full rounded-xl border border-ink/20 bg-white py-3 pl-3 pr-12 font-body text-base font-semibold text-ink focus:border-[#ffb224] focus:outline-none"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-body text-xs text-ink/50">
                  USDC
                </span>
              </div>
            </div>
            {capError && <FieldError>{capError}</FieldError>}
            {!capError && Number(draft.perTxCapUsdc) > 1 && (
              <FieldHint>Slider shows up to 1 USDC — the typed value above is what counts.</FieldHint>
            )}
          </div>

          <hr className="my-7 border-ink/10" />

          {/* Expiry */}
          <div>
            <FieldLabel>Expires</FieldLabel>
            <FieldHint>
              When the hall pass ends. After this, the agent’s payments stop working
              until you extend it.
            </FieldHint>
            <input
              type="datetime-local"
              value={draft.expiryLocal}
              onChange={(e) => setDraft((d) => ({ ...d, expiryLocal: e.target.value }))}
              aria-label="Policy expiry date and time"
              className="mt-3 w-full rounded-xl border border-ink/20 bg-white px-3 py-3 font-body text-base text-ink focus:border-[#ffb224] focus:outline-none"
            />
            {expiryError ? (
              <FieldError>{expiryError}</FieldError>
            ) : (
              expiryUnix !== null && (
                <FieldHint>
                  Stored on-chain as {expiryUnix.toLocaleString('en-US')} (unix seconds).
                </FieldHint>
              )
            )}
          </div>

          <hr className="my-7 border-ink/10" />

          {/* Destination allowlist */}
          <div>
            <div className="flex items-center justify-between">
              <FieldLabel>Allowed destinations</FieldLabel>
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    allowlist: [...d.allowlist, { address: '', label: '' }],
                  }))
                }
                className="rounded-full bg-ink px-4 py-2 font-body text-xs font-semibold text-text transition-transform hover:scale-105"
              >
                + Add destination
              </button>
            </div>
            <FieldHint>
              Leave the list empty and the agent can pay anyone — the caps still
              apply. Add addresses to restrict it to just these.
            </FieldHint>

            {draft.allowlist.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-ink/20 px-4 py-3 font-body text-sm text-ink/60">
                No destinations yet — the agent may pay anyone, within the caps above.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {draft.allowlist.map((row, i) => (
                  <li key={i} className="rounded-xl border border-ink/15 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-body text-xs font-semibold text-ink/60">
                        Destination {i + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            allowlist: d.allowlist.filter((_, j) => j !== i),
                          }))
                        }
                        className="rounded-full px-3 py-1 font-body text-xs font-semibold text-[#b0523c] transition-colors hover:bg-[#b0523c]/10"
                        aria-label={`Remove destination ${i + 1}`}
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      type="text"
                      value={row.address}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          allowlist: d.allowlist.map((r, j) =>
                            j === i ? { ...r, address: e.target.value } : r,
                          ),
                        }))
                      }
                      placeholder="0x… (42 characters)"
                      spellCheck={false}
                      aria-label={`Destination ${i + 1} address`}
                      className="mt-2 w-full rounded-lg border border-ink/20 px-3 py-2.5 font-mono text-sm text-ink focus:border-[#ffb224] focus:outline-none"
                    />
                    {allowlistErrors[i] && <FieldError>{allowlistErrors[i]}</FieldError>}
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          allowlist: d.allowlist.map((r, j) =>
                            j === i ? { ...r, label: e.target.value } : r,
                          ),
                        }))
                      }
                      placeholder="Label — e.g. API provider (optional)"
                      aria-label={`Destination ${i + 1} label`}
                      className="mt-2 w-full rounded-lg border border-ink/20 px-3 py-2.5 font-body text-sm text-ink focus:border-[#ffb224] focus:outline-none"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Exact on-chain values */}
          <div className="mt-7">
            <button
              type="button"
              onClick={() => setShowExact((s) => !s)}
              aria-expanded={showExact}
              className="font-body text-sm font-semibold text-ink/70 underline decoration-[#ffb224] decoration-2 underline-offset-4"
            >
              {showExact ? 'Hide' : 'Show'} exact on-chain values
            </button>
            {showExact && (
              <dl className="mt-3 space-y-2 rounded-xl bg-ink/5 p-4 font-mono text-xs text-ink/80">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt>per-tx cap (wei, 18 decimals)</dt>
                  <dd className="break-all">{onChain ? onChain.perTxCapWei.toString() : '—'}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt>expiry (unix seconds)</dt>
                  <dd>{onChain ? onChain.expiryUnix.toString() : '—'}</dd>
                </div>
                <div>
                  <dt>allowlist</dt>
                  <dd className="mt-1 space-y-1">
                    {onChain && onChain.allowlist.length > 0 ? (
                      onChain.allowlist.map((a) => (
                        <p key={a} className="break-all">
                          {a}
                        </p>
                      ))
                    ) : (
                      <p>empty — anyone, caps apply</p>
                    )}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        </section>

        {/* ---------------- Live preview card ---------------- */}
        <section aria-label="What this allows" className="flex flex-col gap-6">
          <div className="rounded-2xl border border-[#ffb224]/40 bg-text/5 p-6 sm:p-8">
            <p className="font-body text-xs font-semibold uppercase tracking-widest text-amber">
              Live preview — updates as you type
            </p>
            <p className="mt-4 font-display text-2xl font-bold leading-snug text-text">
              {preview}
            </p>
            {!formValid && (
              <p className="mt-3 font-body text-sm text-text/50">
                Finish the details on the left to see the full summary — and to enable
                saving.
              </p>
            )}
          </div>

          {/* Save */}
          <div className="rounded-2xl border border-text/10 bg-text/5 p-6 sm:p-8">
            {savedTx ? (
              <div role="status">
                <p className="font-display text-xl font-bold text-amber">
                  Policy saved on-chain ✓
                </p>
                <p className="mt-2 break-all font-body text-sm text-text/70">
                  Transaction:{' '}
                  <a
                    href={`${EXPLORER_TX}${savedTx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber underline underline-offset-2"
                  >
                    {truncateAddress(savedTx)}
                  </a>
                </p>
                <button
                  type="button"
                  onClick={() => setSavedTx(null)}
                  className="mt-4 rounded-full border border-text/20 px-5 py-2.5 font-body text-sm font-semibold text-text transition-colors hover:border-amber hover:text-amber"
                >
                  Edit again
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  disabled={saveBlocker !== null || saving}
                  onClick={handleSave}
                  className={`w-full rounded-full py-4 font-display text-lg font-bold transition-all ${
                    saveBlocker !== null || saving
                      ? 'cursor-not-allowed bg-text/10 text-text/40'
                      : 'bg-amber text-ink hover:bg-amber/90 active:scale-[0.98]'
                  }`}
                >
                  {saving ? 'Waiting for your wallet…' : 'Save policy on-chain'}
                </button>
                {saveBlocker && (
                  <p role="note" className="mt-3 font-body text-sm text-text/60">
                    Save is unavailable: {saveBlocker}
                  </p>
                )}
                {!saveBlocker && (
                  <p className="mt-3 font-body text-sm text-text/60">
                    Saving asks your wallet to sign one real transaction. Your current
                    on-chain policy stays in force until the new one confirms.
                  </p>
                )}
                {saveError && (
                  <p role="alert" className="mt-3 font-body text-sm font-medium text-[#e08a70]">
                    {saveError}
                  </p>
                )}
              </>
            )}
          </div>

          <p className="font-body text-xs leading-relaxed text-text/40">
            The old policy keeps protecting the account until the new transaction is
            confirmed — there is never a gap where the agent is unbounded.
          </p>
        </section>
      </div>
    </div>
  )
}

export default PolicyEditor
