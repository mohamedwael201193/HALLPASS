# REPUTATION LOOP — mainnet proof

**Date:** 2026-10-15 ~02:00 EEST · **Chain:** Arc mainnet (5042) · **Branch:** `win/reputation-loop`

## The one real dust tx

| Field | Value |
|---|---|
| Tx hash | `0x8f5f56b5e6e0a90b038533c13bb6eae9f4fb2f4feeb2ee0bf4c60379a337e287` |
| Explorer | https://explorer.arc.io/tx/0x8f5f56b5e6e0a90b038533c13bb6eae9f4fb2f4feeb2ee0bf4c60379a337e287 |
| Block | 25996007 |
| Status | 1 (success) |
| From (backend key) | `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` |
| To (registry) | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` (ERC-8004 Reputation registry) |
| Function | `giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)` — selector `0x3c036a7e` |
| Parameters | `agentId=135`, `value=50`, `valueDecimals=0`, `tag1="score"`, `tag2="hallpass-dust-proof"`, `endpoint="hallpass/session-close"`, `feedbackURI=""`, `feedbackHash=0x000…000` |
| Gas used | 194,459 |
| Cost | 0.003889 native USDC (~$0.0039) — dust |
| Emitted | 1 log: `NewFeedback`-family event, topics `[0x6a4a6174…febc, agentId=135 (indexed), client=0xf76e…1a3 (indexed), 0x84937658…e472]` |

## On-chain verification (read back after confirmation)

- `getLastIndex(135, 0xf76e…1a3)` → `1`
- `readFeedback(135, 0xf76e…1a3, 1)` → `value=50, decimals=0, tag1="score", tag2="hallpass-dust-proof", revoked=false` — exactly what was posted
- `getSummary(135, [0xf76e…1a3], "", "")` → `count=1, value=50, decimals=0`

## What this proves

1. **The registry interface is real and live.** The deployed registry at
   `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` (EIP-1967 proxy, code verified
   live) implements the final ERC-8004 spec — proven by `eth_call` probes
   *before* the tx: `getClients(135)` returned a real client list,
   `readFeedback(135, client, 1)` returned real prior feedback
   (`value=65, tag1="score", tag2="apex-watch-v1"`), `getSummary` worked, and
   the legacy `getReputation(uint256)`/`name()` selectors are absent. The
   `giveFeedback` call was additionally **simulated via `eth_call` from the
   backend key and succeeded** before the real tx was sent.
2. **The loop's write path works end-to-end on mainnet.** The tx was sent
   through the production watcher code itself (`backend/reputation/watcher.js
   --post-proof`) — not a one-off script — and the feedback is now permanently
   readable from the registry.
3. **Cost is dust:** 0.0039 USDC per post. One close = one post ≈ sub-cent.

## The watcher (`backend/reputation/`)

`watcher.js` + `README.md` + `package.json`. Pure off-chain loop — the
production plugin (`0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9`, v0.2.0) is
never touched:

- Watches `SessionRevokedEvt(address indexed account, address indexed sessionKey)`
  from the production plugin, ≥12 confirmations deep (same reorg discipline as
  the event indexer).
- On each **new, unposted** close → posts exactly one `giveFeedback` dust tx,
  signed by the backend key (`REPUTATION_KEY`, falls back to
  `DEPLOYER_PRIVATE_KEY`; never logged, never written to disk).
- **Dedupe:** `posted_feedback` SQLite table keyed by plugin close tx hash —
  restarts never double-post.
- **Safety rails:** chain ≠ 5042 → refuse; no key / no `REPUTATION_AGENT_ID` →
  exit 2 loudly (a guessed agent ID would poison the registry); every tx is
  **simulated first** (registry rejections like unknown-agent / self-feedback /
  bad-decimals fail loudly instead of burning dust); the encoded selector is
  checked against the proven `0x3c036a7e` before sending; reverted txs are
  never recorded as posted.
- Modes: `--post-proof` (exactly one post, used for the tx above), single pass,
  and `POLL_INTERVAL_MS` daemon.

Smoke-tested: forward-only single pass → `posted=0`, checkpoint set, exit 0.

## Real closes the loop will process

Two genuine `SessionRevokedEvt` closes already exist on the production plugin
(both ≥12 confirmations deep, found via log scan from the v0.2.0 deploy block
25967278):

- `0x34e6124bdd99b45a4c05686234aedd7415160c36fd37c90044b66beec4aedaa6` — block 25968622
- `0x74ff7a254a7a68476869644c3e7babc64c2eed745415d2135a2faa10e5a79807` — block 25968734

They are **deliberately not backfilled yet**: feedback must name the real
HALLPASS agent, and no HALLPASS agent ID is registered in the Identity
registry (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`) yet. Posting those
closes against agent 135 (a third party's agent, used only for the clearly
labeled dust proof above) would misattribute HALLPASS session closes to the
wrong agent and poison its record. Once the HALLPASS agent is registered,
run the watcher with `REPUTATION_AGENT_ID=<id> START_BLOCK=25967278` and both
closes get their one feedback tx each.

## Honest gaps / notes

- The proof feedback targets agent 135 (owned by `0xccf8…752d`, not by our
  key — no self-feedback issue). It is a single neutral (50/100) data point
  with test-labeled tags; it does not claim to rate that agent's real
  performance.
- Feedback content per close is currently static config (`FEEDBACK_VALUE=50`,
  etc.). Richer per-close values (e.g., derived from the session's spend
  history) are a follow-up, not part of this proof.
- `NewFeedback` event's exact full signature was not decoded (topic0
  `0x6a4a6174…febc` with agentId + client indexed); the read path
  (`readFeedback`/`getSummary`) fully verifies the write, so this is cosmetic.
- Env file (`~/workspace/user/files/env-2.txt`) was read only to sign; no
  secret appears in this repo, in logs, or in this document.
