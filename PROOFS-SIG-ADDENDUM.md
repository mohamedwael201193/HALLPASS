# PROOFS-SIG-ADDENDUM — `isValidSignature` routing verdict (HALLPASS-WIN, SIG-DOC)

**Branch:** `win/sig-fallback` · **Date:** 2026-10-15 ~02:00 EEST · **Chain:** Arc mainnet (5042), RPC `https://rpc.mainnet.arc.io`
**Subject:** `HallpassPlugin` v0.2.0 [`0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9`](https://explorer.arc.io/address/0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9) (Sourcify exact_match) on account [`0xDE9Ea7D5F80F9d68B17672ECF96b82EF12A6c02f`](https://explorer.arc.io/address/0xDE9Ea7D5F80F9d68B17672ECF96b82EF12A6c02f)

## Verdict (one paragraph)

**The plugin's ERC-1271 logic is PROVEN live on mainnet** — `authorizeDigest` → `isValidSignature` returns `MAGIC 0x1626ba7e` for an authorized, unexpired, unrevoked digest with a valid session-key signature, and `0xffffffff` for wrong-signature / unauthorized-digest cases (two real dust txs + five `eth_call` proofs below). **But there is NO live path that routes `isValidSignature` through the smart account**: calling `account.isValidSignature(...)` reverts with `0x534a471c` (the account's own 1271 dispatch, carrying the `0x1626ba7e` selector as its `bytes4` argument) even with the plugin installed and a live authorization; `account.execute(plugin, 0, isValidSignature(...))` reverts with `0x9ce1cc5c(plugin)` (the account refuses `execute` targeting plugin addresses); and calling the plugin directly works but answers against `policies[msg.sender]`, so any caller other than the account itself gets `0xffffffff`. **A third-party x402 facilitator therefore cannot obtain MAGIC from the v0.2.0 setup today** — the typed-data path is real, but it is not account-routable.

## 1. What is PROVEN (positive)

| # | Claim | Evidence |
|---|-------|----------|
| A1 | Authorized digest + valid session-key signature → `MAGIC 0x1626ba7e`, on mainnet | `eth_call` to plugin `0x5543…`, `from` = account `0xDE9E…` (exactly what the account fallback would do: `msg.sender == account`), returned `0x1626ba7e` + 28 zero bytes. Digest `0x46fb6943ccdf1e3223768b02957734d2c791ea025c62301c506dd7db16b5496d`, authorized in TX2 below, sig in §4 |
| B1 | Authorized digest + wrong 65-byte signature → `0xffffffff` | Same call shape, garbage sig `0x22…22` → `0xffffffff` + 28 zero bytes |
| B2 | Never-authorized digest → `0xffffffff` | Same call shape, random digest → `0xffffffff` + 28 zero bytes |
| C | `authorizeDigest` commits a live digest on mainnet (v0.2.0) | Tx [`0xdb5fa1688653bd8694ef35fb95902e6c5ebd1cf8211277ceb76f559031bf73b8`](https://explorer.arc.io/tx/0xdb5fa1688653bd8694ef35fb95902e6c5ebd1cf8211277ceb76f559031bf73b8) — status 1, 194,644 gas. Post-tx `digestAuths(account, digest)` = `(token=EURC, to=owner, amount=2000, expiry=1792022401, revoked=false)` |
| D | Session can be revived on mainnet (owner `updatePolicy` through the account) | Tx [`0x0ce138523b1d077f2c173d2f5e06f040dfd68f5db261c621c28f065465a3bf9d`](https://explorer.arc.io/tx/0x0ce138523b1d077f2c173d2f5e06f040dfd68f5db261c621c28f065465a3bf9d) — status 1, 107,168 gas. Cleared the Q2 revocation, set fresh expiry, fresh session key, preserved EURC config |

Setup cost: 301,812 gas ≈ **0.006 USDC** at 20 gwei. Zero value transferred in either tx (dust: 2,000 EURC-units = 0.002 EURC authorized, never moved).

## 2. What is PROVEN NEGATIVE (the routing gap)

All calls below are `eth_call` (read-only) against live mainnet state **after** the live authorization in §1 existed:

| # | Call | Result |
|---|------|--------|
| R1 | `account.isValidSignature(digest, validSig)` — the exact facilitator path, plugin installed, authorization live | **REVERT** `0x534a471c` + `0x1626ba7e` (padded). Same revert from a stranger `from` address |
| R2 | `account.isValidSignature(randomDigest, garbageSig)` — pre-authorization state (Q2-revoked policy) | **REVERT** `0x534a471c` + `0x1626ba7e`. Identical before and after the live authorization → the revert is in the account's dispatch, not the plugin |
| R3 | `account.execute(plugin, 0, isValidSignature(digest, validSig))` from owner | **REVERT** `0x9ce1cc5c` + plugin address (padded). Control: `account.execute(0x0000…dEaD, 0, 0x)` from owner → **OK** (empty return). The account specifically refuses `execute` targeting plugin addresses |
| R4 | `plugin.isValidSignature(digest, validSig)` from a stranger address | Returns `0xffffffff` (no revert). The plugin answers against `policies[msg.sender]`; a stranger has no policy |
| R5 | `account.revokeSession()` from owner (different installed execution selector, control) | Returns `0x` (executed; state discarded). The account **does** forward installed execution functions through its fallback — `0x1626ba7e` is the exception, not the rule |

`debug_traceCall` is **not supported** by the public RPC (`method not supported`), so call-trace evidence is the `eth_call` return/revert data above, which is byte-exact and reproducible (§4).

## 3. Precise technical reason

1. The MSCA natively handles the `0x1626ba7e` selector — it does **not** fall through to the ERC-6900 fallback that would route to the installed execution-function plugin (proven: R5 shows the fallback routes other installed selectors fine, while R1/R2 revert for `0x1626ba7e` specifically).
2. The account's native `isValidSignature` dispatches through the plugin **validation-function** registry. The deployed v0.2.0 manifest (read on-chain via `pluginManifest()`) lists `0x1626ba7e` under `executionFunctions` and **nowhere** under `runtimeValidationFunctions` (8 entries: `execute`/`executeBatch`→FID 1, `installPlugin`/`uninstallPlugin`→FID 3, `revokeSession`/`updatePolicy`→FID 3, `authorizeDigest`/`revokeDigest`→FID 4). The validation lookup finds no entry for `0x1626ba7e` → revert `0x534a471c`.
3. This reconciles the W1C evidence (PROOFS.md rows 19–22): SigGate registered `0x1626ba7e` as `RUNTIME_VALIDATION_ALWAYS_ALLOW` — i.e. in the **validation** registry — and routed successfully, returning MAGIC. v0.2.0 registers it only as an **execution** function, so the same dispatch reverts. (The v0.2.0 source comment claims "the deployed PluginManager does not support RUNTIME_VALIDATION_ALWAYS_ALLOW" — the SigGate install on the same PluginManager suggests otherwise; whether a validation association is still installable is **untested**, flagged as a follow-up, not a claim.)
4. Separately, the account's `execute` blocks calls whose target is an installed plugin (`0x9ce1cc5c`, R3), closing the `execute`-through-the-account workaround.
5. Error-name honesty note: PROOFS.md row 18 / the fork test call the R1 revert `InvalidValidationFunctionId`, but `keccak256("InvalidValidationFunctionId(bytes4)")[:4] = 0x42b1a0c7 ≠ 0x534a471c`. The **selector `0x534a471c` is the ground truth**; its human-readable name is unconfirmed. Same for `0x9ce1cc5c` (unidentified; behavior: `execute`-to-plugin guard).

## 4. Discrepancy resolved: "proven" vs "not live-routable"

- **"Proven" (build bible)** refers to the **plugin mechanism**: `authorizeDigest` commits a digest; `isValidSignature` evaluates authorization + expiry + revocation + session-key signature and returns MAGIC/`0xffffffff`. This was proven in unit/fork tests, and **is now proven on mainnet** (§1, A1/B1/B2/C).
- **"Not live-routable" (gaps)** refers to **reaching that mechanism through the account's `isValidSignature` entrypoint** — the path any third-party facilitator (x402) would actually use. This is **proven impossible** on the current MSCA + v0.2.0 combination (§2, R1–R4).
- Both statements are true simultaneously; they describe different layers. The old gap note's phrasing ("the plugin must be called directly") is imprecise: a direct call from anyone but the account returns `0xffffffff` (R4) — the requirement is `msg.sender == account`, which only account-forwarding can satisfy, and the account refuses.

## 5. Exact reproducible calls

Network: `https://rpc.mainnet.arc.io`, chain 5042, block `latest`. All `eth_call`, no state changes.

```
# R1/R2 — the facilitator path (reverts). data = isValidSignature(bytes32,bytes):
#   0x1626ba7e
#   + 0x46fb6943ccdf1e3223768b02957734d2c791ea025c62301c506dd7db16b5496d   (digest)
#   + 0x0000...0040                                                        (bytes offset)
#   + 0x0000...0041                                                        (bytes length = 65)
#   + 0x87d1fc331a71e768846dee1f51885c50766ec58de45ece6f1e094f2c4188235c
#     34a02a0b1cf796adc2c01d89f855e2da06d6d041dcd87c3ddb52359c351317971c   (65-byte sig)
#     0x0000...00                                                          (12 bytes padding)
eth_call { to: 0xDE9Ea7D5F80F9d68B17672ECF96b82EF12A6c02f, data: <above> }
  => REVERT 0x534a471c00000000000000000000000000000000000000000000000000000000

# A1 — plugin logic, account as caller (returns MAGIC):
eth_call { to: 0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9, from: 0xDE9E…6c02f, data: <above> }
  => 0x1626ba7e00000000000000000000000000000000000000000000000000000000

# R3 — execute-to-plugin guard:
eth_call { to: 0xDE9E…6c02f, from: 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3,
           data: 0xb61d27f6 <address plugin> <0> <bytes: isValidSignature calldata> }
  => REVERT 0x9ce1cc5c0000000000000000000000005543fb530763ce21eb827446b4913b8db7f0d3d9
```

## 6. State changes made (dust only)

1. `0x0ce138523b1d077f2c173d2f5e06f040dfd68f5db261c621c28f065465a3bf9d` — owner `updatePolicy` through the account: cleared the Q2 `revoked` flag, fresh 2h session expiry, fresh random session key (generated in-memory, **never persisted or printed** — no party holds it), preserved allowlist `[EURC, owner]` / tokens `[EURC]` / decimals `[6]`, caps unchanged (0.01 / 0.05).
2. `0xdb5fa1688653bd8694ef35fb95902e6c5ebd1cf8211277ceb76f559031bf73b8` — owner `authorizeDigest` through the account: digest `0x46fb…5496d`, EURC, to owner, amount 2000 units (0.002 EURC), 1h digest expiry.

Net effect on account `0xDE9E…`: policy is live (was revoked+expired) with an unknowable session key — no spend path exists for anyone except the owner via management functions. No funds moved. The test digest expires ~1h after creation.

## 7. Incidental finding (verified, not load-bearing)

`policies(address)` on the deployed plugin returns **9 words**, not 12 — solc 0.8.24 **omits dynamic arrays from public struct getters** (confirmed by compiling a minimal replica with solc 0.8.24: the generated ABI lists only the 9 scalar fields). The arrays live in storage regardless (verified via `eth_getStorageAt`: `allowlist.length=2`, `tokens.length=1`, `tokenDecimals.length=1` at the expected slots), and Sourcify's `storageLayout` for the exact_match-verified source shows all 12 members. **The deployed contract matches the repo source; there is no divergence** — the 9-word return is compiler behavior, and earlier decode failures in probing were caused by expecting 12 fields.
