/**
 * PolicyEditor — F7.
 *
 * Screen (d) of the dashboard (frontend prompt §6): edit ONE session key's
 * policy — per-transaction cap, expiry, destination allowlist — with a live
 * "what this allows" preview that updates as you type.
 *
 * Spec sources: build bible §4.2 (policy amounts are native wei, 18 decimals;
 * `updatePolicy` is an installed execution function called through the account
 * fallback) and §8.4 (plain-language controls, exact-values row, validation);
 * design standard §6 (react-hook-form + zod as the only form pattern), §7
 * (dashboard simplicity checklist), §9 (HALLPASS identity tokens).
 *
 * HARD RULES honoured here:
 * - Save NEVER fakes success. Until F9 wires the real on-chain update, the
 *   Save button is disabled with the exact reason shown inline. When wired,
 *   it reports the real tx hash + explorer link, or the real error.
 * - Every value shown comes from props (read from chain by the parent screen).
 * - Plain words, zero jargon. Amber accents. Mobile-usable.
 * - Preview panel: sentence case, 16–18px, ~60ch measure (design standard §1).
 * - INP < 200ms: every keystroke/drag does only string state updates plus
 *   one cheap parseUnits; no layout reads, no heavy computation in render.
 * - No animations on this screen beyond the save-button spinner, which stops
 *   under prefers-reduced-motion. No shaders, no cursor gimmicks on dashboard.
 *
 * WIRING (for F9 / the dashboard worker): pass `onSave` — a function that
 * submits the real `updatePolicy(...)` transaction through the account and
 * resolves with `{ txHash }`. Leave it out and the button stays disabled with
 * the reason below. Mount at `/app/policy` (F1 owns App.tsx routes).
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getAddress, isAddress, parseUnits } from 'viem'
import { EmptyState } from '../../components/EmptyState'

/* ------------------------------------------------------------------ */
/* Types + validation schema                                           */
/* ------------------------------------------------------------------ */

export interface AllowlistEntry {
  address: string
  label: string
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

const addressEntrySchema = z.object({
  address: z
    .string()
    .trim()
    .min(1, 'Paste the destination address here.')
    .refine(
      (v: string): boolean => isAddress(v),
      'That address doesn’t look right — it should start with 0x and be 42 characters long.',
    ),
  label: z.string(),
})

const policyFormSchema = z.object({
  perTxCapUsdc: z
    .string()
    .trim()
    .min(1, 'Type an amount, like 0.10.')
    .refine(
      (v) => {
        const n = Number(v)
        return Number.isFinite(n) && n > 0
      },
      'Cap must be more than 0 — type an amount like 0.10.',
    )
    .refine(
      (v) => {
        try {
          parseUnits(v, 18)
          return true
        } catch {
          return false
        }
      },
      'That amount can’t be turned into an on-chain value — use at most 18 decimals.',
    ),
  expiryLocal: z
    .string()
    .min(1, 'Pick a date and time for the expiry.')
    .refine((v) => {
      const ms = new Date(v).getTime()
      return !Number.isNaN(ms)
    }, 'That date and time could not be read — pick it from the calendar.')
    .refine((v) => {
      const ms = new Date(v).getTime()
      return ms > Date.now()
    }, 'Expiry must be in the future — a hall pass that already ended protects nothing.'),
  allowlist: z.array(addressEntrySchema),
})

type PolicyFormValues = z.infer<typeof policyFormSchema>

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function truncateAddress(a: string): string {
  return a.length > 13 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

function formatUsdc(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
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

function defaultValuesFor(initialPolicy?: PolicyEditorProps['initialPolicy']): PolicyFormValues {
  return {
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
  }
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces (design tokens §9)                       */
/* ------------------------------------------------------------------ */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-body text-base font-semibold text-ink">{children}</p>
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 font-body text-sm leading-relaxed text-ink/55">{children}</p>
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-1 font-body text-sm font-medium leading-relaxed text-[#b0523c]">
      {children}
    </p>
  )
}

/** Button-internal spinner: transform-only; stops under prefers-reduced-motion. */
function ButtonSpinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    />
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
  const navigate = useNavigate()

  const {
    register,
    control,
    watch,
    formState: { errors, isValid },
  } = useForm<PolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
    mode: 'onChange',
    defaultValues: defaultValuesFor(initialPolicy),
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'allowlist' })

  const [copied, setCopied] = useState(false)
  const [showExact, setShowExact] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedTx, setSavedTx] = useState<string | null>(null)

  // Live values for the preview — cheap reads, no heavy work per keystroke.
  const perTxCapUsdc = watch('perTxCapUsdc')
  const expiryLocal = watch('expiryLocal')
  const allowlistWatched = watch('allowlist')

  const formValid = isValid
  const expiryUnix = toUnixSeconds(expiryLocal)

  /* ---------------- on-chain values (exact, for the collapsible row) ---------------- */

  const onChain: OnChainPolicyValues | null = useMemo(() => {
    if (!formValid || expiryUnix === null) return null
    let wei: bigint
    try {
      wei = parseUnits(perTxCapUsdc.trim(), 18)
    } catch {
      return null
    }
    return {
      perTxCapWei: wei,
      expiryUnix: BigInt(expiryUnix),
      allowlist: allowlistWatched.map((r) => {
        try {
          return getAddress(r.address.trim())
        } catch {
          return r.address.trim()
        }
      }),
    }
  }, [formValid, expiryUnix, perTxCapUsdc, allowlistWatched])

  /* ---------------- live preview — plain-words imperative block ----------------
     Sentence case, 16–18px, ~60ch measure (design standard §1). Updates as
     you type; stays honest when a field is invalid or empty. */

  const preview = useMemo(() => {
    const capError = errors.perTxCapUsdc
    const expiryError = errors.expiryLocal
    const capPart = capError
      ? 'an unset per-payment amount'
      : `up to ${formatUsdc(perTxCapUsdc.trim())} USDC per payment`
    let destPart: string
    if (allowlistWatched.length === 0) {
      destPart = 'to anyone — there are no destination limits'
    } else {
      const labels = allowlistWatched
        .map((r) => r.label.trim() || truncateAddress(r.address))
        .filter(Boolean)
      const n = allowlistWatched.length
      destPart = `only to ${n === 1 ? 'this 1 destination' : `these ${n} destinations`}${
        labels.length ? ` (${labels.join(', ')})` : ''
      }`
    }
    const expiryPart =
      expiryError || expiryUnix === null
        ? 'with no valid expiry set yet'
        : `until ${formatDateTime(new Date(expiryUnix * 1000))}`
    return `Your agent may spend ${capPart}, ${destPart}, ${expiryPart}.`
  }, [errors.perTxCapUsdc, errors.expiryLocal, perTxCapUsdc, allowlistWatched, expiryUnix])

  /* ---------------- save (real tx only — never faked) ---------------- */

  const saveBlocker: string | null = !formValid
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

  /* ---------------- no session key → shared empty state, one CTA ---------------- */

  if (!sessionKeyAddress) {
    return (
      <EmptyState
        title="No session key selected"
        description="Pick a session key first, then set its bounds here."
        actionLabel="Go to my accounts"
        onAction={() => navigate('/app/accounts')}
      />
    )
  }

  const key = sessionKeyAddress
  const sliderValue = (() => {
    const n = Number(perTxCapUsdc)
    if (!Number.isFinite(n)) return 0
    return Math.min(Math.max(n, 0), 1)
  })()

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-body text-xs font-semibold uppercase tracking-widest text-amber">
            Hall pass policy
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-text sm:text-4xl">
            Set this key&rsquo;s hall pass
          </h1>
        </div>
        <Link
          to="/app/accounts"
          className="min-h-[44px] rounded-full border border-text/20 px-5 py-2.5 font-body text-sm font-semibold text-text transition-colors hover:border-amber hover:text-amber"
        >
          ← All keys
        </Link>
      </div>

      {/* Session key identity — one fact, one row */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-text/10 bg-text/5 px-5 py-4">
        <span className="inline-block h-3 w-3 shrink-0 rounded-full bg-amber" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-body text-xs text-text/50">Session key — the agent&rsquo;s hot key</p>
          <p className="break-all font-mono text-sm text-text sm:text-base" title={key}>
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
          className="min-h-[44px] rounded-full border border-text/20 px-4 py-2 font-body text-xs font-semibold text-text transition-colors hover:border-amber hover:text-amber"
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
                aria-label="Max per payment slider, 0 to 1 USDC"
                className="h-2 min-h-[44px] w-full cursor-pointer accent-[#ffb224]"
                {...register('perTxCapUsdc')}
                value={sliderValue}
                onChange={(e) =>
                  register('perTxCapUsdc').onChange({
                    target: { name: 'perTxCapUsdc', value: e.target.value },
                  })
                }
              />
              <div className="relative w-32 shrink-0">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Max per payment in USDC"
                  className="min-h-[44px] w-full rounded-xl border border-ink/20 bg-white py-3 pl-3 pr-12 font-body text-base font-semibold text-ink focus:border-[#ffb224] focus:outline-none"
                  {...register('perTxCapUsdc')}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-body text-xs text-ink/50">
                  USDC
                </span>
              </div>
            </div>
            {errors.perTxCapUsdc && <FieldError>{errors.perTxCapUsdc.message}</FieldError>}
            {!errors.perTxCapUsdc && Number(perTxCapUsdc) > 1 && (
              <FieldHint>Slider shows up to 1 USDC — the typed value above is what counts.</FieldHint>
            )}
          </div>

          <hr className="my-7 border-ink/10" />

          {/* Expiry */}
          <div>
            <FieldLabel>Expires</FieldLabel>
            <FieldHint>
              When the hall pass ends. After this, the agent&rsquo;s payments stop
              working until you extend it.
            </FieldHint>
            <input
              type="datetime-local"
              aria-label="Policy expiry date and time"
              className="mt-3 min-h-[44px] w-full rounded-xl border border-ink/20 bg-white px-3 py-3 font-body text-base text-ink focus:border-[#ffb224] focus:outline-none"
              {...register('expiryLocal')}
            />
            {errors.expiryLocal ? (
              <FieldError>{errors.expiryLocal.message}</FieldError>
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
            <div className="flex items-center justify-between gap-2">
              <FieldLabel>Allowed destinations</FieldLabel>
              <button
                type="button"
                onClick={() => append({ address: '', label: '' })}
                className="min-h-[44px] rounded-full bg-ink px-4 py-2 font-body text-xs font-semibold text-text transition-transform hover:scale-105"
              >
                + Add destination
              </button>
            </div>
            <FieldHint>
              Leave the list empty and the agent can pay anyone — the caps still
              apply. Add addresses to restrict it to just these.
            </FieldHint>

            {fields.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-ink/20 px-4 py-3 font-body text-sm leading-relaxed text-ink/60">
                No destinations yet — the agent may pay anyone, within the caps above.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {fields.map((field, i) => (
                  <li key={field.id} className="rounded-xl border border-ink/15 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-body text-sm font-semibold text-ink/60">
                        Destination {i + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="min-h-[44px] rounded-full px-4 py-2 font-body text-xs font-semibold text-[#b0523c] transition-colors hover:bg-[#b0523c]/10"
                        aria-label={`Remove destination ${i + 1}`}
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="0x… (42 characters)"
                      spellCheck={false}
                      aria-label={`Destination ${i + 1} address`}
                      className="mt-2 min-h-[44px] w-full rounded-lg border border-ink/20 px-3 py-2.5 font-mono text-sm text-ink focus:border-[#ffb224] focus:outline-none"
                      {...register(`allowlist.${i}.address`)}
                    />
                    {errors.allowlist?.[i]?.address && (
                      <FieldError>{errors.allowlist[i]?.address?.message}</FieldError>
                    )}
                    <input
                      type="text"
                      placeholder="Label — e.g. API provider (optional)"
                      aria-label={`Destination ${i + 1} label`}
                      className="mt-2 min-h-[44px] w-full rounded-lg border border-ink/20 px-3 py-2.5 font-body text-sm text-ink focus:border-[#ffb224] focus:outline-none"
                      {...register(`allowlist.${i}.label`)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Exact on-chain values — collapsible, user-verifiable */}
          <div className="mt-7">
            <button
              type="button"
              onClick={() => setShowExact((s) => !s)}
              aria-expanded={showExact}
              className="min-h-[44px] font-body text-sm font-semibold text-ink/70 underline decoration-[#ffb224] decoration-2 underline-offset-4"
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

        {/* ---------------- Live preview + save ---------------- */}
        <section aria-label="What this allows" className="flex flex-col gap-6">
          <div className="rounded-2xl border border-[#ffb224]/40 bg-text/5 p-6 sm:p-8">
            <p className="font-body text-xs font-semibold uppercase tracking-widest text-amber">
              What this allows
            </p>
            {/* Plain-words block: sentence case, 16–18px, ~60ch measure. */}
            <p className="mt-4 max-w-[60ch] font-body text-lg leading-relaxed text-text">
              {preview}
            </p>
            {!formValid && (
              <p className="mt-3 max-w-[60ch] font-body text-sm leading-relaxed text-text/50">
                Finish the details on the left to see the full summary — and to
                enable saving.
              </p>
            )}
          </div>

          {/* ONE primary action per screen (design standard §7.1). */}
          <div className="rounded-2xl border border-text/10 bg-text/5 p-6 sm:p-8">
            {savedTx ? (
              <div role="status" aria-live="polite">
                <p className="font-display text-xl font-bold text-amber">
                  Policy saved on-chain ✓
                </p>
                <p className="mt-2 max-w-[60ch] break-all font-body text-sm leading-relaxed text-text/70">
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
                  className="mt-4 min-h-[44px] rounded-full border border-text/20 px-5 py-2.5 font-body text-sm font-semibold text-text transition-colors hover:border-amber hover:text-amber"
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
                  aria-busy={saving}
                  className={`flex min-h-[56px] w-full items-center justify-center gap-3 rounded-full py-4 font-display text-lg font-bold transition-all ${
                    saveBlocker !== null || saving
                      ? 'cursor-not-allowed bg-text/10 text-text/40'
                      : 'bg-amber text-ink hover:bg-amber/90 active:scale-[0.98]'
                  }`}
                >
                  {saving && <ButtonSpinner />}
                  {saving ? 'Waiting for your wallet…' : 'Save policy on-chain'}
                </button>
                {saveBlocker && (
                  <p role="note" className="mt-3 max-w-[60ch] font-body text-sm leading-relaxed text-text/60">
                    Save is unavailable: {saveBlocker}
                  </p>
                )}
                {!saveBlocker && (
                  <p className="mt-3 max-w-[60ch] font-body text-sm leading-relaxed text-text/60">
                    Saving asks your wallet to sign one real transaction. Your current
                    on-chain policy stays in force until the new one confirms.
                  </p>
                )}
                {saveError && (
                  <p
                    role="alert"
                    aria-live="assertive"
                    className="mt-3 max-w-[60ch] font-body text-sm font-medium leading-relaxed text-[#e08a70]"
                  >
                    {saveError}
                  </p>
                )}
              </>
            )}
          </div>

          <p className="max-w-[60ch] font-body text-xs leading-relaxed text-text/40">
            The old policy keeps protecting the account until the new transaction is
            confirmed — there is never a gap where the agent is unbounded.
          </p>
        </section>
      </div>
    </div>
  )
}

export default PolicyEditor
