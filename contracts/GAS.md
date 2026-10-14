# HALLPASS — Gas notes (C6)

**Status: ESTIMATES.** `forge`/`solc` are not installed in this environment and
`~/workspace/hallpass-build/test/` and `src/` are still empty (foundry.toml
scaffold only), so `forge test --gas-report` could not be run.
Every figure below is derived from the code + the post-Berlin gas schedule
(cold SLOAD 2,100 / warm 100; cold SSTORE 0→nonzero 22,100 / 0→0 or
reset ≈2,900 cold; `ecrecover` 3,000; code deposit 200/byte; CREATE 32,000;
LOG 375 + 375/topic + 8/byte). Replace with measured numbers once the
foundry scaffold lands — the acceptance checklist already requires it.

Bytecode size reference: bible §4.2 gives **8,206 bytes runtime** for the
research build (solc 0.8.24, optimizer 200). The clean rewrite **will**
change this — re-measure before mainnet deploy.

## Deploy cost

| Item | Math | Gas |
|---|---|---|
| Code deposit (`HallpassPlugin`, 8,206 bytes × 200) | 8,206 × 200 | **1,641,200** |
| CREATE base + init execution (no constructor; minimal init) | — | ≈ 35,000–45,000 |
| **Deploy tx total (est.)** | — | **≈ 1.68–1.70M** |
| `HallpassProxy` deploy (few hundred bytes) | — | ≈ 100,000–160,000 |

The code deposit is ~97% of the deploy cost — it is deterministic and
dominates everything else.

## The ≥ 2.2M deploy-gas rule — why

1. **Deterministic floor, not a target.** ~1.64M of the ~1.7M is pure code
   deposit. Any gas *limit* below actual usage reverts the deployment and
   still burns the gas executed. 2.2M gives ~28–30% headroom over the
   estimate.
2. **Estimation variance.** Wallets/RPC `eth_estimateGas` can under-quote
   (esp. across optimizer-version bytecode drift between the research build
   and the clean rewrite). An explicit limit removes that failure mode.
3. **The constraint is liveness, not cost.** On Arc, gas is USDC-denominated
   (18-decimal native) at 20–40 gwei: 2.2M × 30 gwei ≈ **0.066 USDC**.
   Setting the limit high costs nothing extra — you pay for gas *used*.
4. **Bytecode drift.** The clean rewrite must re-measure size; the rule
   survives drift that a tight limit would not.

Bible §12 also requires Sourcify `exact_match` — verify the deployed
bytecode, then confirm actual deploy gas < 2.2M with margin, and record it.

## Per-function estimates (post-Berlin, cold storage)

| Function | Est. gas | Dominant costs |
|---|---|---|
| `onInstall` (empty allowlist) | **165k–190k** | 7 cold 0→nonzero SSTOREs (`sessionKey`, `owner`, `perTxCap`, `windowCap`, `windowSecs`, `expiry`, `windowStart`: 7 × 22,100 = 154,700) + `SessionRegistered` event + calldata decode |
| `onInstall` per allowlist entry | **+~25k** | 1 cold SSTORE (22,100) + slot hashing per element; linear scan also affects every spend (below) |
| `onUninstall` | **35k–60k** net | ~9 slot deletes (cold reads + resets); refunds capped at 1/5 of tx gas |
| `runtimeValidationFunction` — spend path | **45k–90k** | calldata decode + ~9 cold SLOADs (~19k) + allowlist scan (~2,100/entry) + `windowSpent` SSTORE (2,900–22,900) + `SpendAuthorized` event |
| `userOpValidationFunction` — spend path | **50k–100k** | above + `ecrecover` (3,000) + hashing |
| `revokeSession` | **28k–34k** | 1 cold SSTORE `false→true` (22,100) + `SessionRevokedEvt` |
| `updatePolicy` | **150k–200k** | like `onInstall` (all slots dirty) + `PolicyUpdated` |
| `pluginManifest()` (`eth_call`) | **15k–30k** | memory array construction; not paid on-chain in the install flow |
| `policies(addr)` view | **2k–5k** | cold SLOADs |

Notes:

- **Allowlist length is the gas lever.** Both the install cost and *every*
  spend pay ~2,100 gas per entry (cold; ~100 warm within one tx, but each
  spend is its own validation call). Keep allowlists short, or accept the
  per-spend cost in the policy UX.
- **First-write premium.** The estimates assume cold storage (first touch).
  Repeated spends in the same block/slot-state are cheaper (warm slots),
  but cross-tx validation calls are cold again — budget the cold numbers.
- **Window rollover** (`block.timestamp >= windowStart + windowSecs`,
  L257) costs an extra SSTORE pair on boundary-crossing spends; negligible
  amortized.
- **UserOp path overhead is out of plugin scope** but real: EntryPoint
  verification + prefund per bible §4.6
  (`(verificationGasLimit + callGasLimit + preVerificationGas) × maxFeePerGas`
  must be covered by the account's deposit, else `AA13`). The plugin-side
  validation cost above is only the account's *inner* call.
- **`updatePolicy` is the expensive owner op** (~150–200k). Fine — it is
  rare, and cheaper than uninstall+reinstall.

## CI gas gates (recommended)

1. `forge test --gas-report` green; record per-function actuals in this file,
   replacing the estimates above.
2. Assert deploy gas < 2.2M with ≥20% margin (catches optimizer/size drift).
3. Fuzz the rolling-window accounting (acceptance checklist) with gas
   snapshots on boundary crossings (rollover, batch-sum cap, allowlist
   lengths 0/1/10) so the dashboard can show honest fee estimates.
4. Selector-assertion tests for every hardcoded selector (hard rule #8) —
   cheap, and they pin the values this audit recomputed
   (`b61d27f6`, `34fcd5be`, `f85730f4`, `c1a221f3`).
