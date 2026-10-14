# HALLPASS Mock-Hunt Report (Q2)

**Swept:** 2026-10-14 ~19:30–20:15 EEST. Entire repo (`contracts/`, `backend/`, `frontend/`, `scripts/`, `docs/`, root), 76 files. Patterns grepped: `mock|stub|fake|dummy|placeholder|lorem|coming soon|todo: wire|wire up|TBD|not implemented`, `Math.random()` as data, setTimeout-faked loading, hardcoded addresses/hashes, `demo|simulate`.

**Note on conditions:** sibling build workers were editing the same tree during the sweep (I observed live rewrites of `server.js`, `Hero.tsx`, `Nav.tsx`, `SessionKeys.tsx`, `Marketplace.tsx`, `PolicyCard.tsx`). Where a sibling fixed something before I touched it, it's recorded as RESOLVED-BY-SIBLING.

**On-chain spot-checks performed (read-only RPC, Arc mainnet 5042):**
- `eth_getCode(0x7C912e73f9b8B60e4c68d58d52DeC5524e17ABDd)` → 8,178 bytes (real)
- `eth_getCode(0x5780e3DEd211ee13494909432C89Be7b8D6441A3)` → 3,993 bytes (real)
- `getInstalledPlugins()` on `0x2829f88DB9D8f86E57E9606b56cAC1039b6Bf89a` → returns single `address[]` containing the plugin — this settled two ABI disputes below
- `keccak256("getInstalledPlugins()")[:4]` = `0x3a0cac56` ✓; `installPlugin(...)` = `0xf85730f4` ✓

---

## KILL — fixed during this hunt (9)

### 1. `backend/api/server.js` — `getInstalledPlugins` decoded with the wrong ABI (would falsely report "not installed")
- **Before:** `PLUGIN_MANAGER_ABI` declared `returns (address[] plugins, bytes32[] manifestHashes)`. Verified on-chain that Circle's MSCA returns a **single** `address[]`. Decoding the real return data against the 2-tuple ABI throws → the catch block swallowed it → `installedList = []` → the API would report *"plugin NOT installed"* for the very account that provably has it installed. A live misrepresentation of install state.
- **Fix:** ABI corrected to `returns (address[] pluginAddresses)`; decode verified against live chain data (returns the installed plugin address). `node --check` clean.

### 2. `backend/api/stats.js` — queried phantom tables, would report permanent zeros
- **Before:** `EXPECTED_TABLES = ['installs','policies','spends','denials','revokes']` with `meta.last_block`, `uninstalled`, `revoked` columns — none of which `backend/indexer/index.js` writes. Every query returned null → every metric permanently 0 with `source: "hallpass-indexer-degraded"`. The landing page would have shown "0 plugins installed" forever, sourced as real.
- **Fix:** rewrote `computeStats` to the real indexer schema (`plugin_installs`, `policy_updates`, `validation_results`, `revokes`, `indexer_state`/`last_indexed_block`). `policiesActive` = distinct accounts with unexpired policy and no revoke on record (documented as conservative). `spendsBlocked` counts relay-fed `allowed=0` rows (0 until the relay denial feed lands — documented, not presented as "nothing was ever blocked"). Verified: seeded a real-schema SQLite DB → `/api/stats` via the mounted router returned `{"pluginsInstalled":1,"policiesActive":1,"spendsAllowed":1,"spendsBlocked":0,"revokes":0,"asOfBlock":102,"source":"hallpass-indexer"}`; missing DB → honest `indexer-unavailable` zeros.

### 3. `backend/api/server.js` — mounted the stats router
- `/api/stats` (the endpoint the landing page's `Hero.tsx` fetches) did not exist in the rewritten server (only `/api/v1/*`). Mounted `./stats` inside `createServer` with the server's `dbPath`, best-effort (v1 endpoints unaffected on failure).

### 4. `frontend/src/components/landing/Hero.tsx` — rendered any finite zeros as live stats
- **Before (older revision):** on API failure it set zeros and rendered them under "Live from Arc mainnet." A sibling had already changed it to omit the row when `stats === null`, but it accepted *any* finite values — including an `indexer-unavailable` zero response — as "real".
- **Fix:** the row now renders only when `data.source === "hallpass-indexer"`. Anything else → row omitted.

### 5. `backend/README.md` — stated "docs only, not implemented" while the indexer and API are implemented
- Also gave wrong env var names (`ARC_RPC_URL`, `RELAY_SIGNER_KEY`, `INDEXER_START_BLOCK`, `DATABASE_URL`/Postgres) and wrong run commands (`npm run indexer`, `npm run api` on `:8080`).
- **Fix:** rewrote the section — indexer: implemented; API (`server.js` + `stats.js`): implemented; relay: planned, not implemented. Correct env names (`RPC_URL`, `PLUGIN_ADDRESS`, `START_BLOCK`, `DB_PATH`, `PORT`, `RELAYER_PRIVATE_KEY`), correct commands, SQLite (not Postgres).

### 6. `contracts/script/VerifyHallpass.sh` — deleted from disk while two docs reference it
- `README.md` ("deploy via `contracts/script/VerifyHallpass.sh`") and `docs/VERIFICATION.md` (the documented deploy path) pointed at a missing file — a judge following the docs hits a dead end.
- **Fix:** restored the script verbatim (it was a real, honest, secret-free script: rebuilds with pinned solc/optimizer, submits to Sourcify, hard-fails unless status is `perfect`). `bash -n` clean, `chmod +x`.

### 7. `backend/api/STATS.md` — documented a planned schema the indexer never implemented
- Schema contract listed `installs/policies/spends/denials/meta` tables; the real indexer writes different tables. Also the example JSON was presented without labeling.
- **Fix:** schema contract now matches `backend/indexer/index.js` exactly; metric table SQL updated to the real queries; example JSON captioned "(Illustrative example — not real data)"; honesty rule 2 extended: `spendsBlocked` = 0 until the relay feed lands must render as "not yet recorded", never "0 blocked".

### 8. `backend/api/server.js` (pre-rewrite revision) — amounts formatted with 6 decimals instead of 18
- `fmtAmount` used `ARC_USDC_DECIMALS` (6) on native-wei (18-decimal) policy/spend amounts → displayed values inflated ×10¹². (Superseded: the sibling's rewrite ships correct 18-decimal `fmtUSDC`; verified.)

### 9. `frontend/src/components/landing/Footer.tsx` — honesty claim overreached (flagged by the repo's own `UX-AUDIT.md` M13)
- **Before:** "Nothing here is a demo, mock, or placeholder." True of the hashes/addresses (all verified real), but an absolute the page can't vouch for — the linked `/app` screens are honestly-labeled placeholders, and the sentence would read as a blanket claim.
- **Fix:** narrowed to what's strictly verifiable: "every address and transaction hash on this page is a real Arc mainnet record — click any card to check it on the explorer yourself. The app screens behind the links are still being built; each one says so." (The audit's other two sub-claims — "fake Connect wallet", "zeroed stats" — were already stale: the Nav rewrite dropped the button and the Hero source-gate omits unfed stats.)

## HONEST-PLACEHOLDER — allowed, verified clean

- `frontend/src/shells/LandingShell.tsx` + `frontend/src/shells/Screens.tsx` `ScreenPlaceholder`: labeled "isn't live yet", names the next action, no fake controls, no dead ends. ✓
- `frontend/src/components/PolicyCard.tsx` `coming-soon` badge: disabled card, no install button rendered on purpose, explicit copy "nothing here can take your money or your signature". ✓
- `frontend/src/pages/app/PolicyEditor.tsx`: Save is disabled with the exact reason until F9 wires `onSave`; `handleSave` returns early without a hash; success state requires a real `0x` tx hash. Never fakes success. ✓
- `frontend/src/pages/app/SessionKeys.tsx`: revoke disabled with reason until the wallet module lands; rows only from the API; errors shown, not placeholder rows. ✓
- `backend/api/OPENAPI.yaml`: every endpoint `x-status: planned`; header states "Nothing here is implemented yet — all endpoints are planned". Example hashes are truncated (`0x113c…467`) and traceable to real bible txs. ✓
- Test fixtures (`contracts/test/*.sol`): `makeAddr("…")`, `0xA11CE`, `0xdeadbeef` — labeled fixtures in tests, not user-facing. The malleability-bound typo is honestly pinned as a behavior quote, not silently fixed. ✓
- `backend/api/contract-fields.test.js` / `_harness.js`: spec tests explicitly labeled "IMPLEMENTATION MISSING — do NOT write a stub server to make them pass". ✓
- `frontend/src/lib/userops.ts`: backend relay is a documented honest TODO throwing `RelayNotConfiguredError`, never a fake submission. ✓

## FALSE-POSITIVE — checked, no deception

- `backend/indexer/index.js`: refuses to run without `PLUGIN_ADDRESS` (exit 2), refuses the wrong chain, commits only ≥12-confirmation blocks, reports honest empty results, never fabricates denial rows. One of the most honest indexers in the repo.
- `frontend/src/components/landing/LiveProof.tsx`: all 10 hashes/addresses verified **character-for-character** against `hallpass-build-bible.md` §6 (install userOp `0xc5ad85a3…`, minimal plugin `0x5780…`, MSCA `0x2829…`, over-cap revert `0x1c25ab93…`, in-policy `0x113cdef8…`, userOp `0x8579d7b6…`, revoke `0x6d0e37a4…`, post-revoke `0xeb776bf0…`, SigGate `0x20203458…` + deploy `0x926d1c42…`, manifest hash `0xb058e6dc…`). Total-gas ≈0.25 USDC matches the bible. Explorer links are real.
- `frontend/src/components/landing/Footer.tsx`: all three contract addresses verified to carry code on mainnet.
- `frontend/src/pages/app/Marketplace.tsx` plugin address `0x7C912e73f9b8B60e4c68d58d52DeC5524e17ABDd`: the bible prints it 3 hex digits short (37 chars, invalid — confirmed); the corrected address is valid, has code, **and is returned by `getInstalledPlugins()` on the live MSCA**. The "recovered from H9 ledgers" comment checks out.
- `SEL_GET_INSTALLED_PLUGINS = 0x3a0cac56`: independently computed via keccak256 — matches.
- `frontend/src/lib/contracts.ts`: plugin address is env-only with **no** fallback default (install stays disabled with a reason); all selectors computed via `toFunctionSelector` and asserted; decimals split 18/6 explicit.
- `frontend/src/lib/wagmi.ts`: Reown project ID from env only, never hardcoded.
- `frontend/src/lib/useHallpass.ts`: real wallet-gated writes, manifest-mismatch hard-fails install.
- `frontend/src/components/landing/Nav.tsx`: wallet button is an honest link to `/app`, "no fake connect dialog".
- Root `README.md` / `PROOFS.md` / `HISTORY.md`: PROVEN-vs-SPECIFIED tables honest; production deployments marked TBD; disclosed bugs (malleability typo, facilitator trap) stated.

## OPEN — reported, not fixed (sibling-owned or owner's call)

1. **Indexer ↔ API schema divergence.** `backend/indexer/index.js` writes `plugin_installs/policy_updates/validation_results/revokes/indexer_state`, but the new `backend/api/server.js` `/api/v1/*` endpoints read `meta/accounts/activity` (per `CONTRACT.md`), which **no writer populates yet** — those endpoints return zeros until the indexer is aligned or a bridge is written. `/api/stats` (mounted, real-schema) is the honest landing-stats path for now. Recommend: align the indexer to the CONTRACT.md schema or have the API read the real indexer tables.
2. **`Marketplace.tsx` ↔ `PolicyCard.tsx` type sync** — was mid-edit during the sweep; a sibling resolved it (`onArmUninstall` now matches). Verified current state compiles-clean in shape.
3. **`SessionKeys.tsx` response-shape mismatch** (`data.policies` vs envelope `data.data.sessions`) — fixed by a sibling rewrite before I edited; I verified the new version (envelope read + on-chain owner overlay + guarded owner check).
4. **Landing page not mounted at `/`**: `frontend/src/pages/Landing.tsx` (11 real sections, verified hashes) exists but `App.tsx` serves the honest `LandingShell` scaffold. Placeholder is labeled; wiring is the landing owner's call.
5. **`spendsBlocked` is 0 until the relay denial feed lands** — by design (reverts emit no events); the API, docs, and Hero all handle it honestly, but a future relay integration must actually write `validation_results` denial rows or the metric stays 0.

## Files changed by this hunt

| File | Change |
|---|---|
| `backend/api/server.js` | `PLUGIN_MANAGER_ABI` → single-`address[]` return (live-verified); mounted `./stats` as `/api/stats` inside `createServer` |
| `backend/api/stats.js` | Rewrote `computeStats` to the real indexer schema; E2E-verified against a seeded DB |
| `backend/api/STATS.md` | Real schema contract; metric SQL updated; example labeled illustrative; spendsBlocked honesty rule |
| `backend/README.md` | Replaced false "docs only / not implemented" with the true implemented/planned split; fixed env names + run commands |
| `frontend/src/components/landing/Hero.tsx` | Stats row requires `source === "hallpass-indexer"` |
| `contracts/script/VerifyHallpass.sh` | Restored (was deleted; docs reference it) |
| `frontend/src/components/landing/Footer.tsx` | Narrowed the overreaching honesty claim to what's verifiable |

No secrets touched. No credentials, keys, or env values involved at any point.
