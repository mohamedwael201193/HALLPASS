// useDashboardStats — the relay "TAPE" stats strip data layer.
//
// Every number comes from Arc mainnet (chain 5042) via eth_call, aggregated
// across the user's tracked accounts (localStorage registry — never seeded).
// Cells the chain cannot answer are null → the strip renders "—", never a
// guess. States:
//   'locked'  — wallet not connected (or wallet setup incomplete): "—".
//   'loading' — reads in flight: "—".
//   'ready'   — values (or zeros) from the chain.
//   'error'   — every account's reads failed: "—" + retry.
//
// Session status per account is derived from the plugin's policies() getter:
//   none    — sessionKey is the zero address (no hall pass on this account)
//   revoked — policy.revoked
//   expired — expiry set and in the past
//   active  — otherwise

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type Address, zeroAddress } from 'viem';
import { useHallpass } from '../../lib/useHallpass';
import {
  EURC_ADDRESS,
  PLUGIN_ADDRESS,
  USDC_ADDRESS,
  getTokenBalance,
  pluginAbi,
  publicClient,
} from '../../lib/contracts';
import { WALLET_SETUP_ERROR } from '../../lib/wagmi';
import { loadTrackedAccounts, plainError } from './shared';

export type SessionStatus = 'none' | 'active' | 'expired' | 'revoked';

export interface AccountSession {
  account: Address;
  status: SessionStatus;
  /** Native wei (18 decimals) — the plugin's unit. */
  perTxCapWei: bigint;
  windowCapWei: bigint;
  windowSecs: bigint;
  expiry: bigint;
  windowStart: bigint;
  windowSpent: bigint;
  usdcWei: bigint;
  eurcUnits: bigint;
}

export interface DashboardStats {
  state: 'locked' | 'loading' | 'ready' | 'error';
  sessions: AccountSession[];
  activeSessions: number | null;
  /** Sum of window caps over ACTIVE policies, native wei (18). */
  totalSpendCapsWei: bigint | null;
  /** Native-USDC (18 decimals) balances summed across tracked accounts. */
  usdcWei: bigint | null;
  /** EURC (6 decimals) balances summed across tracked accounts. */
  eurcUnits: bigint | null;
  revoked: number | null;
  accountsRead: number;
  accountsTotal: number;
  /** Honest caveat shown under the strip (config gaps, partial reads). */
  note: string | null;
  error: string | null;
  reload: () => void;
}

const ZERO_ADDRESS = zeroAddress;

async function readAccountSession(
  account: Address,
): Promise<AccountSession> {
  const [usdcWei, eurcUnits, policy] = await Promise.all([
    getTokenBalance(publicClient, USDC_ADDRESS, account),
    getTokenBalance(publicClient, EURC_ADDRESS, account),
    PLUGIN_ADDRESS
      ? (publicClient.readContract({
          address: PLUGIN_ADDRESS,
          abi: pluginAbi,
          functionName: 'policies',
          args: [account],
        }) as Promise<readonly unknown[]>)
      : Promise.resolve(null),
  ]);

  let status: SessionStatus = 'none';
  let perTxCapWei = 0n;
  let windowCapWei = 0n;
  let windowSecs = 0n;
  let expiry = 0n;
  let windowStart = 0n;
  let windowSpent = 0n;

  if (policy) {
    const [
      sessionKey,
      ,
      perTx,
      winCap,
      winSecs,
      exp,
      ,
      winStart,
      winSpent,
      revoked,
    ] = policy as unknown as [
      Address,
      Address,
      bigint,
      bigint,
      bigint,
      bigint,
      Address[],
      bigint,
      bigint,
      boolean,
    ];
    perTxCapWei = perTx;
    windowCapWei = winCap;
    windowSecs = winSecs;
    expiry = exp;
    windowStart = winStart;
    windowSpent = winSpent;
    if (sessionKey.toLowerCase() === ZERO_ADDRESS) {
      status = 'none';
    } else if (revoked) {
      status = 'revoked';
    } else if (exp > 0n && exp <= BigInt(Math.floor(Date.now() / 1000))) {
      status = 'expired';
    } else {
      status = 'active';
    }
  }

  return {
    account,
    status,
    perTxCapWei,
    windowCapWei,
    windowSecs,
    expiry,
    windowStart,
    windowSpent,
    usdcWei,
    eurcUnits,
  };
}

export function useDashboardStats(): DashboardStats {
  const { isConnected } = useHallpass();
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Re-read the registry every render (cheap localStorage read) so the strip
  // follows add/remove on the Accounts page without a remount.
  const accountsKey = loadTrackedAccounts().join(',').toLowerCase();
  const accounts = useMemo(() => loadTrackedAccounts(), [accountsKey, nonce]);

  const locked = WALLET_SETUP_ERROR !== null || !isConnected;

  const load = useCallback(() => {
    let cancelled = false;
    setPhase('loading');
    setError(null);
    setFailed(0);
    if (accounts.length === 0) {
      setSessions([]);
      setPhase('ready');
      return;
    }
    Promise.allSettled(accounts.map((a) => readAccountSession(a))).then(
      (results) => {
        if (cancelled) return;
        const ok: AccountSession[] = [];
        let failedCount = 0;
        for (const r of results) {
          if (r.status === 'fulfilled') ok.push(r.value);
          else failedCount += 1;
        }
        setSessions(ok);
        setFailed(failedCount);
        if (ok.length === 0) {
          setError(
            failedCount > 0
              ? 'The chain reads for every tracked account failed.'
              : 'No account data came back from the chain.',
          );
          setPhase('error');
        } else {
          setPhase('ready');
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accountsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (locked) return;
    const cleanup = load();
    return cleanup;
  }, [locked, load]);

  const reload = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  return useMemo<DashboardStats>(() => {
    if (locked) {
      return {
        state: 'locked',
        sessions: [],
        activeSessions: null,
        totalSpendCapsWei: null,
        usdcWei: null,
        eurcUnits: null,
        revoked: null,
        accountsRead: 0,
        accountsTotal: accounts.length,
        note: WALLET_SETUP_ERROR
          ? 'Wallet setup incomplete — the connect button stays disabled until the Reown project ID is configured. No numbers are guessed in the meantime.'
          : 'Connect your wallet to read your accounts. Nothing here is estimated.',
        error: null,
        reload,
      };
    }
    if (phase === 'loading') {
      return {
        state: 'loading',
        sessions: [],
        activeSessions: null,
        totalSpendCapsWei: null,
        usdcWei: null,
        eurcUnits: null,
        revoked: null,
        accountsRead: 0,
        accountsTotal: accounts.length,
        note: null,
        error: null,
        reload,
      };
    }
    if (phase === 'error') {
      return {
        state: 'error',
        sessions: [],
        activeSessions: null,
        totalSpendCapsWei: null,
        usdcWei: null,
        eurcUnits: null,
        revoked: null,
        accountsRead: 0,
        accountsTotal: accounts.length,
        note: null,
        error,
        reload,
      };
    }
    const active = sessions.filter((s) => s.status === 'active');
    const revokedCount = sessions.filter((s) => s.status === 'revoked').length;
    const notes: string[] = [];
    if (!PLUGIN_ADDRESS) {
      notes.push(
        'Session reads are unavailable: the HallpassPlugin address is not configured (VITE_PLUGIN_ADDRESS). Balances below are from the chain; session cells show —.',
      );
    }
    if (failed > 0) {
      notes.push(
        `Couldn't read ${failed} of ${accounts.length} tracked ${
          failed === 1 ? 'account' : 'accounts'
        } from the chain — the numbers below cover the ones that answered.`,
      );
    }
    if (accounts.length === 0) {
      notes.push('No smart accounts are tracked yet — add one to start the tape.');
    }
    return {
      state: 'ready',
      sessions,
      activeSessions: PLUGIN_ADDRESS ? active.length : null,
      totalSpendCapsWei: PLUGIN_ADDRESS
        ? active.reduce((sum, s) => sum + s.windowCapWei, 0n)
        : null,
      usdcWei: sessions.reduce((sum, s) => sum + s.usdcWei, 0n),
      eurcUnits: sessions.reduce((sum, s) => sum + s.eurcUnits, 0n),
      revoked: PLUGIN_ADDRESS ? revokedCount : null,
      accountsRead: sessions.length,
      accountsTotal: accounts.length,
      note: notes.length > 0 ? notes.join(' ') : null,
      error: null,
      reload,
    };
  }, [locked, phase, sessions, failed, accounts.length, error, reload]);
}

export { plainError };
