/**
 * GetEurcPanel — "Get EURC" flow.
 *
 * Shown contextually: when the user picks EURC as a capped asset but holds
 * zero EURC, and next to EURC balances. Three REAL paths only:
 *  (a) SWAP via LI.FI — a live quote is probed at runtime from
 *      https://li.quest/v1/quote (the API moved off li.fi; the v1 path 404s).
 *      The Swap button renders ONLY when a live quote returns with a usable
 *      transactionRequest, and executes the real route through the connected
 *      wallet (ERC-20 approval first when the quote requires it). Any API
 *      error / no route → the button is hidden with a plain-language reason.
 *  (b) BRIDGE via CCTP — informational card only. No action buttons except a
 *      real clipboard copy of the CrossChainTokenService address.
 *  (c) BUY — text mention of Circle Onramp only. NO button (it isn't
 *      integrated; a dead button would violate the hard rule).
 *
 * HARD RULE honoured: every executable-looking control here executes a real
 * on-chain tx or is hidden/disabled with the exact reason, per the design
 * standard §7.6.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isAddress, parseUnits, zeroAddress, type Address, type Hex } from 'viem';
import { useAccount, useWalletClient } from 'wagmi';
import TokenIcon from './TokenIcon';
import {
  EURC_ADDRESS,
  USDC_ADDRESS,
  parsedErc20Abi,
  formatEurc,
  formatNativeUsdc,
  publicClient,
} from '../lib/contracts';
import { ARC_CHAIN_ID } from '../lib/wagmi';

const EXPLORER_TX = (h: string) => `https://explorer.arc.io/tx/${h}`;
const LIFI_QUOTE_URL = 'https://li.quest/v1/quote';

/* ------------------------------------------------------------------ */
/* Read-only token balances (no wallet needed)                          */
/* ------------------------------------------------------------------ */

export interface TokenBalances {
  usdc: bigint;
  eurc: bigint;
  loaded: boolean;
  error: string | null;
}

/** USDC + EURC balances for one address, read live from Arc. */
export function useTokenBalances(address?: Address): TokenBalances & { refetch: () => void } {
  const [state, setState] = useState<TokenBalances>({
    usdc: 0n,
    eurc: 0n,
    loaded: false,
    error: null,
  });

  const refetch = useCallback(async () => {
    if (!address || !isAddress(address)) {
      setState({ usdc: 0n, eurc: 0n, loaded: false, error: null });
      return;
    }
    try {
      const [usdc, eurc] = await Promise.all([
        publicClient.readContract({
          address: USDC_ADDRESS,
          abi: parsedErc20Abi,
          functionName: 'balanceOf',
          args: [address],
        }),
        publicClient.readContract({
          address: EURC_ADDRESS,
          abi: parsedErc20Abi,
          functionName: 'balanceOf',
          args: [address],
        }),
      ]);
      setState({ usdc: usdc as bigint, eurc: eurc as bigint, loaded: true, error: null });
    } catch (e) {
      setState((s) => ({
        ...s,
        loaded: true,
        error: e instanceof Error ? e.message : 'Could not read token balances.',
      }));
    }
  }, [address]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...state, refetch: () => void refetch() };
}

/* ------------------------------------------------------------------ */
/* LI.FI quote                                                         */
/* ------------------------------------------------------------------ */

interface LifiTxRequest {
  from: string;
  to: string;
  data: string;
  value?: string;
  gasPrice?: string;
  gasLimit?: string;
  chainId?: number;
}

interface LifiQuote {
  estimate: {
    toAmount: string;
    toAmountMin?: string;
    approvalAddress?: string;
  };
  transactionRequest?: LifiTxRequest;
  toolDetails?: { name?: string };
}

type QuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; quote: LifiQuote }
  | { status: 'error'; kind: 'rate-limited' | 'no-route' | 'other'; message: string };

const NO_ROUTE_MESSAGE =
  'No swap route on Arc yet — try the bridge or buy paths below.';

/** Live LI.FI quote probe. Throws nothing — returns a QuoteState. */
async function fetchLifiQuote(
  fromAddress: Address,
  fromAmountWei: bigint,
  signal: AbortSignal,
): Promise<QuoteState> {
  const params = new URLSearchParams({
    fromChain: String(ARC_CHAIN_ID),
    toChain: String(ARC_CHAIN_ID),
    fromToken: USDC_ADDRESS,
    toToken: EURC_ADDRESS,
    fromAmount: fromAmountWei.toString(),
    fromAddress,
  });
  let res: Response;
  try {
    res = await fetch(`${LIFI_QUOTE_URL}?${params.toString()}`, { signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return { status: 'idle' };
    return {
      status: 'error',
      kind: 'other',
      message: `Couldn't reach the swap service. ${NO_ROUTE_MESSAGE}`,
    };
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      if (typeof body?.message === 'string') detail = body.message;
    } catch {
      /* keep detail empty */
    }
    if (res.status === 429) {
      return {
        status: 'error',
        kind: 'rate-limited',
        message: `The swap service is rate-limited right now${detail ? ` (${detail})` : ''} — try again in a bit, or use the bridge or buy paths below.`,
      };
    }
    return {
      status: 'error',
      kind: 'no-route',
      message: detail ? `${NO_ROUTE_MESSAGE} (the service said: ${detail})` : NO_ROUTE_MESSAGE,
    };
  }
  let q: any;
  try {
    q = await res.json();
  } catch {
    return { status: 'error', kind: 'other', message: NO_ROUTE_MESSAGE };
  }
  const txReq = q?.transactionRequest as LifiTxRequest | undefined;
  const toAmount = q?.estimate?.toAmount as string | undefined;
  const usable =
    txReq &&
    isAddress(txReq.to) &&
    typeof txReq.data === 'string' &&
    txReq.data.startsWith('0x') &&
    typeof toAmount === 'string' &&
    /^\d+$/.test(toAmount) &&
    BigInt(toAmount) > 0n;
  if (!usable) {
    return { status: 'error', kind: 'no-route', message: NO_ROUTE_MESSAGE };
  }
  return { status: 'ready', quote: q as LifiQuote };
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function CopyAddressButton({ value }: { value: string }) {
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
      aria-label="Copy contract address"
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-text/20 px-4 py-2 font-body text-xs font-semibold text-text transition-colors hover:border-amber hover:text-amber"
    >
      {state === 'copied' ? (
        <span className="text-amber">Copied ✓</span>
      ) : state === 'failed' ? (
        <span className="text-[#E08A73]">Copy failed</span>
      ) : (
        <>
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
          Copy address
        </>
      )}
    </button>
  );
}

function ButtonSpinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    />
  );
}

function PathHeading({ step, title }: { step: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber/15 font-display text-sm font-extrabold text-amber">
        {step}
      </span>
      <h3 className="font-display text-lg font-bold text-text">{title}</h3>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The panel                                                           */
/* ------------------------------------------------------------------ */

export interface GetEurcPanelProps {
  /** The wallet whose balances are shown and whose USDC gets swapped. */
  address?: Address;
  /** Compact heading override, e.g. inside the session form. */
  title?: string;
}

type SwapState =
  | { status: 'idle' }
  | { status: 'working'; step: 'Approving USDC spend' | 'Swapping' }
  | { status: 'done'; txHash: Hex }
  | { status: 'error'; message: string };

export default function GetEurcPanel({ address, title }: GetEurcPanelProps) {
  const { address: connected, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const balances = useTokenBalances(address);

  const [amount, setAmount] = useState('1');
  const [quote, setQuote] = useState<QuoteState>({ status: 'idle' });
  const [swap, setSwap] = useState<SwapState>({ status: 'idle' });
  const quoteAbort = useRef<AbortController | null>(null);

  const amountWei: bigint | null = (() => {
    try {
      const v = parseUnits(amount.trim() === '' ? '0' : amount.trim(), 18);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  })();

  // Live quote probe — debounced. Runs only with a wallet address + valid amount.
  useEffect(() => {
    quoteAbort.current?.abort();
    if (!address || amountWei === null) {
      setQuote({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    quoteAbort.current = ctrl;
    setQuote({ status: 'loading' });
    const t = window.setTimeout(() => {
      void fetchLifiQuote(address, amountWei, ctrl.signal).then((q) => {
        if (!ctrl.signal.aborted) setQuote(q);
      });
    }, 700);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [address, amountWei]);

  const onArc = chainId === ARC_CHAIN_ID;
  const quoteReady = quote.status === 'ready';
  const exceedsBalance = balances.loaded && amountWei !== null && amountWei > balances.usdc;

  const swapDisabledReason: string | null =
    !isConnected || !connected
      ? 'Connect your wallet to swap.'
      : !onArc
        ? 'Switch to the Arc network (chain 5042) to swap.'
        : !walletClient
          ? 'Wallet client unavailable — reconnect your wallet.'
          : !quoteReady
            ? 'Waiting on a live swap route — the button appears only when one exists.'
            : exceedsBalance
              ? "That's more USDC than this wallet holds."
              : null;

  async function handleSwap() {
    if (swapDisabledReason || !walletClient || !connected || quote.status !== 'ready') return;
    if (!address || address.toLowerCase() !== connected.toLowerCase()) return;
    setSwap({ status: 'working', step: 'Approving USDC spend' });
    try {
      const q = quote.quote;
      const txReq = q.transactionRequest!;
      const fromAmount = parseUnits(amount.trim(), 18);
      const approvalAddr = q.estimate.approvalAddress;

      // ERC-20 approval first, only when the quote requires it.
      if (approvalAddr && isAddress(approvalAddr) && approvalAddr !== zeroAddress) {
        const allowance = (await publicClient.readContract({
          address: USDC_ADDRESS,
          abi: parsedErc20Abi,
          functionName: 'allowance',
          args: [connected, approvalAddr],
        })) as bigint;
        if (allowance < fromAmount) {
          const approveHash = await walletClient.writeContract({
            address: USDC_ADDRESS,
            abi: parsedErc20Abi,
            functionName: 'approve',
            args: [approvalAddr, fromAmount],
            account: connected,
            chain: walletClient.chain,
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      setSwap({ status: 'working', step: 'Swapping' });
      const value = txReq.value ? BigInt(txReq.value) : 0n;
      const swapHash = await walletClient.sendTransaction({
        account: connected,
        to: txReq.to as Address,
        data: txReq.data as Hex,
        value,
        chain: walletClient.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: swapHash });
      setSwap({ status: 'done', txHash: swapHash });
      balances.refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'The swap did not go through.';
      setSwap({
        status: 'error',
        message: /user rejected|rejected/i.test(msg)
          ? 'You rejected the transaction in your wallet — nothing changed.'
          : `The swap did not go through: ${msg}`,
      });
    }
  }

  function retryQuote() {
    if (!address || amountWei === null) return;
    const ctrl = new AbortController();
    quoteAbort.current?.abort();
    quoteAbort.current = ctrl;
    setQuote({ status: 'loading' });
    void fetchLifiQuote(address, amountWei, ctrl.signal).then((q) => {
      if (!ctrl.signal.aborted) setQuote(q);
    });
  }

  const quotedOut =
    quote.status === 'ready' ? formatEurc(BigInt(quote.quote.estimate.toAmount)) : null;
  const toolName =
    quote.status === 'ready' && quote.quote.toolDetails?.name
      ? quote.quote.toolDetails.name
      : null;

  return (
    <section
      aria-label="Get EURC"
      className="rounded-2xl border border-amber/25 bg-ink p-6 sm:p-7"
    >
      <div className="flex items-center gap-3">
        <TokenIcon token="EURC" size={36} />
        <div>
          <h2 className="font-display text-xl font-extrabold text-text">
            {title ?? 'Get EURC'}
          </h2>
          <p className="mt-0.5 font-body text-sm leading-relaxed text-text/60">
            Three real ways to fund EURC on Arc — pick whichever you have.
          </p>
        </div>
      </div>

      {/* Live balances */}
      <div className="mt-5 flex flex-wrap gap-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-text/10 bg-text/[0.03] px-4 py-2.5">
          <TokenIcon token="USDC" size={22} />
          <span className="font-body text-sm text-text/60">USDC</span>
          <span className="font-display text-base font-extrabold text-text">
            {balances.loaded ? formatNativeUsdc(balances.usdc) : '…'}
          </span>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-text/10 bg-text/[0.03] px-4 py-2.5">
          <TokenIcon token="EURC" size={22} />
          <span className="font-body text-sm text-text/60">EURC</span>
          <span className="font-display text-base font-extrabold text-text">
            {balances.loaded ? formatEurc(balances.eurc) : '…'}
          </span>
        </div>
        {balances.error && (
          <p className="w-full font-body text-xs text-text/50">
            Balances couldn't load ({balances.error}) — the paths below still work.
          </p>
        )}
      </div>

      {/* (a) Swap via LI.FI — the button exists ONLY with a live quote */}
      <div className="mt-6 rounded-xl border border-text/10 bg-text/[0.02] p-5">
        <PathHeading step="1" title="Swap USDC → EURC" />
        <p className="mt-2 max-w-[60ch] font-body text-sm leading-relaxed text-text/60">
          Routed live through LI.FI on Arc. The button below appears only when LI.FI
          returns a real route — never a guess.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block font-body text-sm font-bold text-text">
              Amount in USDC
            </span>
            <input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setSwap({ status: 'idle' });
              }}
              inputMode="decimal"
              aria-label="Swap amount in USDC"
              className="min-h-[48px] w-40 rounded-xl border border-text/15 bg-ink px-3 py-2.5 font-body text-base font-semibold text-text outline-none transition-colors focus:border-amber/60"
            />
          </label>
          <div className="min-h-[48px] pb-1 font-body text-sm text-text/60" aria-live="polite">
            {quote.status === 'loading' && <span>Checking LI.FI for a live route…</span>}
            {quoteReady && quotedOut && (
              <span>
                You get ≈ <strong className="text-amber">{quotedOut} EURC</strong>
                {toolName ? ` via ${toolName}` : ''}
              </span>
            )}
            {quote.status === 'error' && quote.kind === 'rate-limited' && (
              <span className="flex items-center gap-3">
                <span className="max-w-[46ch]">{quote.message}</span>
                <button
                  type="button"
                  onClick={retryQuote}
                  className="min-h-[44px] shrink-0 rounded-full border border-text/20 px-4 py-2 font-body text-xs font-semibold text-text transition-colors hover:border-amber hover:text-amber"
                >
                  Try again
                </button>
              </span>
            )}
            {quote.status === 'error' && quote.kind !== 'rate-limited' && (
              <span className="max-w-[60ch]">{quote.message}</span>
            )}
          </div>
        </div>
        {quoteReady && (
          <div className="mt-4">
            <button
              type="button"
              disabled={swapDisabledReason !== null || swap.status === 'working'}
              onClick={handleSwap}
              aria-busy={swap.status === 'working'}
              className={`flex min-h-[52px] items-center justify-center gap-3 rounded-full px-8 py-3 font-display text-base font-bold transition-all ${
                swapDisabledReason !== null || swap.status === 'working'
                  ? 'cursor-not-allowed bg-text/10 text-text/40'
                  : 'bg-amber text-ink hover:bg-amber/90 active:scale-[0.98]'
              }`}
            >
              {swap.status === 'working' && <ButtonSpinner />}
              {swap.status === 'working'
                ? `${swap.step} — confirm in your wallet…`
                : 'Swap on Arc'}
            </button>
            {swapDisabledReason && (
              <p role="note" className="mt-2 max-w-[60ch] font-body text-sm text-text/55">
                Swap is off: {swapDisabledReason}
              </p>
            )}
            {exceedsBalance && quoteReady && (
              <p className="mt-2 max-w-[60ch] font-body text-sm text-text/55">
                That amount is more USDC than this wallet holds — lower it or top up first.
              </p>
            )}
          </div>
        )}
        {swap.status === 'done' && (
          <p role="status" className="mt-4 max-w-[60ch] font-body text-sm leading-relaxed text-text">
            <span className="font-semibold text-amber">Swapped.</span> The EURC is in your
            wallet now.{' '}
            <a
              href={EXPLORER_TX(swap.txHash)}
              target="_blank"
              rel="noreferrer"
              className="text-amber underline decoration-dotted underline-offset-4 hover:text-amber/80"
            >
              View on the explorer
            </a>
          </p>
        )}
        {swap.status === 'error' && (
          <p role="alert" className="mt-4 max-w-[60ch] font-body text-sm leading-relaxed text-[#E08A73]">
            {swap.message}
          </p>
        )}
      </div>

      {/* (b) Bridge via CCTP — informational only, plus a real copy button */}
      <div className="mt-4 rounded-xl border border-text/10 bg-text/[0.02] p-5">
        <PathHeading step="2" title="Bridge EURC from another chain" />
        <p className="mt-2 max-w-[60ch] font-body text-sm leading-relaxed text-text/60">
          Holding EURC on another chain? Bridge it to Arc with Circle CCTP — it burns
          the EURC there and mints it here. Point your CCTP transfer at Arc (domain 26)
          and this contract:
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-ink px-4 py-3">
          <div className="min-w-0">
            <p className="font-body text-xs text-text/50">CrossChainTokenService</p>
            <p className="break-all font-mono text-sm text-text">0x431871229103b780868f8C6BB820cd16ECf942BC</p>
          </div>
          <CopyAddressButton value="0x431871229103b780868f8C6BB820cd16ECf942BC" />
        </div>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 font-body text-sm leading-relaxed text-text/60">
          <li>On the chain where your EURC lives, start a Circle CCTP transfer to Arc (domain 26).</li>
          <li>CCTP burns the EURC there; the contract above mints it on Arc.</li>
          <li>When it lands it shows in your EURC balance — nothing else to do.</li>
        </ol>
      </div>

      {/* (c) Buy — text only, no button (not integrated) */}
      <div className="mt-4 rounded-xl border border-text/10 bg-text/[0.02] p-5">
        <PathHeading step="3" title="Buy with cash" />
        <p className="mt-2 max-w-[60ch] font-body text-sm leading-relaxed text-text/60">
          Prefer cash? Circle Onramp turns a card, Apple&nbsp;Pay, or Google&nbsp;Pay payment
          into EURC on Arc. That's the fiat path — it isn't built into this page, so
          there's no button here.
        </p>
      </div>
    </section>
  );
}
