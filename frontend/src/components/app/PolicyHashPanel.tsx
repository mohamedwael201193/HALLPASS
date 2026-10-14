/**
 * PolicyHashPanel — the policy-audit panel (competitor-showdown gap #3).
 *
 * Read-only, wallet-free: every value comes from eth_call / eth_getLogs
 * against the deployed HallpassPlugin on Arc mainnet. Three parts:
 *
 *  1. Committed policy hash — keccak256(abi.encode(sessionKey, perTxCap,
 *     windowCap, windowSecs, expiry, allowlist)) computed client-side from
 *     the on-chain policy fields. Honestly labeled: it is a *commitment*
 *     recomputed from the live policy, not a value the contract stores.
 *  2. Session rollups — windowSpent, caps, window reset, session expiry,
 *     revoked status, tokens covered. "—" while loading, never invented.
 *  3. CSV export — SessionRegistered / SpendAuthorized / PolicyUpdated /
 *     DigestAuthorized / DigestRevoked / SessionRevokedEvt fetched via
 *     eth_getLogs in 10,000-block chunks (the RPC hard-caps range per call),
 *     then generated + downloaded client-side.
 *
 * The plugin address comes from VITE_PLUGIN_ADDRESS (env only). When it is
 * unset the panel renders the honest "unavailable" state, never a fake.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  encodeAbiParameters,
  getAbiItem,
  keccak256,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import {
  EURC_ADDRESS,
  PLUGIN_ADDRESS,
  USDC_ADDRESS,
  formatNativeUsdc,
  pluginAbi,
  publicClient,
} from '../../lib/contracts';
import TokenIcon, { type TokenKind } from '../TokenIcon';
import TapeEmptyState, {
  TapePrimaryAction,
} from '../TapeEmptyState';
import {
  CopyButton,
  SectionError,
  Skeleton,
  explorerTxUrl,
  truncateAddress,
} from '../../pages/app/shared';

/* ------------------------------------------------------------------ */
/* Parsed ABI — viem 2.57.x needs parsed AbiItem objects (not human-        */
/* readable strings) inside readContract/getLogs: the string arrays from    */
/* contracts.ts are the human-readable source of truth, and parseAbi()      */
/* turns them into the runtime form here (same pattern the sibling worker  */
/* landed in contracts.ts' working tree — parsed locally so this file      */
/* stays self-contained).                                                  */
/*                                                                         */
/* DigestAuthorized / DigestRevoked exist in                                */
/* contracts/src/HallpassPlugin.sol but are not in pluginAbi, so they are   */
/* appended here verbatim. Keep in sync by hand.                            */
/* ------------------------------------------------------------------ */

const parsedPluginAbi = parseAbi([
  ...pluginAbi,
  'event DigestAuthorized(address indexed account, bytes32 indexed digest, address token, address to, uint256 spend, uint64 expiry)',
  'event DigestRevoked(address indexed account, bytes32 indexed digest)',
]);

/**
 * The six policy events, looked up from the parsed plugin ABI by literal
 * name (getAbiItem only resolves precise overloads for literal names).
 * Built lazily inside the fetch so a mismatch surfaces as a UI error,
 * never a module-load crash — see the 2026-10-14 black-screen lesson in
 * contracts.ts.
 */
function policyEvents() {
  return {
    SessionRegistered: getAbiItem({
      abi: parsedPluginAbi,
      name: 'SessionRegistered' as const,
    }),
    SpendAuthorized: getAbiItem({
      abi: parsedPluginAbi,
      name: 'SpendAuthorized' as const,
    }),
    PolicyUpdated: getAbiItem({
      abi: parsedPluginAbi,
      name: 'PolicyUpdated' as const,
    }),
    SessionRevokedEvt: getAbiItem({
      abi: parsedPluginAbi,
      name: 'SessionRevokedEvt' as const,
    }),
    DigestAuthorized: getAbiItem({
      abi: parsedPluginAbi,
      name: 'DigestAuthorized' as const,
    }),
    DigestRevoked: getAbiItem({
      abi: parsedPluginAbi,
      name: 'DigestRevoked' as const,
    }),
  };
}

type PolicyEventName = keyof ReturnType<typeof policyEvents>;

/* ------------------------------------------------------------------ */
/* Policy commitment hash                                               */
/* ------------------------------------------------------------------ */

const POLICY_HASH_FIELDS =
  'address sessionKey, uint256 perTxCap, uint256 windowCap, uint256 windowSecs, uint256 expiry, address[] allowlist';

export function computePolicyCommitmentHash(p: {
  sessionKey: Address;
  perTxCapWei: bigint;
  windowCapWei: bigint;
  windowSecs: bigint;
  expiry: bigint;
  allowlist: Address[];
}): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters(POLICY_HASH_FIELDS), [
      p.sessionKey,
      p.perTxCapWei,
      p.windowCapWei,
      p.windowSecs,
      p.expiry,
      p.allowlist,
    ]),
  );
}

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

interface PolicyRollup {
  sessionKey: Address;
  owner: Address;
  perTxCapWei: bigint;
  windowCapWei: bigint;
  windowSecs: bigint;
  windowStart: bigint;
  windowSpent: bigint;
  expiry: bigint;
  allowlist: Address[];
  tokens: Address[];
  revoked: boolean;
}

type PolicyState =
  | { status: 'loading' }
  | { status: 'unavailable'; reason: string }
  | { status: 'none' }
  | { status: 'error'; error: string }
  | { status: 'ready'; policy: PolicyRollup; hash: Hex };

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                          */
/* ------------------------------------------------------------------ */

function tokenKindOf(t: Address): TokenKind | null {
  const l = t.toLowerCase();
  if (l === USDC_ADDRESS.toLowerCase()) return 'USDC';
  if (l === EURC_ADDRESS.toLowerCase()) return 'EURC';
  return null;
}

function TokenChip({ token }: { token: Address }) {
  const kind = tokenKindOf(token);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-text/15 bg-text/[0.04] px-2.5 py-1 text-xs font-semibold text-text/85">
      {kind ? (
        <TokenIcon token={kind} size={14} />
      ) : (
        <span className="font-mono">{truncateAddress(token)}</span>
      )}
      {kind ?? 'token'}
    </span>
  );
}

function StatRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-text/10 py-3 last:border-b-0">
      <dt className="shrink-0 text-sm text-text/55">{label}</dt>
      <dd
        className={`text-right text-sm font-semibold text-text ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function fmtExpiry(ts: bigint): string {
  if (ts === 0n) return 'No expiry set';
  return new Date(Number(ts) * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtWindow(secs: bigint): string {
  const s = Number(secs);
  if (!s || s <= 0) return '—';
  if (s % 86400 === 0) {
    const d = s / 86400;
    return d === 1 ? '1 day' : `${d} days`;
  }
  if (s % 3600 === 0) {
    const h = s / 3600;
    return h === 1 ? '1 hour' : `${h} hours`;
  }
  return `${s} seconds`;
}

/* ------------------------------------------------------------------ */
/* CSV export — event scan                                              */
/* ------------------------------------------------------------------ */

/** The RPC rejects eth_getLogs ranges wider than this (proven 2026-10-15). */
const LOG_RANGE = 10_000n;

interface CsvRow {
  event: string;
  blockNumber: bigint;
  blockTimeUtc: string;
  txHash: string;
  logIndex: number;
  account: string;
  sessionKey: string;
  to: string;
  token: string;
  digest: string;
  amountUsdc: string;
  spendUsdc: string;
  windowSpentUsdc: string;
  perTxCapUsdc: string;
  windowCapUsdc: string;
  expiryUtc: string;
}

const CSV_COLUMNS: Array<{ key: keyof CsvRow; header: string }> = [
  { key: 'event', header: 'event' },
  { key: 'blockNumber', header: 'block_number' },
  { key: 'blockTimeUtc', header: 'block_time_utc' },
  { key: 'txHash', header: 'tx_hash' },
  { key: 'logIndex', header: 'log_index' },
  { key: 'account', header: 'account' },
  { key: 'sessionKey', header: 'session_key' },
  { key: 'to', header: 'to' },
  { key: 'token', header: 'token' },
  { key: 'digest', header: 'digest' },
  { key: 'amountUsdc', header: 'amount_usdc' },
  { key: 'spendUsdc', header: 'spend_usdc' },
  { key: 'windowSpentUsdc', header: 'window_spent_usdc' },
  { key: 'perTxCapUsdc', header: 'per_tx_cap_usdc' },
  { key: 'windowCapUsdc', header: 'window_cap_usdc' },
  { key: 'expiryUtc', header: 'expiry_utc' },
];

function tokenLabel(t: Address): string {
  return tokenKindOf(t) ?? t;
}

function isoOrDash(ts: bigint): string {
  return ts > 0n ? new Date(Number(ts) * 1000).toISOString() : '';
}

function csvCell(v: string | number | bigint): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows: CsvRow[]): string {
  const lines = [CSV_COLUMNS.map((c) => c.header).join(',')];
  for (const r of rows) {
    lines.push(CSV_COLUMNS.map((c) => csvCell(r[c.key])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Find the block the plugin was first deployed at, by binary search on
 * getBytecode. Events can only exist from this block on — bounding the scan
 * this way is honest (no silent window truncation) and keeps the request
 * count small (the RPC caps eth_getLogs at 10k blocks per call).
 */
async function findDeployBlock(plugin: Address): Promise<bigint> {
  const latest = await publicClient.getBlockNumber();
  let lo = 0n;
  let hi = latest;
  while (lo < hi) {
    const mid = (lo + hi) >> 1n;
    const code = await publicClient.getBytecode({ address: plugin, blockNumber: mid });
    if (code && code !== '0x') hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}

async function fetchEventRows(
  plugin: Address,
  account: Address,
  onProgress: (done: number, total: number) => void,
): Promise<{ rows: CsvRow[]; fromBlock: bigint; toBlock: bigint }> {
  const deployBlock = await findDeployBlock(plugin);
  const latest = await publicClient.getBlockNumber();
  const chunks: Array<{ from: bigint; to: bigint }> = [];
  for (let from = deployBlock; from <= latest; from += LOG_RANGE) {
    const to = from + LOG_RANGE - 1n > latest ? latest : from + LOG_RANGE - 1n;
    chunks.push({ from, to });
  }

  const raw: Array<{
    eventName: string;
    log: {
      blockNumber: bigint;
      transactionHash: Hex;
      logIndex: number;
      args: Record<string, unknown>;
    };
  }> = [];

  const events = policyEvents();
  const eventNames = Object.keys(events) as PolicyEventName[];

  let done = 0;
  for (const { from, to } of chunks) {
    const perEvent = await Promise.all(
      eventNames.map(async (eventName) => {
        const logs = await publicClient.getLogs({
          address: plugin,
          event: events[eventName],
          args: { account },
          fromBlock: from,
          toBlock: to,
        });
        return logs.map((log) => ({ eventName, log }));
      }),
    );
    for (const tagged of perEvent) {
      for (const t of tagged) {
        raw.push({
          eventName: t.eventName,
          log: {
            blockNumber: t.log.blockNumber,
            transactionHash: t.log.transactionHash,
            logIndex: t.log.logIndex,
            args: t.log.args as Record<string, unknown>,
          },
        });
      }
    }
    done += 1;
    onProgress(done, chunks.length);
  }

  // Block timestamps, one call per distinct block.
  const blockNums = [...new Set(raw.map((r) => r.log.blockNumber))];
  const times = new Map<bigint, string>();
  await Promise.all(
    blockNums.map(async (b) => {
      const block = await publicClient.getBlock({ blockNumber: b });
      times.set(b, new Date(Number(block.timestamp) * 1000).toISOString());
    }),
  );

  const empty = (v: unknown): string =>
    v === undefined || v === null ? '' : String(v);

  const rows: CsvRow[] = raw.map(({ eventName, log }) => {
    const a = log.args;
    return {
      event: eventName,
      blockNumber: log.blockNumber,
      blockTimeUtc: times.get(log.blockNumber) ?? '',
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      account: empty(a.account),
      sessionKey: empty(a.sessionKey),
      to: empty(a.to),
      token: a.token ? tokenLabel(a.token as Address) : '',
      digest: empty(a.digest),
      amountUsdc: a.amount !== undefined ? formatNativeUsdc(a.amount as bigint) : '',
      spendUsdc: a.spend !== undefined ? formatNativeUsdc(a.spend as bigint) : '',
      windowSpentUsdc:
        a.windowSpent !== undefined ? formatNativeUsdc(a.windowSpent as bigint) : '',
      perTxCapUsdc:
        a.perTxCap !== undefined ? formatNativeUsdc(a.perTxCap as bigint) : '',
      windowCapUsdc:
        a.windowCap !== undefined ? formatNativeUsdc(a.windowCap as bigint) : '',
      expiryUtc: a.expiry !== undefined ? isoOrDash(a.expiry as bigint) : '',
    };
  });

  rows.sort((x, y) =>
    x.blockNumber < y.blockNumber
      ? -1
      : x.blockNumber > y.blockNumber
        ? 1
        : x.logIndex - y.logIndex,
  );

  return { rows, fromBlock: deployBlock, toBlock: latest };
}

type ExportState =
  | { status: 'idle' }
  | { status: 'scanning'; done: number; total: number }
  | { status: 'error'; error: string }
  | {
      status: 'ready';
      rows: CsvRow[];
      csv: string;
      filename: string;
      fromBlock: bigint;
      toBlock: bigint;
    };

function ExportEvents({ account, plugin }: { account: Address; plugin: Address }) {
  const [state, setState] = useState<ExportState>({ status: 'idle' });
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, [account, plugin]);

  const start = useCallback(async () => {
    setState({ status: 'scanning', done: 0, total: 0 });
    try {
      const { rows, fromBlock, toBlock } = await fetchEventRows(
        plugin,
        account,
        (done, total) => {
          if (!cancelled.current)
            setState({ status: 'scanning', done, total });
        },
      );
      if (cancelled.current) return;
      const csv = rowsToCsv(rows);
      const filename = `hallpass-policy-events-${account.slice(0, 10).toLowerCase()}-${fromBlock}-${toBlock}.csv`;
      setState({ status: 'ready', rows, csv, filename, fromBlock, toBlock });
    } catch (e) {
      if (!cancelled.current)
        setState({
          status: 'error',
          error:
            e instanceof Error ? e.message : 'The chain could not be scanned.',
        });
    }
  }, [account, plugin]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-text">
            Event history
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text/60">
            SessionRegistered, SpendAuthorized, PolicyUpdated,
            DigestAuthorized, DigestRevoked and SessionRevokedEvt for this
            account, read from Arc mainnet. Amounts are 18-decimal-normalized
            USDC equivalents — the plugin&apos;s on-chain unit.
          </p>
        </div>
        {state.status === 'idle' || state.status === 'error' ? (
          <button
            type="button"
            onClick={start}
            className="min-h-[48px] rounded-full bg-amber px-6 font-display font-bold text-[#1a1207] transition-transform hover:scale-[1.02] active:scale-[0.99]"
          >
            Scan &amp; export CSV
          </button>
        ) : state.status === 'ready' ? (
          <button
            type="button"
            onClick={() => downloadCsv(state.filename, state.csv)}
            className="min-h-[48px] rounded-full bg-amber px-6 font-display font-bold text-[#1a1207] transition-transform hover:scale-[1.02] active:scale-[0.99]"
          >
            Download CSV ({state.rows.length} {state.rows.length === 1 ? 'event' : 'events'})
          </button>
        ) : null}
      </div>

      {state.status === 'scanning' && (
        <div className="mt-4" role="status" aria-label="Scanning chain events">
          <p className="text-sm text-text/60">
            Scanning blocks…
            {state.total > 0
              ? ` ${state.done} of ${state.total} ranges`
              : ' locating the plugin deployment'}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-text/10">
            <div
              className="h-full rounded-full bg-amber transition-[width]"
              style={{
                width:
                  state.total > 0
                    ? `${Math.round((state.done / state.total) * 100)}%`
                    : '8%',
              }}
            />
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="mt-4">
          <SectionError
            message="Couldn't scan this account's events from the chain."
            cause={state.error}
            onRetry={start}
          />
        </div>
      )}

      {state.status === 'ready' && (
        <div className="mt-4 rounded-xl border border-text/10 bg-text/[0.03] p-4">
          <p className="text-sm leading-relaxed text-text/70">
            {state.rows.length === 0 ? (
              <>
                No policy events found for this account between blocks{' '}
                <span className="font-mono text-text">
                  {state.fromBlock.toString()}
                </span>{' '}
                and{' '}
                <span className="font-mono text-text">
                  {state.toBlock.toString()}
                </span>{' '}
                — the CSV will contain headers only.
              </>
            ) : (
              <>
                {state.rows.length}{' '}
                {state.rows.length === 1 ? 'event' : 'events'} scanned from
                blocks{' '}
                <span className="font-mono text-text">
                  {state.fromBlock.toString()}
                </span>{' '}
                to{' '}
                <span className="font-mono text-text">
                  {state.toBlock.toString()}
                </span>{' '}
                — the plugin&apos;s full on-chain lifetime. Latest:
                <a
                  href={explorerTxUrl(state.rows[state.rows.length - 1].txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 font-mono text-amber hover:underline"
                >
                  {truncateAddress(state.rows[state.rows.length - 1].txHash)}
                </a>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The panel                                                           */
/* ------------------------------------------------------------------ */

export default function PolicyHashPanel({ account }: { account: Address }) {
  const [state, setState] = useState<PolicyState>({ status: 'loading' });

  useEffect(() => {
    if (!PLUGIN_ADDRESS) {
      setState({
        status: 'unavailable',
        reason:
          'VITE_PLUGIN_ADDRESS is not set, so there is no deployed plugin to read from. ' +
          'Set it to the Sourcify-verified HallpassPlugin address and reload.',
      });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      const p = (await publicClient.readContract({
        address: PLUGIN_ADDRESS,
        abi: parsedPluginAbi,
        functionName: 'policies',
        args: [account],
      })) as unknown as [
        Address, // sessionKey
        Address, // owner
        bigint, // perTxCap
        bigint, // windowCap
        bigint, // windowSecs
        bigint, // expiry
        Address[], // allowlist
        bigint, // windowStart
        bigint, // windowSpent
        boolean, // revoked
        Address[], // tokens
        number[], // tokenDecimals
      ];
      const [
        sessionKey,
        owner,
        perTxCap,
        windowCap,
        windowSecs,
        expiry,
        allowlist,
        windowStart,
        windowSpent,
        revoked,
        tokens,
        ,
      ] = p;
      if (cancelled) return;
      if (sessionKey.toLowerCase() === zeroAddress) {
        setState({ status: 'none' });
        return;
      }
      const rollup: PolicyRollup = {
        sessionKey,
        owner,
        perTxCapWei: perTxCap,
        windowCapWei: windowCap,
        windowSecs,
        windowStart,
        windowSpent,
        expiry,
        allowlist: Array.isArray(allowlist) ? allowlist : [],
        tokens: Array.isArray(tokens) ? tokens : [],
        revoked,
      };
      setState({
        status: 'ready',
        policy: rollup,
        hash: computePolicyCommitmentHash(rollup),
      });
    })().catch((e: unknown) => {
      if (!cancelled)
        setState({
          status: 'error',
          error:
            e instanceof Error ? e.message : 'Could not read the policy.',
        });
    });
    return () => {
      cancelled = true;
    };
  }, [account]);

  if (state.status === 'loading') {
    return (
      <div aria-label="Loading policy audit">
        <Skeleton className="h-36" />
        <Skeleton className="mt-4 h-72" />
      </div>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <div className="rounded-2xl border border-amber/30 bg-amber/[0.06] p-6 md:p-8">
        <h2 className="font-display text-xl font-extrabold text-text">
          Policy audit unavailable
        </h2>
        <p className="mt-2 leading-relaxed text-text/70">{state.reason}</p>
      </div>
    );
  }

  if (state.status === 'none') {
    return (
      <TapeEmptyState
        title="No hall pass on this account."
        copy="The plugin holds no session key for this account, so there is no policy to commit to and no events to export. Install one first."
        action={
          <TapePrimaryAction to="/app/marketplace">
            Install a hall pass
          </TapePrimaryAction>
        }
      />
    );
  }

  if (state.status === 'error') {
    return (
      <SectionError
        message="Couldn't read this account's policy from the chain."
        cause={state.error}
        onRetry={() => setState({ status: 'loading' })}
      />
    );
  }

  const { policy: p, hash } = state;
  const now = Math.floor(Date.now() / 1000);
  const expired = p.expiry > 0n && p.expiry <= BigInt(now);
  const windowReset =
    p.windowSecs > 0n && p.windowStart > 0n
      ? new Date(Number(p.windowStart + p.windowSecs) * 1000)
      : null;
  const spentPct =
    p.windowCapWei > 0n
      ? Number((p.windowSpent * 100n) / p.windowCapWei)
      : null;

  return (
    <div className="space-y-6">
      {/* 1 — committed policy hash */}
      <section
        aria-label="Policy commitment"
        className="rounded-2xl border border-amber/25 bg-amber/[0.05] p-5 md:p-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold text-text md:text-2xl">
            Policy commitment
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
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-text/10 bg-black/30 px-4 py-3">
          <span className="min-w-0 flex-1 break-all font-mono text-sm text-amber">
            {hash}
          </span>
          <CopyButton value={hash} label="Copy policy commitment hash" />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-text/60">
          Policy commitment hash (computed from the on-chain policy):{' '}
          <span className="font-mono">
            keccak256(abi.encode(sessionKey, perTxCap, windowCap, windowSecs,
            expiry, allowlist))
          </span>
          . Recomputed live from the plugin&apos;s policy fields above — change
          any of them and this hash changes.
        </p>
      </section>

      {/* 2 — session rollups */}
      <section
        aria-label="Session rollups"
        className="rounded-2xl border border-text/10 bg-text/[0.03] p-5 md:p-7"
      >
        <h2 className="font-display text-xl font-extrabold text-text md:text-2xl">
          Session rollups
        </h2>
        <p className="mt-1 text-sm text-text/55">
          Read live from the HallpassPlugin on Arc — “—” appears while a value
          loads.
        </p>
        <dl className="mt-4">
          <StatRow
            label="Session key"
            value={
              <span className="flex items-center justify-end gap-1">
                <span className="font-mono">{truncateAddress(p.sessionKey)}</span>
                <CopyButton value={p.sessionKey} label="Copy session key" />
              </span>
            }
            mono
          />
          <StatRow
            label="Owner"
            value={
              <span className="flex items-center justify-end gap-1">
                <span className="font-mono">{truncateAddress(p.owner)}</span>
                <CopyButton value={p.owner} label="Copy owner address" />
              </span>
            }
            mono
          />
          <StatRow
            label="Per-payment cap"
            value={`${formatNativeUsdc(p.perTxCapWei)} USDC`}
          />
          <StatRow
            label="Window cap"
            value={`${formatNativeUsdc(p.windowCapWei)} USDC / ${fmtWindow(p.windowSecs)}`}
          />
          <StatRow
            label="Spent this window"
            value={
              spentPct === null
                ? `${formatNativeUsdc(p.windowSpent)} USDC`
                : `${formatNativeUsdc(p.windowSpent)} of ${formatNativeUsdc(p.windowCapWei)} USDC (${spentPct}%)`
            }
          />
          <StatRow
            label="Window resets"
            value={windowReset ? windowReset.toLocaleString() : '—'}
          />
          <StatRow label="Session expiry" value={fmtExpiry(p.expiry)} />
          <StatRow
            label="Revoked"
            value={p.revoked ? 'Yes — revoked by the owner' : 'No'}
          />
          <StatRow
            label="Destinations"
            value={
              p.allowlist.length === 0
                ? 'Open — any address, caps still apply'
                : p.allowlist.length === 1
                  ? '1 address'
                  : `${p.allowlist.length} addresses`
            }
          />
        </dl>
        {p.allowlist.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-text/70">Allowlist</p>
            <ul className="mt-2 space-y-1.5">
              {p.allowlist.map((a) => (
                <li
                  key={a}
                  className="flex items-center gap-2 font-mono text-xs text-text/75"
                >
                  <span className="break-all">{a}</span>
                  <CopyButton value={a} label="Copy allowlisted address" />
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4">
          <p className="text-sm font-semibold text-text/70">Tokens covered</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {p.tokens.length === 0 ? (
              <span className="text-sm text-text/55">USDC only (default)</span>
            ) : (
              p.tokens.map((t) => <TokenChip key={t} token={t} />)
            )}
          </div>
        </div>
      </section>

      {/* 3 — CSV export */}
      <section
        aria-label="Event export"
        className="rounded-2xl border border-text/10 bg-text/[0.03] p-5 md:p-7"
      >
        <ExportEvents account={account} plugin={PLUGIN_ADDRESS as Address} />
      </section>
    </div>
  );
}
