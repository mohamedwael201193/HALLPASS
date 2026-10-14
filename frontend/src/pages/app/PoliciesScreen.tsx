/**
 * PoliciesScreen — the Policies nav screen (route /app/policy).
 *
 * Top: "What the plugin enforces" — the live on-chain policy for the chosen
 * account in plain language (spend caps, allowed targets, expiry, token
 * coverage). Every sentence is backed by policies() on Arc mainnet.
 * Below: the PolicyEditor with Save wired to the REAL updatePolicy(...)
 * transaction through the account fallback (bible §4.2 — never wrapped in
 * account.execute, which reverts on-chain).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { isAddress, zeroAddress, type Address } from 'viem';
import type { UseHallpass } from '../../lib/useHallpass';
import { EURC_ADDRESS, USDC_ADDRESS } from '../../lib/contracts';
import {
  CopyButton,
  HallpassGate,
  SectionError,
  Skeleton,
  WalletDownState,
  truncateAddress,
} from './shared';
import TapeEmptyState, { TapePrimaryAction } from '../../components/TapeEmptyState';
import { PolicyEditor, type OnChainPolicyValues } from './PolicyEditor';

function tokenLabel(t: Address): string {
  if (t.toLowerCase() === USDC_ADDRESS.toLowerCase()) return 'USDC';
  if (t.toLowerCase() === EURC_ADDRESS.toLowerCase()) return 'EURC';
  return truncateAddress(t);
}

function fmtWindow(secs: bigint): string {
  const s = Number(secs);
  if (!s || s <= 0) return 'a rolling window';
  if (s % 86400 === 0) {
    const d = s / 86400;
    return d === 1 ? 'a rolling day' : `a rolling ${d} days`;
  }
  if (s % 3600 === 0) {
    const h = s / 3600;
    return h === 1 ? 'a rolling hour' : `a rolling ${h} hours`;
  }
  return `a rolling ${s} seconds`;
}

function fmtDate(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/* ------------------------------------------------------------------ */
/* The plain-language enforcement panel                                */
/* ------------------------------------------------------------------ */

interface PolicyView {
  sessionKey: Address;
  owner: Address;
  perTxCapWei: bigint;
  windowCapWei: bigint;
  windowSecs: bigint;
  expiry: bigint;
  allowlist: Address[];
  tokens: Address[];
  revoked: boolean;
}

function EnforcementPanel({ p, hp }: { p: PolicyView; hp: UseHallpass }) {
  const now = Math.floor(Date.now() / 1000);
  const expired = p.expiry > 0n && p.expiry <= BigInt(now);
  const dest =
    p.allowlist.length === 0
      ? 'anyone — there is no destination limit, the caps still apply'
      : p.allowlist.length === 1
        ? 'one address only'
        : `${p.allowlist.length} addresses only`;
  const tokens =
    p.tokens.length > 0 ? p.tokens.map(tokenLabel).join(' and ') : 'USDC';

  const rules: Array<{ t: string; d: string }> = [
    {
      t: `At most ${hp.formatNativeUsdc(p.perTxCapWei)} USDC in a single payment`,
      d: 'A bigger payment is refused by the chain before anything moves.',
    },
    {
      t: `At most ${hp.formatNativeUsdc(p.windowCapWei)} USDC in ${fmtWindow(p.windowSecs)}`,
      d: 'The window resets on its own timer; the agent cannot spend ahead of it.',
    },
    {
      t: `The agent may pay ${dest}`,
      d:
        p.allowlist.length === 0
          ? 'An empty destination list is the open mode from the contract: anyone can be paid, within the caps.'
          : 'Anything else reverts with RecipientNotAllowed — nothing is spent.',
    },
    {
      t:
        p.expiry === 0n
          ? 'No expiry is set on this pass'
          : `The pass stops working ${fmtDate(p.expiry)}`,
      d:
        p.expiry === 0n
          ? 'It stays valid until you revoke it or replace it.'
          : 'After that, every payment from the key reverts until you extend it.',
    },
    {
      t: `The caps cover ${tokens}`,
      d: 'The plugin scales the shared caps into each token’s own decimals.',
    },
  ];

  return (
    <section
      aria-label="What the plugin enforces"
      className="rounded-2xl border border-amber/25 bg-amber/[0.05] p-5 md:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold text-text md:text-2xl">
          What the plugin enforces
        </h2>
        {p.revoked ? (
          <span className="rounded-full border border-[#B0523C]/40 bg-[#B0523C]/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#E08A73]">
            Revoked
          </span>
        ) : expired ? (
          <span className="rounded-full border border-text/20 bg-text/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-text/60">
            Expired
          </span>
        ) : (
          <span className="rounded-full border border-amber/30 bg-amber/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber">
            Enforcing now
          </span>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-1 text-sm text-text/60">
        <span>Session key</span>
        <span className="font-mono text-text/85">
          {truncateAddress(p.sessionKey)}
        </span>
        <CopyButton value={p.sessionKey} label="Copy session key" />
        <span>· read live from the HallpassPlugin on Arc</span>
      </p>
      <ul className="mt-5 space-y-4">
        {rules.map((r) => (
          <li key={r.t} className="flex gap-3">
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber"
              aria-hidden
            />
            <div>
              <p className="font-semibold text-text">{r.t}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-text/60">
                {r.d}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {p.revoked || expired ? (
        <p className="mt-5 rounded-xl border border-text/10 bg-text/[0.04] p-4 text-sm leading-relaxed text-text/65">
          This pass no longer authorizes spending. Install a fresh one from the{' '}
          <Link to="/app/marketplace" className="font-semibold text-amber hover:underline">
            marketplace
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

type LoadState =
  | { status: 'loading' }
  | { status: 'unavailable'; reason: string }
  | { status: 'none' }
  | { status: 'error'; error: string }
  | { status: 'ready'; policy: PolicyView };

function PoliciesLive({ hp }: { hp: UseHallpass }) {
  const [searchParams] = useSearchParams();
  const accountParam = searchParams.get('account') ?? '';
  const account: Address | null =
    accountParam && isAddress(accountParam)
      ? (accountParam as Address)
      : null;

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  const load = useCallback(() => {
    if (!account) {
      setState({ status: 'loading' });
      return;
    }
    if (hp.pluginConfigError) {
      setState({ status: 'unavailable', reason: hp.pluginConfigError });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    hp
      .getPolicy(account)
      .then((p) => {
        if (cancelled) return;
        if (p.sessionKey.toLowerCase() === zeroAddress) {
          setState({ status: 'none' });
          return;
        }
        setState({
          status: 'ready',
          policy: {
            sessionKey: p.sessionKey,
            owner: p.owner,
            perTxCapWei: p.perTxCapWei,
            windowCapWei: p.windowCapWei,
            windowSecs: p.windowSecs,
            expiry: p.expiry,
            allowlist: Array.isArray(p.allowlist) ? p.allowlist : [],
            tokens: Array.isArray(p.tokens) ? p.tokens : [],
            revoked: p.revoked,
          },
        });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({
            status: 'error',
            error: e instanceof Error ? e.message : 'Could not read the policy.',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [account, hp]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load, nonce]);

  const handleSave = useCallback(
    async (values: OnChainPolicyValues): Promise<{ txHash: string }> => {
      if (!account) throw new Error('No account selected.');
      // Window/tokens carry over from the live policy — the editor only
      // changes per-payment cap, expiry and destinations.
      const current = await hp.getPolicy(account);
      const txHash = await hp.updatePolicy(account, {
        sessionKey: current.sessionKey,
        owner: current.owner,
        perTxCapWei: values.perTxCapWei,
        windowCapWei: current.windowCapWei,
        windowSecs: current.windowSecs,
        expiry: values.expiryUnix,
        allowlist: values.allowlist.map((a) => a as Address),
        tokens: current.tokens,
        tokenDecimals: current.tokenDecimals,
      });
      setNonce((n) => n + 1); // re-read the enforcement panel from chain
      return { txHash };
    },
    [account, hp],
  );

  const saveDisabledReason: string | null = hp.walletSetupError
    ? `Wallet setup incomplete: ${hp.walletSetupError}`
    : !hp.isConnected
      ? 'Connect the owner wallet to save a policy.'
      : !hp.isArc
        ? 'Switch to the Arc network (chain 5042) to save.'
        : hp.pluginConfigError;

  if (!account) {
    return (
      <TapeEmptyState
        title="Choose an account first."
        copy="Policies live on a specific smart account. Pick one and its live rules appear here, in plain language."
        action={
          <TapePrimaryAction to="/app/accounts">
            Go to my accounts
          </TapePrimaryAction>
        }
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <p className="font-body text-sm text-text/50">
        <Link to="/app/accounts" className="text-amber hover:text-amber/80">
          My accounts
        </Link>
        <span className="mx-2">/</span>Policies
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">
        Policies
      </h1>
      <p className="mt-2 flex flex-wrap items-center gap-1 font-body text-sm text-text/60 sm:text-base">
        <span>Account</span>
        <span className="font-mono">{truncateAddress(account)}</span>
        <CopyButton value={account} label="Copy account address" />
      </p>

      <div className="mt-6 space-y-6">
        {state.status === 'loading' && (
          <div aria-label="Loading policy">
            <Skeleton className="h-40" />
            <Skeleton className="mt-4 h-64" />
          </div>
        )}

        {state.status === 'unavailable' && (
          <div className="rounded-2xl border border-amber/30 bg-amber/[0.06] p-6 md:p-8">
            <h2 className="font-display text-xl font-extrabold text-text">
              Policy reads unavailable
            </h2>
            <p className="mt-2 leading-relaxed text-text/70">
              {state.reason}
            </p>
            <button
              type="button"
              disabled
              title={state.reason}
              className="mt-5 min-h-[52px] cursor-not-allowed rounded-full bg-text/10 px-8 font-display font-bold text-text/40"
            >
              Edit policy
            </button>
          </div>
        )}

        {state.status === 'none' && (
          <TapeEmptyState
            title="No hall pass on this account yet."
            copy="The plugin holds no session key for this account, so there is nothing to enforce — and nothing to edit. Install one first."
            action={
              <TapePrimaryAction to="/app/marketplace">
                Install a hall pass
              </TapePrimaryAction>
            }
          />
        )}

        {state.status === 'error' && (
          <SectionError
            message="Couldn't read this account's policy from the chain."
            cause={state.error}
            onRetry={() => setNonce((n) => n + 1)}
          />
        )}

        {state.status === 'ready' && (
          <>
            <EnforcementPanel p={state.policy} hp={hp} />
            <PolicyEditor
              sessionKeyAddress={state.policy.sessionKey}
              initialPolicy={{
                perTxCapWei: state.policy.perTxCapWei,
                expiryUnix: state.policy.expiry,
                allowlist: state.policy.allowlist.map((a) => ({
                  address: a,
                })),
              }}
              onSave={handleSave}
              saveDisabledReason={
                saveDisabledReason ??
                'Saving is unavailable for an unknown reason — nothing was changed.'
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

export default function PoliciesScreen() {
  return (
    <HallpassGate
      render={(hp) => <PoliciesLive hp={hp} />}
      fallback={<WalletDownState />}
    />
  );
}
