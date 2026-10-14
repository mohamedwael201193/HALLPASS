// HALLPASS contract layer — addresses, ABIs, selectors, viem clients.
// Bible §4 (selectors/calldata), §4.7 (live addresses), §5.3 (manifest hash).
//
// HARD RULES that apply here:
//  - No private keys anywhere in this file or anywhere else in the frontend.
//  - Selectors are computed, never recalled (bible hard rule 8). The literals
//    below exist ONLY as assertion targets; the values actually used are the
//    computed ones.

import {
  type Address,
  type Hex,
  type PublicClient,
  createPublicClient,
  decodeErrorResult,
  encodeAbiParameters,
  http,
  isAddress,
  keccak256,
  parseAbiParameters,
  toFunctionSelector,
} from 'viem';
import { arc, ARC_CHAIN_ID } from './wagmi';

const env = import.meta.env as unknown as Record<string, string | undefined>;

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/**
 * ERC-4337 v0.7 EntryPoint on Arc 5042.
 * Canonical singleton (same address on every EVM chain); RPC-verified per bible §4.7.
 * Env override exists for disaster recovery only — do not point it elsewhere
 * unless the canonical EntryPoint is genuinely unusable on Arc.
 */
export const ENTRYPOINT_ADDRESS: Address = (env.VITE_ENTRYPOINT_ADDRESS ||
  '0x0000000071727De22E5E9d8BAf0edAc6f37da032') as Address;

/**
 * HallpassPlugin deployment on Arc 5042. Env ONLY — there is deliberately NO
 * fallback default: installing the wrong plugin address is a security-relevant
 * mistake, so a missing address must surface as a disabled Install button with
 * a reason (bible hard rule 1), never a silent fallback.
 *
 * Research deployments (bible §6, for local QA only — NEVER defaults):
 *   full plugin    0x66A7464f091304B3619eDc163634169519E41Ce9
 *   minimal plugin 0x5780e3DEd211ee13494909432C89Be7b8D6441A3
 * Production deployer must bake the real address into VITE_PLUGIN_ADDRESS
 * after Sourcify exact_match verification (bible §5.2).
 */
export const PLUGIN_ADDRESS: Address | undefined = env.VITE_PLUGIN_ADDRESS as
  | Address
  | undefined;

/**
 * keccak256(abi.encode(plugin.pluginManifest())) for the DEPLOYED plugin.
 * Preferred source: computed at runtime by fetchManifestHash() against the
 * deployed plugin (bible §4.6/§5.3). The env value is the deploy-time reference
 * the runtime value is compared against — a mismatch means the plugin binary
 * changed and the plugin must be shown as UNVERIFIED (bible §8.3).
 */
export const CONFIGURED_MANIFEST_HASH: Hex | undefined = env.VITE_PLUGIN_MANIFEST_HASH as
  | Hex
  | undefined;

/** Circle MSCA v1 implementation (deploy ERC1967 proxies against this — bible §4.7). */
export const ACCOUNT_IMPL_ADDRESS: Address =
  '0xA70F1296869DA9D7CB69578123F21888E6dB2B62';

/** Arc USDC ERC-20 — 6 decimals (decimals() verified on-chain, bible §4.7). */
export const USDC_ADDRESS: Address = '0x3600000000000000000000000000000000000000';

/** Circle MSCA v1 factory — ALLOWLISTED. Do NOT use for custom plugins (bible §3). */
export const MSCA_FACTORY_ADDRESS: Address =
  '0x0000000DF7E6c9Dc387cAFc5eCBfa6c3a6179AdD';

// ---------------------------------------------------------------------------
// Selectors — computed via toFunctionSelector, asserted against bible values.
// ---------------------------------------------------------------------------

function computedSelector(sig: string, expected?: Hex): Hex {
  const sel = toFunctionSelector(sig);
  if (expected && sel.toLowerCase() !== expected.toLowerCase()) {
    // A selector mismatch is a ship-blocking bug, not a warning (bible rule 8).
    throw new Error(
      `[hallpass] selector mismatch for ${sig}: computed ${sel}, expected ${expected}`,
    );
  }
  return sel;
}

// Account (Circle MSCA, ERC-6900 v0.7) — bible §4.1
export const INSTALL_PLUGIN_SELECTOR = computedSelector(
  'installPlugin(address,bytes32,bytes,(address,uint8)[])',
  '0xf85730f4',
);
export const UNINSTALL_PLUGIN_SELECTOR = computedSelector(
  'uninstallPlugin(address,bytes,bytes)',
  '0xc1a221f3',
);
export const EXECUTE_SELECTOR = computedSelector(
  'execute(address,uint256,bytes)',
  '0xb61d27f6',
);
export const EXECUTE_BATCH_SELECTOR = computedSelector(
  'executeBatch(address[],uint256[],bytes[])',
  '0x34fcd5be',
);
// Plugin lifecycle (bible §4.1)
export const ON_INSTALL_SELECTOR = computedSelector('onInstall(bytes)', '0x6d61fe70');
export const ON_UNINSTALL_SELECTOR = computedSelector('onUninstall(bytes)', '0x8a91b0e3');
// HallpassPlugin installed execution functions (no bible literals — computed only)
export const REVOKE_SESSION_SELECTOR = computedSelector('revokeSession()');
export const UPDATE_POLICY_SELECTOR = computedSelector(
  'updatePolicy(address,uint256,uint256,uint256,uint256,address[])',
);
// Manifest read (no args; raw return data is keccak256'd — see fetchManifestHash)
export const PLUGIN_MANIFEST_SELECTOR = computedSelector('pluginManifest()');

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------

/** Circle MSCA account surface the dashboard touches (bible §4.1). */
export const accountAbi = [
  'function installPlugin(address plugin, bytes32 manifestHash, bytes pluginInstallData, tuple(address plugin, uint8 functionId)[] dependencies)',
  'function uninstallPlugin(address plugin, bytes uninstallData, bytes dependencies)',
  'function execute(address target, uint256 value, bytes data)',
  'function executeBatch(address[] targets, uint256[] values, bytes[] datas)',
  'function getInstalledPlugins() view returns (address[])',
  'function initializeUpgradableMSCA(address[] plugins, bytes32[] manifestHashes, bytes[] initDatas)',
  'function isValidSignature(bytes32 digest, bytes sig) view returns (bytes4)',
] as const;

/** HallpassPlugin: policy setters, getters, events, custom errors. */
export const pluginAbi = [
  // --- installed execution functions (called via the account fallback) ---
  'function revokeSession()',
  'function updatePolicy(address sessionKey, uint256 perTxCap, uint256 windowCap, uint256 windowSecs, uint256 expiry, address[] allowlist)',
  // --- policy read ---
  'function policies(address account) view returns (address sessionKey, address owner, uint256 perTxCap, uint256 windowCap, uint256 windowSecs, uint256 expiry, address[] allowlist, uint256 windowStart, uint256 windowSpent, bool revoked)',
  // --- events (activity feed, bible §8.6) ---
  'event SessionRegistered(address indexed account, address indexed sessionKey, uint256 perTxCap, uint256 windowCap, uint256 expiry)',
  'event SpendAuthorized(address indexed account, address indexed sessionKey, address indexed to, uint256 amount, uint256 windowSpent)',
  'event SessionRevokedEvt(address indexed account, address indexed sessionKey)',
  'event PolicyUpdated(address indexed account, uint256 perTxCap, uint256 windowCap, uint256 expiry)',
  // --- custom errors (decoded to user-facing copy, bible hard rule 4) ---
  'error SessionRevoked()',
  'error SessionExpired(uint256 nowTs, uint256 expiry)',
  'error PerTxCapExceeded(uint256 amount, uint256 cap)',
  'error WindowCapExceeded(uint256 windowSpentAfter, uint256 cap)',
  'error RecipientNotAllowed(address target)',
  'error UnknownSigner(address signer)',
  'error UnsupportedExecution(bytes4 sel)',
  'error BadInit()',
  'error UnknownFunctionId(uint8 functionId)',
] as const;

/** ERC-4337 v0.7 EntryPoint surface used by the dashboard. */
export const entryPointAbi = [
  'function getNonce(address sender, uint192 key) view returns (uint256)',
  'function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address beneficiary)',
  'function balanceOf(address account) view returns (uint256)',
  'function depositTo(address account) payable',
] as const;

export const erc20Abi = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
] as const;

// ---------------------------------------------------------------------------
// viem clients
// ---------------------------------------------------------------------------

export const RPC_URL =
  env.VITE_RPC_URL || 'https://rpc.mainnet.arc.io';

/** Read-only client on Arc mainnet. Writes go through the user's Reown wallet. */
export const publicClient: PublicClient = createPublicClient({
  chain: arc,
  transport: http(RPC_URL),
});

// ---------------------------------------------------------------------------
// Manifest hash — computed from the DEPLOYED plugin, not from a local struct.
// ---------------------------------------------------------------------------

/**
 * manifestHash = keccak256(abi.encode(plugin.pluginManifest())) — bible §4.6.
 * The raw eth_call return data IS abi.encode(struct), so hashing the raw bytes
 * reproduces the proven recipe exactly (w1a-minimal-install.js) without
 * hand-reconstructing Circle's PluginManifest struct (which would be a
 * recall-the-layout bug farm — bible rule 8).
 */
export async function fetchManifestHash(
  client: PublicClient,
  plugin: Address,
): Promise<Hex> {
  const { data } = await client.call({
    to: plugin,
    data: PLUGIN_MANIFEST_SELECTOR,
  });
  if (!data || data === '0x') {
    throw new Error(
      `Plugin ${plugin} returned no manifest — it is not a valid ERC-6900 plugin.`,
    );
  }
  return keccak256(data);
}

export interface PluginVerification {
  hasCode: boolean;
  supportsIPlugin: boolean; // ERC-165 0x043140ed (bible §4.1)
  manifestHash: Hex;
  matchesConfigured: boolean | null; // null when no configured hash to compare
}

/**
 * Pre-install safety gate (bible §8.3): a plugin with no code on 5042, or whose
 * on-chain manifest hash differs from the configured reference, is UNVERIFIED
 * and the Install button must stay disabled with the reason shown.
 */
export async function verifyPlugin(
  client: PublicClient,
  plugin: Address,
): Promise<PluginVerification> {
  if (!isAddress(plugin)) throw new Error(`Not an address: ${plugin}`);
  const code = await client.getBytecode({ address: plugin });
  const hasCode = !!code && code !== '0x';
  let supportsIPlugin = false;
  let manifestHash: Hex = '0x';
  if (hasCode) {
    try {
      supportsIPlugin = await client.readContract({
        address: plugin,
        abi: ['function supportsInterface(bytes4) view returns (bool)'] as const,
        functionName: 'supportsInterface',
        args: ['0x043140ed' as Hex],
      });
    } catch {
      supportsIPlugin = false;
    }
    manifestHash = await fetchManifestHash(client, plugin);
  }
  return {
    hasCode,
    supportsIPlugin,
    manifestHash,
    matchesConfigured: CONFIGURED_MANIFEST_HASH
      ? manifestHash.toLowerCase() === CONFIGURED_MANIFEST_HASH.toLowerCase()
      : null,
  };
}

// ---------------------------------------------------------------------------
// Calldata helpers
// ---------------------------------------------------------------------------

export interface PolicyParams {
  sessionKey: Address;
  owner: Address;
  /** Native-wei (18-decimal) caps — convert at the boundary, never guess. */
  perTxCapWei: bigint;
  windowCapWei: bigint;
  windowSecs: bigint;
  /** Unix timestamp. */
  expiry: bigint;
  /** Empty = open (caps-only mode), stated explicitly in the UI (bible §8.4). */
  allowlist: Address[];
}

/**
 * onInstall init data: abi.encode(sessionKey, owner, perTxCap, windowCap,
 * windowSecs, expiry, allowlist) — bible §4.2.
 */
export function encodePolicyInitData(p: PolicyParams): Hex {
  return encodeAbiParameters(
    parseAbiParameters('address, address, uint256, uint256, uint256, uint256, address[]'),
    [p.sessionKey, p.owner, p.perTxCapWei, p.windowCapWei, p.windowSecs, p.expiry, p.allowlist],
  );
}

/**
 * Call a plugin's installed execution function THROUGH THE ACCOUNT FALLBACK.
 * revokeSession / updatePolicy must NOT be wrapped in account.execute(plugin, …)
 * — the wrapped call reverts on-chain (bible §4.2 / §6.2 genuine findings).
 */
export function encodeAccountFallbackCalldata(
  functionName: 'revokeSession' | 'updatePolicy',
  args: readonly unknown[] = [],
): Hex {
  if (functionName === 'revokeSession') {
    return REVOKE_SESSION_SELECTOR as Hex;
  }
  const [sessionKey, perTxCap, windowCap, windowSecs, expiry, allowlist] = args as [
    Address,
    bigint,
    bigint,
    bigint,
    bigint,
    Address[],
  ];
  // encodeFunctionData-equivalent without a full ABI import:
  return (UPDATE_POLICY_SELECTOR +
    encodeAbiParameters(
      parseAbiParameters('address, uint256, uint256, uint256, uint256, address[]'),
      [sessionKey, perTxCap, windowCap, windowSecs, expiry, allowlist],
    ).slice(2)) as Hex;
}

// ---------------------------------------------------------------------------
// Decimals — the day-0 gate (bible §5.0).
// ERC-20 USDC: 6. Native gas USDC: 18. Policy caps are NATIVE wei (18).
// ---------------------------------------------------------------------------

export const NATIVE_USDC_DECIMALS = 18;
export const ERC20_USDC_DECIMALS = 6;

/** Human USDC string → native wei (18). Throws on invalid input. */
export function usdcToNativeWei(amount: string): bigint {
  const [whole = '0', frac = ''] = amount.trim().split('.');
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(frac) || frac.length > NATIVE_USDC_DECIMALS) {
    throw new Error(`Invalid USDC amount: ${amount}`);
  }
  return BigInt(whole) * 10n ** 18n + BigInt((frac + '0'.repeat(18)).slice(0, 18) || '0');
}

/** Human USDC string → ERC-20 token units (6). */
export function usdcToTokenUnits(amount: string): bigint {
  const [whole = '0', frac = ''] = amount.trim().split('.');
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(frac) || frac.length > ERC20_USDC_DECIMALS) {
    throw new Error(`Invalid USDC amount: ${amount}`);
  }
  return BigInt(whole) * 10n ** 6n + BigInt((frac + '0'.repeat(6)).slice(0, 6) || '0');
}

/** Native wei (18) → human USDC string, e.g. "0.10". */
export function formatNativeUsdc(wei: bigint): string {
  const s = wei.toString().padStart(19, '0');
  const whole = s.slice(0, -18);
  const frac = s.slice(-18).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

// ---------------------------------------------------------------------------
// Revert decoding → user-facing copy (bible hard rule 4). A raw hex blob shown
// to a user is a bug.
// ---------------------------------------------------------------------------

export interface DecodedRevert {
  name: string;
  message: string;
}

export function decodeHallpassRevert(data: Hex): DecodedRevert {
  try {
    const decoded = decodeErrorResult({ abi: pluginAbi, data });
    const a = decoded.args as unknown[];
    switch (decoded.errorName) {
      case 'PerTxCapExceeded':
        return {
          name: decoded.errorName,
          message: `Blocked: ${formatNativeUsdc(a[0] as bigint)} USDC exceeds your ${formatNativeUsdc(a[1] as bigint)} USDC per-payment cap. Nothing was spent. Fix: the owner can raise the per-payment cap in the policy editor.`,
        };
      case 'WindowCapExceeded':
        return {
          name: decoded.errorName,
          message: `Blocked: this payment would take the rolling window to ${formatNativeUsdc(a[0] as bigint)} USDC, over the ${formatNativeUsdc(a[1] as bigint)} USDC window cap. Nothing was spent. Fix: wait for the window to reset, or the owner can raise the window cap.`,
        };
      case 'SessionExpired':
        return {
          name: decoded.errorName,
          message: `Blocked: this session key expired on ${new Date(Number(a[1] as bigint) * 1000).toUTCString()}. Nothing was spent. Fix: the owner can register a new session key.`,
        };
      case 'SessionRevoked':
        return { name: decoded.errorName, message: 'Blocked: this session key was revoked by the owner. Nothing was spent. Fix: the owner can register a new key.' };
      case 'RecipientNotAllowed':
        return {
          name: decoded.errorName,
          message: `Blocked: ${a[0] as string} is not on this session's recipient allowlist. Nothing was spent. Fix: the owner can add this address to the allowlist.`,
        };
      case 'UnknownSigner':
        return { name: decoded.errorName, message: `Blocked: ${a[0] as string} is not an authorized signer for this account.` };
      case 'UnsupportedExecution':
        return { name: decoded.errorName, message: `Blocked: this operation type (${a[0] as string}) is not covered by the policy plugin.` };
      case 'BadInit':
        return { name: decoded.errorName, message: 'Invalid policy parameters — check the session key and caps, then try again.' };
      default:
        return { name: decoded.errorName, message: `Transaction reverted: ${decoded.errorName}. Nothing was spent.` };
    }
  } catch {
    return { name: 'Unknown', message: 'Transaction reverted. The chain refused it — nothing was spent.' };
  }
}

// ---------------------------------------------------------------------------
// Read helpers used across the dashboard
// ---------------------------------------------------------------------------

/** Source of truth for installed-state (bible §4.1). */
export async function getInstalledPlugins(
  client: PublicClient,
  account: Address,
): Promise<Address[]> {
  return client.readContract({
    address: account,
    abi: accountAbi,
    functionName: 'getInstalledPlugins',
  });
}

export async function isPluginInstalled(
  client: PublicClient,
  account: Address,
  plugin: Address,
): Promise<boolean> {
  const installed = await getInstalledPlugins(client, account);
  return installed.some((p) => p.toLowerCase() === plugin.toLowerCase());
}

/** ERC-20 USDC balance (6 decimals) of an account. */
export async function getUsdcBalance(client: PublicClient, account: Address): Promise<bigint> {
  return client.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account],
  });
}

export { ARC_CHAIN_ID };
