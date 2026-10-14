// Build-time selector sanity check — runs as `npm run prebuild`.
// Asserts every expected selector in SELECTOR_EXPECTATIONS against a fresh
// computation. A mismatch FAILS THE BUILD (loud, safe) instead of throwing
// during render (which black-screened /app on 2026-10-14).
//
// This script intentionally does NOT import src/lib/contracts.ts (that would
// pull the whole app graph); it re-declares the expectation table from the
// single source of truth by reading the file's SELECTOR_EXPECTATIONS block.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { toFunctionSelector } from 'viem';

const here = dirname(fileURLToPath(import.meta.url));
const contractsTs = readFileSync(resolve(here, '../src/lib/contracts.ts'), 'utf8');

const block = contractsTs.match(/SELECTOR_EXPECTATIONS[^=]*=\s*\{([\s\S]*?)\};/);
if (!block) {
  console.error('[check-selectors] SELECTOR_EXPECTATIONS block not found in src/lib/contracts.ts');
  process.exit(1);
}

const expectations = [...block[1].matchAll(/'([^']+)'\s*:\s*'(0x[0-9a-fA-F]+)'/g)].map((m) => ({
  sig: m[1],
  expected: m[2].toLowerCase(),
}));

if (expectations.length === 0) {
  console.error('[check-selectors] no expectations parsed — refusing to pass silently');
  process.exit(1);
}

let failed = 0;
for (const { sig, expected } of expectations) {
  const computed = toFunctionSelector(sig).toLowerCase();
  if (computed !== expected) {
    console.error(`[check-selectors] MISMATCH ${sig}: computed ${computed}, expected ${expected}`);
    failed++;
  } else {
    console.log(`[check-selectors] ok ${sig} -> ${computed}`);
  }
}

if (failed > 0) {
  console.error(`[check-selectors] ${failed} selector mismatch(es) — build blocked`);
  process.exit(1);
}
console.log(`[check-selectors] all ${expectations.length} selectors verified`);
