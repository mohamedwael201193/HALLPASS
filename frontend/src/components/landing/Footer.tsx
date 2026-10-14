/**
 * Footer — a sign-off, not a link farm (design-standard §6).
 * Pattern: one mixed-case line → made-by line → ≤3 minimal links.
 * Cream band per the §9 HALLPASS tokens.
 *
 * Links are real only: the Arc explorer and the two proven contracts.
 * No socials, no invented URLs.
 */

const TOKENS = {
  cream: "#FAF6EE",
  ink: "#121110",
  amber: "#B07A00",
  muted: "rgba(18,17,16,0.55)",
};

const EXPLORER = "https://explorer.arc.io";

const LINKS = [
  {
    label: "Arc explorer",
    href: EXPLORER,
  },
  {
    label: "Hallpass plugin",
    href: `${EXPLORER}/address/0x5780e3DEd211ee13494909432C89Be7b8D6441A3`,
  },
  {
    label: "SigGate contract",
    href: `${EXPLORER}/address/0x202034589739214Dd4daC17C66FCf53e875B6531`,
  },
];

export default function Footer() {
  return (
    <footer
      style={{
        background: TOKENS.cream,
        color: TOKENS.ink,
        padding: "64px 24px 32px",
        textAlign: "center",
      }}
    >
      <style>{`
        .foot-link { transition: color 0.2s ease, border-color 0.2s ease; }
        .foot-link:hover { color: #8a5f00; border-color: #8a5f00 !important; }
      `}</style>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <p
          style={{
            fontSize: "clamp(24px, 3.5vw, 36px)",
            fontWeight: 800,
            lineHeight: 1.2,
            letterSpacing: "-0.01em",
            margin: "0 0 8px",
          }}
        >
          Thanks for stopping by.
        </p>
        <p
          style={{
            fontSize: 17,
            fontWeight: 700,
            margin: "0 0 28px",
          }}
        >
          The list is closed.
        </p>
        <nav
          style={{
            display: "flex",
            gap: 24,
            justifyContent: "center",
            flexWrap: "wrap",
            marginBottom: 32,
          }}
        >
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="foot-link"
              style={{
                color: TOKENS.ink,
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
                borderBottom: `2px solid ${TOKENS.amber}`,
                paddingBottom: 2,
              }}
            >
              {l.label} ↗
            </a>
          ))}
        </nav>
        <p style={{ color: TOKENS.muted, fontSize: 14, margin: "0 0 6px" }}>
          Made for the Arc builder community © 2026.
        </p>
        <p style={{ color: TOKENS.muted, fontSize: 12.5, margin: 0 }}>
          *every address and transaction hash on this page is a real Arc mainnet
          record — click any card to check it on the explorer yourself. The app
          is live: every control executes a real transaction or says exactly
          why it can't.
        </p>
      </div>
    </footer>
  );
}
