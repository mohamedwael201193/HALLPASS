# HALLPASS Backend

Two small services plus one API. They never hold keys, never decide policy, and never invent state.

## What each piece does

### 1. Relay service (`relay/`)
Submits ERC-4337 v0.7 `PackedUserOperation`s on behalf of operators. There is **no public v0.7 bundler on Arc** (verified by research), so the relay calls `EntryPoint.handleOps([userOp], beneficiary)` directly with its own signer — the same self-relay pattern proven on mainnet. It relays; it never signs owner or session actions, never modifies calldata. If the relay is down, the dashboard offers the direct-call (`execute`) path — degradation is always labeled.

### 2. Indexer (`indexer/`)
Watches Arc mainnet for HALLPASS-relevant events and turns them into a queryable cache:
- `SpendAuthorized(session, to, amount, policyHash, windowUsed)` — the activity feed
- install / `updatePolicy` / `revokeSession` events — policy history + policy-hash commitments
- `authorizeDigest` records — the typed-data authorizations screen
- Reverted txs / `FailedOp` events the relay observed — **blocked attempts**, labeled by source (`observed_revert`, never `on_chain_event`)

It also computes per-session rollups: window used, spend totals, counts. That is all it does.

### 3. API (`api/`)
Serves the indexer's cache to the dashboard: health, accounts, plugins, policies, activity, stats, config. Spec: `api/OPENAPI.yaml`.

## The principle: the indexer is cache, the chain is truth

The dashboard reads live state **from chain** (`eth_call`, `getInstalledPlugins`, policy getters, event logs) and re-queries on focus and after every transaction. It uses this API only for history and rollups — anything the indexer could lag on. Every API row carries chain provenance (`blockNumber`, `txHash`, `logIndex`) so the frontend can re-verify any claim. If the API and the chain ever disagree, the chain wins and the API row is shown as `unverified` until it matches. The indexer can be deleted and rebuilt from events; nothing of value is lost.

## How the frontend consumes it

| Frontend need | Source |
|---|---|
| Balances, installed plugins, policy values, session status | Chain directly (`eth_call`, logs) |
| Activity feed history, CSV export, per-session stats | This API (`/api/accounts/{addr}/activity`, `/stats`) |
| userOp installs on multisig-owned accounts | This relay (`POST /api/relay/userop`) |
| Contract addresses, chain config, Sourcify links | `/api/config` |

Owner actions (install / update / revoke / create account) are signed by the user's own wallet (Reown) and submitted as txs or through the relay as userOps — never through this API as signed payloads.

## Run locally (planned — not implemented yet)

```bash
cd backend
npm install
cp .env.example .env   # fill in: ARC_RPC_URL, RELAY_SIGNER_KEY, INDEXER_START_BLOCK
npm run indexer         # background: syncs events -> local db
npm run api             # serves the API on :8080
```

Env vars (names only — never commit values):
- `ARC_RPC_URL` — Arc mainnet RPC (default `https://rpc.mainnet.arc.io`)
- `RELAY_SIGNER_KEY` — private key of the relay's beneficiary signer (self-relay only; no owner funds)
- `INDEXER_START_BLOCK` — block to begin event backfill from
- `DATABASE_URL` — indexer store (any Postgres)

## Deploy on Render (planned)

- **Worker service** `hallpass-indexer`: runs `npm run indexer`, env: `ARC_RPC_URL`, `INDEXER_START_BLOCK`, `DATABASE_URL`
- **Web service** `hallpass-api`: runs `npm run api`, env: `DATABASE_URL`; internal, exposed only to the dashboard
- **Web service** `hallpass-relay`: the relay submission endpoint; env: `ARC_RPC_URL`, `RELAY_SIGNER_KEY`, `DATABASE_URL`

Each service deploys independently. The indexer is stateless apart from the database; the API is stateless.

## Honest status

This directory currently contains **docs only**. The relay, indexer, and API are specified but not implemented. Endpoints in `api/OPENAPI.yaml` are marked `x-status: planned` — they do not exist yet. Do not document or demo them as live.

**Chain facts this backend assumes** (Arc mainnet, chain 5042 — from the build bible, verified on-chain):
- EntryPoint v0.7: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
- Circle MSCA impl (ERC1967 target): `0xA70F1296869DA9D7CB69578123F21888E6dB2B62`
- USDC ERC-20: `0x3600000000000000000000000000000000000000` (6 decimals; native gas token = 18-decimal USDC)
- Policy caps are native wei (18 decimals); convert explicitly at every boundary
