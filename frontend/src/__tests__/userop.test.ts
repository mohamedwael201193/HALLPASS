// userOp layer tests (src/lib/userops.ts).
//
// Covers: the ERC-4337 v0.7 userOpHash recipe (bible §4.6), the accountGasLimits
// / gasFees byte packing order (high-128 vs low-128 — swapped fields here
// would underfund the prefund and produce AA13 on-chain), the AA13 prefund
// estimator, the proven gas constants (Arc base fee is pinned at 20 gwei), and
// the honest unconfigured-relay error path (no mocks: VITE_RELAY_URL is
// genuinely unset in the test env).

import { describe, expect, it } from 'vitest';
import { encodePacked, type Address, type Hex } from 'viem';
import {
  PROVEN_GAS,
  estimatePrefund,
  getUserOpHash,
  relayUserOperationViaBackend,
  RelayNotConfiguredError,
  type PackedUserOperation,
} from '../lib/userops';
import { ENTRYPOINT_ADDRESS } from '../lib/contracts';
import { ARC_CHAIN_ID } from '../lib/wagmi';

const SENDER = '0x3333333333333333333333333333333333333333' as Address;

function sampleUserOp(overrides: Partial<PackedUserOperation> = {}): PackedUserOperation {
  return {
    sender: SENDER,
    nonce: 7n,
    initCode: '0x',
    callData: '0xf85730f41111',
    accountGasLimits: encodePacked(['uint128', 'uint128'], [400_000n, 1_000_000n]),
    preVerificationGas: 120_000n,
    gasFees: encodePacked(['uint128', 'uint128'], [2_000_000_000n, 22_000_000_000n]),
    paymasterAndData: '0x',
    signature: '0x',
    ...overrides,
  };
}

describe('PROVEN_GAS constants (bible §4.6, re-measure before changing)', () => {
  it('pins the proven gas limits', () => {
    expect(PROVEN_GAS.verificationGasLimit).toBe(400_000n);
    expect(PROVEN_GAS.callGasLimit).toBe(1_000_000n);
    expect(PROVEN_GAS.preVerificationGas).toBe(120_000n);
  });

  it('maxFeePerGas clears the pinned 20 gwei Arc base fee', () => {
    expect(PROVEN_GAS.maxPriorityFeePerGas).toBe(2_000_000_000n); // 2 gwei
    expect(PROVEN_GAS.maxFeePerGas).toBe(22_000_000_000n); // 22 gwei
    expect(PROVEN_GAS.maxFeePerGas).toBeGreaterThan(20_000_000_000n);
    expect(PROVEN_GAS.maxFeePerGas).toBeGreaterThan(PROVEN_GAS.maxPriorityFeePerGas);
  });
});

describe('accountGasLimits / gasFees byte packing order', () => {
  it('high 128 bits are verificationGasLimit, low 128 are callGasLimit', () => {
    const packed = encodePacked(['uint128', 'uint128'], [400_000n, 1_000_000n]);
    expect(packed).toHaveLength(66); // 0x + 64 hex
    expect(BigInt(`0x${packed.slice(2, 34)}`)).toBe(400_000n);
    expect(BigInt(`0x${packed.slice(34, 66)}`)).toBe(1_000_000n);
  });

  it('gasFees: high 128 are maxPriorityFeePerGas, low 128 are maxFeePerGas', () => {
    const packed = encodePacked(['uint128', 'uint128'], [2_000_000_000n, 22_000_000_000n]);
    expect(BigInt(`0x${packed.slice(2, 34)}`)).toBe(2_000_000_000n);
    expect(BigInt(`0x${packed.slice(34, 66)}`)).toBe(22_000_000_000n);
  });
});

describe('estimatePrefund (AA13 guard)', () => {
  it('equals (verification + call + preVerification) * maxFeePerGas', () => {
    const userOp = sampleUserOp();
    // computed from first principles, not from the code's slicing logic:
    // (400_000 + 1_000_000 + 120_000) gas * 22e9 wei
    expect(estimatePrefund(userOp)).toBe(1_520_000n * 22_000_000_000n);
    expect(estimatePrefund(userOp)).toBe(33_440_000_000_000_000n);
  });

  it('a swapped gas-fees packing order would produce a different prefund', () => {
    const swappedFees = encodePacked(['uint128', 'uint128'], [22_000_000_000n, 2_000_000_000n]);
    const userOp = sampleUserOp({ gasFees: swappedFees });
    expect(estimatePrefund(userOp)).not.toBe(33_440_000_000_000_000n);
    expect(estimatePrefund(userOp)).toBe(1_520_000n * 2_000_000_000n);
  });

  it('grows with gas limits — a bigger op needs a bigger deposit', () => {
    const big = sampleUserOp({
      accountGasLimits: encodePacked(['uint128', 'uint128'], [800_000n, 2_000_000n]),
    });
    expect(estimatePrefund(big)).toBeGreaterThan(estimatePrefund(sampleUserOp()));
  });
});

describe('getUserOpHash (ERC-4337 v0.7 recipe, chain 5042)', () => {
  it('returns a 32-byte hash', () => {
    const hash = getUserOpHash(sampleUserOp());
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('is deterministic for the same inputs', () => {
    expect(getUserOpHash(sampleUserOp())).toBe(getUserOpHash(sampleUserOp()));
  });

  it('changes when any signed field changes', () => {
    const base = getUserOpHash(sampleUserOp());
    expect(getUserOpHash(sampleUserOp({ nonce: 8n }))).not.toBe(base);
    expect(getUserOpHash(sampleUserOp({ callData: '0xdeadbeef' }))).not.toBe(base);
    expect(getUserOpHash(sampleUserOp({ sender: '0x4444444444444444444444444444444444444444' as Address }))).not.toBe(base);
    // signature is NOT part of the hash: the unsigned and signed op hash alike
    expect(
      getUserOpHash(sampleUserOp({ signature: ('0x' + '11'.repeat(65)) as Hex })),
    ).toBe(base);
  });

  it('binds the hash to the EntryPoint address and chain id', () => {
    const base = getUserOpHash(sampleUserOp());
    expect(
      getUserOpHash(sampleUserOp(), '0x0000000000000000000000000000000000000001' as Address),
    ).not.toBe(base);
    expect(getUserOpHash(sampleUserOp(), ENTRYPOINT_ADDRESS, 1)).not.toBe(base);
    // defaults are the Arc EntryPoint on Arc mainnet
    expect(getUserOpHash(sampleUserOp(), ENTRYPOINT_ADDRESS, ARC_CHAIN_ID)).toBe(base);
  });
});

describe('relayUserOperationViaBackend honesty', () => {
  it('rejects with a named, actionable error when VITE_RELAY_URL is unset', async () => {
    // No mocking: the test env genuinely has no VITE_RELAY_URL.
    await expect(relayUserOperationViaBackend(sampleUserOp())).rejects.toThrow(
      RelayNotConfiguredError,
    );
    await expect(relayUserOperationViaBackend(sampleUserOp())).rejects.toThrow(
      /VITE_RELAY_URL/,
    );
    const err = (await relayUserOperationViaBackend(sampleUserOp()).catch((e) => e)) as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/direct path|self-relay/i);
  });
});
