// Revert decoding tests (decodeHallpassRevert).
//
// Bible hard rule 4: a raw hex blob shown to a user is a bug. These tests
// build REAL error payloads with viem's encodeErrorResult against the actual
// pluginAbi, then assert the decoded copy is human, names the right error,
// and always contains the "Nothing was spent" reassurance where applicable.

import { describe, expect, it } from 'vitest';
import { encodeErrorResult, parseAbi, type Hex } from 'viem';
import { decodeHallpassRevert, pluginAbi } from '../lib/contracts';

// encodeErrorResult needs parsed ABI items; decodeHallpassRevert takes the
// raw human-readable strings. Same ABI either way — parseAbi just resolves
// the string form viem's encoder requires.
const parsedPluginAbi = parseAbi(pluginAbi as unknown as string[]);

function encodedError(name: string, args: unknown[]): Hex {
  return encodeErrorResult({ abi: parsedPluginAbi, errorName: name, args: args as never });
}

describe('decodeHallpassRevert', () => {
  it('decodes PerTxCapExceeded with human-readable amounts', () => {
    const data = encodedError('PerTxCapExceeded', [200_000_000_000_000_000n, 100_000_000_000_000_000n]);
    const out = decodeHallpassRevert(data);
    expect(out.name).toBe('PerTxCapExceeded');
    expect(out.message).toMatch(/exceeds your/);
    expect(out.message).toMatch(/0\.2 USDC/);
    expect(out.message).toMatch(/0\.1 USDC/);
    expect(out.message).toMatch(/Nothing was spent/);
    expect(out.message).toMatch(/owner can raise the per-payment cap/);
  });

  it('decodes WindowCapExceeded', () => {
    const data = encodedError('WindowCapExceeded', [1_500_000_000_000_000_000n, 1_000_000_000_000_000_000n]);
    const out = decodeHallpassRevert(data);
    expect(out.name).toBe('WindowCapExceeded');
    expect(out.message).toMatch(/rolling window/);
    expect(out.message).toMatch(/1\.5 USDC/);
    expect(out.message).toMatch(/Nothing was spent/);
  });

  it('decodes SessionExpired with a readable expiry date', () => {
    const expiry = 1_800_000_000n; // a fixed unix timestamp
    const data = encodedError('SessionExpired', [1_800_000_001n, expiry]);
    const out = decodeHallpassRevert(data);
    expect(out.name).toBe('SessionExpired');
    expect(out.message).toMatch(/expired/);
    expect(out.message).toMatch(/GMT/); // toUTCString renders a GMT date
    expect(out.message).toMatch(/register a new session key/);
  });

  it('decodes SessionRevoked without needing arguments', () => {
    const data = encodedError('SessionRevoked', []);
    const out = decodeHallpassRevert(data);
    expect(out.name).toBe('SessionRevoked');
    expect(out.message).toMatch(/revoked by the owner/);
    expect(out.message).toMatch(/Nothing was spent/);
  });

  it('decodes RecipientNotAllowed and names the blocked address', () => {
    const bad = '0x9999999999999999999999999999999999999999';
    const data = encodedError('RecipientNotAllowed', [bad]);
    const out = decodeHallpassRevert(data);
    expect(out.name).toBe('RecipientNotAllowed');
    expect(out.message).toContain(bad);
    expect(out.message).toMatch(/allowlist/);
  });

  it('decodes UnknownSigner and names the signer', () => {
    const signer = '0x8888888888888888888888888888888888888888';
    const data = encodedError('UnknownSigner', [signer]);
    const out = decodeHallpassRevert(data);
    expect(out.name).toBe('UnknownSigner');
    expect(out.message).toContain(signer);
  });

  it('decodes UnsupportedExecution and BadInit without crashing', () => {
    expect(decodeHallpassRevert(encodedError('UnsupportedExecution', ['0x34fcd5be' as Hex])).name).toBe(
      'UnsupportedExecution',
    );
    const badInit = decodeHallpassRevert(encodedError('BadInit', []));
    expect(badInit.name).toBe('BadInit');
    expect(badInit.message).toMatch(/Invalid policy parameters/);
  });

  it('falls back gracefully on garbage data — never throws', () => {
    const out = decodeHallpassRevert('0xdeadbeef' as Hex);
    expect(out.name).toBe('Unknown');
    expect(out.message).toMatch(/reverted/);
    expect(() => decodeHallpassRevert('0x' as Hex)).not.toThrow();
  });
});
