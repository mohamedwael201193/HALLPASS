# HALLPASS verification guide (Sourcify, Arc mainnet chain 5042)

Automated path: `contracts/script/VerifyHallpass.sh` (syntax-checked, no secrets).
This document explains what it does and how to fix it when it fails.

> **Do NOT use the Arc explorer's Blockscout verification UI/API.** The
> explorer sits behind a Cloudflare managed challenge — `forge
> verify-contract` and `curl` get HTTP 403. Sourcify is the reliable path on
> 5042. (Build-bible §5.)

---

## 1. What `exact_match` means

Sourcify recompiles your source and compares the result against the
on-chain deployed bytecode:

- **`perfect`** (called `exact_match` in the UI/checklist) — the deployed
  bytecode matches the recompiled bytecode **including the metadata hash**
  appended by solc. This proves the exact sources, compiler version, and
  optimizer settings that produced the deployed contract. **This is the only
  acceptable result** — per §12 definition of done, a non-exact match is a
  hard stop: fix the build config or re-deploy, never proceed inexact.
- **`partial`** — code matches but the metadata hash does not (or constructor
  args were wrong). Fails the §12 checklist. Do not accept it.
- **`false`** — no match.

Lookup URL for any address: `https://repo.sourcify.dev/5042/<address>`

---

## 2. Compiler settings that must match

These are pinned in `contracts/foundry.toml` and **must be byte-identical**
to what was used at deploy time:

```toml
solc_version   = '0.8.24'
optimizer      = true
optimizer_runs = 200
```

Verification compiles `src/HallpassPlugin.sol:HallpassPlugin`. If you deploy
with any other solc version, optimizer on/off, or run count, the match will
be at best `partial`.

Constructor args: `HallpassPlugin` has **no** constructor — pass none.
`HallpassProxy` (in the same file) has `constructor(address _logic, bytes
memory _data)` — encode its args ABI-wise and pass via `CONSTRUCTOR_ARGS`
(or the equivalent flag on the proxy contract reference
`src/HallpassPlugin.sol:HallpassProxy`).

---

## 3. Verify a deployed contract (step by step)

1. Deploy:
   ```bash
   cd ~/workspace/hallpass-build/contracts
   forge create --rpc-url arc --private-key <deployer> \
       src/HallpassPlugin.sol:HallpassPlugin \
       --gas-limit 2200000
   ```
   Record the address + tx hash.
2. Verify immediately (address as argument, or export it first):
   ```bash
   ./script/VerifyHallpass.sh 0xYourDeployedAddress
   # or:
   export HALLPASS_PLUGIN_ADDRESS=0xYourDeployedAddress
   ./script/VerifyHallpass.sh
   ```
   The script rebuilds, submits via `forge verify-contract --verifier
   sourcify --chain-id 5042`, then checks the API and prints:
   ```
   https://repo.sourcify.dev/5042/0xYourDeployedAddress
   ```
3. Only when the script exits 0 with **"EXACT MATCH confirmed"** do you
   record the link (build-bible §5.2: record the Sourcify link next to the
   address in the test ledger / deployment record).

### Verifying the proxy instead

```bash
export CONSTRUCTOR_ARGS=0x... # abi-encoded (address _logic, bytes _data)
./script/VerifyHallpass.sh 0xYourProxyAddress src/HallpassPlugin.sol:HallpassProxy
```

---

## 4. Confirm independently (curl)

After verification, anyone can check without forge:

```bash
ADDRESS=0xYourDeployedAddress
curl -s "https://repo.sourcify.dev/server/v1/check-all-by-addresses?addresses=${ADDRESS}&chainIds=5042" | python3 -m json.tool
```

Look for `"status": "perfect"`. Anything else (`partial`, `false`) fails
the §12 definition of done.

---

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `partial` match | Metadata hash mismatch: solc version, optimizer settings, or file contents differ from deploy-time | Rebuild with the exact `foundry.toml` pins (0.8.24 / optimizer on / 200 runs); if you compiled elsewhere, re-deploy with this repo's pinned config |
| `false` match | Wrong sources, wrong contract ref, or address has no code on 5042 | Check address + chain; confirm `cast code 0x... --rpc-url arc` is non-empty |
| forge verify fails "constructor args" | Args missing/wrong for the chosen contract | Plugin takes none; proxy needs `(address,bytes)` ABI-encoded in `CONSTRUCTOR_ARGS` |
| 403 from Sourcify submit | Endpoint or chain not supported by forge's sourcify verifier | Ensure `--verifier sourcify --chain-id 5042`; the repo `foundry.toml` also maps the `arc` chain to `api.sourcify.dev/server` |
| Explorer verification 403 | Expected — Cloudflare challenge | Use Sourcify only; ignore the explorer UI |

### Metadata hash note

solc appends an IPFS/CBOR metadata hash to the bytecode (exact_match
includes it). The metadata embeds the exact compiler version and settings
— but also the **source file contents verbatim**, so even a comment change
breaks `perfect`. Verify from the exact commit that was deployed.
