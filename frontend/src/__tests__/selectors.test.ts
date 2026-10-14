// Selector regression tests — the gate the 2026-10-14 /app black screen
// made necessary.
//
// On 2026-10-14 the frontend asserted the ERC-4337 SimpleAccount form
//   executeBatch(address[],uint256[],bytes[])  ->  0x47e1da2a
// while the deployed HallpassPlugin (0x5543fb53...0D3d9) hard-codes and
// validates the ERC-6900 IStandardExecutor struct-array form
//   executeBatch((address,uint256,bytes)[])     ->  0x34fcd5be
// The stale expected value threw at module load and black-screened /app.
// These tests pin the ON-CHAIN reality as literals: if anyone edits a
// signature or a literal in src/lib/contracts.ts so the app drifts back to
// the parallel-array form (or any wrong selector), the suite fails.
//
// None of these are tautologies: the expected values below are pinned to
// the deployed plugin's Sourcify exact_match ABI and the canonical ERC-6900
// / ERC-4337 v0.7 signatures, not to whatever contracts.ts currently says.

import { describe, expect, it } from 'vitest';
import { toFunctionSelector } from 'viem';
import {
  EXECUTE_BATCH_SELECTOR,
  EXECUTE_SELECTOR,
  INSTALL_PLUGIN_SELECTOR,
  ON_INSTALL_SELECTOR,
  ON_UNINSTALL_SELECTOR,
  PLUGIN_MANIFEST_SELECTOR,
  REVOKE_SESSION_SELECTOR,
  SELECTOR_EXPECTATIONS,
  UNINSTALL_PLUGIN_SELECTOR,
  UPDATE_POLICY_SELECTOR,
} from '../lib/contracts';

// The value hard-coded in the DEPLOYED plugin (Sourcify exact_match ABI of
// 0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9). This is what on-chain
// reality validates; the app must route batches through exactly this.
const ON_CHAIN_EXECUTE_BATCH = '0x34fcd5be';
// The trap: ERC-4337 SimpleAccount parallel-array form. Looks plausible,
// produces a clean-looking selector — and is NOT what the plugin enforces.
const PARALLEL_ARRAY_TRAP = '0x47e1da2a';

describe('2026-10-14 executeBatch regression (the /app black screen)', () => {
  it('the ERC-6900 struct-array form computes to 0x34fcd5be', () => {
    expect(toFunctionSelector('executeBatch((address,uint256,bytes)[])')).toBe(
      ON_CHAIN_EXECUTE_BATCH,
    );
  });

  it('documents the trap: the parallel-array form is a DIFFERENT selector', () => {
    expect(toFunctionSelector('executeBatch(address[],uint256[],bytes[])')).toBe(
      PARALLEL_ARRAY_TRAP,
    );
    expect(PARALLEL_ARRAY_TRAP).not.toBe(ON_CHAIN_EXECUTE_BATCH);
  });

  it('the app uses the on-chain selector, never the trap', () => {
    expect(EXECUTE_BATCH_SELECTOR).toBe(ON_CHAIN_EXECUTE_BATCH);
    expect(EXECUTE_BATCH_SELECTOR).not.toBe(PARALLEL_ARRAY_TRAP);
  });

  it('SELECTOR_EXPECTATIONS pins executeBatch to the on-chain value', () => {
    expect(SELECTOR_EXPECTATIONS['executeBatch((address,uint256,bytes)[])']).toBe(
      ON_CHAIN_EXECUTE_BATCH,
    );
    // and nothing in the expectation table sneaks the trap back in
    for (const [sig, sel] of Object.entries(SELECTOR_EXPECTATIONS)) {
      expect(sel.toLowerCase(), sig).not.toBe(PARALLEL_ARRAY_TRAP);
    }
  });
});

describe('selector literal pins (computed values must equal on-chain reality)', () => {
  // signature -> selector, pinned against the exact_match plugin ABI and
  // Circle MSCA ERC-6900 v0.7 surface. Change any signature string in
  // contracts.ts and these fail.
  const pins: Array<[keyof typeof SELECTOR_EXPECTATIONS, string]> = [
    ['installPlugin(address,bytes32,bytes,(address,uint8)[])', '0xf85730f4'],
    ['uninstallPlugin(address,bytes,bytes)', '0xc1a221f3'],
    ['execute(address,uint256,bytes)', '0xb61d27f6'],
    ['executeBatch((address,uint256,bytes)[])', '0x34fcd5be'],
    ['onInstall(bytes)', '0x6d61fe70'],
    ['onUninstall(bytes)', '0x8a91b0e3'],
  ];

  for (const [sig, expected] of pins) {
    it(`${sig} -> ${expected}`, () => {
      expect(toFunctionSelector(sig)).toBe(expected);
      expect(SELECTOR_EXPECTATIONS[sig].toLowerCase()).toBe(expected);
    });
  }

  it('exported computed selectors equal their pinned literals', () => {
    expect(INSTALL_PLUGIN_SELECTOR).toBe('0xf85730f4');
    expect(UNINSTALL_PLUGIN_SELECTOR).toBe('0xc1a221f3');
    expect(EXECUTE_SELECTOR).toBe('0xb61d27f6');
    expect(EXECUTE_BATCH_SELECTOR).toBe('0x34fcd5be');
    expect(ON_INSTALL_SELECTOR).toBe('0x6d61fe70');
    expect(ON_UNINSTALL_SELECTOR).toBe('0x8a91b0e3');
  });

  it('plugin execution selectors pin to the deployed plugin ABI', () => {
    expect(REVOKE_SESSION_SELECTOR).toBe(toFunctionSelector('revokeSession()'));
    expect(REVOKE_SESSION_SELECTOR).toBe('0xc4605d8c');
    expect(UPDATE_POLICY_SELECTOR).toBe('0xc1c3b4f6');
    expect(PLUGIN_MANIFEST_SELECTOR).toBe('0xc7763130');
  });

  it('selectors are all distinct — no signature collision across the surface', () => {
    const sels = [
      INSTALL_PLUGIN_SELECTOR,
      UNINSTALL_PLUGIN_SELECTOR,
      EXECUTE_SELECTOR,
      EXECUTE_BATCH_SELECTOR,
      ON_INSTALL_SELECTOR,
      ON_UNINSTALL_SELECTOR,
      REVOKE_SESSION_SELECTOR,
      UPDATE_POLICY_SELECTOR,
      PLUGIN_MANIFEST_SELECTOR,
    ];
    expect(new Set(sels).size).toBe(sels.length);
  });

  it('ERC-165 supportsInterface selector is the canonical one', () => {
    // sanity: viem's selector computation itself behaves canonically
    expect(toFunctionSelector('supportsInterface(bytes4)')).toBe('0x01ffc9a7');
  });
});

describe('SELECTOR_EXPECTATIONS table integrity', () => {
  it('every expectation entry recomputes to its pinned value', () => {
    for (const [sig, expected] of Object.entries(SELECTOR_EXPECTATIONS)) {
      expect(toFunctionSelector(sig).toLowerCase(), sig).toBe(expected.toLowerCase());
    }
  });

  it('the table has no empty or malformed selectors', () => {
    const entries = Object.entries(SELECTOR_EXPECTATIONS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [sig, sel] of entries) {
      expect(sel, sig).toMatch(/^0x[0-9a-fA-F]{8}$/);
    }
  });
});
