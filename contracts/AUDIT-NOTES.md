# HALLPASS — Contract audit notes (C6)

**Artifact under review:** `~/workspace/beacon-build/progress/h9/work/HallpassPlugin.sol`
(428 lines; `HallpassPlugin` L104–403, `HallpassProxy` L406–427)
**Spec:** `~/workspace/your_files/hallpass-build-bible.md` §§4, 11
**Method:** line-by-line read + independent recomputation (pure-Python Keccak-256,
sanity-checked against the empty-string digest; secp256k1 order cross-checked
against the published decimal `115792089237316195423570985008687907852837564279074904382605163141518161494337`).
Every claim below cites a line number. Nothing is asserted from memory —
all four hardcoded selectors and the ERC-165 interface id were recomputed.

---

## (a) Malleability-constant fix — ❌ NOT PRESENT (see Finding H-1)

Build bible §4.5 mandates the true secp256k1 half-order:

```
floor(n/2) = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0   (64 hex digits)
```

Line 396 of the reviewed file still carries the **pre-fix 62-digit typo**:

```solidity
require(
    uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A450ABBEB08BC4FBE82A,
    "malleable s"
);
```

Measured: 62 hex digits, strictly less than `floor(n/2)`. Consequence: the
`userOpValidationFunction` (L211) rejects **≈99.6% of valid signatures**
(1 − C/H = 99.609375% of the s-range) with `"malleable s"` — reproducing
exactly the failure mode in the bible's §6.4 ledger (two reverted `handleOps`
txs, `FailedOpWithRevert(0, "AA23 reverted", Error("malleable s"))`).
Fail-closed (no fund theft), but the ERC-4337 userOp path is non-functional
for real wallets until the constant is replaced. The bible's §4.5 value was
independently re-verified here and is correct — use it verbatim, then
re-prove the userOp path on mainnet per the acceptance checklist.

---

## (b) External calls & trust assumptions

**External calls in the entire file (3 total):**

| # | Line | Call | Trust |
|---|------|------|-------|
| 1 | 412 | `_logic.delegatecall(_data)` in `HallpassProxy` constructor | Deployer-supplied `_logic` (intended: Circle MSCA impl `0xA70F1296869DA9D7CB69578123F21888E6dB2B62`) and correct initializer `_data`. Runs once, in construction. |
| 2 | 421 | `delegatecall(gas(), impl, …)` in `HallpassProxy` fallback | Standard ERC-1967 proxy; `impl` slot (`0x3608…bbc`) is written once at L409 and the proxy exposes no upgrade path — immutable after deploy. |
| 3 | 399 | `ecrecover(hash, v, r, s)` | Precompile, not a contract call — deterministic. Security rests on the L396 bound (broken — see H-1) plus the `v ∈ {27,28}` and `signer != 0` checks (L393–401). |

**The plugin makes no other external calls**: no token transfers, no calls
back into the account, no oracles. Consistent with the manifest comment
(L363–368): `permitAnyExternalAddress=false`, `canSpendNativeToken=false` —
the plugin never moves funds itself.

**Trust assumptions (must hold for the policy to mean anything):**

1. The calling MSCA (`msg.sender` at L163/188/194/211/282/289) is a genuine
   ERC-6900 v0.7 account that invokes plugin callbacks only through validated
   paths (account `installPlugin` → `onInstall`; `execute`/`executeBatch` →
   validation fns; fallback → execution fns gated by the manifest).
2. The ERC-4337 EntryPoint calls the *account*, which forwards to
   `userOpValidationFunction` — the plugin never sees a userOp directly.
3. Owner key = game over if compromised; session-key leak is *bounded* by
   the policy, not prevented (bible hard rule #5 — must be on screen one).
4. `block.timestamp` for expiry (L231) and window rollover (L257) — coarse
   windows only; sequencer can skew by seconds, not policy-relevant at
   sane `windowSecs`.
5. Self-relayed `handleOps` (no public v0.7 bundler on Arc): validation-phase
   SSTOREs are tolerated there (disclosed NOTE, L221–222) but violate strict
   ERC-4337/7562 mempool storage rules — see Finding L-2.
6. Deployer passes the real MSCA implementation + initializer to
   `HallpassProxy` (Finding scope: proxy is out-of-policy-code but in-file).

---

## (c) Access-control matrix

| Function | Lines | Plugin-level caller check | Effective gate |
|---|---|---|---|
| `onInstall(bytes)` | 163–186 | none — writes `policies[msg.sender]` only | Reached via account `installPlugin`; direct calls can only poison the *caller's own* (nonexistent) slot |
| `onUninstall(bytes)` | 188–189 | none — `delete policies[msg.sender]` | Same as above |
| `runtimeValidationFunction` | 194–208 | none (expects the account) | `FID_OWNER` (3): `sender == p.owner` else `NotOwner` (L199–202). `FID_SPEND` (1): owner bypass (L204); else `sender == p.sessionKey` + `_authorizeSpend` (L205–206); else `UnknownSigner`. Unknown fid → `UnknownFunctionId` (L207) |
| `userOpValidationFunction` | 211–226 | none (expects the account) | `FID_USEROP` (2) only (L215); `ecrecover` signer must be owner (bypass, L219) or session key (L220), else `UnknownSigner` |
| `revokeSession()` | 282–286 | none | Intended path: account fallback → manifest registers it as execution fn with `FID_OWNER` runtime validation (L358–360) → owner-only. Direct call sets `revoked` on caller's own empty slot — harmless |
| `updatePolicy(…)` | 289–310 | none | Same as `revokeSession` (manifest L361–363, `FID_OWNER`) |
| `preUserOpValidationHook` / `preRuntimeValidationHook` / `preExecutionHook` / `postExecutionHook` | 313–333 | none | `pure` no-ops returning defaults; **not registered in the manifest** — unreachable through the account |
| `pluginManifest` / `pluginMetadata` / `supportsInterface` | 337–379 | none | `pure`; `supportsInterface` true only for `type(IPlugin).interfaceId` (= `0xf04ee9c7` computed — see L-3) and `0x01ffc9a7` |
| `_recover` | 383–403 | `internal` | — |
| `HallpassProxy` ctor / fallback | 406–427 | deployer / anyone | Standard proxy; no admin, no upgrade |

Key observation: **there is no `onlyAccount` modifier anywhere** — the design
substitutes `msg.sender`-keyed storage for caller authentication. This is
sound *for storage isolation* (Finding I-5 documents the residual assumption),
but it means `revokeSession`/`updatePolicy` are only owner-gated *when reached
through the account fallback*; the plugin itself cannot tell the difference.

---

## (d) Edge cases

- **Expiry boundary (L231):** `if (block.timestamp >= p.expiry) revert
  SessionExpired(...)` — a spend in the exact expiry second reverts.
  Strictly-before semantics; fail-closed. Fine, document it.
- **Zero `perTxCap` (L266: `value > p.perTxCap`):** only zero-value calls
  pass. Zero-value `execute` (pure data calls) is therefore allowed by design.
- **Zero `windowCap` (L261: `windowSpent + total > p.windowCap`):** any
  positive spend reverts; zero-value calls pass.
- **Zero `windowSecs` (L257):** `block.timestamp >= p.windowStart + 0` is
  always true → the window resets on *every* call, i.e. the window cap
  degrades to a per-call cap. Owner foot-gun; fail-closed.
- **`windowStart + windowSecs` overflow (L257):** solc 0.8 checked arithmetic
  reverts — only reachable with an owner-set absurd `windowSecs`; fail-closed.
- **Empty allowlist = open / caps-only (L267):** intentional, documented in
  the struct comment (L151). Non-empty allowlist is a linear scan —
  gas grows with list length (see GAS.md).
- **Uninitialized policy (all zeros):** `sessionKey == address(0)` →
  `UnknownSigner` for any sender (L205/L220); the owner bypass is guarded by
  `p.owner != address(0)` (L204/L219), so there is no zero-address bypass.
  Fail-closed. Good.
- **`sessionKey == owner` or either zero:** rejected at install (L176) and
  update (L297) with `BadInit`. Good.
- **Install with `expiry <= block.timestamp`:** allowed → policy is
  dead-on-arrival (every spend reverts `SessionExpired`). Owner foot-gun,
  fail-closed; the dashboard should warn.
- **Silent reinstall:** `onInstall` (L163) has no already-installed guard —
  it overwrites, resets the window, and clears `revoked`. The *account's*
  `installPlugin` normally prevents double-install; the dashboard's
  "policy unchanged since install" commitment (acceptance criteria) must be
  enforced off-chain via the install event, not assumed from the plugin.
- **`updatePolicy` resets window accounting and clears revocation**
  (L305–307; disclosed in the L288 dev comment). Intended; note the
  revocation-clearing is owner-only so it is not a privilege escalation.
- **Batch cap semantics (L256 vs L266):** each call is checked against
  `perTxCap` (L266) *and* the batch **sum** is checked again in
  `_recordWindow` (L256) — a batch of individually-compliant calls reverts
  if the sum exceeds `perTxCap`. The batch is treated as one transaction.
  Design decision; must be documented (users will be surprised).
- **Short calldata:** `bytes4(execCalldata[:4])` (L232) panics on `< 4`
  bytes instead of reverting with a custom error. Unreachable via the
  account (it always forwards real execution calldata); only a direct-call
  artifact. Cosmetic.
- **Reentrancy surface:** none in the spend path — no external calls between
  check (L229–253) and record (L255–263); `ecrecover` is a precompile.
  `onInstall`/`onUninstall` are store-only. The proxy's constructor
  `delegatecall` (L412) runs after the ERC-1967 `sstore` (L409), once, at
  deploy — standard and safe.
- **Owner bypass skips revocation/expiry:** `runtimeValidationFunction`
  returns early for the owner (L204) *before* `_authorizeSpend` — an owner
  can always execute even on a revoked/expired policy. By design (owner is
  trusted), but the dashboard must not present "revoked" as "frozen" for
  the owner.

---

## (e) Findings

| ID | Sev | Title | Lines | Detail |
|---|---|---|---|---|
| H-1 | **HIGH** | Malleability bound is the pre-fix 62-digit typo, not `floor(n/2)` | 396 | Quoted in §(a). The bible §4.5 mandatory fix is **not present** in this file. `userOpValidationFunction` rejects ≈99.6% of valid signatures (`"malleable s"`). Fail-closed — no theft — but the ERC-4337 path is broken for real wallets. **Fix:** replace with `0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0` (independently verified here against the published secp256k1 order), add the low-S/high-S/boundary vector suite to CI (acceptance checklist), redeploy, re-prove the userOp path on mainnet. |
| L-2 | LOW | State writes inside userOp validation | 211–226 (NOTE L221–222) | Window accounting SSTOREs happen in *validation*. Disclosed in-code and proven working via self-relayed `handleOps`, but strict ERC-4337/7562 bundlers may drop such userOps (validation must not write non-account-associated storage). Acceptable while relaying is self-operated; document as a known constraint, revisit if a public v0.7 bundler appears on Arc. |
| L-3 | LOW | `IPlugin` ERC-165 id ≠ bible's `0x043140ed` | 377–379 | Computed `type(IPlugin).interfaceId` from this file = **`0xf04ee9c7`**; no subset of this interface's 10 selectors XORs to the bible's `0x043140ed`. A mainnet install *was* proven with this interface definition, which bounds the practical risk (the live account evidently accepts it), but the bible's hex should not be trusted: assert the value the live account actually checks in CI instead of copying `0x043140ed` from documentation. |
| L-4 | LOW | `executeBatch` layout vs bible §4.1 table | 112, 240 | Selector `0x34fcd5be` recomputed = `executeBatch((address,uint256,bytes)[])` (tuple-array) — the plugin's constant, comment, and `abi.decode` (L240) are internally consistent. But bible §4.1's table pairs `34fcd5be` with parallel-array params (which compute to `0x47e1da2a`). If the live MSCA's actual `executeBatch` layout ever differs from the plugin's decode, the batch path misdecodes (fail-closed revert). Requires a batch-path mainnet test + selector assertions per hard rule #8. |
| I-5 | INFO | No caller authentication; `msg.sender`-keyed storage instead | 163, 188, 282, 289 | Sound for storage isolation (direct calls only touch the caller's own empty slot), but `revokeSession`/`updatePolicy` are owner-gated *only* via the account fallback + manifest `FID_OWNER`. Document as a trust assumption; the clean rewrite should keep this shape (adding `onlyAccount` would break the intended direct-call harmlessness analysis — decide explicitly). |
| I-6 | INFO | Batch sum counts as one tx against `perTxCap` | 256 | Documented in §(d); keep, but surface in UI copy. |
| I-7 | INFO | Zero-config semantics | 231, 256–257, 266–267 | Catalogued in §(d): all fail-closed except `windowSecs=0` (degrades window cap to per-call). Consider `require(windowSecs > 0)` in the rewrite if that degradation is never desired. |
| I-8 | INFO | Unused hooks return defaults unconditionally | 313–333 | `preUserOpValidationHook` returns `0` ignoring `functionId`; none are in the manifest. Harmless; required by the interface. |

**Positive confirmations:** all four hardcoded selectors recomputed and match
(`b61d27f6`, `34fcd5be`, `f85730f4`, `c1a221f3` — L111–114); `installPlugin`/
`uninstallPlugin` canonical signatures verified against the `(address,uint8)`
`FunctionReference` layout; owner-bypass correctly ordered before policy
checks with zero-address guards (L204/L219); uninitialized policies
fail-closed; custom errors throughout; no fund-moving code paths.

**Bottom line:** the contract logic is sound and honestly structured, but it
is the **pre-fix research artifact**: H-1 must be fixed before any deploy,
and L-3/L-4 need CI assertions (hard rule #8) rather than documentation trust.
`
