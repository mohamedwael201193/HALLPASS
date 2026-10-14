/**
 * LiveProof — "Don't trust us. Verify."
 *
 * HARD RULE: every value below is copied character-for-character from
 * hallpass-build-bible.md §6 (Test evidence ledger, H9 sprint, all Arc
 * mainnet chain 5042). Anything truncated in the bible is OMITTED here.
 * No invented hashes or addresses.
 */

const EXPLORER = "https://explorer.arc.io";

const TOKENS = {
  bg: "#121110",
  amber: "#FFB224",
  cream: "#FAF6EE",
  textDark: "#FFF9EF",
  muted: "rgba(255,249,239,0.62)",
  card: "rgba(250,246,238,0.045)",
  border: "rgba(255,178,36,0.22)",
  red: "#E0655F",
};

type Proof = {
  group: string;
  label: string;
  value: string;
  kind: "tx" | "address";
  proves: string;
};

const PROOFS: Proof[] = [
  // §6.1 — Install path
  {
    group: "Install",
    label: "installPlugin via ERC-4337 v0.7 userOp — status 1",
    value:
      "0xc5ad85a35e7928f26e6cc45fd99169f555ad2e012c1f71936a24ca1ff3e6ee36",
    kind: "tx",
    proves:
      "A real third-party plugin install on a Circle smart account through a v0.7 userOp. Post-install, getInstalledPlugins() lists the plugin and perTxCap = 0.02 USDC on-chain.",
  },
  {
    group: "Install",
    label: "HallpassMinimalPlugin contract",
    value: "0x5780e3DEd211ee13494909432C89Be7b8D6441A3",
    kind: "address",
    proves:
      "The deployed minimal plugin (4,022 bytes) — installs cleanly on multisig-owned accounts via userOp because it claims no validation slots (manifest hash 0xb058e6dcf9dcd9bf9b20674c96c796223c9ddb030e5b84332dfc8e52c7185a64).",
  },
  {
    group: "Install",
    label: "Policy-bound smart account (MSCA)",
    value: "0x2829f88DB9D8f86E57E9606b56cAC1039b6Bf89a",
    kind: "address",
    proves:
      "The W1B2 enforcement account running policy per-tx 0.01 / window 0.02 / 3600s / expiry +2h.",
  },
  // §6.2 — Enforcement
  {
    group: "Enforcement",
    label: "Over-cap spend — reverted on-chain",
    value:
      "0x1c25ab934b020d8fe5ddb8297455b2d4aadac8d86522ba2a689a4b36a3c4f149",
    kind: "tx",
    proves:
      "Session key tried execute(payee, 0.05) against a 0.01 cap. Status 0 — reverted PerTxCapExceeded(0.05, 0.01), byte-exact. Window accounting untouched.",
  },
  {
    group: "Enforcement",
    label: "In-policy spend — allowed",
    value:
      "0x113cdef86eabe40139f6252e3fe57907e188c040b8396545bcba38e22a076467",
    kind: "tx",
    proves:
      "Session key execute(payee, 0.005). Status 1 — the agent spends inside bounds. The direct-on-chain signing bypass is gated: windowSpent 0 → 0.005.",
  },
  {
    group: "Enforcement",
    label: "Real v0.7 userOp, session-key ECDSA — self-relayed handleOps",
    value:
      "0x8579d7b6f321d098b3ab6f12bc6e7cec3b6cd75c2d3d78a51eb059a850428ad4",
    kind: "tx",
    proves:
      "A genuine ERC-4337 userOp, not a raw EOA call. windowSpent 0.005 → 0.006, TOCTOU-atomic. (No public v0.7 bundler on Arc — userOps were self-relayed, disclosed honestly.)",
  },
  {
    group: "Enforcement",
    label: "Owner revokeSession() — status 1",
    value:
      "0x6d0e37a4446f498d13ee8a3511dedcff56d9800935478b0e454c6ab2c00e21f0",
    kind: "tx",
    proves:
      "The owner pulls the pass through the account fallback. Final state verified: revoked = true, caps intact, plugin installed.",
  },
  {
    group: "Enforcement",
    label: "Post-revoke spend — reverted on-chain",
    value:
      "0xeb776bf0b75e733a122dc74b1dec5009f0859141d1d3e4807bab7da4943d6d5d",
    kind: "tx",
    proves:
      "Session key tried execute(payee, 0.005) after revocation. Status 0 — reverted SessionRevoked(). The pass, once pulled, is gone.",
  },
  // §6.3 — Typed-data gate
  {
    group: "Typed-data gate",
    label: "SigGate contract (EIP-1271 / EIP-3009 guard)",
    value: "0x202034589739214Dd4daC17C66FCf53e875B6531",
    kind: "address",
    proves:
      "The 1271 plugin (6,258 bytes). Pre-authorized EIP-3009 digest + session-key signature returns MAGIC 0x1626ba7e; unauthorized or over-cap digests return 0xffffffff or revert.",
  },
  {
    group: "Typed-data gate",
    label: "SigGate deploy — status 1",
    value:
      "0x926d1c4292909edc7bdce2545f14a26402372ef3b522faafe781774f3dff44af",
    kind: "tx",
    proves:
      "The gate went live on Arc mainnet: 1,400,397 gas, 0.030809 USDC. This is the x402 facilitator settlement path — covered by policy, not by trust.",
  },
];

function short(v: string): string {
  return v.length > 18 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v;
}

function linkFor(p: Proof): string {
  return p.kind === "tx"
    ? `${EXPLORER}/tx/${p.value}`
    : `${EXPLORER}/address/${p.value}`;
}

export default function LiveProof() {
  const groups = ["Install", "Enforcement", "Typed-data gate"];
  return (
    <section
      id="live-proof"
      style={{
        background: TOKENS.bg,
        color: TOKENS.textDark,
        padding: "96px 24px",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <p
          style={{
            color: TOKENS.amber,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontSize: 13,
            fontWeight: 700,
            margin: "0 0 16px",
          }}
        >
          Live proof
        </p>
        <h2
          style={{
            fontSize: "clamp(34px, 5vw, 56px)",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            margin: "0 0 12px",
            fontWeight: 800,
          }}
        >
          Don&rsquo;t trust us. Verify.
        </h2>
        <p style={{ color: TOKENS.muted, fontSize: 18, maxWidth: 720, margin: "0 0 48px" }}>
          Every value below is a real Arc mainnet (chain 5042) record from our
          test ledger — the contract, the install userOp, the allowed spend,
          the blocked spend, the revocation. Click any card to check it on the
          Arc explorer yourself.
        </p>

        {groups.map((g) => (
          <div key={g} style={{ marginBottom: 40 }}>
            <h3
              style={{
                fontSize: 14,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: TOKENS.amber,
                margin: "0 0 16px",
                fontWeight: 700,
              }}
            >
              {g}
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: 16,
              }}
            >
              {PROOFS.filter((p) => p.group === g).map((p) => (
                <a
                  key={p.value}
                  href={linkFor(p)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    background: TOKENS.card,
                    border: `1px solid ${TOKENS.border}`,
                    borderRadius: 14,
                    padding: 20,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <p style={{ fontWeight: 700, fontSize: 15, margin: "0 0 10px" }}>
                    {p.label}
                  </p>
                  <code
                    title={p.value}
                    style={{
                      display: "inline-block",
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 13,
                      color: TOKENS.amber,
                      background: "rgba(255,178,36,0.08)",
                      border: "1px solid rgba(255,178,36,0.25)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      marginBottom: 12,
                      wordBreak: "break-all",
                    }}
                  >
                    {short(p.value)}
                  </code>
                  <p
                    style={{
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: TOKENS.muted,
                      margin: 0,
                    }}
                  >
                    <span style={{ color: TOKENS.textDark, fontWeight: 600 }}>
                      What it proves:{" "}
                    </span>
                    {p.proves}
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: TOKENS.amber,
                      margin: "12px 0 0",
                      fontWeight: 600,
                    }}
                  >
                    View on Arc explorer ↗
                  </p>
                </a>
              ))}
            </div>
          </div>
        ))}

        <p style={{ color: TOKENS.muted, fontSize: 13.5, marginTop: 8 }}>
          Honest bounds: no public ERC-4337 v0.7 bundler exists on Arc yet, so
          userOps were self-relayed; the policy binds account execution either
          way. Total sprint gas ≈ 0.25 USDC. No principal lost. Keys never
          printed.
        </p>
      </div>
    </section>
  );
}
