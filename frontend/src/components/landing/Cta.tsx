/**
 * Cta — the final ask. Big, amber, confident.
 */

const TOKENS = {
  bg: "#121110",
  amber: "#FFB224",
  textDark: "#FFF9EF",
  muted: "rgba(255,249,239,0.62)",
};

export default function Cta() {
  return (
    <section
      style={{
        background: TOKENS.amber,
        color: "#121110",
        padding: "110px 24px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <h2
          style={{
            fontSize: "clamp(36px, 6vw, 64px)",
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            fontWeight: 800,
            margin: "0 0 16px",
          }}
        >
          Your agent goes to work tomorrow.
          <br />
          Give it a hall pass — not your keys.
        </h2>
        <p
          style={{
            fontSize: 18,
            lineHeight: 1.6,
            maxWidth: 620,
            margin: "0 auto 36px",
            color: "rgba(18,17,16,0.72)",
          }}
        >
          Install the plugin, set the bounds, hand your agent the session key.
          Every spend inside the policy goes through; everything else reverts
          on-chain. Verify the whole flow yourself first.
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            href="#live-proof"
            style={{
              display: "inline-block",
              background: "#121110",
              color: "#FFF9EF",
              fontWeight: 700,
              fontSize: 17,
              padding: "16px 36px",
              borderRadius: 12,
              textDecoration: "none",
            }}
          >
            Verify the live proof
          </a>
          <a
            href="#faq"
            style={{
              display: "inline-block",
              background: "transparent",
              color: "#121110",
              fontWeight: 700,
              fontSize: 17,
              padding: "16px 36px",
              borderRadius: 12,
              textDecoration: "none",
              border: "2px solid #121110",
            }}
          >
            Read the FAQ
          </a>
        </div>
      </div>
    </section>
  );
}
