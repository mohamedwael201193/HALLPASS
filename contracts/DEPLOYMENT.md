# HALLPASS Deployment Guide — Arc Mainnet (chain 5042)

> Source of truth: `~/workspace/your_files/hallpass-build-bible.md` §5 (deployment runbook).
> This machine has **no GitHub push access** and the founder runs the real
> deploy from their environment. This document makes that run reproducible.

## 0. What is being deployed

| Item | Value |
|---|---|
| Contract | `contracts/src/HallpassPlugin.sol` → `HallpassPlugin` |
| Standard | ERC-6900 v0.7 plugin, ERC-4337 v0.7 account compatible |
| Constructor args | **None** — `constructor()` takes no parameters |
| solc | 0.8.24 (pinned in `foundry.toml`) |
| Optimizer | enabled, 200 runs (pinned in `foundry.toml`) |
| Target chain | Arc mainnet, chain id **5042** |

## 1. Pre-flight checklist

- [ ] `forge --version` ≥ 1.8.5 (`export PATH="$HOME/.foundry/bin:$PATH"`)
- [ ] `~/workspace/user/files/env-2.txt` present with `DEPLOYER_PRIVATE_KEY`
      (never printed, never committed — `scripts/deploy.sh` loads it silently)
- [ ] Deployer holds enough native USDC for a **3M-gas worst case** at current
      gas price (the script checks this and aborts if short)
- [ ] RPC reachable: `cast chain-id --rpc-url https://rpc.mainnet.arc.io` → `5042`
- [ ] `forge build` green in `contracts/`
- [ ] `forge test` green in `contracts/` (27 unit + 19 fork tests)

## 2. The gas lesson (READ BEFORE BROADCASTING)

During the H9 research sprint a deploy with a **1.5M gas limit OOG'd on
mainnet and burned 0.036 USDC**. The plugin costs **~1.8M gas** to deploy.
**The deploy transaction MUST carry a gas limit ≥ 2.2M.**

Solidity forbids `{gas: ...}` on `new`, so the limit is enforced by
`scripts/deploy.sh` via forge's `--gas-estimate-multiplier 150`
(~2.7M effective limit — a gas LIMIT is not gas SPENT; unused gas is refunded).

**Do not hand-tune the multiplier below 150. Do not deploy with a raw
`--gas-limit` under 2.2M.**

## 3. Deploy

Dry-run rehearsal first (no broadcast, no key usage beyond address derivation):

```bash
DRY_RUN=1 ./scripts/deploy.sh
```

Real deploy:

```bash
./scripts/deploy.sh
```

What the script does:
1. Loads `DEPLOYER_PRIVATE_KEY` from `env-2.txt` without echoing any value.
2. Pre-flight: chain id = 5042, deployer address, balance vs 3M-gas budget.
3. `forge script script/DeployHallpass.s.sol --rpc-url https://rpc.mainnet.arc.io
   --private-key "$DEPLOYER_PRIVATE_KEY" --gas-estimate-multiplier 150 --broadcast`
4. Records `contracts/deployments/arc-5042.json`
   (`plugin`, `deployer`, `blockNumber`, `txHash` — txHash backfilled from
   forge's broadcast artifact, deployer cross-checked against the key).
5. Prints next steps (verify → provision account → fund → prove).

## 4. Verify (Sourcify exact_match — REQUIRED)

The Arc explorer's Blockscout verification API sits behind a Cloudflare
managed challenge and returns **HTTP 403** to forge/curl. **Sourcify is the
only reliable verification path on 5042** (bible §5.2).

```bash
cd contracts
./script/VerifyHallpass.sh <PLUGIN_ADDRESS>
# or: HALLPASS_PLUGIN_ADDRESS=0x... ./script/VerifyHallpass.sh
```

The script rebuilds with the pinned settings, submits
`forge verify-contract --verifier sourcify --chain-id 5042`, then queries the
Sourcify API and **fails loudly unless the match status is `perfect`**
(= `exact_match`). A `partial` match is a hard stop: fix the build config
(solc 0.8.24, optimizer on, 200 runs, identical sources) or re-deploy.

Manual equivalent:

```bash
forge verify-contract --chain-id 5042 --verifier sourcify \
  <PLUGIN_ADDRESS> contracts/src/HallpassPlugin.sol:HallpassPlugin
# confirm: https://repo.sourcify.dev/5042/<PLUGIN_ADDRESS> shows exact_match
```

No API key needed — verification is read-and-recompile only.

## 5. Provision a smart account (direct-proxy path)

Circle's factory `createAccount` is **allowlisted for custom plugins** —
do NOT use the factory path (bible §3). Use the direct-proxy path:

1. Deploy a minimal ERC1967 proxy pointing at the MSCA implementation
   `0xA70F1296869DA9D7CB69578123F21888E6dB2B62`.
2. Call `initializeUpgradableMSCA([plugin], [manifestHash], [initData])` where
   - `manifestHash = keccak256(abi.encode(plugin.pluginManifest()))`
     — query `pluginManifest()` on the DEPLOYED plugin and hash it
     (matches by construction),
   - `initData = abi.encode(sessionKey, owner, perTxCap, windowCap, windowSecs, expiry, allowlist)`.
3. **Amounts are native wei (18 decimals), not 6-decimal ERC-20 USDC.**
   0.01 USDC cap = `10000000000000000`. Convert explicitly at every boundary
   (bible §4.2 decimals gate).

## 6. Fund + configure

- Fund the account with dust (0.05 USDC is plenty for the money-shot proofs).
- Top up the account's EntryPoint v0.7 deposit via `depositTo(account)` —
  covers userOp prefunds, otherwise AA13.
- Verify on-chain: `getInstalledPlugins()` includes the plugin;
  `policies(account)` returns the configured caps
  (9-field getter — the dynamic `allowlist` is omitted).

## 7. Prove it (dust amounts, record every hash)

Per bible §5.5, on mainnet with dust:
1. In-policy spend succeeds.
2. Over-cap spend reverts `PerTxCapExceeded` (nothing moves).
3. Real v0.7 userOp through `EntryPoint.handleOps` succeeds.
4. Owner `revokeSession()` → post-revoke spend reverts `SessionRevoked`.
5. Typed-data `authorizeDigest` gate behaves.

Record EVERY transaction/userOp hash in `QA/dust-e2e-report.md` and the
test-evidence ledger (`PROOFS.md`).

## 8. Deployment record

| Network | Contract | Deployer | Deploy tx | Block | Sourcify |
|---|---|---|---|---|---|
| Arc mainnet (5042) | `0x5780e3DEd211ee13494909432C89Be7b8D6441A3` (H9 minimal-plugin research deploy; manifest `0xb058e6dc…7185a64`) | research key | bible §7 test-evidence ledger | — | exact_match |
| Arc mainnet (5042) | `0x66A7464f091304B3619eDc163634169519E41Ce9` (H9 full-plugin research deploy; 8,206 B) | research key | `0x2628f6a6…42256108` | — | exact_match |
| Arc mainnet (5042) | **`0x8a81455a477deeA986ca48cE83ca89C5331Da793` — PRODUCTION** (fixed malleability constant; first deploy of the H-1-fixed binary) | `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` | `0xf408ec17f3b9e915488fa901f190123fc56368f487ee6ee30eb80e065e86fe1c` | 25959755 | **exact_match** (creation + runtime, 2026-10-14) |

> The H9 rows are the research deployments that produced the proven test
> evidence (bible §7). The production row is the founder-authorized deploy
> of 2026-10-14: `scripts/deploy.sh` broadcast it, `cast code` confirms the
> deployed bytecode carries the FIXED malleability constant
> (`0x7FFF…B20A0`, no typo constant present), and Sourcify reports
> `exact_match` for both creation and runtime bytecode
> (`https://repo.sourcify.dev/5042/0x8a81455a477deeA986ca48cE83ca89C5331Da793`).
> `contracts/deployments/arc-5042.json` holds the machine-readable record.
>
> **Wiring the live address:** the frontend takes it from `VITE_PLUGIN_ADDRESS`
> (no fallback default — deliberate); the backend API takes it from the
> `PLUGIN_ADDRESS` env var (default remains the H9 minimal-plugin deployment
> that the existing indexer data refers to). Set both in the production
> deployment environment.
