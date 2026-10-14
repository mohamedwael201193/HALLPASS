// HALLPASS userOp layer — ERC-4337 v0.7 PackedUserOperation builders.
// Bible §4.6 (exact install recipe — proven on Arc mainnet), §9 (self-relay:
// no public v0.7 bundler exists on Arc).
//
// What this file implements (all proven in research):
//   1. encodeInstallPluginCalldata — selector f85730f4 + §4.6 arg layout.
//   2. buildInstallPluginUserOp — v0.7 PackedUserOperation with the proven
//      gas values (verification 400k, call 1M, preVerification 120k).
//   3. getUserOpHash — the §4.6 double-keccak recipe (chain 5042).
//   4. signUserOpHash — owner signs eth_signed_message(userOpHash) via the
//      connected Reown wallet; multisig-owner v+32 transform included.
//   5. submitUserOpDirect — the dashboard itself self-relays handleOps
//      (bible §9: "for low-volume operators, the dashboard itself").
// TODO (honest): backend relay POST — VITE_RELAY_URL endpoint contract is
//   pending from the relay team; relayUserOperationViaBackend throws a clear
//   error until then. Bundler support: NONE exists on Arc (proven) — do not
//   claim it in UI copy.
//
// HARD RULES: no private keys here or anywhere in the frontend. Session keys
// are generated client-side and shown once; the owner key lives in the
// user's wallet (Reown) — never in our code, never logged.

import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  keccak256,
  parseAbiParameters,
  parseEther,
  parseSignature,
  toHex,
} from 'viem';
import { signMessage } from 'viem/actions';
import {
  ENTRYPOINT_ADDRESS,
  entryPointAbi,
  accountAbi,
  encodePolicyInitData,
  type PolicyParams,
} from './contracts';
import { ARC_CHAIN_ID } from './wagmi';

// ---------------------------------------------------------------------------
// Proven gas values from the research install txs (bible §4.6).
// NOTE: Arc base fee is PINNED at 20 gwei (measured, bible §5.0) — maxFeePerGas
// must clear it, hence 22 gwei. Re-measure before changing these.
// ---------------------------------------------------------------------------

export const PROVEN_GAS = {
  verificationGasLimit: 400_000n,
  callGasLimit: 1_000_000n,
  preVerificationGas: 120_000n,
  maxPriorityFeePerGas: parseEther('0.000000002'), // 2 gwei
  maxFeePerGas: parseEther('0.000000022'), // 22 gwei
} as const;

export interface PackedUserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex; // bytes32: verificationGasLimit (high) ++ callGasLimit (low)
  preVerificationGas: bigint;
  gasFees: Hex; // bytes32: maxPriorityFeePerGas (high) ++ maxFeePerGas (low)
  paymasterAndData: Hex; // 0x — gas is USDC from the account balance/deposit
  signature: Hex; // 0x until the owner signs
}

// ---------------------------------------------------------------------------
// 1. installPlugin calldata — bible §4.6
//    installPlugin(plugin, manifestHash, pluginInstallData, dependencies)
// ---------------------------------------------------------------------------

export function encodeInstallPluginCalldata(
  plugin: Address,
  manifestHash: Hex,
  initData: Hex,
  dependencies: { plugin: Address; functionId: number }[] = [],
): Hex {
  return encodeFunctionData({
    abi: accountAbi,
    functionName: 'installPlugin',
    args: [plugin, manifestHash, initData, dependencies],
  });
}

// ---------------------------------------------------------------------------
// 2. Build the unsigned v0.7 userOp for an install.
// ---------------------------------------------------------------------------

export interface BuildInstallUserOpArgs extends PolicyParams {
  account: Address;
  pluginAddress: Address;
  manifestHash: Hex;
  entryPoint?: Address;
}

export async function buildInstallPluginUserOp(
  client: PublicClient,
  args: BuildInstallUserOpArgs,
): Promise<{ userOp: PackedUserOperation; initData: Hex; callData: Hex }> {
  const entryPoint = args.entryPoint ?? ENTRYPOINT_ADDRESS;
  const initData = encodePolicyInitData(args);
  const callData = encodeInstallPluginCalldata(args.pluginAddress, args.manifestHash, initData);

  const nonce = await client.readContract({
    address: entryPoint,
    abi: entryPointAbi,
    functionName: 'getNonce',
    args: [args.account, 0n],
  });

  const accountGasLimits = encodePacked(
    ['uint128', 'uint128'],
    [PROVEN_GAS.verificationGasLimit, PROVEN_GAS.callGasLimit],
  );
  const gasFees = encodePacked(
    ['uint128', 'uint128'],
    [PROVEN_GAS.maxPriorityFeePerGas, PROVEN_GAS.maxFeePerGas],
  );

  return {
    userOp: {
      sender: args.account,
      nonce,
      initCode: '0x',
      callData,
      accountGasLimits,
      preVerificationGas: PROVEN_GAS.preVerificationGas,
      gasFees,
      paymasterAndData: '0x',
      signature: '0x',
    },
    initData,
    callData,
  };
}

// ---------------------------------------------------------------------------
// 3. userOpHash — bible §4.6 recipe (ERC-4337 v0.7)
// ---------------------------------------------------------------------------

export function getUserOpHash(
  userOp: PackedUserOperation,
  entryPoint: Address = ENTRYPOINT_ADDRESS,
  chainId: number = ARC_CHAIN_ID,
): Hex {
  const packed = encodeAbiParameters(
    parseAbiParameters('address, uint256, bytes32, bytes32, bytes32, uint256, bytes32, bytes32'),
    [
      userOp.sender,
      userOp.nonce,
      keccak256(userOp.initCode),
      keccak256(userOp.callData),
      userOp.accountGasLimits,
      userOp.preVerificationGas,
      userOp.gasFees,
      keccak256(userOp.paymasterAndData),
    ],
  );
  return keccak256(
    encodeAbiParameters(parseAbiParameters('bytes32, address, uint256'), [
      keccak256(packed),
      entryPoint,
      BigInt(chainId),
    ]),
  );
}

// ---------------------------------------------------------------------------
// 4. Owner signing.
//    The owner signs eth_signed_message(userOpHash) with the connected Reown
//    wallet (wagmi/viem signMessage applies the EIP-191 prefix — exactly the
//    proven "digest = hashMessage(userOpHash)" pattern).
//    Multisig-owned accounts: signature wire format is r ‖ s ‖ (v+32)
//    (last byte 59/60 — proven, bible §4.6).
// ---------------------------------------------------------------------------

export type OwnerKind = 'eoa' | 'multisig';

/** Owner signs the userOp hash. No private key material — the wallet signs. */
export async function signUserOpHash(
  walletClient: WalletClient,
  owner: Address,
  userOpHash: Hex,
  ownerKind: OwnerKind = 'eoa',
): Promise<Hex> {
  const raw = await signMessage(walletClient, {
    account: owner,
    message: { raw: userOpHash },
  });
  if (ownerKind === 'eoa') return raw;
  // Multisig owner: r ‖ s ‖ (v+32)
  const { r, s, v } = parseSignature(raw);
  if (v === undefined) throw new Error('Cannot derive v from owner signature');
  return encodePacked(['bytes32', 'bytes32', 'uint8'], [r, s, Number(v) + 32]) as Hex;
}

// ---------------------------------------------------------------------------
// EntryPoint deposit — bible §4.6 step 1.
// The account's deposit must cover
//   (verificationGasLimit + callGasLimit + preVerificationGas) × maxFeePerGas
// or handleOps reverts FailedOp(0, "AA13 didn't pay prefund").
// ---------------------------------------------------------------------------

export function estimatePrefund(userOp: PackedUserOperation): bigint {
  const gasLimit =
    BigInt(
      `0x${userOp.accountGasLimits.slice(2, 34)}`, // verificationGasLimit (high 128)
    ) +
    BigInt(`0x${userOp.accountGasLimits.slice(34, 66)}`) + // callGasLimit (low 128)
    userOp.preVerificationGas;
  const maxFee = BigInt(`0x${userOp.gasFees.slice(34, 66)}`); // maxFeePerGas (low 128)
  return gasLimit * maxFee;
}

export async function getEntryPointDeposit(
  client: PublicClient,
  account: Address,
  entryPoint: Address = ENTRYPOINT_ADDRESS,
): Promise<bigint> {
  return client.readContract({
    address: entryPoint,
    abi: entryPointAbi,
    functionName: 'balanceOf',
    args: [account],
  });
}

/**
 * Top up the account's EntryPoint deposit (owner wallet pays; native USDC).
 * Call this when estimatePrefund(userOp) > deposit, else AA13.
 */
export async function topUpEntryPointDeposit(
  walletClient: WalletClient,
  owner: Address,
  account: Address,
  amountWei: bigint,
  entryPoint: Address = ENTRYPOINT_ADDRESS,
): Promise<Hex> {
  return walletClient.writeContract({
    account: owner,
    address: entryPoint,
    abi: entryPointAbi,
    functionName: 'depositTo',
    args: [account],
    value: amountWei,
    chain: walletClient.chain,
  });
}

// ---------------------------------------------------------------------------
// 5a. Dashboard self-relay — submit handleOps from the owner's wallet.
//     (bible §9: no public bundler on Arc; the dashboard itself can relay.)
//     The submitting wallet pays USDC gas; `beneficiary` receives the prefund
//     settlement, so it must be the wallet that submitted.
// ---------------------------------------------------------------------------

export async function submitUserOpDirect(
  walletClient: WalletClient,
  relayer: Address, // = the connected owner wallet
  userOp: PackedUserOperation,
  entryPoint: Address = ENTRYPOINT_ADDRESS,
): Promise<Hex> {
  if (userOp.signature === '0x') {
    throw new Error('UserOp is unsigned — call signUserOpHash first.');
  }
  return walletClient.writeContract({
    account: relayer,
    address: entryPoint,
    abi: entryPointAbi,
    functionName: 'handleOps',
    args: [[userOp], relayer],
    chain: walletClient.chain,
  });
}

// ---------------------------------------------------------------------------
// 5b. Backend relay — TODO (honest).
//     The relay service (backend team) exposes POST {relayUrl}/userops with
//     { userOp, entryPoint, chainId } and self-relays handleOps with its own
//     funded key (bible §3 diagram). The endpoint contract is pending — this
//     throws a clear, actionable error until it is wired.
// ---------------------------------------------------------------------------

export class RelayNotConfiguredError extends Error {
  constructor() {
    super(
      'UserOp relay is not configured: VITE_RELAY_URL is not set. ' +
        'Use the direct path (dashboard self-relay) instead, or configure the relay backend.',
    );
    this.name = 'RelayNotConfiguredError';
  }
}

export async function relayUserOperationViaBackend(
  _userOp: PackedUserOperation,
): Promise<Hex> {
  const relayUrl = (import.meta.env as unknown as Record<string, string | undefined>)
    .VITE_RELAY_URL;
  if (!relayUrl) throw new RelayNotConfiguredError();
  // TODO: POST to `${relayUrl}/userops` once the relay API contract lands.
  // The backend must: validate the userOp, call EntryPoint.handleOps([userOp],
  // beneficiary), and return the tx hash. Tracked as an open item — do not
  // ship UI copy implying this path works.
  throw new Error(
    'Backend relay endpoint contract is not implemented yet. ' +
      'Use submitUserOpDirect (dashboard self-relay) for now.',
  );
}

// ---------------------------------------------------------------------------
// Direct install — hallpass-first accounts only.
// On a fresh hallpass-first account the owner calls installPlugin directly
// (bible §3: "the owner can call installPlugin directly"). On EXISTING /
// multisig-owned accounts a direct EOA call reverts RuntimeValidationFailed —
// use the userOp path above there (bible §4.1).
// ---------------------------------------------------------------------------

export async function installPluginDirect(
  walletClient: WalletClient,
  owner: Address,
  account: Address,
  plugin: Address,
  manifestHash: Hex,
  initData: Hex,
): Promise<Hex> {
  return walletClient.writeContract({
    account: owner,
    address: account,
    abi: accountAbi,
    functionName: 'installPlugin',
    args: [plugin, manifestHash, initData, []],
    chain: walletClient.chain,
  });
}

/** Generate a fresh session-key EOA client-side (shown once, never stored). */
export { generatePrivateKey as generateSessionKeyMaterial } from 'viem/accounts';

/** toHex re-export for address/bytes32 packing conveniences in callers. */
export { toHex };
