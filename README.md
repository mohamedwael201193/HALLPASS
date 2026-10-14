# HALLPASS

> **Give your agent a hall pass — not your keys.**

[![Arc](https://img.shields.io/badge/Arc-5042%20mainnet-blue)](https://explorer.arc.io)
[![ERC-6900](https://img.shields.io/badge/ERC--6900-v0.7-purple)](https://eips.ethereum.org/EIPS/eip-6900)
[![ERC-4337](https://img.shields.io/badge/ERC--4337-v0.7-purple)](https://eips.ethereum.org/EIPS/eip-4337)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Installable **ERC-6900 v0.7 policy plugins** for Circle's modular smart accounts (MSCAs) on **Arc mainnet (chain 5042)**. HALLPASS gives an agent's hot key — a *session key* — bounded spending authority enforced **on-chain by the account itself**: per-transaction cap, rolling-window cap, recipient allowlist, expiry, instant revocation. Every violation **reverts on-chain** — the money never moves.

---

## The story

**The metaphor.** A school hall pass: *"You may leave the room — but only to the bathroom, and only until the bell rings."* Permission with built-in expiry and destination bounds. *"Show me your hall pass"* is how the account says no. Every visual, every headline, every line of copy in this product should feel like a permission slip glowing with allowed bounds — **amber light = allowed**.

**The problem.** AI agents need to spend money on-chain — paying for APIs, tools, data, compute. Today a team faces a brutal choice: hand the agent your private key (all-or-nothing access; the agent can drain everything — reckless) or keep the agent on a leash so short it's useless (manual approvals for every 1-cent API call — the agent might as well not exist). Keys are binary: you either trust completely, or you don't use agents at all. Off-chain spend trackers don't fix this — their refusal lives in a server, not at the money's location.

**The solution.** HALLPASS installs a policy plugin on your Circle smart account. The operator installs it once (one owner-signed action); from then on, every spend the session key attempts is gated by the plugin at the account's execution layer. Spends inside the bounds succeed normally; the moment the agent tries to exceed one, the transaction **reverts on-chain** with a clear, human-readable reason (`PerTxCapExceeded(0.50, 0.10)` — not a hex blob). Revocation is one transaction: the key dies instantly, and unspent funds never left the account. Typed-data authorizations (the kind x402 payment facilitators use) are covered too — pre-authorized per-digest through the account, verified on-chain via `isValidSignature`.

---

## Architecture

Four pieces. No token, no factory, no fees, no admin.

```
┌──────────────┐      userOp / tx       ┌─────────────────────────────┐
│  Owner (EOA) │ ─────────────────────▶ │  Circle MSCA (ERC1967 proxy) │
│  via Reown   │   install/update/      │  impl 0xA70F…B2B62          │
│  dashboard   │   revoke (owner-only)  │                             │
└──────────────┘                        │  ┌───────────────────────┐  │
                                        │  │ HallpassPlugin        │  │
┌──────────────┐      userOp            │  │ (ERC-6900 v0.7)       │  │
│ Session key  │ ─────────────────────▶ │  │ - policy store        │◀─┼── gates every spend
│ (agent hot   │   execute/executeBatch │  │ - preExecutionHook    │  │
│  key, EOA)   │   authorizeDigest      │  │ - userOp validation   │  │
└──────────────┘                        │  │ - isValidSignature    │◀─┼── gates typed-data path
                                        │  │   (SigGate pattern)   │  │
┌──────────────┐      eth_call /        │  └───────────────────────┘  │
│  Dashboard   │   event logs           │  EntryPoint v0.7            │
│  (Next.js)   │ ◀────────────────────  │  0x0000…032 (self-relayed)  │
└──────────────┘                        └─────────────────────────────┘
        │                                    ▲
        │  builds + submits                  │ handleOps (self-relay;
        ▼  PackedUserOperation                │ no public v0.7 bundler
┌──────────────┐                             │ on Arc — proven)
│ Relay service│ ────────────────────────────┘
│ (backend)    │  handleOps([userOp], beneficiary)
└──────────────┘
        │
        ▼
┌──────────────┐
│ Indexer      │  SpendAuthorized / denial events → activity feed,
│ (event logs) │  policy-hash commitments, per-session rollups
└──────────────┘
```

**Spend path, end to end:**
1. The agent's session key builds an intent (e.g., pay 0.05 USDC to an API), wrapped as an ERC-4337 v0.7 `PackedUserOperation` or a direct `execute` call.
2. The EntryPoint (userOp path) or the account's runtime validation (direct path) invokes the plugin's validation: caller must be the registered session key (owner always bypasses); `value ≤ perTxCap`; `windowSpent + value ≤ windowCap` (window resets every `windowSecs`); `to` ∈ allowlist (empty allowlist = open, caps-only mode); `block.timestamp < expiry`. Check **and** window-spend recording happen atomically in the same hook invocation (TOCTOU-proof). The counted amount is fee-inclusive.
3. Any violation → revert at the account (`PerTxCapExceeded`, `WindowCapExceeded`, `NotAllowlisted`, `SessionExpired`, `SessionRevoked` — all decodable custom errors). Success → `SpendAuthorized(session, to, amount, policyHash, windowUsed)` event.
4. **Typed-data path:** the session key pre-authorizes `(digest → to/value/expiry)` *through the account* (`authorizeDigest`, policy-gated); signs EIP-3009 typed data off-chain; any facilitator's `isValidSignature(digest, sig)` call routes via the account fallback to the plugin, which returns MAGIC `0x1626ba7e` iff (digest pre-authorized) ∧ (`ecrecover == sessionKey`) ∧ (unexpired). Unauthorized or over-cap digests return `0xffffffff` or revert.

**Two deployment shapes, both proven:**
- **Hallpass-first account** — plugin installed at account creation via `initializeUpgradableMSCA`. Full plugin owns userOp + runtime validation. Best for new deployments.
- **Existing accounts** (e.g., multisig-owned) — hooks-only minimal plugin installed post-creation via owner-signed **userOp** through the EntryPoint (`installPlugin` selector `f85730f4`). The minimal plugin's manifest claims no validation slots (hook lists compose, validation slots are exclusive — proven by a live revert).

**Factory note (load-bearing):** Circle's `UpgradableMSCAFactory.createAccount` is **allowlisted** for init plugins. Do NOT use the factory path. Deploy a minimal ERC1967 proxy directly against Circle's live implementation `0xA70F1296869DA9D7CB69578123F21888E6dB2B62` and call `initializeUpgradableMSCA` — the identical `PluginManager.install` code path, minus the allowlist gate. Proven on mainnet.

### Repo layout

```
hallpass-build/
├── README.md                 ← this file (the front door)
├── .env.example              ← key names + placeholders ONLY; never commit a filled .env
├── contracts/                ← Foundry project (solc 0.8.24, optimizer 200)
│   ├── src/
│   │   └── HallpassPlugin.sol    ← full policy plugin: policy store, userOp/runtime
│   │                               validation, preExecutionHook, revoke/update,
│   │                               SigGate-style isValidSignature module
│   ├── script/
│   │   └── VerifyHallpass.sh     ← deploy + Sourcify verify helper (exact_match required)
│   ├── deployments/              ← per-deploy records: address, tx hash, Sourcify link
│   ├── foundry.toml              ← rpc_endpoints: arc = https://rpc.mainnet.arc.io
│   └── lib/                      ← forge-std (submodule)
├── backend/                  ← Node 20 services (no keys, no policy decisions, no invented state)
│   ├── api/                  ← dashboard API (OPENAPI.yaml, stats.js)
│   ├── indexer/              ← event indexer → SQLite: SpendAuthorized, installs,
│   │                           policy updates, revokes, authorizations; per-session rollups
│   │                           (the chain is truth — the indexer is cache, rebuildable)
│   ├── render.yaml           ← Render blueprint: hallpass-api (web) + hallpass-indexer (worker)
│   ├── Dockerfile / start.sh ← container entry points
│   └── README.md             ← service details + API surface
├── frontend/                 ← Reown AppKit + wagmi + viem (Arc chain built-in, 5042)
│   ├── src/
│   │   ├── App.tsx / main.tsx / index.css
│   │   └── components/landing/   ← landing page: Metaphor, Problem, Live proof, …
│   ├── vercel.json           ← Vercel deploy config
│   └── package.json          ← dev: vite · build: tsc --noEmit && vite build
└── docs/                     ← PROOFS.md (full mainnet test-evidence ledger), design notes
```

---

## Quickstart

### Prerequisites

- **Foundry** (`forge`, `cast`) — [book.getfoundry.sh](https://book.getfoundry.sh/getting-started/installation)
- **Node 20+** — check with `node -v`
- An Arc mainnet RPC: public `https://rpc.mainnet.arc.io` (or Alchemy / Blockdaemon / dRPC / QuickNode Arc endpoints)
- A wallet with a little USDC on Arc for gas (the full proof set cost ≈ 0.25 USDC; gas is 18-decimal USDC, pinned ~20 gwei)

### Install

```bash
git clone <this-repo> hallpass-build && cd hallpass-build

# contracts
cd contracts && forge install && forge build && forge test

# backend (relay + indexer + api)
cd ../backend && npm install

# frontend
cd ../frontend && npm install
```

### Environment setup

Copy `.env.example` and fill in — **key names and placeholders only, never real values in git**:

```bash
cp .env.example .env   # then fill in: RPC_URL, PLUGIN_ADDRESS, RELAYER_PRIVATE_KEY, …
```

Required variables (see `.env.example` for the full list):
- `RPC_URL` — Arc mainnet RPC (public value, e.g. `https://rpc.mainnet.arc.io`)
- `PLUGIN_ADDRESS` — your HallpassPlugin deployment on Arc 5042 (from the deploy step)
- `ENTRYPOINT_ADDRESS` — `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (verified on-chain)
- `RELAYER_PRIVATE_KEY` — key the relay uses for `EntryPoint.handleOps` (**secret** — fund with USDC for gas, never commit)
- `REOWN_PROJECT_ID` — from the Reown dashboard (frontend; public)
- `DB_PATH` / `PORT` / `FRONTEND_URL` — backend-local settings

### Run

```bash
# 1. contract tests (unit + fuzz on the rolling-window accounting + selector assertions)
cd contracts && forge test

# 2. backend — indexer first, then API (indexer needs no secrets: pure RPC reads)
cd ../backend
PLUGIN_ADDRESS=<deployed plugin> START_BLOCK=<deploy block> node indexer/index.js &
npm run api        # or: node api/<server> per backend/README.md

# 3. frontend dashboard
cd ../frontend && npm run dev
```

Open **http://localhost:5173**. Connect a wallet → create a smart account → install the plugin → set policy → generate a session key. Everything on Arc mainnet, everything real.

---

## Deploy

### Contracts → Arc mainnet

```bash
cd contracts
forge script script/DeployHallpass.s.sol \
  --rpc-url arc --broadcast \
  --gas-limit 2200000          # ≥ 2.2M — a 1.5M limit caused a real out-of-gas (0.036 USDC burned)
```

Then **verify on Sourcify immediately** (`exact_match` is mandatory — a non-exact match is not shippable):

```
https://repo.sourcify.dev/5042/<address>
```

Do NOT use the Arc explorer's Blockscout verification API — it sits behind a Cloudflare challenge and returns 403. `contracts/script/VerifyHallpass.sh` wraps the forge-deploy + Sourcify-verify flow. Record every deployment in `contracts/deployments/` (address + tx hash + Sourcify link).

### Frontend → Vercel

```bash
cd frontend
vercel --prod
```

`vercel.json` is already configured. Set these env vars in the Vercel dashboard:
- `VITE_REOWN_PROJECT_ID` (Reown dashboard)
- `VITE_RPC_URL` (public, `https://rpc.mainnet.arc.io`)
- `VITE_PLUGIN_ADDRESS` (your deployed plugin)
- `VITE_API_URL` (your Render API origin)

### Backend → Render

`backend/render.yaml` is the blueprint: one **web** service (`hallpass-api`) + one **worker** (`hallpass-indexer`), each with its own 1 GB disk for SQLite. In the Render dashboard, set every `sync: false` variable:

| Service | Env vars to set |
|---|---|
| `hallpass-api` | `RPC_URL`, `PLUGIN_ADDRESS`, `ENTRYPOINT_ADDRESS`, `FRONTEND_URL`, **`RELAYER_PRIVATE_KEY`** (secret) |
| `hallpass-indexer` | `RPC_URL`, `PLUGIN_ADDRESS` |

No secrets in `render.yaml` itself — `RELAYER_PRIVATE_KEY` is set in the dashboard only.

---

## Live addresses & selectors (Arc mainnet, chain 5042)

All RPC-verified 2026-10-14. Explorer: https://explorer.arc.io · Sourcify: https://repo.sourcify.dev/5042/`<address>`

### Infrastructure (verified on-chain)

| Item | Address | Notes |
|---|---|---|
| Circle MSCA v1 implementation (ERC-6900 v0.7 + ERC-4337 v0.7) | `0xA70F1296869DA9D7CB69578123F21888E6dB2B62` | Deploy ERC1967 proxies against this |
| Circle MSCA v1 factory | `0x0000000DF7E6c9Dc387cAFc5eCBfa6c3a6179AdD` | **Allowlisted — do not use for custom plugins** |
| ERC-4337 EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | Self-relayed (no public v0.7 bundler on Arc) |
| ERC-6900 Address Book plugin (install precedent) | `0x0000000d81083B16EA76dfab46B0315B0eDBF3d0` | |
| Arc USDC (ERC-20) | `0x3600000000000000000000000000000000000000` | **6 decimals** — policy caps in the plugin are native wei (18 decimals); convert explicitly at every boundary |
| Native gas token | — | USDC, **18 decimals** — one balance funds spend + gas |

### HALLPASS deployments

| Contract | Address | Status |
|---|---|---|
| `HallpassPlugin` (production, malleability fix applied) | — | **TBD** — deploy via `contracts/script/VerifyHallpass.sh`, Sourcify exact_match required |
| `HallpassMinimalPlugin` (hooks-only, existing accounts) | — | **TBD** |
| SigGate `isValidSignature` module (production, with `used`-flag SSTORE) | — | **TBD** |

### Key selectors (computed with `cast sig`, never recalled — every selector has an assertion test in CI)

| Function | Selector |
|---|---|
| `installPlugin(address,bytes32,bytes,(address,uint8)[])` | `f85730f4` |
| `uninstallPlugin(address,bytes,bytes)` | `c1a221f3` |
| `executeBatch(address[],uint256[],bytes[])` | `34fcd5be` |
| `preExecutionHook(uint8,address,uint256,bytes)` | `46d60eb2` |
| `preRuntimeValidationHook(uint8,address,uint256,bytes)` | `0c7ecd84` |
| `postExecutionHook(uint8,bytes)` | `1128186d` |
| `onInstall(bytes)` | `6d61fe70` |
| `onUninstall(bytes)` | `8a91b0e3` |
| `isValidSignature` MAGIC return (ERC-1271) | `0x1626ba7e` (revert-or-`0xffffffff` otherwise) |

### Exact install calldata pattern (proven)

```
installPlugin(
  plugin            = <plugin address>,
  manifestHash      = keccak256(abi.encode(plugin.pluginManifest())),  // queried on-chain
  pluginInstallData = abi.encode(sessionKey, owner, perTxCap, windowCap, windowSecs, expiry, allowlist),
  dependencies      = []                                               // (address,uint8)[] — empty unless needed
)
```

---

## Wallet setup

**Verdict: Reown (AppKit) + wagmi + viem. Not Privy.** viem ships a native `arc` chain definition (5042) — config is declarative. Broad wallet support (Rabby, MetaMask, Coinbase Wallet) via AppKit connectors. Privy has a documented Arc quirk (`eth_sendTransaction` → 401 per-chain auth, forcing `eth_signTransaction` + own-RPC broadcast) on the exact signing paths this product lives on. Embedded wallets are unnecessary indirection: the operator already holds an EOA (they own the MSCA).

1. Create a project at [dashboard.reown.com](https://dashboard.reown.com) → copy the **project ID**.
2. Set `VITE_REOWN_PROJECT_ID` (frontend) / `REOWN_PROJECT_ID`.
3. AppKit config: `chains: [arc]` (viem built-in), transports keyed to `https://rpc.mainnet.arc.io`.
4. Owner actions (install / update / revoke / create account) are signed by the connected wallet. For userOp installs on multisig-owned accounts, the owner signs `eth_signed_message(userOpHash)` with the connected wallet.
5. Session keys are generated client-side (`viem.generatePrivateKeyAccount`), shown **exactly once** with a copy-now warning, and never stored server-side.

---

## Testing (dust E2E, mainnet only)

All acceptance runs against Arc mainnet with dust amounts. Testnet-only is not acceptance. The full proof set cost ≈ 0.25 USDC.

1. `cd contracts && forge test` — unit + fuzz (rolling-window: concurrent spends, window boundaries, revert atomicity) + selector-assertion tests + signature test vectors (low-S / high-S / boundary — the malleability bug that bit research is now a CI gate).
2. Repeat the money-shots against every production deploy, with tx hashes recorded in `docs/PROOFS.md`:
   - `installPlugin` executes (direct on hallpass-first accounts; userOp on existing accounts)
   - In-policy spend succeeds; `SpendAuthorized` emits with correct fields
   - Over-cap spend reverts with decodable `PerTxCapExceeded`
   - Allowlist violation reverts; expired session reverts
   - Real v0.7 userOp through `EntryPoint.handleOps` (self-relayed) succeeds with correct window accounting
   - `revokeSession()` via the account fallback succeeds; post-revoke spend reverts `SessionRevoked()`
   - `authorizeDigest` over-cap reverts; pre-authorized digest + session-key sig → MAGIC; unauthorized digest → `0xffffffff`
   - `uninstallPlugin` succeeds; the account behaves as before
3. **Stranger test (dashboard):** fresh wallet → connect → create account → install plugin → set policy → generate session key → spend within bounds → attempt over-cap (sees the plain-language block) → revoke → sweep — entirely unassisted, no mock data, no dead-ends.

---

## Honesty block

### Proven on mainnet vs specified

| Claim | Status | Evidence |
|---|---|---|
| Third-party plugin installs on a Circle MSCA via a real v0.7 userOp | **PROVEN** | `handleOps` tx `0xc5ad85a3…3e6ee36`; `getInstalledPlugins()` listed it; `perTxCap` = 0.02 USDC on-chain |
| Over-cap spend reverts at the account | **PROVEN** | tx `0x1c25ab93…3c4f149` reverted `PerTxCapExceeded(0.05, 0.01)`, byte-exact |
| In-policy spend + TOCTOU-atomic window accounting | **PROVEN** | txs `0x113cdef8…076467` (direct) and `0x8579d7b6…0428ad4` (userOp, self-relayed) |
| Revocation kills the key | **PROVEN** | `revokeSession` tx `0x6d0e37a4…c00e21f0`; post-revoke spend reverted `SessionRevoked()` |
| Typed-data gate (SigGate pattern) | **PROVEN** | Pre-authorized digest + session-key sig → MAGIC `0x1626ba7e`; stranger/facilitator + valid pair → MAGIC; unauthorized/owner-sig-on-session-digest → `0xffffffff`; over-cap `authorizeDigest` reverts |
| Facilitator trap | **PROVEN** | `supportsInterface(0x1626ba7e)` returned `true` on a plugin-less account while `isValidSignature` reverted |
| No public v0.7 bundler on Arc | **PROVEN** | userOps were self-relayed; relay status is shown honestly in the UI |
| Manifest-collision rule | **PROVEN** | live revert: `ValidationFunctionAlreadySet` on multisig-owned accounts (hooks compose, validation slots don't) |
| Production `HallpassPlugin` deployment (malleability fix) | **SPECIFIED** | TBD — deploy step above; repeat the full money-shot list after deploy |
| `used`-flag SSTORE on digest verification | **SPECIFIED** | research probe omitted it; production MUST mark digests consumed |
| Bundler-mempool acceptance (ERC-7562 storage rules) | **SPECIFIED** | both paths prove policy binds account execution + 4337 validation; mempool acceptance NOT proven |
| Full production test ledger | — | **`docs/PROOFS.md`** — tx hashes for every deploy, repeated per production deployment |

### What you have to trust

This is on screen one of the dashboard, and it belongs here too:

- **Owner compromise is game-over.** If the account owner key is compromised, the attacker can uninstall the plugin or raise the caps. Same as every smart-account policy system — disclosed, not hidden.
- **A session-key leak is bounded, not prevented.** The policy limits the blast radius (per-tx cap, window cap, expiry, revocation); it does not stop the leak itself. Lost key → revoke it; the policy bounds what it could do, and revoking kills it instantly.
- **The facilitator trap:** `supportsInterface(0x1626ba7e)` can return `true` on accounts where `isValidSignature` actually reverts. Never trust the ERC-165 answer alone.
- **First-party feature risk:** Circle owns the MSCA standard and the chain; it could ship a native policy plugin. It hasn't (its repo ships only `acl`/`addressbook`/`multisig`; its docs list Passkey + Address Book). Circle cannot unilaterally upgrade an account under installed plugins — `upgradeToAndCall` must pass the account owner's own plugin-mediated validation (source-verified in `buidl-wallet-contracts`).
- **Research bugs we disclosed:** a signature-malleability bound typo once rejected ~99.8% of valid signatures — the production constant is the true secp256k1 half-order `0x7fff…b20a0`, with low-S/high-S/boundary test vectors in CI.
- Session private keys are generated client-side, shown once, never logged, never stored server-side. Owner keys live in the user's wallet (Reown), never in our backend.

---

## Links

- Arc explorer: https://explorer.arc.io · Arc docs: https://docs.arc.io · RPC: https://rpc.mainnet.arc.io
- Sourcify (verification, the reliable path on 5042): https://repo.sourcify.dev/5042/`<address>`
- Circle modular wallets: https://developers.circle.com/wallets/modular/how-passkeys-and-modules-work.md · wallet upgrades: https://developers.circle.com/wallets/wallet-upgrades.md
- Circle `buidl-wallet-contracts` (MSCA source — read `src/msca/6900/v0.7/` before writing any manifest): https://github.com/circlefin/buidl-wallet-contracts
- Standards: [ERC-6900](https://eips.ethereum.org/EIPS/eip-6900) · [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) · [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) · [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009)
- Wallet stack: [Reown AppKit](https://reown.com/appkit) · [wagmi](https://wagmi.sh) · [viem](https://viem.sh)

---

## License

MIT — see [LICENSE](LICENSE).

**Done means:** a stranger can install a policy on their own Circle smart account, watch an agent spend inside it, watch an over-cap attempt revert with a human-readable reason, and revoke the key — all on Arc mainnet, all real, with every trust assumption stated up front.
