# HALLPASS — Build History

Chronological log of the HALLPASS build: the H9 research sprint (2026-10-14)
that proved every load-bearing mechanism on Arc mainnet, followed by the
ongoing build log. Every tx hash below is copied character-for-character from
the research records (`~/workspace/beacon-build/progress/h9/`, `~/workspace/your_files/hallpass-build-bible.md` §6);
entries with no on-chain artifact are labeled, not invented. Chain: Arc mainnet
(chain id 5042), unless stated.

**Conventions:** PROVEN = executed as a real mainnet tx with a recorded hash.
ATTESTED = worker-attested from live RPC, receipt unfetchable.
SPECIFIED = designed, not yet executed.

---

## RESEARCH SPRINT — H9 (2026-10-14)

### R1 — 2026-10-14 — Install path PROVEN via real ERC-4337 v0.7 userOp (W1A)

A real `installPlugin` executed via a real v0.7 userOp through
`EntryPoint.handleOps`. Evidence (Arc mainnet):

- Install tx: `0xc5ad85a35e7928f26e6cc45fd99169f555ad2e012c1f71936a24ca1ff3e6ee36` — status 1, gas 484864, block 25870396.
- userOpHash: `0x389a7d0ecf6171c1d6894efc395217607cf8ba53f053ae90c22a5d21218976a2`
- MSCA (Circle UpgradableMSCA, ERC1967 proxy → impl `0xA70F1296869DA9D7CB69578123F21888E6dB2B62`): `0x1Aa3842F384c9e825312075D075f561598D78Ca1`
- HallpassMinimalPlugin: `0x5780e3DEd211ee13494909432C89Be7b8D6441A3`
- Manifest hash: `0xb058e6dcf9dcd9bf9b20674c96c796223c9ddb030e5b84332dfc8e52c7185a64`
- Post-install on-chain queries: `getInstalledPlugins()` lists the plugin; `getExecutionHooks(0xb61d27f6)` shows the pre-exec hook; `perTxCap` = 0.02 USDC.
- W1A gas accounting (abbreviated hashes, as recorded): deploy full plugin `0x2628f6a6…42256108` (1,821,751 gas, 0.038257 USDC → `0x66A7464f091304B3619eDc163634169519E41Ce9`); proxy+init `0xb3c32e35…7950662b`; `depositTo` `0x525e1dfa…a54931eb592b`; `handleOps` #1 (reverted — see R2) `0x31d96c7a…c69c574eb`; deploy minimal plugin `0x8d5ea617…04da87c9b1c` (916,697 gas, 0.019251 USDC). Phase total: **0.1194 USDC**.
- Scripts preserved: `~/workspace/beacon-build/progress/h9/w1a-minimal-install.js`, `w1a-userop-install.js`.

### R2 — 2026-10-14 — Three first-class install findings (W1A F1–F3)

- **F1 — Circle factory is allowlisted:** `UpgradableMSCAFactory.createAccount` reverts `PluginIsNotAllowed` for non-allowlisted init plugins. Working path: deploy a minimal ERC1967 proxy directly against impl `0xA70F1296869DA9D7CB69578123F21888E6dB2B62` + `initializeUpgradableMSCA` — identical `PluginManager.install` code path, minus the allowlist.
- **F2 — direct EOA `installPlugin` is impossible on multisig-owned MSCAs:** the Circle multisig plugin has no `runtimeValidationFunction` (default reverts `NotImplemented(0xbfd151c1,0)`); **the only install path is a userOp through the EntryPoint** (proven by R1).
- **F3 — manifest validation-function collision:** the full HallpassPlugin's manifest claimed validation slots the multisig already owns → on-chain revert `ValidationFunctionAlreadySet` (ATTESTED; inner-revert receipt `0x31d96c7a…` recorded truncated and unfetchable — do NOT cite as RPC-verified). Hook lists compose; validation slots are exclusive. The two designs are complementary: full plugin for hallpass-first accounts, hooks-only minimal plugin for existing accounts.

### R3 — 2026-10-14 — Enforcement PROVEN: in-policy spend, over-cap revert, userOp, revoke (W1B2)

Deployed system: plugin `0x7C912e73f9b8B60e4c68d52DeC5524e17ABDd`, MSCA `0x2829f88DB9D8f86E57E9606b56cAC1039b6Bf89a`, policy = per-tx 0.01 / window 0.02 / 3600 s / expiry +2 h.

- D1 plugin deploy: `0xa420b99413543c1304960c87b6ffe6c055bdfc493d561cacb36c7736e75eaa22` (0.043725 USDC) — PROVEN.
- D2 proxy + init (plugin installed at creation): `0x209314409ce37cbcf3f30a935f01cde970b11c01d3dedba34ff21c0aefa250f4` (0.016452 USDC) — PROVEN.
- **In-policy spend** — session key `execute(payee, 0.005)`: `0x113cdef86eabe40139f6252e3fe57907e188c040b8396545bcba38e22a076467` — status 1. The documented bypass (key signing directly on-chain) is gated: `windowSpent` 0 → 0.005.
- **Over-cap spend** — 0.05 vs 0.01 cap: `0x1c25ab934b020d8fe5ddb8297455b2d4aadac8d86522ba2a689a4b36a3c4f149` — status 0, reverted `RuntimeValidationFailed` → **`PerTxCapExceeded(0.05, 0.01)`**, byte-exact (replay returned `0x6d4fdb09` wrapping `0xc154b3a8` with args `0xb1a2bc2ec500` / `0x2386f26fc10000`).
- **Real v0.7 userOp** via self-relayed `handleOps`: `0x8579d7b6f321d098b3ab6f12bc6e7cec3b6cd75c2d3d78a51eb059a850428ad4` — status 1. userOpHash `0xf06f051d4e410f9085aee68141fd1fc46b563b7279970f12228c72db2a23d3e5`. `windowSpent` 0.005 → 0.006, TOCTOU-atomic (check-and-record in one hook invocation).
- **Owner `revokeSession()`** via account fallback: `0x6d0e37a4446f498d13ee8a3511dedcff56d9800935478b0e454c6ab2c00e21f0` — status 1.
- **Post-revoke spend**: `0xeb776bf0b75e733a122dc74b1dec5009f0859141d1d3e4807bab7da4943d6d5d` — status 0, reverted `SessionRevoked()` (replay `0xec580bc7`). Final state verified live: `revoked=true`, caps intact.
- Genuine finding: `revokeSession` must go through the account fallback (installed execution function), NOT wrapped in `account.execute(plugin, 0, ...)` — the wrapped call reverts on-chain (custom error `0x9ce1cc5c`).
- Honest caveat: no public v0.7 bundler exists on Arc — userOps were self-relayed (ERC-7562 mempool acceptance NOT proven; disclosed).

### R4 — 2026-10-14 — REAL bug found and disclosed: malleability-constant typo (W1B2)

The research plugin's anti-malleability bound was a **62-hex-digit typo** (≈ 2^247), rejecting ~99.8 % of valid signatures on the userOp path — proven by two real reverted `handleOps` txs (`FailedOpWithRevert(0, "AA23 reverted", Error("malleable s"))`). The enforcement proofs above used an offline-ground passing signature against the deployed bound — the proof holds; the bound does not.

**Mandatory production fix** — use the true secp256k1 half-order:
`floor(n/2) = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0`
Verify independently; do not copy from memory. Redeploy and re-verify the userOp path after fixing. The build must ship a signature-malleability test-vector suite (low-S / high-S / boundary) in CI. The defect is in signature-strictness, not in the policy-enforcement mechanism (proven on both paths).

### R5 — 2026-10-14 — Typed-data / ERC-1271 gate CLOSED on mainnet (W1C)

SigGate `0x202034589739214Dd4daC17C66FCf53e875B6531` (6,229 bytes on-chain; the file's 6,258 figure was a byte-count artifact); Account B `0xB25A75a2990d07027E2676aF28DBe828BB3C18Be` (SigGate at init); Account A `0xF0d611Db9B94C863283E991E055b1F0a17bdFE31` (no plugins — control).

- SigGate deploy: `0x926d1c4292909edc7bdce2545f14a26402372ef3b522faafe781774f3dff44af` (1,400,397 gas, 0.030809 USDC, block 25869265) — PROVEN.
- Proxy → Account B: `0x3f3930be8e128d91ea5485570da9938da8002a8e3a460531d2fc5cb3940324b0` (0.015082 USDC) — PROVEN.
- Proxy → Account A (control): `0x5ee937a338b7bf251e2e561cce50bb3602576a628fc9f04fd83374cb65e3c38b` (0.003119 USDC) — PROVEN.
- `authorizeDigest` (owner, through account): `0x89150a83042a9f8a5787c7b6d20931abd8cec21dc9fe040dcecdd97001fe90df` (0.002640 USDC) — PROVEN.
- **Facilitator trap (real Arc-mainnet discovery):** on plugin-less Account A, `supportsInterface(0x1626ba7e)` = true while `isValidSignature` reverts `InvalidValidationFunctionId` (selector `0x534a471c`, independently computed and replay-verified). Never trust the ERC-165 answer alone.
- Pre-authorized EIP-3009 digest (built from Arc USDC's on-chain `DOMAIN_SEPARATOR`; digest `0x93fda2af4e9cdb5afd8b69613902df2a96a4add2ac506ce02cff6e4e7f408113`) + session-key sig → `isValidSignature` returns MAGIC **`0x1626ba7e`** — PROVEN. Stranger (facilitator simulation) + valid pair → MAGIC — PROVEN. Owner sig on session digest / never-authorized digest → `0xffffffff` — PROVEN.
- `authorizeDigest` over-cap → reverts `over per-tx cap`; stranger `authorizeDigest` → reverts at account level — PROVEN.
- Honest bounds: one plugin per selector per account (the 1271 plugin displaces Circle's multisig 1271 — owner chooses); the probe didn't flip the `used` flag (production needs one SSTORE); settlement mechanics after MAGIC are facilitator-specific.

### R6 — 2026-10-14 — OOG lesson: gas economics are real (failures ledger F1)

A plugin deploy with a 1.5 M gas limit ran **out of gas** (abbreviated hash `0x2a461682…` as recorded) — the code-deposit alone (200 gas/byte) needed ~1.64 M. **0.036 USDC burned.** Measured economics: Arc base fee is **pinned at 20 gwei**; plugin deploy ≈ 1.8 M gas (≈ 0.039 USDC at 21 gwei). Rule: always set deploy `gasLimit ≥ 2.2M` and compute code-deposit cost before sending.

### R7 — 2026-10-14 — Vendor-risk verdict: UUPS-key leg REFUTED by Circle's own source (W2A)

Direct inspection of Circle's public `buidl-wallet-contracts` (kill-verified verbatim, 2026-10-14): `UpgradableMSCA.upgradeToAndCall` carries BOTH `onlyProxy` AND `validateNativeFunction`; `_authorizeUpgrade` is intentionally empty because authorization is delegated to the account's installed validation plugins; `BaseMSCA.sol:113` doc comment explicitly lists `upgradeTo and upgradeToAndCall` among the functions guarded by owner-mediated validation. **Circle holds no per-account upgrade key and cannot unilaterally change the implementation under installed plugins.** Remaining risk reframed: first-party *feature* risk (a major AA provider already ships a first-party Session Key Plugin) — real but partial, disclosed on the product's trust screen.

### R8 — 2026-10-14 — Competition + buyer sweep (W2B, W3)

- **Broad lane occupied (two live mainnet near-collisions, code-verified):** Barkeep Arc — factory `0xccebC58DD1F5937B36D5f9F89f0754424f4D443c` (2,355 B), tab impl `0x89B63f2E43dea9014750925C01996D34856B01D2` (3,637 B), live since 2026-09-24; ArcMandate — vault `0x99cAae907095bBB95D8714ee2a23369dB2377d7A` (7,906 B), demo txs `0xa8ee649567be40eefc93cd894a1b8fa6d8b97c709073fcfcc6ff8a3c18e0f5a3` and `0x5cc09bb95d3f41789abd24059680f1c31ae7087b9c879708b4d0ddea64710897` (2026-10-10). **Narrow lane (ERC-6900 v0.7 policy plugin on Circle MSCAs) verifiably empty** — Circle docs list only Passkey + Address Book; repo ships only `acl`/`addressbook`/`multisig`.
- **Buyer:** no committed buyer. Strongest honest lead: AgentBadge (named team, live Arc project, verbatim self-documented bypass gap). Bench: Fatstack, PinkWallet. Correction logged: CrewAIInc/crewai **#7799** is an OPEN `feature-request` by external builder **gazoy**, exactly 2 comments, **zero maintainer engagement** — weaker demand evidence than first implied.

### R9 — 2026-10-14 — Kill-gate verification + re-judge: 8.875 → 9.0 (W4, W5)

- **W4 kill-gate: 19/19 fetchable receipts match claimed status AND gasUsed exactly**; every claimed revert reason replays byte-identical. Byte-count corrections applied (measurement artifact, no money-shot impact): minimal plugin 4,022 → **3,993**; full plugin 8,206 → **8,178**; SigGate 6,258 → **6,229**; ArcMandate 7,907 → **7,906**.
- **W5 re-judge (identical rubric to the 8.875 baseline):** Arc-relevance 9.0 (hold), technical credibility 8.5 → **9.0** (typed-data gate closed + enforcement proven + real bug disclosed + 19/19 verified), build-quality path 9.0 (hold), promise 9.0 → **9.1** (UUPS leg refuted). (9.0 + 9.0 + 9.0 + 9.1) / 4 = 9.025 → **9.0 / 10**. 9.2 honestly unearned: no committed buyer, first-party feature risk unhedged, broad-lane form-factor compression, session-key UX gap ahead.
- Gas total across the sprint: ≈ **0.25 USDC** (W1A 0.1194 + W1B2 0.0767 + W1C 0.0516 + F1 OOG 0.036). No principal lost.

### R10 — 2026-10-14 — Build bible + Cursor pack delivered (coordinator)

- `~/workspace/your_files/hallpass-build-bible.md` (559 lines): thesis, why-it-wins, architecture, contract specs with verified addresses/selectors, implementation guide (Arc 5042 specifics), full test-evidence ledger, product flows, UI spec, wallet verdict (**Reown + wagmi + viem** — not Privy), sources, 10 hard rules (no demo/mock/fake), definition of done.
- `~/workspace/your_files/hallpass-cursor-pack.zip` (30 files: build bible, `HallpassPlugin.sol`, userOp execution scripts, wave evidence logs, `README-CURSOR.md`) — verified on disk 06:37 UTC.

---

## BUILD LOG (in progress)

Entries are appended here as build workers complete them. Nothing in this section is backfilled — if it has no evidence, it is marked PLANNED or omitted.

### B1 — 2026-10-14 — Repo scaffold created (baseline snapshot)

- Repo: `~/workspace/hallpass-build/`. Structure: `contracts/` (Foundry: `src/HallpassPlugin.sol`, `script/VerifyHallpass.sh`, `script/Probe.s.sol`, `foundry.toml`), `backend/` (`api/`: `OPENAPI.yaml`, `stats.js`, `STATS.md`; `indexer/`: `index.js`, `README.md`, `package.json`; `Dockerfile`, `render.yaml`, `start.sh`, `README.md`), `frontend/` (Vite + Tailwind + TypeScript scaffold, `vercel.json`), `scripts/` (empty), `.env.example` (key names + placeholders ONLY — no values).
- Git: repository initialized on branch `master`; **zero commits** (`git log --oneline` → "your current branch 'master' does not have any commits yet"). Nothing has been committed yet.
- No mainnet deployments, no txs, no test runs have been recorded in this repo yet — the only proven artifacts are the research-sprint ones above.

### B2 — 2026-10-14 — Contracts: malleability fix applied + 27/27 unit tests + 19/19 fork tests (coordinator + C2 + C3)

- **H-1 HIGH fixed by the coordinator:** `contracts/src/HallpassPlugin.sol` line 396 carried the pre-fix 62-digit malleability-constant typo (from the H9 work copy). Independently verified and corrected to the true secp256k1 half-order `0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0`; `forge build` green after.
- C2: `contracts/test/HallpassPlugin.t.sol` — **27/27 green**, including `test_MalleabilityBoundIsTrueHalfOrder`, which behaviorally probes the exact constant the bytecode enforces via revert-reason binary search (no source literal read — a silent re-typo fails CI). Negative control: the probe FAILS against the pre-fix source, extracting the typo'd constant byte-for-byte.
- C2/C3 corrections to the bible: the real revert is `RecipientNotAllowed(address)` (not `NotAllowlisted`); the auto-generated `policies()` getter returns 9 fields (dynamic `allowlist` omitted); `revokeSession`/`updatePolicy` have no on-contract sender check (authorization is the account's `FID_OWNER` routing).
- C3: `contracts/test/HallpassFork.t.sol` — **19/19 pass** on an Arc mainnet fork.
- C4/C5: `contracts/script/DeployHallpass.s.sol` + `scripts/deploy.sh` (≥2.2M gas limit enforced via `--gas-estimate-multiplier 150`; key loaded silently from env-2.txt, never printed) + `contracts/script/VerifyHallpass.sh` (Sourcify `exact_match` plan; explorer 403s behind Cloudflare) + `contracts/DEPLOYMENT.md` (checklist, record table).
- C6: `contracts/AUDIT-NOTES.md` + `contracts/GAS.md`.

### B3 — 2026-10-14 — Backend: CONTRACT.md conformance + 32/32 API tests green (coordinator + B5)

- B5 wrote `backend/api/CONTRACT.md` v1.0.0 (the test target) + 5 test files; the parallel `server.js` had diverged (wrong routes/envelope, leaked `rpcUrl`/`dbPath` in `/health`). The coordinator rewrote `backend/api/server.js` to conform exactly: `/api/v1/*` routes, uniform error envelope, 405+`Allow`, no secret leaks, RPC-backed vs indexer-backed provenance labels, `createServer({dbPath, rpcUrl, chainId, port})` module interface.
- Fixed a Node-24 harness bug (`t.after` no longer exists on `before`-hook contexts; teardown now registered once at module top level).
- `node --test backend/api/` → **32/32 pass**.
- B1 indexer verified against live mainnet; B3 stats API; B4 `render.yaml` + `Dockerfile` + `.env.example`; B6 docs + OpenAPI.

### B4 — 2026-10-14 — Frontend: /api/v1 migration + gates green (coordinator + F1–F10)

- 10 frontend workers built landing (12 sections, seenadvertising.agency-grade) + dashboard (Connect, Accounts, SessionKeys, Marketplace, PolicyEditor, Activity) + wallet lib (`src/lib/`: Reown AppKit + wagmi + viem, `useHallpass` hook, real userOp builders).
- Design law `~/workspace/your_files/design-standard.md` applied as binding; Q4 UX audit (8 blockers) resolved: landing mounted at `/`, dashboard routes mounted, no `next/*` imports (Vite only), real connect button, hero stats omitted unless real.
- The coordinator migrated all API call sites to `/api/v1/*` after the backend conformance rewrite (Hero stats, SessionKeys sessions, Activity cursor feed, shared account-status client) and added `frontend/.env.example`.
- Gates: `npx tsc --noEmit` clean, `npm run build` green, `npm run dev` starts with zero errors and the landing renders at 200 with no wallet connected (P4 verified).

### B5 — 2026-10-14 — Q1 dust E2E RE-PROVEN on mainnet (coordinator; two Q1 workers died in daemon restarts)

- Fresh account `0xae57003e42e3548A9D39Cd55bCDfAc04363B1d63` (ERC1967 proxy → MSCA impl), plugin `0x7C912e73f9b8B60e4c68d58d52DeC5524e17ABDd`, fresh session key, policy 0.01/0.02 USDC.
- Full report: `QA/dust-e2e-report.md`. Hashes: install `0x18d20d1f36645456b8614544c0b3a6237639ae150b6ab9e842c32e8c1c402ca0`; in-policy 0.005 `0x9020636267e33400df6639d79d3a18bc7389f6152cb505039c49594f8e555953`; over-cap revert `PerTxCapExceeded(0.05,0.01)` `0x9fdc48e5a47d12ec08eeccbd8dccae3441d03de7e544b5f46d29124cefa074bf`; revoke `0xe1bf2980e4fdb2ff7ed4a2e9f6d308a9a191c4ce8ff499552ed9316a64d9f291`; post-revoke revert `SessionRevoked()` `0xb51c29dadc8e91a167ebecef2bbe5a550deae8b4976cff69b9869fe403d72f11`.
- Budget: per-tx ≤ 0.01 except the install tx (0.01314 — cold SSTOREs, disclosed); total gas ≈ 0.0221 USDC.
- Bytecode honesty: `0x7C91…` is pre-fix bytecode (verified via `cast code`); enforcement paths identical — the fix is proven by unit tests, and a fixed-binary production deploy is the founder's step.

### B6 — 2026-10-14 — PRODUCTION DEPLOY of the fixed plugin (founder-authorized broadcast)

- `scripts/deploy.sh` broadcast `HallpassPlugin` (H-1-fixed source) on Arc mainnet: **`0x8a81455a477deeA986ca48cE83ca89C5331Da793`**, tx `0xf408ec17f3b9e915488fa901f190123fc56368f487ee6ee30eb80e065e86fe1c`, block 25959755. Record: `contracts/deployments/arc-5042.json` (real values, no placeholders).
- `cast code` verification: deployed bytecode contains the FIXED malleability constant `0x7FFF…B20A0`; the typo constant is absent.
- Sourcify: **exact_match** (creation + runtime), verified 2026-10-14T17:46:52Z. Also fixed `contracts/script/VerifyHallpass.sh` (Sourcify API v1 removed; now uses v2 `/v2/contract/{chainId}/{address}`) — re-ran green.
- Wiring: frontend → `VITE_PLUGIN_ADDRESS`; backend API → `PLUGIN_ADDRESS` env (default stays the H9 deployment the indexer data refers to). Documented in `contracts/DEPLOYMENT.md` §8.

### Upcoming (PLANNED)

- **B7 (PLANNED):** re-prove the money-shots against the production `0x8a81…793` deployment (in-policy spend, over-cap revert, userOp, revoke, typed-data gate) — the enforcement paths are byte-identical to the proven `0x7C91…` binary except the malleability bound.
- **B8 (PLANNED):** relay service contract for `VITE_RELAY_URL` (currently throws `RelayNotConfiguredError`; dashboard self-relays) — or remove the relay path if self-relay stays the design.
- **B9 (PLANNED):** submission package for the program deadline (2026-10-14 23:59 ET).
