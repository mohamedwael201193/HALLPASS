import type { ReactNode } from 'react'

/**
 * PolicyCard — one plugin in the Hallpass marketplace.
 *
 * Design standard §2 module skeleton (7 slots, in order):
 *   label → contents list → fine-print asterisk → imperative how-to →
 *   name as heading → one-line tagline → bespoke visual.
 *
 * Presentational only: all chain truth and all wallet actions live in the
 * parent (Marketplace.tsx). This card never touches the network and never
 * fakes a state — every badge and every button state arrives as props.
 *
 * Tokens: Tailwind theme (ink #121110, amber #FFB224, text #FFF9EF).
 */

export type InstallState = 'checking' | 'installed' | 'not-installed' | 'coming-soon'

export type VerificationNote =
  | 'exact'
  | 'partial'
  | 'none'
  | 'unknown'
  | 'manifest-mismatch'
  | 'no-code'
  | 'onchain-ok'

export interface PluginMeta {
  id: string
  /** Slot 1 — small label, e.g. "PLUGIN · SESSION POLICY". */
  label: string
  /** Slot 2 — contents list: plain-language "what this does" bullets. */
  enforces: string[]
  /** Slot 3 — asterisk-led fine print (caveats). */
  finePrint: string
  /** Slot 4 — imperative how-to paragraph. */
  howTo: string
  /** Slot 5 — product/feature name as heading. */
  name: string
  /** Slot 6 — one-line tagline, sentence case, ends with a period. */
  tagline: string
  /** Slot 7 — bespoke visual key. */
  visual: 'hallpass' | 'caps' | 'typeddata'
  /** Deployed plugin address on Arc mainnet. Omit when not configured. */
  address?: string
  /** keccak256(abi.encode(pluginManifest())) for the deployed build, if known. */
  manifestHash?: string
  live: boolean
}

export interface PolicyCardProps {
  plugin: PluginMeta
  installState: InstallState
  verification?: VerificationNote
  installDisabled: boolean
  /** Exact plain-language reason shown while Install is disabled. Never omitted. */
  installDisabledReason?: string
  installing: boolean
  uninstalling: boolean
  uninstallArmed: boolean
  /** Inline policy form, rendered inside the live card only. */
  policyForm?: ReactNode
  /** Inline destructive-confirm, rendered by the parent when uninstall is armed. */
  confirmUninstall?: ReactNode
  onInstall: () => void
  onArmUninstall: () => void
}

function verificationCopy(v: VerificationNote | undefined): string | null {
  switch (v) {
    case 'exact':
      return 'Source verified on Sourcify (exact match).'
    case 'partial':
      return 'Source partially verified on Sourcify — install stays off until it is an exact match.'
    case 'none':
      return 'Source not verified on Sourcify — install stays off until the production build is verified (exact match).'
    case 'manifest-mismatch':
      return 'UNVERIFIED: the on-chain manifest does not match the configured one. Install is blocked.'
    case 'no-code':
      return 'UNVERIFIED: no contract code at this address on Arc mainnet. Install is blocked.'
    case 'onchain-ok':
      return 'On-chain checks pass: contract code present, valid plugin interface, manifest hash recorded on-chain.'
    default:
      return 'Verification status unknown — install stays off until it can be confirmed.'
  }
}

/* Slot 7 — hand-made inline SVG. Stroke-only; no animation (dashboard). */
function PluginVisual({ kind, dimmed }: { kind: PluginMeta['visual']; dimmed: boolean }) {
  const stroke = dimmed ? '#6B6259' : '#FFB224'
  const inner =
    kind === 'hallpass' ? (
      <g fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="20" width="104" height="64" rx="8" />
        <line x1="36" y1="20" x2="36" y2="84" strokeDasharray="5 5" />
        <path d="M50 44l8 8 16-18" />
        <circle cx="98" cy="34" r="3" />
      </g>
    ) : kind === 'caps' ? (
      <g fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="28" width="104" height="48" rx="8" />
        <line x1="60" y1="28" x2="60" y2="76" />
        <path d="M22 52h24M74 52h24" />
      </g>
    ) : (
      <g fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="20" y="14" width="80" height="76" rx="8" />
        <line x1="32" y1="32" x2="88" y2="32" />
        <line x1="32" y1="46" x2="88" y2="46" />
        <path d="M48 66l8 8 16-18" />
      </g>
    )
  return (
    <svg
      width="120"
      height="104"
      viewBox="0 0 120 104"
      role="img"
      aria-label={dimmed ? 'Plugin illustration, coming soon' : 'Plugin illustration'}
      className={dimmed ? 'opacity-55' : undefined}
    >
      {inner}
    </svg>
  )
}

function StatusWord({ state }: { state: InstallState }) {
  const text =
    state === 'installed'
      ? 'Installed'
      : state === 'not-installed'
        ? 'Not installed'
        : state === 'coming-soon'
          ? 'Coming soon'
          : 'Checking…'
  const cls =
    state === 'installed' ? 'text-amber' : state === 'checking' ? 'text-text/50' : 'text-text/60'
  return <span className={`ml-3 text-sm font-bold ${cls}`}>{text}</span>
}

export default function PolicyCard(props: PolicyCardProps) {
  const { plugin, installState } = props
  const comingSoon = installState === 'coming-soon' || !plugin.live
  const verCopy = verificationCopy(props.verification)

  return (
    <article
      aria-label={plugin.name}
      data-testid={`plugin-card-${plugin.id}`}
      className={`rounded-2xl border border-text/10 bg-white/[0.03] p-6 sm:p-8 ${
        comingSoon ? 'opacity-75' : ''
      }`}
    >
      {/* Slot 1 — label */}
      <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.2em] text-text/50">
        {plugin.label}
        <StatusWord state={installState} />
      </p>

      {/* Slot 2 — contents list */}
      <ul className="mb-3 space-y-1.5 pl-5 font-body text-base leading-relaxed text-text">
        {plugin.enforces.map((line) => (
          <li key={line} className="list-disc">
            {line}
          </li>
        ))}
      </ul>

      {/* Slot 3 — fine print */}
      <p className="mb-4 font-body text-[13px] leading-relaxed text-text/50">*{plugin.finePrint}</p>

      {/* Slot 4 — imperative how-to */}
      {!comingSoon && (
        <p className="mb-6 max-w-[60ch] font-body text-[15px] leading-relaxed text-text/85">
          {plugin.howTo}
        </p>
      )}

      {/* Slot 5 — name as heading */}
      <h2 className="font-display mb-2 text-2xl font-extrabold tracking-tight text-text sm:text-[28px]">
        {plugin.name}
      </h2>

      {/* Slot 6 — tagline */}
      <p className="mb-5 font-body text-base text-text/60">{plugin.tagline}</p>

      {/* Slot 7 — bespoke visual */}
      <div className="mb-5">
        <PluginVisual kind={plugin.visual} dimmed={comingSoon} />
      </div>

      {plugin.address && (
        <div className="mb-4 space-y-1.5 font-body text-[13px] leading-relaxed text-text/50">
          <p>
            Contract <code className="break-all text-text">{plugin.address}</code>
          </p>
          <p>
            <a
              href={`https://repo.sourcify.dev/5042/${plugin.address}`}
              target="_blank"
              rel="noreferrer"
              className="text-amber underline decoration-dotted underline-offset-4 hover:text-amber/80"
            >
              View the source on Sourcify
            </a>
          </p>
          {plugin.manifestHash && (
            <p>
              Manifest hash <code className="break-all text-text">{plugin.manifestHash}</code>
            </p>
          )}
          {verCopy && <p>{verCopy}</p>}
        </div>
      )}

      {comingSoon ? (
        <p className="max-w-[60ch] font-body text-[15px] text-text/60">
          Not available yet. There is deliberately no install button here — nothing on
          this card can take your signature or your money.
        </p>
      ) : (
        <>
          {props.policyForm}
          {props.uninstallArmed && props.confirmUninstall ? (
            props.confirmUninstall
          ) : installState === 'installed' ? (
            <div className="mt-6">
              <button
                type="button"
                disabled={props.uninstalling}
                onClick={props.onArmUninstall}
                className="min-h-[44px] rounded-[10px] border border-red-400/40 bg-transparent px-6 py-2.5 font-body text-[15px] font-bold text-red-300 transition-colors hover:border-red-300 disabled:cursor-wait disabled:opacity-60"
              >
                {props.uninstalling ? 'Removing…' : 'Uninstall'}
              </button>
            </div>
          ) : (
            <div className="mt-6">
              <button
                type="button"
                disabled={props.installDisabled || props.installing}
                onClick={props.onInstall}
                aria-describedby={`install-why-${plugin.id}`}
                className={`min-h-[48px] rounded-[10px] px-7 py-3 font-body text-base font-extrabold transition-all duration-200 ${
                  props.installDisabled
                    ? 'cursor-not-allowed bg-text/10 text-text/40'
                    : 'bg-amber text-ink hover:bg-amber/90 active:scale-[0.97]'
                } ${props.installing ? 'cursor-wait' : ''}`}
              >
                {props.installing ? (
                  <span className="inline-flex items-center">
                    <span
                      aria-hidden
                      className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink border-t-transparent"
                    />
                    Installing…
                  </span>
                ) : (
                  'Install'
                )}
              </button>
              {props.installDisabled && props.installDisabledReason && (
                <p
                  id={`install-why-${plugin.id}`}
                  className="mt-3 max-w-[60ch] font-body text-sm text-amber"
                >
                  {props.installDisabledReason}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </article>
  )
}
