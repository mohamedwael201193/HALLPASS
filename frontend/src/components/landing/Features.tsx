/**
 * Features — what the pass controls. All enforcement happens on-chain,
 * proven on Arc mainnet (chain 5042) — see the Live proof section.
 */

const TOKENS = {
  bg: "#121110",
  amber: "#FFB224",
  cream: "#FAF6EE",
  textDark: "#FFF9EF",
  muted: "rgba(255,249,239,0.62)",
  card: "rgba(250,246,238,0.045)",
  border: "rgba(255,178,36,0.22)",
};

type Feature = { title: string; body: string; icon: string };

const FEATURES: Feature[] = [
  {
    title: "Per-tx caps",
    body: "One transaction can never exceed the per-transaction ceiling. We proved the cap on mainnet: a 0.05 USDC spend against a 0.01 cap reverted PerTxCapExceeded(0.05, 0.01) — byte-exact.",
    icon: "⚖",
  },
  {
    title: "Spending windows",
    body: "Cap total spend per window (e.g. 0.02 per hour). The plugin tracks windowSpent on-chain — 0 → 0.005 on our proven mainnet spend.",
    icon: "◔",
  },
  {
    title: "Expiry",
    body: "The pass dies on its own. Set an expiry at install; after it, the session key is dead weight — no revocation ceremony needed.",
    icon: "⏱",
  },
  {
    title: "Destination allowlists",
    body: "Restrict where money can go. Only the addresses you named receive anything; everywhere else is unreachable to the agent.",
    icon: "☰",
  },
  {
    title: "Typed-data coverage (EIP-712 / EIP-3009)",
    body: "Policy doesn't stop at raw transfers. Session-key typed data is pre-authorized per-digest through the account and verified via the plugin's isValidSignature gate — the x402 facilitator settlement path, closed on-chain.",
    icon: "✒",
  },
  {
    title: "Instant revoke",
    body: "Pull the pass any time. Owner calls revokeSession() through the account — proven status 1 on mainnet — and every later spend reverts SessionRevoked().",
    icon: "✕",
  },
  {
    title: "ERC-6900 native",
    body: "Not a wrapper, not middleware. A first-class plugin on Circle's ERC-6900 v0.7 smart accounts — the same manifest/manifest-hash machinery Circle's own plugins ship on.",
    icon: "◇",
  },
];

export default function Features() {
  return (
    <section
      style={{ background: TOKENS.bg, color: TOKENS.textDark, padding: "96px 24px" }}
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
          What the pass controls
        </p>
        <h2
          style={{
            fontSize: "clamp(34px, 5vw, 56px)",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            margin: "0 0 48px",
            fontWeight: 800,
          }}
        >
          Every bound, enforced on-chain.
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
            gap: 16,
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                background: TOKENS.card,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 14,
                padding: 24,
              }}
            >
              <div style={{ fontSize: 26, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ fontSize: 19, margin: "0 0 10px", fontWeight: 700 }}>
                {f.title}
              </h3>
              <p style={{ color: TOKENS.muted, fontSize: 15, lineHeight: 1.6, margin: 0 }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
