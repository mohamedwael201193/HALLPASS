// F5 — shared dashboard primitives for src/pages/app/*.
//
// Everything here is presentational or read-only except the registry
// (localStorage list of account addresses the user added) and the API client.
// No wallet logic: wallet state comes from src/lib via useHallpass().

import { Component, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isAddress, type Address } from 'viem';
import { arc, WALLET_SETUP_ERROR, WALLET_READY } from '../../lib/wagmi';
import { useHallpass, type UseHallpass } from '../../lib/useHallpass';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

export const EXPLORER_URL =
  arc.blockExplorers?.default.url ?? 'https://explorer.arc.io';
export const ARC_CHAIN_ID = arc.id;

const API_BASE = (
  import.meta.env as unknown as Record<string, string | undefined>
).VITE_API_BASE_URL ?? '';

const REGISTRY_KEY = 'hallpass.accounts.v1';

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export function truncateAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function explorerAddressUrl(a: string): string {
  return `${EXPLORER_URL}/address/${a}`;
}

export function explorerTxUrl(h: string): string {
  return `${EXPLORER_URL}/tx/${h}`;
}

/** 6-decimal ERC-20 USDC units → human string, e.g. 1250000n → "1.25". */
export function formatTokenUsdc(units: bigint): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole.toString()}${frac ? `.${frac}` : ''}`;
}

export function plainError(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

/* ------------------------------------------------------------------ */
/* Tracked-account registry (localStorage — addresses the user added). */
/* Never seeded, never faked: an empty registry renders an empty state. */
/* ------------------------------------------------------------------ */

export function loadTrackedAccounts(): Address[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (a): a is Address => typeof a === 'string' && isAddress(a),
    );
  } catch {
    return [];
  }
}

export function saveTrackedAccounts(accounts: Address[]): void {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(accounts));
  } catch {
    /* storage unavailable — the list simply won't persist */
  }
}

/* ------------------------------------------------------------------ */
/* API client — GET /api/v1/accounts/:address (CONTRACT.md §4.2)        */
/* RPC-backed: the chain is the source of truth for install state.      */
/* ------------------------------------------------------------------ */

export interface PluginInfo {
  address: string;
  name?: string;
  status?: string;
  policyHash?: string;
  manifestHash?: string;
  installedAt?: string;
  installTxHash?: string;
}

export class ApiError extends Error {
  kind: 'unreachable' | 'bad-status' | 'bad-data';
  constructor(kind: ApiError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

/**
 * Fetch installed plugins for one smart account from the backend API.
 * CONTRACT.md §4.2 — the response is read live from the account's
 * ERC-6900 plugin manager (source: "rpc"). No plugin installed is a normal
 * empty state (200 with pluginInstalled: false), not an error.
 * Throws ApiError (plain-language message) — never returns invented data.
 */
export async function fetchAccountPlugins(
  account: Address,
  signal: AbortSignal,
): Promise<PluginInfo[]> {
  const url = `${API_BASE}/api/v1/accounts/${account}`;
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    throw new ApiError(
      'unreachable',
      "Couldn't reach the plugin API. Check your connection and that the backend is running.",
    );
  }
  if (!res.ok) {
    let detail = `The plugin API answered with an error (HTTP ${res.status}).`;
    try {
      const body = await res.json();
      if (body?.error?.message) detail = body.error.message;
    } catch {
      /* keep generic detail */
    }
    throw new ApiError('bad-status', detail);
  }
  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(
      'bad-data',
      'The plugin API answered, but not with data this page understands.',
    );
  }
  if (!json || json.pluginInstalled !== true) return [];
  const addr = typeof json.pluginAddress === 'string' ? json.pluginAddress : '';
  if (!isAddress(addr)) return [];
  const policy = json.policy && typeof json.policy === 'object' ? json.policy : null;
  const info: PluginInfo = {
    address: addr,
    name: 'Hallpass policy plugin',
    status: policy && policy.revoked === true ? 'revoked' : 'active',
    policyHash: typeof json.policyHash === 'string' ? json.policyHash : undefined,
    installedAt:
      typeof json.installedAtBlock === 'number'
        ? `block ${json.installedAtBlock.toLocaleString()}`
        : undefined,
  };
  return [info];
}

/* ------------------------------------------------------------------ */
/* Wallet gate — P1 (2026-10-15): useHallpass() NEVER throws for the      */
/* unconfigured state (it returns a static DOWN object with zero wagmi    */
/* hooks called), so this gate renders the honest WalletDownState         */
/* directly — no error is ever raised, the console stays clean, and the   */
/* zero-page-errors requirement holds. WalletErrorBoundary remains as a   */
/* safety net for genuinely unexpected failures only.                     */
/* ------------------------------------------------------------------ */

export class WalletErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[hallpass] wallet layer failed to initialize:', error);
  }

  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}

function HallpassInner({
  render,
}: {
  render: (hp: UseHallpass) => ReactNode;
}) {
  const hp = useHallpass();
  if (!hp.walletReady) {
    // Config gap — nothing threw (P1): the honest state renders directly.
    return <WalletDownState />;
  }
  return <>{render(hp)}</>;
}

/** Honest fallback when the wallet stack can't initialize. Never fake. */
export function WalletDownState() {
  if (WALLET_SETUP_ERROR) {
    return (
      <div className="rounded-2xl border border-amber/30 bg-amber/[0.06] p-8 md:p-10">
        <h2 className="font-display text-2xl font-extrabold text-text">
          Wallet setup incomplete
        </h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-text/70">
          {WALLET_SETUP_ERROR}
        </p>
        <button
          type="button"
          disabled
          title={WALLET_SETUP_ERROR}
          className="mt-6 min-h-[52px] cursor-not-allowed rounded-full bg-text/10 px-8 font-display text-lg font-bold text-text/40"
        >
          Connect wallet
        </button>
        <p className="mt-3 text-sm text-text/50">
          The button stays disabled until the project ID is configured — nothing
          here is simulated.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-text/10 bg-text/[0.03] p-8 text-center md:p-10">
      <h2 className="font-display text-2xl font-extrabold text-text">
        Wallet connection is still being wired up
      </h2>
      <p className="mx-auto mt-3 max-w-xl leading-relaxed text-text/70">
        The wallet provider hasn't finished loading. Wait a moment and refresh —
        this page will never show a fake connected state.
      </p>
      <Link
        to="/app"
        className="mt-6 inline-block min-h-[48px] rounded-full border border-text/20 px-8 py-3 font-display font-bold text-text"
      >
        Back to Connect
      </Link>
    </div>
  );
}

export function HallpassGate({
  render,
  fallback,
}: {
  render: (hp: UseHallpass) => ReactNode;
  fallback?: ReactNode;
}) {
  if (!WALLET_READY) {
    // Config gap — the hook-calling inner component never mounts, so no
    // wagmi hook runs and nothing throws. Render the caller's compact
    // fallback when it has one, else the full WalletDownState.
    return <>{fallback ?? <WalletDownState />}</>;
  }
  return (
    <WalletErrorBoundary fallback={fallback ?? <WalletDownState />}>
      <HallpassInner render={render} />
    </WalletErrorBoundary>
  );
}

/* ------------------------------------------------------------------ */
/* Design-standard primitives                                          */
/* ------------------------------------------------------------------ */

/** Empty state formula: icon + ONE line + ONE action. */
export function EmptyState({
  icon,
  line,
  action,
}: {
  icon: ReactNode;
  line: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-text/10 bg-text/[0.03] px-6 py-14 text-center">
      <div className="mb-5 text-amber">{icon}</div>
      <p className="max-w-md text-lg leading-relaxed text-text/80">{line}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/** Loading skeleton block (transform-only shimmer, see index.css). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`hp-skeleton rounded-lg ${className}`} />;
}

/** Plain-language error adjacent to the failed element, with retry. */
export function SectionError({
  message,
  cause,
  onRetry,
}: {
  message: string;
  cause?: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[#B0523C]/40 bg-[#B0523C]/10 p-4"
    >
      <p className="font-semibold text-text">{message}</p>
      {cause ? <p className="mt-1 text-sm text-text/60">{cause}</p> : null}
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 min-h-[44px] rounded-full border border-text/25 px-5 text-sm font-semibold text-text transition-colors hover:border-amber/60 hover:text-amber"
      >
        Try again
      </button>
    </div>
  );
}

/** Copy-to-clipboard with inline feedback (no toast dependency). */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    window.setTimeout(() => setState('idle'), 1600);
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      title={label}
      aria-label={label}
      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-text/50 transition-colors hover:bg-text/10 hover:text-amber"
    >
      {state === 'copied' ? (
        <span className="px-2 text-xs font-bold text-amber">Copied</span>
      ) : state === 'failed' ? (
        <span className="px-2 text-xs font-bold text-[#E08A73]">
          Copy failed
        </span>
      ) : (
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="7" y="7" width="9" height="9" rx="2" />
          <path d="M4 13V6a2 2 0 0 1 2-2h7" />
        </svg>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Hand-made icons (no emoji, no stock)                                */
/* ------------------------------------------------------------------ */

export function IconWallet({ className = 'h-12 w-12' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="6" y="12" width="36" height="26" rx="6" />
      <path d="M6 20h36" />
      <circle cx="33" cy="29" r="2.2" fill="currentColor" stroke="none" />
      <path d="M14 12V9a3 3 0 0 1 3-3h14" opacity="0.6" />
    </svg>
  );
}

export function IconPlug({ className = 'h-12 w-12' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6v10M30 6v10" />
      <rect x="12" y="16" width="24" height="14" rx="4" />
      <path d="M24 30v12" />
      <path d="M17 42h14" opacity="0.6" />
    </svg>
  );
}

export function IconShield({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
      <path d="M9.5 12l2 2 3.5-4" />
    </svg>
  );
}
