// Unit conversion tests — the "day-0 gate" (bible §5.0).
//
// ERC-20 USDC: 6. Native gas USDC: 18. EURC: 6. Policy caps are NATIVE wei
// (18). A decimal-handling bug here is not a cosmetic bug: it would display
// a cap 10^12 off, or let a user type "1" and sign 1e18. Every converter
// round-trips and every invalid input throws.

import { describe, expect, it } from 'vitest';
import {
  ERC20_USDC_DECIMALS,
  EURC_DECIMALS,
  NATIVE_USDC_DECIMALS,
  formatEurc,
  formatNativeUsdc,
  formatTokenUnits,
  usdcToNativeWei,
  usdcToTokenUnits,
} from '../lib/contracts';

describe('decimal constants (the day-0 gate)', () => {
  it('native gas USDC is 18 decimals', () => {
    expect(NATIVE_USDC_DECIMALS).toBe(18);
  });

  it('ERC-20 USDC is 6 decimals and MUST differ from native', () => {
    expect(ERC20_USDC_DECIMALS).toBe(6);
    expect(ERC20_USDC_DECIMALS).not.toBe(NATIVE_USDC_DECIMALS);
  });

  it('EURC is 6 decimals', () => {
    expect(EURC_DECIMALS).toBe(6);
  });
});

describe('usdcToNativeWei (human USDC -> 18-decimal wei)', () => {
  it('converts whole units', () => {
    expect(usdcToNativeWei('1')).toBe(1_000_000_000_000_000_000n);
    expect(usdcToNativeWei('100')).toBe(100_000_000_000_000_000_000n);
  });

  it('converts fractional units without float error', () => {
    expect(usdcToNativeWei('0.1')).toBe(100_000_000_000_000_000n);
    expect(usdcToNativeWei('0.10')).toBe(usdcToNativeWei('0.1'));
    expect(usdcToNativeWei('0.000000000000000001')).toBe(1n);
  });

  it('zero and whitespace-padded input', () => {
    expect(usdcToNativeWei('0')).toBe(0n);
    expect(usdcToNativeWei('  1.5 ')).toBe(1_500_000_000_000_000_000n);
  });

  it('throws on invalid input instead of producing a wrong number', () => {
    expect(() => usdcToNativeWei('')).toThrow();
    expect(() => usdcToNativeWei('abc')).toThrow();
    expect(() => usdcToNativeWei('-1')).toThrow();
    // more than 18 fractional digits cannot be represented — must throw,
    // never silently truncate
    expect(() => usdcToNativeWei('1.0000000000000000001')).toThrow();
  });

  it('KNOWN LENIENCY (flagged, not fixed here): "1.2.3" parses as 1.2', () => {
    // '1.2.3'.split('.') destructures to whole='1', frac='2' — the trailing
    // '.3' is silently dropped. Pinned so the behavior cannot drift
    // unnoticed; a strict parser would be the better fix (see report).
    expect(usdcToNativeWei('1.2.3')).toBe(usdcToNativeWei('1.2'));
  });
});

describe('usdcToTokenUnits (human USDC -> 6-decimal token units)', () => {
  it('converts with 6 decimals', () => {
    expect(usdcToTokenUnits('1')).toBe(1_000_000n);
    expect(usdcToTokenUnits('0.10')).toBe(100_000n);
    expect(usdcToTokenUnits('0.000001')).toBe(1n);
  });

  it('throws when precision exceeds 6 decimals', () => {
    expect(() => usdcToTokenUnits('1.0000001')).toThrow();
    expect(() => usdcToTokenUnits('nope')).toThrow();
  });
});

describe('native vs token unit conversions agree in kind but not scale', () => {
  it('1 USDC is 1e18 native wei and 1e6 token units — never confused', () => {
    const wei = usdcToNativeWei('1');
    const units = usdcToTokenUnits('1');
    expect(wei).toBe(units * 1_000_000_000_000n); // 1e12 scale factor, pinned
  });

  it('a dust policy cap round-trips through formatNativeUsdc', () => {
    const dust = usdcToNativeWei('0.01');
    expect(formatNativeUsdc(dust)).toBe('0.01');
    expect(usdcToNativeWei(formatNativeUsdc(dust))).toBe(dust);
  });
});

describe('formatNativeUsdc (18-decimal wei -> human string)', () => {
  it('formats whole and fractional values', () => {
    expect(formatNativeUsdc(1_000_000_000_000_000_000n)).toBe('1');
    expect(formatNativeUsdc(100_000_000_000_000_000n)).toBe('0.1');
    expect(formatNativeUsdc(0n)).toBe('0');
    expect(formatNativeUsdc(1n)).toBe('0.000000000000000001');
  });

  it('never renders trailing zeros', () => {
    expect(formatNativeUsdc(1_500_000_000_000_000_000n)).toBe('1.5');
  });

  it('round-trips arbitrary values', () => {
    for (const s of ['3', '0.5', '123.456789', '0.000001', '999999.999999999999999999']) {
      expect(formatNativeUsdc(usdcToNativeWei(s))).toBe(s.replace(/\.?0+$/, '') || '0');
    }
  });
});

describe('formatTokenUnits / formatEurc (arbitrary decimals)', () => {
  it('formats 6-decimal EURC', () => {
    expect(formatTokenUnits(1_000_000n, 6)).toBe('1');
    expect(formatTokenUnits(450_000n, 6)).toBe('0.45');
    expect(formatTokenUnits(0n, 6)).toBe('0');
    expect(formatTokenUnits(1n, 6)).toBe('0.000001');
  });

  it('formatEurc is formatTokenUnits with 6 decimals', () => {
    expect(formatEurc(1_000_000n)).toBe('1');
    expect(formatEurc(123456789n)).toBe(formatTokenUnits(123456789n, 6));
  });

  it('handles negative units without losing the sign', () => {
    expect(formatTokenUnits(-500_000n, 6)).toBe('-0.5');
  });

  it('handles 18 decimals like native USDC', () => {
    expect(formatTokenUnits(1_000_000_000_000_000_000n, 18)).toBe('1');
  });
});
