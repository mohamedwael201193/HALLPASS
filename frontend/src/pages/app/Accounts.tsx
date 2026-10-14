// F5 — (b) Accounts. The user's smart accounts + installed plugins.
//
// Data sources (all real, all labeled):
//   - account list: localStorage registry of addresses the USER added
//     (never seeded — an empty registry is an honest empty state)
//   - balances + plugin count: Arc mainnet via eth_call (chain-sourced)
//   - plugin details: GET /api/v1/accounts/:address (CONTRACT.md §4.2,
//     unreachable API is stated plainly with a retry — never papered over)
//
// Four states per screen/section: main / empty / loading / error.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type Ref,
} from 'react';
import { Link } from 'react-router-dom';
import { isAddress, type Address } from 'viem';
import { publicClient, formatNativeUsdc, formatEurc, getTokenBalance, EURC_ADDRESS } from '../../lib/contracts';
import TokenIcon from '../../components/TokenIcon';
import GetEurcPanel from '../../components/GetEurcPanel';
import type { UseHallpass } from '../../lib/useHallpass';
import {
  ApiError,
  CopyButton,
  EmptyState,
  HallpassGate,
  IconPlug,
  IconShield,
  IconWallet,
  SectionError,
  Skeleton,
  WalletDownState,
  explorerAddressUrl,
  explorerTxUrl,
  fetchAccountPlugins,
  loadTrackedAccounts,
  plainError,
  saveTrackedAccounts,
  truncateAddress,
  type PluginInfo,
} from './shared';

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status?: string }) {
  const v = (status ?? '').toLowerCase();
  const style =
    v === 'active'
      ? 'border-amber/30 bg-amber/15 text-amber'
      : v === 'revoked'
        ? 'border-[#B0523C]/40 bg-[#B0523C]/15 text-[#E08A73]'
        : 'border-text/20 bg-text/10 text-text/60';
  return (
    <span
      className={`inline-block rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${style}`}
    >
      {status && status.trim() ? status : 'Unknown'}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: React.ReactNode;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-text/10 bg-text/[0.03] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text/50">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-extrabold text-text">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-text/50">{sub}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per-account plugin list (API-sourced)                               */
/* ------------------------------------------------------------------ */

type PluginsState =
  | { status: 'loading' }
  | { status: 'ok'; plugins: PluginInfo[] }
  | { status: 'error'; error: string };

function PluginList({ account }: { account: Address }) {
  const [state, setState] = useState<PluginsState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    setState({ status: 'loading' });
    fetchAccountPlugins(account, controller.signal)
      .then((plugins) => setState({ status: 'ok', plugins }))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') {
          setState({
            status: 'error',
            error: 'The request timed out after 10 seconds.',
          });
        } else if (e instanceof ApiError) {
          setState({ status: 'error', error: e.message });
        } else {
          setState({ status: 'error', error: plainError(e) });
        }
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [account, nonce]);

  if (state.status === 'loading') {
    return (
      <div className="space-y-3" aria-label="Loading plugins">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <SectionError
        message="Couldn't load plugin details."
        cause={state.error}
        onRetry={() => setNonce((n) => n + 1)}
      />
    );
  }

  if (state.plugins.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-text/20 p-6 text-center">
        <p className="text-text/75">No plugins installed yet.</p>
        <Link
          to="/app/marketplace"
          className="mt-3 inline-flex min-h-[48px] items-center rounded-full bg-amber px-6 font-display font-bold text-ink"
        >
          Browse the marketplace
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {state.plugins.map((p) => (
        <li
          key={p.address}
          className="rounded-xl border border-text/10 bg-text/[0.03] p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-amber">
                <IconShield className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-display font-bold text-text">
                  {p.name?.trim() ? p.name : 'Policy plugin'}
                </p>
                <a
                  href={explorerAddressUrl(p.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-text/50 hover:text-amber"
                >
                  {truncateAddress(p.address)}
                </a>
              </div>
            </div>
            <StatusBadge status={p.status} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text/50">
            {p.policyHash ? (
              <span>
                Policy{' '}
                <span className="font-mono">{truncateAddress(p.policyHash)}</span>
              </span>
            ) : null}
            {p.installTxHash ? (
              <a
                href={explorerTxUrl(p.installTxHash)}
                target="_blank"
                rel="noreferrer"
                className="hover:text-amber"
              >
                Install tx ↗
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* One account card (balances + plugin count from chain)               */
/* ------------------------------------------------------------------ */

type ChainState =
  | { status: 'loading' }
  | {
      status: 'ready';
      usdc: bigint;
      eurc: bigint;
      native: bigint;
      chainPlugins: Address[];
    }
  | { status: 'error'; error: string };

function AccountCard({
  account,
  hp,
  onRemove,
}: {
  account: Address;
  hp: UseHallpass;
  onRemove: (a: Address) => void;
}) {
  const [chain, setChain] = useState<ChainState>({ status: 'loading' });
  const [confirmRemove, setConfirmRemove] = useState(false);

  const reloadChain = useCallback(() => {
    let cancelled = false;
    setChain({ status: 'loading' });
    Promise.all([
      hp.getUsdcBalance(account),
      getTokenBalance(publicClient, EURC_ADDRESS, account),
      publicClient.getBalance({ address: account }),
      hp.getInstalledPlugins(account),
    ])
      .then(([usdc, eurc, native, chainPlugins]) => {
        if (!cancelled) setChain({ status: 'ready', usdc, eurc, native, chainPlugins });
      })
      .catch((e: unknown) => {
        if (!cancelled) setChain({ status: 'error', error: plainError(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [account, hp]);

  useEffect(() => reloadChain(), [reloadChain]);

  return (
    <article className="rounded-2xl border border-text/10 bg-text/[0.02] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-sm text-text/85 md:text-base">
            {truncateAddress(account)}
          </span>
          <CopyButton value={account} label="Copy account address" />
          <a
            href={explorerAddressUrl(account)}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-text/50 transition-colors hover:text-amber"
            title="View on Arc explorer"
            aria-label="View account on Arc explorer"
          >
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
              <path d="M8 4h8v8M12 8L4 16" />
              <path d="M12 4H7a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-5" opacity="0.45" />
            </svg>
          </a>
        </div>
        {confirmRemove ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text/60">Stop tracking?</span>
            <button
              type="button"
              onClick={() => onRemove(account)}
              className="min-h-[44px] rounded-full bg-[#B0523C]/20 px-4 text-sm font-bold text-[#E08A73]"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="min-h-[44px] rounded-full border border-text/20 px-4 text-sm font-semibold text-text/70"
            >
              Keep
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="min-h-[44px] rounded-full px-3 text-xs font-semibold text-text/40 transition-colors hover:text-[#E08A73]"
          >
            Remove
          </button>
        )}
      </div>

      <div className="mt-4">
        {chain.status === 'loading' && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Loading balances">
            <Skeleton className="h-[76px]" />
            <Skeleton className="h-[76px]" />
            <Skeleton className="h-[76px]" />
            <Skeleton className="h-[76px]" />
          </div>
        )}
        {chain.status === 'error' && (
          <SectionError
            message="Couldn't read this account from the chain."
            cause={chain.error}
            onRetry={reloadChain}
          />
        )}
        {chain.status === 'ready' && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <TokenIcon token="USDC" size={16} /> USDC balance
                  </span>
                }
                value={formatNativeUsdc(chain.usdc)}
                sub="18 decimals"
              />
              <StatCard
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <TokenIcon token="EURC" size={16} /> EURC balance
                  </span>
                }
                value={formatEurc(chain.eurc)}
                sub="6 decimals"
              />
              <StatCard
                label="Gas balance"
                value={formatNativeUsdc(chain.native)}
                sub="native USDC · 18 decimals"
              />
              <StatCard
                label="Plugins on-chain"
                value={String(chain.chainPlugins.length)}
                sub="via getInstalledPlugins()"
              />
            </div>
            {hp.address && (
              <div className="mt-4">
                <GetEurcPanel address={hp.address} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-text/50">
          Installed plugins
        </p>
        <PluginList account={account} />
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Add-account form — validates on-chain before anything is listed     */
/* ------------------------------------------------------------------ */

function AddAccountForm({
  hp,
  existing,
  onAdd,
  onClose,
  inputRef,
}: {
  hp: UseHallpass;
  existing: Address[];
  onAdd: (a: Address) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const candidate = value.trim();
    setError(null);
    if (!isAddress(candidate)) {
      setError("That doesn't look like an address — check for typos and try again.");
      return;
    }
    if (existing.some((a) => a.toLowerCase() === candidate.toLowerCase())) {
      setError('That account is already in your list.');
      return;
    }
    setBusy(true);
    try {
      const code = await publicClient.getCode({ address: candidate });
      if (!code || code === '0x') {
        setError('No contract lives at that address — smart accounts are contracts.');
        return;
      }
      await hp.getInstalledPlugins(candidate); // throws if not an MSCA-style account
      onAdd(candidate);
      setValue('');
    } catch (err) {
      setError(
        "That contract doesn't answer like a smart account. " +
          plainError(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-amber/25 bg-amber/[0.04] p-5 md:p-6"
    >
      <label
        htmlFor="add-account-address"
        className="font-display text-lg font-bold text-text"
      >
        Add a smart account
      </label>
      <p className="mt-1 text-sm text-text/60">
        Paste the address of your Circle smart account. It's checked on-chain
        before it appears in your list.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          ref={inputRef as Ref<HTMLInputElement>}
          id="add-account-address"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          className="min-h-[52px] flex-1 rounded-xl border border-text/20 bg-ink px-4 font-mono text-sm text-text placeholder:text-text/30 focus:border-amber/60 focus:outline-none"
        />
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-amber px-8 font-display font-bold text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  viewBox="0 0 20 20"
                  className="h-5 w-5 animate-spin"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden
                >
                  <path d="M10 2a8 8 0 0 1 8 8" strokeLinecap="round" />
                </svg>
                Checking…
              </span>
            ) : (
              'Add account'
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[52px] rounded-full border border-text/20 px-6 font-semibold text-text/70"
          >
            Cancel
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-[#E08A73]">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function AccountsLive({ hp }: { hp: UseHallpass }) {
  const [tracked, setTracked] = useState<Address[]>(() => loadTrackedAccounts());
  const [showAdd, setShowAdd] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openAdd = useCallback(() => {
    setShowAdd(true);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const addAccount = useCallback((a: Address) => {
    setTracked((prev) => {
      const next = [...prev, a];
      saveTrackedAccounts(next);
      return next;
    });
    setShowAdd(false);
  }, []);

  const removeAccount = useCallback((a: Address) => {
    setTracked((prev) => {
      const next = prev.filter((x) => x.toLowerCase() !== a.toLowerCase());
      saveTrackedAccounts(next);
      return next;
    });
  }, []);

  if (!hp.isConnected) {
    return (
      <EmptyState
        icon={<IconWallet />}
        line="Connect your wallet to see your smart accounts."
        action={
          <button
            type="button"
            onClick={hp.connect}
            className="inline-flex min-h-[56px] items-center rounded-full bg-amber px-8 font-display text-lg font-extrabold text-ink"
          >
            Connect wallet
          </button>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-text md:text-4xl">
            Accounts
          </h1>
          <p className="mt-1 text-text/60">
            Your Circle smart accounts on Arc — balances and plugins read live
            from chain.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex min-h-[52px] items-center rounded-full bg-amber px-7 font-display font-bold text-ink transition-transform duration-200 hover:scale-[1.03]"
        >
          Add account
        </button>
      </div>

      {showAdd ? (
        <div className="mb-6">
          <AddAccountForm
            hp={hp}
            existing={tracked}
            onAdd={addAccount}
            onClose={() => setShowAdd(false)}
            inputRef={inputRef}
          />
        </div>
      ) : null}

      {tracked.length === 0 && !showAdd ? (
        <EmptyState
          icon={<IconPlug />}
          line="No smart accounts yet. Add one to install its first hall pass."
          action={
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex min-h-[56px] items-center rounded-full bg-amber px-8 font-display text-lg font-extrabold text-ink"
            >
              Add your first account
            </button>
          }
        />
      ) : (
        <div className="space-y-5">
          {tracked.map((a) => (
            <AccountCard key={a} account={a} hp={hp} onRemove={removeAccount} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Accounts() {
  return (
    <HallpassGate
      render={(hp) => <AccountsLive hp={hp} />}
      fallback={<WalletDownState />}
    />
  );
}
