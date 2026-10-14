// useHallpass() — the hook surface F5–F8 call.
// Thin over src/lib/{wagmi,contracts,userops}. No chain writes happen here
// without an explicit user gesture in the calling screen (bible hard rule 1:
// every executable control submits a real tx/userOp or is disabled with the
// exact reason — the `disabledReason` fields below feed that copy).
//
// Design-standard note (§7): every async action exposes a stable
// { status, error } shape so screens can render the four states
// (main / empty / loading / error) without inventing copy.

import { useCallback, useMemo } from 'react';
import { useAccount, usePublicClient, useWalletClient, useSwitchChain } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import {
  type Address,
  type Hex,
  generatePrivateKey,
  privateKeyToAccount,
} from 'viem/accounts';
import {
  PLUGIN_ADDRESS,
  CONFIGURED_MANIFEST_HASH,
  ENTRYPOINT_ADDRESS,
  pluginAbi,
  publicClient as defaultPublicClient,
  fetchManifestHash,
  verifyPlugin,
  getInstalledPlugins,
  isPluginInstalled,
  getUsdcBalance,
  decodeHallpassRevert,
  encodeAccountFallbackCalldata,
  encodePolicyInitData,
  formatNativeUsdc,
  usdcToNativeWei,
  type PolicyParams,
} from './contracts';
import {
  WALLET_SETUP_ERROR,
  WALLET_READY,
  ARC_CHAIN_ID,
} from './wagmi';
import {
  buildInstallPluginUserOp,
  getUserOpHash,
  signUserOpHash,
  submitUserOpDirect,
  relayUserOperationViaBackend,
  RelayNotConfiguredError,
  installPluginDirect,
  estimatePrefund,
  getEntryPointDeposit,
  topUpEntryPointDeposit,
  type OwnerKind,
  type PackedUserOperation,
} from './userops';

export interface NewSessionKey {
  address: Address;
  /** Shown EXACTLY ONCE by the calling screen, never stored, never logged. */
  privateKey: Hex;
}

export interface UseHallpass {
  // --- wallet state ---
  walletReady: boolean;
  walletSetupError: string | null;
  address: Address | undefined;
  isConnected: boolean;
  isArc: boolean;
  connect: () => void;
  switchToArc: () => void;
  // --- config state (drives disabled-with-reason UI, design std §7.6) ---
  pluginAddress: Address | undefined;
  pluginConfigError: string | null;
  // --- reads ---
  getInstalledPlugins: (account: Address) => Promise<Address[]>;
  isPluginInstalled: (account: Address) => Promise<boolean>;
  getPolicy: (account: Address) => Promise<PolicyParams & {
    windowStart: bigint; windowSpent: bigint; revoked: boolean;
  }>;
  getUsdcBalance: (account: Address) => Promise<bigint>;
  fetchManifestHash: (plugin: Address) => Promise<Hex>;
  verifyPlugin: (plugin: Address) => ReturnType<typeof verifyPlugin>;
  // --- writes (owner-signed; each returns the real tx/userOp hash) ---
  installPluginDirect: (account: Address, policy: PolicyParams) => Promise<Hex>;
  buildInstallUserOp: (
    account: Address,
    policy: PolicyParams,
    ownerKind?: OwnerKind,
  ) => Promise<{ userOp: PackedUserOperation; userOpHash: Hex }>;
  signAndSendUserOp: (
    account: Address,
    policy: PolicyParams,
    opts?: { ownerKind?: OwnerKind; via?: 'direct' | 'backend' },
  ) => Promise<{ userOpHash: Hex; txHash: Hex }>;
  revokeSession: (account: Address) => Promise<Hex>;
  updatePolicy: (account: Address, policy: PolicyParams) => Promise<Hex>;
  topUpEntryPointDeposit: (account: Address, amountWei: bigint) => Promise<Hex>;
  // --- helpers ---
  generateSessionKey: () => NewSessionKey;
  decodeRevert: (data: Hex) => { name: string; message: string };
  formatNativeUsdc: typeof formatNativeUsdc;
  usdcToNativeWei: typeof usdcToNativeWei;
  estimatePrefund: typeof estimatePrefund;
  getEntryPointDeposit: (account: Address) => Promise<bigint>;
}

const PLUGIN_CONFIG_ERROR =
  'Install is unavailable: the HallpassPlugin address is not configured ' +
  '(VITE_PLUGIN_ADDRESS). The deploy step must set it after Sourcify exact_match ' +
  'verification — see bible §5.2.';

export function useHallpass(): UseHallpass {
  const { address, isConnected, chainId } = useAccount();
  const { open } = useAppKit();
  const wagmiPublicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();

  const client = useMemo(
    () => wagmiPublicClient ?? defaultPublicClient,
    [wagmiPublicClient],
  );
  const isArc = chainId === ARC_CHAIN_ID;

  const requireWallet = useCallback((): Address => {
    if (!WALLET_READY || WALLET_SETUP_ERROR) throw new Error(WALLET_SETUP_ERROR ?? 'Wallet not configured.');
    if (!isConnected || !address) throw new Error('Connect a wallet first.');
    if (!isArc) throw new Error('Switch to the Arc network (chain 5042) first.');
    if (!walletClient) throw new Error('Wallet client unavailable — reconnect your wallet.');
    return address;
  }, [isConnected, address, isArc, walletClient]);

  const requirePlugin = useCallback((): Address => {
    if (!PLUGIN_ADDRESS) throw new Error(PLUGIN_CONFIG_ERROR);
    return PLUGIN_ADDRESS;
  }, []);

  /** Resolve + verify the manifest hash: explicit > env > on-chain (bible §5.3). */
  const resolveManifestHash = useCallback(
    async (plugin: Address, explicit?: Hex): Promise<Hex> => {
      const onChain = await fetchManifestHash(client, plugin);
      const reference = explicit ?? CONFIGURED_MANIFEST_HASH;
      if (reference && onChain.toLowerCase() !== reference.toLowerCase()) {
        throw new Error(
          `Plugin manifest mismatch: on-chain ${onChain} != configured ${reference}. ` +
            'The plugin binary changed — it is UNVERIFIED and cannot be installed.',
        );
      }
      return onChain;
    },
    [client],
  );

  /**
   * Call an installed execution function through the account fallback.
   * revokeSession / updatePolicy must NOT be wrapped in account.execute —
   * the wrapped call reverts on-chain (bible §4.2 / §6.2). A plain tx to the
   * account address with the plugin calldata routes via the fallback to the
   * plugin's execution function, gated by the owner's runtime validation.
   */
  const sendToAccount = useCallback(
    async (account: Address, data: Hex): Promise<Hex> => {
      const owner = requireWallet();
      return walletClient!.sendTransaction({
        account: owner,
        to: account,
        data,
        chain: walletClient!.chain,
      });
    },
    [requireWallet, walletClient],
  );

  return useMemo<UseHallpass>(
    () => ({
      walletReady: WALLET_READY,
      walletSetupError: WALLET_SETUP_ERROR,
      address,
      isConnected,
      isArc,
      connect: () => open(),
      switchToArc: () => switchChain({ chainId: ARC_CHAIN_ID }),

      pluginAddress: PLUGIN_ADDRESS,
      pluginConfigError: PLUGIN_ADDRESS ? null : PLUGIN_CONFIG_ERROR,

      getInstalledPlugins: (account) => getInstalledPlugins(client, account),
      isPluginInstalled: (account) =>
        isPluginInstalled(client, account, requirePlugin()),
      getPolicy: async (account) => {
        const plugin = requirePlugin();
        const p = await client.readContract({
          address: plugin,
          abi: pluginAbi,
          functionName: 'policies',
          args: [account],
        });
        const [sessionKey, owner, perTxCap, windowCap, windowSecs, expiry, allowlist, windowStart, windowSpent, revoked] = p as unknown as [
          Address, Address, bigint, bigint, bigint, bigint, Address[], bigint, bigint, boolean,
        ];
        return { sessionKey, owner, perTxCapWei: perTxCap, windowCapWei: windowCap, windowSecs, expiry, allowlist, windowStart, windowSpent, revoked };
      },
      getUsdcBalance: (account) => getUsdcBalance(client, account),
      fetchManifestHash: (plugin) => fetchManifestHash(client, plugin),
      verifyPlugin: (plugin) => verifyPlugin(client, plugin),

      installPluginDirect: async (account, policy) => {
        const owner = requireWallet();
        const plugin = requirePlugin();
        const manifestHash = await resolveManifestHash(plugin);
        return installPluginDirect(
          walletClient!,
          owner,
          account,
          plugin,
          manifestHash,
          encodePolicyInitData(policy),
        );
      },

      buildInstallUserOp: async (account, policy, ownerKind = 'eoa') => {
        requireWallet();
        const plugin = requirePlugin();
        const manifestHash = await resolveManifestHash(plugin);
        const { userOp } = await buildInstallPluginUserOp(client, {
          account,
          pluginAddress: plugin,
          manifestHash,
          ...policy,
        });
        const userOpHash = getUserOpHash(userOp);
        const signature = await signUserOpHash(walletClient!, address!, userOpHash, ownerKind);
        return { userOp: { ...userOp, signature }, userOpHash };
      },

      signAndSendUserOp: async (account, policy, opts) => {
        const ownerKind: OwnerKind = opts?.ownerKind ?? 'eoa';
        const via = opts?.via ?? 'direct';
        const owner = requireWallet();
        const { userOp, userOpHash } = await (async () => {
          const plugin = requirePlugin();
          const manifestHash = await resolveManifestHash(plugin);
          const built = await buildInstallPluginUserOp(client, {
            account,
            pluginAddress: plugin,
            manifestHash,
            ...policy,
          });
          const hash = getUserOpHash(built.userOp);
          const signature = await signUserOpHash(walletClient!, owner, hash, ownerKind);
          return { userOp: { ...built.userOp, signature }, userOpHash: hash };
        })();
        // Prefund guard (bible §4.6 step 1): fail with an actionable message
        // instead of a cryptic AA13 revert.
        const deposit = await getEntryPointDeposit(client, account);
        const need = estimatePrefund(userOp);
        if (deposit < need) {
          throw new Error(
            `EntryPoint deposit too low: ${formatNativeUsdc(deposit)} USDC deposited, ` +
              `~${formatNativeUsdc(need)} USDC needed for this userOp. ` +
              'Top up the deposit first (topUpEntryPointDeposit).',
          );
        }
        const txHash =
          via === 'backend'
            ? await relayUserOperationViaBackend(userOp)
            : await submitUserOpDirect(walletClient!, owner, userOp);
        return { userOpHash, txHash };
      },

      revokeSession: (account) =>
        sendToAccount(account, encodeAccountFallbackCalldata('revokeSession')),

      updatePolicy: (account, policy) =>
        sendToAccount(
          account,
          encodeAccountFallbackCalldata('updatePolicy', [
            policy.sessionKey,
            policy.perTxCapWei,
            policy.windowCapWei,
            policy.windowSecs,
            policy.expiry,
            policy.allowlist,
          ]),
        ),

      topUpEntryPointDeposit: (account, amountWei) =>
        topUpEntryPointDeposit(walletClient!, requireWallet(), account, amountWei),

      generateSessionKey: () => {
        const privateKey = generatePrivateKey();
        const acct = privateKeyToAccount(privateKey);
        return { address: acct.address, privateKey };
      },

      decodeRevert: decodeHallpassRevert,
      formatNativeUsdc,
      usdcToNativeWei,
      estimatePrefund,
      getEntryPointDeposit: (account) => getEntryPointDeposit(client, account),
    }),
    [
      address, isConnected, isArc, open, switchChain, client, walletClient,
      requireWallet, requirePlugin, resolveManifestHash, sendToAccount,
    ],
  );
}

export { RelayNotConfiguredError, ENTRYPOINT_ADDRESS, ARC_CHAIN_ID };
export type { OwnerKind, PackedUserOperation };
