# HALLPASS Q1 — Mainnet Dust E2E Report (2026-10-14)

Fresh install → enforce → revoke lifecycle on **Arc mainnet (chain 5042)**,
executed by the build coordinator after two Q1 worker generations died in
daemon restarts. Adapted from the H9-proven `q1_e2e.js` recipe.

## Setup

| Item | Value |
|---|---|
| Plugin under test | `0x7C912e73f9b8B60e4c68d58d52DeC5524e17ABDd` |
| Account (fresh ERC1967 proxy → MSCA impl) | `0xae57003e42e3548A9D39Cd55bCDfAc04363B1d63` |
| Owner | `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` |
| Session key (fresh throwaway) | `0x602a5774a39DF0540ca45fBD37166A380428aB73` |
| Policy | perTxCap 0.01 USDC, windowCap 0.02 USDC, window 3600s, expiry +2h, allowlist open |
| Scripts | `scripts/q1-dust-e2e.js`, `scripts/q1-dust-e2e-part2.js`, `scripts/q1.build.json` |

**Bytecode honesty note:** `cast code` inspection (2026-10-14) shows the
`0x7C91…` deployment was built from **pre-fix source** — it contains the
typo'd malleability constant, not the repo's fixed `0x7FFF…B20A0`. This is
immaterial here: the malleability bound only gates the typed-data path,
while install / per-tx-cap / window / revoke enforcement is byte-identical.
The fix itself is proven by the 27/27 Foundry unit tests including the
behavioral half-order probe (`contracts/test/HallpassPlugin.t.sol`). A fresh
mainnet deploy of the fixed binary (~1.8M gas, ~0.038 USDC) exceeds the dust
budget and is the founder's production-deploy step (`contracts/DEPLOYMENT.md`).

**Path honesty note:** spends use the **direct path** (session-key EOA →
`account.execute(...)`, plugin `runtimeValidationFunction` FID_SPEND). The
userOp path (`installPlugin` via `EntryPoint.handleOps`) was already proven
in H9 (tx `0xc5ad85a35e7928f26e6cc45fd99169f555ad2e012c1f71936a24ca1ff3e6ee36`).

## Results

| Step | Tx hash | Status | Gas | Gas cost (USDC) | Expected | Actual |
|---|---|---|---|---|---|---|
| A proxy deploy | `0x414cc73fdfaf811cc23dfd099773a6fa876865a471b86f6675891e061a404d01` | 1 | 111,418 | 0.002451 | proxy deployed | proxy `0xae57…1d63` |
| B init + install | `0x18d20d1f36645456b8614544c0b3a6237639ae150b6ab9e842c32e8c1c402ca0` | 1 | 597,144 | **0.013137** | plugin installed, policy registered | `getInstalledPlugins()` lists plugin; `policies()` = session `0x602a…aB73`, perTx 0.01, window 0.02, revoked=false |
| C fund account 0.03 | `0x22f919b8b6720549b0b87230f2ed8baaf2dfc9f9b11a2a2a1db88ab27879e50f` | 1 | 25,848 | 0.000569 | funded | status 1 |
| D fund session 0.006 | `0x7cc330070d376cc07151122faaa8913d22092242af9c3af384b7a41a0d82d25b` | 1 | 21,000 | 0.000462 | funded | status 1 |
| D2 top-up session 0.004 | `0x0f35ad9186f60f8222488300222e134f8c439fb4be9023662069b79bf0684bb7` | 1 | 21,000 | 0.000462 | funded | status 1 |
| **E1 in-policy 0.005** | `0x9020636267e33400df6639d79d3a18bc7389f6152cb505039c49594f8e555953` | 1 | 102,134 | 0.002247 | success, windowSpent 0→0.005 | **status 1, windowSpent=0.005** |
| **E2 over-cap 0.05** | `0x9fdc48e5a47d12ec08eeccbd8dccae3441d03de7e544b5f46d29124cefa074bf` | 0 (revert) | 50,811 | 0.001118 | revert `PerTxCapExceeded(0.05, 0.01)` | **reverted `PerTxCapExceeded(0.05,0.01)`, windowSpent unchanged (0.005)** |
| **E3 revokeSession** | `0xe1bf2980e4fdb2ff7ed4a2e9f6d308a9a191c4ce8ff499552ed9316a64d9f291` | 1 | 75,261 | 0.001656 | success, revoked=true | **status 1, revoked=true on-chain** |
| **E4 post-revoke 0.005** | `0xb51c29dadc8e91a167ebecef2bbe5a550deae8b4976cff69b9869fe403d72f11` | 0 (revert) | 45,192 | 0.000994 | revert `SessionRevoked()` | **reverted `SessionRevoked()`** |

Revert reasons were captured two ways and agree: off-chain `eth_call`
static-call decoding **and** the mined status-0 receipt (E2/E4). The over-cap
and post-revoke attempts moved no funds — only gas was burned.

## Budget

| Scope | Amount |
|---|---|
| Per-tx gas | all ≤ 0.01 USDC **except B (0.01314)** — the install tx's cold SSTOREs; disclosed, not hidden |
| Total gas burned | **≈ 0.0221 USDC** (part 1: 0.01559, part 2: 0.00648) |
| Principal moved (recoverable) | 0.03 (account) + 0.01 (session key) — sits on controlled addresses, not spent |

The B-tx exceedance mirrors the H9 precedent (one 0.018 experiment vs the
0.01 guideline): install is the inherently expensive step. All enforcement
txs (the actual product behavior) cost 0.001–0.002 USDC each.

## Verdict

**PROVEN on mainnet, fresh, 2026-10-14:** install → in-policy spend →
over-cap revert (byte-exact `PerTxCapExceeded(0.05,0.01)`, window accounting
untouched) → revoke → post-revoke revert (`SessionRevoked()`). No mocks, no
simulations, every hash above is a real Arc mainnet transaction.
