// Calldata encoder tests.
//
// These encoders build the exact bytes that go on-chain. A mis-encoded
// install or policy update is not a UI bug — it is a burned tx or, worse, a
// policy that silently means something else. Every encoder here is checked
// against a real ABI decode (viem), not against itself.

import { describe, expect, it } from 'vitest';
import {
  decodeAbiParameters,
  decodeFunctionData,
  type Address,
  type Hex,
} from 'viem';
import {
  encodeAccountFallbackCalldata,
  encodePolicyInitData,
  INSTALL_PLUGIN_SELECTOR,
  PLUGIN_MANIFEST_SELECTOR,
  REVOKE_SESSION_SELECTOR,
  UPDATE_POLICY_SELECTOR,
  USDC_ADDRESS,
  parsedAccountAbi,
  type PolicyParams,
} from '../lib/contracts';
import { encodeInstallPluginCalldata } from '../lib/userops';

const OWNER = '0x1111111111111111111111111111111111111111' as Address;
const SESSION_KEY = '0x2222222222222222222222222222222222222222' as Address;
const PLUGIN = '0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9' as Address;
const MANIFEST = ('0x' + 'ab'.repeat(32)) as Hex;

function samplePolicy(): PolicyParams {
  return {
    sessionKey: SESSION_KEY,
    owner: OWNER,
    perTxCapWei: 100_000_000_000_000_000n, // 0.1 USDC
    windowCapWei: 1_000_000_000_000_000_000n, // 1 USDC
    windowSecs: 86_400n,
    expiry: 1_800_000_000n,
    allowlist: [OWNER],
    tokens: [USDC_ADDRESS],
    tokenDecimals: [18],
  };
}

describe('encodePolicyInitData (onInstall init data, plugin v0.2.0 layout)', () => {
  it('ABI-decodes back to the exact fields in the documented order', () => {
    const encoded = encodePolicyInitData(samplePolicy());
    const [sessionKey, owner, perTxCap, windowCap, windowSecs, expiry, allowlist, tokens, tokenDecimals] =
      decodeAbiParameters(
        [
          { type: 'address', name: 'sessionKey' },
          { type: 'address', name: 'owner' },
          { type: 'uint256', name: 'perTxCap' },
          { type: 'uint256', name: 'windowCap' },
          { type: 'uint256', name: 'windowSecs' },
          { type: 'uint256', name: 'expiry' },
          { type: 'address[]', name: 'allowlist' },
          { type: 'address[]', name: 'tokens' },
          { type: 'uint8[]', name: 'tokenDecimals' },
        ],
        encoded,
      ) as unknown as [Address, Address, bigint, bigint, bigint, bigint, Address[], Address[], number[]];

    const p = samplePolicy();
    expect(sessionKey).toBe(p.sessionKey);
    expect(owner).toBe(p.owner);
    expect(perTxCap).toBe(p.perTxCapWei);
    expect(windowCap).toBe(p.windowCapWei);
    expect(windowSecs).toBe(p.windowSecs);
    expect(expiry).toBe(p.expiry);
    expect(allowlist).toEqual(p.allowlist);
    expect(tokens).toEqual(p.tokens);
    expect(tokenDecimals).toEqual(p.tokenDecimals);
  });

  it('caps stay 18-decimal native wei through the encode (no silent rescale)', () => {
    const encoded = encodePolicyInitData(samplePolicy());
    // perTxCap occupies the third 32-byte slot (offset 64..96 after the
    // two addresses): slot value must be exactly 0.1e18 in hex
    const perTxCapSlot = `0x${encoded.slice(2 + 64 * 2, 2 + 96 * 2)}`;
    expect(BigInt(perTxCapSlot)).toBe(100_000_000_000_000_000n);
  });

  it('supports an empty allowlist (caps-only mode) without breaking the layout', () => {
    const encoded = encodePolicyInitData({ ...samplePolicy(), allowlist: [] });
    const decoded = decodeAbiParameters(
      [
        { type: 'address', name: 'sessionKey' },
        { type: 'address', name: 'owner' },
        { type: 'uint256', name: 'perTxCap' },
        { type: 'uint256', name: 'windowCap' },
        { type: 'uint256', name: 'windowSecs' },
        { type: 'uint256', name: 'expiry' },
        { type: 'address[]', name: 'allowlist' },
        { type: 'address[]', name: 'tokens' },
        { type: 'uint8[]', name: 'tokenDecimals' },
      ],
      encoded,
    ) as unknown as [string, string, bigint, bigint, bigint, bigint, string[], string[], number[]];
    expect(decoded[6]).toEqual([]);
    // and the rest of the layout is unaffected by the empty list
    expect(decoded[2]).toBe(100_000_000_000_000_000n);
    expect(decoded[7]).toEqual([USDC_ADDRESS]);
  });
});

describe('encodeInstallPluginCalldata (installPlugin selector f85730f4)', () => {
  it('starts with the pinned installPlugin selector', () => {
    const calldata = encodeInstallPluginCalldata(PLUGIN, MANIFEST, '0x1234');
    expect(calldata.slice(0, 10)).toBe('0xf85730f4');
    expect(calldata.slice(0, 10)).toBe(INSTALL_PLUGIN_SELECTOR);
  });

  it('decodes through the real MSCA ABI back to its arguments', () => {
    const initData = encodePolicyInitData(samplePolicy());
    const calldata = encodeInstallPluginCalldata(PLUGIN, MANIFEST, initData, []);
    const decoded = decodeFunctionData({ abi: parsedAccountAbi, data: calldata });
    expect(decoded.functionName).toBe('installPlugin');
    const args = decoded.args as unknown as unknown[];
    expect((args[0] as string).toLowerCase()).toBe(PLUGIN.toLowerCase());
    expect((args[1] as string).toLowerCase()).toBe(MANIFEST.toLowerCase());
    expect((args[2] as string).toLowerCase()).toBe(initData.toLowerCase());
    expect(args[3]).toEqual([]);
  });

  it('carries declared dependencies through to the decoded args', () => {
    const dep = { plugin: OWNER, functionId: 1 };
    const calldata = encodeInstallPluginCalldata(PLUGIN, MANIFEST, '0x', [dep]);
    const decoded = decodeFunctionData({ abi: parsedAccountAbi, data: calldata });
    const deps = (decoded.args as unknown as unknown[])[3] as { plugin: string; functionId: number }[];
    expect(deps).toHaveLength(1);
    expect(deps[0].plugin.toLowerCase()).toBe(OWNER.toLowerCase());
    expect(deps[0].functionId).toBe(1);
  });
});

describe('encodeAccountFallbackCalldata (plugin execution THROUGH the account fallback)', () => {
  it('revokeSession is the bare selector — no account.execute wrapper', () => {
    // The on-chain finding: wrapping revokeSession in account.execute reverts.
    // The encoder must emit exactly the 4-byte selector.
    const data = encodeAccountFallbackCalldata('revokeSession');
    expect(data).toBe(REVOKE_SESSION_SELECTOR);
    expect(data).toBe('0xc4605d8c');
    expect(data).toHaveLength(10); // '0x' + 8 hex chars: no trailing args
  });

  it('updatePolicy is selector ++ ABI-encoded args, decodable back', () => {
    const args = [
      SESSION_KEY,
      100_000_000_000_000_000n,
      1_000_000_000_000_000_000n,
      86_400n,
      1_800_000_000n,
      [OWNER],
      [USDC_ADDRESS],
      [18],
    ] as const;
    const data = encodeAccountFallbackCalldata('updatePolicy', args);
    expect(data.slice(0, 10)).toBe(UPDATE_POLICY_SELECTOR);
    expect(data.slice(0, 10)).toBe('0xc1c3b4f6');

    const decoded = decodeAbiParameters(
      [
        { type: 'address', name: 'sessionKey' },
        { type: 'uint256', name: 'perTxCap' },
        { type: 'uint256', name: 'windowCap' },
        { type: 'uint256', name: 'windowSecs' },
        { type: 'uint256', name: 'expiry' },
        { type: 'address[]', name: 'allowlist' },
        { type: 'address[]', name: 'tokens' },
        { type: 'uint8[]', name: 'tokenDecimals' },
      ],
      `0x${data.slice(10)}` as Hex,
    ) as unknown as [string, bigint, bigint, bigint, bigint, string[], string[], number[]];
    expect(decoded[0].toLowerCase()).toBe(SESSION_KEY.toLowerCase());
    expect(decoded[1]).toBe(args[1]);
    expect(decoded[7]).toEqual([18]);
  });

  it('manifest read is a bare selector call (raw return is hashed, not decoded)', () => {
    expect(PLUGIN_MANIFEST_SELECTOR).toBe('0xc7763130');
    expect(PLUGIN_MANIFEST_SELECTOR).toHaveLength(10);
  });
});
