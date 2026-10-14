// Address + chain sanity tests.
//
// These pin the canonical on-chain constants the app depends on. A wrong
// EntryPoint address would route userOps into the void; a wrong token
// address would strand user funds; a hardcoded PLUGIN_ADDRESS fallback
// would be a security hole (bible §8.3: installing the wrong plugin is a
// security-relevant mistake).

import { describe, expect, it } from 'vitest';
import { getAddress, isAddress, type Address } from 'viem';
import {
  ACCOUNT_IMPL_ADDRESS,
  ENTRYPOINT_ADDRESS,
  EURC_ADDRESS,
  MSCA_FACTORY_ADDRESS,
  PLUGIN_ADDRESS,
  USDC_ADDRESS,
} from '../lib/contracts';
import { ARC_CHAIN_ID, arc } from '../lib/wagmi';

describe('Arc chain identity', () => {
  it('chain id is Arc mainnet 5042', () => {
    expect(ARC_CHAIN_ID).toBe(5042);
    expect(arc.id).toBe(5042);
    expect(arc.id).toBe(ARC_CHAIN_ID);
  });

  it('chain id is not Ethereum mainnet or any common testnet', () => {
    expect(ARC_CHAIN_ID).not.toBe(1);
    expect(ARC_CHAIN_ID).not.toBe(137);
    expect(ARC_CHAIN_ID).not.toBe(42161);
    expect(ARC_CHAIN_ID).not.toBe(8453);
  });

  it('native currency is USDC with 18 decimals (gas accounting unit)', () => {
    expect(arc.nativeCurrency.symbol).toBe('USDC');
    expect(arc.nativeCurrency.decimals).toBe(18);
  });
});

describe('EntryPoint address', () => {
  it('is the canonical ERC-4337 v0.7 singleton address', () => {
    expect(ENTRYPOINT_ADDRESS).toBe('0x0000000071727De22E5E9d8BAf0edAc6f37da032');
  });

  it('is a valid EIP-55 address', () => {
    expect(isAddress(ENTRYPOINT_ADDRESS)).toBe(true);
  });
});

describe('token addresses', () => {
  it('USDC is the Arc native gas token at 0x3600...0000 (not an ERC-20 contract)', () => {
    expect(USDC_ADDRESS).toBe('0x3600000000000000000000000000000000000000');
    expect(isAddress(USDC_ADDRESS)).toBe(true);
  });

  it('EURC address is checksum-valid and matches the verified live value', () => {
    expect(EURC_ADDRESS).toBe('0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1');
    // getAddress recomputes EIP-55 casing; a miscased literal throws here
    expect(getAddress(EURC_ADDRESS)).toBe(EURC_ADDRESS);
  });

  it('USDC and EURC are different contracts', () => {
    expect(USDC_ADDRESS.toLowerCase()).not.toBe(EURC_ADDRESS.toLowerCase());
  });
});

describe('Circle MSCA infrastructure addresses', () => {
  it('account implementation and factory are valid addresses', () => {
    expect(isAddress(ACCOUNT_IMPL_ADDRESS)).toBe(true);
    expect(isAddress(MSCA_FACTORY_ADDRESS)).toBe(true);
    expect(ACCOUNT_IMPL_ADDRESS).toBe('0xA70F1296869DA9D7CB69578123F21888E6dB2B62');
    expect(MSCA_FACTORY_ADDRESS).toBe('0x0000000DF7E6c9Dc387cAFc5eCBfa6c3a6179AdD');
  });

  it('infra addresses are all distinct', () => {
    const addrs = [
      ENTRYPOINT_ADDRESS.toLowerCase(),
      ACCOUNT_IMPL_ADDRESS.toLowerCase(),
      MSCA_FACTORY_ADDRESS.toLowerCase(),
      USDC_ADDRESS.toLowerCase(),
      EURC_ADDRESS.toLowerCase(),
    ];
    expect(new Set(addrs).size).toBe(addrs.length);
  });
});

describe('PLUGIN_ADDRESS security rule: no silent fallback', () => {
  it('is undefined when VITE_PLUGIN_ADDRESS is not set — never a silent default', () => {
    // Installing a hardcoded/default plugin address would be a
    // security-relevant mistake (bible §8.3). The correct missing-state is
    // undefined so the UI disables Install with a reason.
    expect(PLUGIN_ADDRESS).toBeUndefined();
  });

  it('research deployments are known-valid distinct addresses (docs only)', () => {
    const research: Address[] = [
      '0x66A7464f091304B3619eDc163634169519E41Ce9', // full plugin
      '0x5780e3DEd211ee13494909432C89Be7b8D6441A3', // minimal plugin
      '0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9', // production plugin
    ];
    for (const a of research) {
      expect(isAddress(a)).toBe(true);
    }
    expect(new Set(research.map((a) => a.toLowerCase())).size).toBe(research.length);
  });
});
