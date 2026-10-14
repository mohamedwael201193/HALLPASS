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
        padding: "72px 24px 36px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <p
          style={{
            fontSize: "clamp(28px, 4.5vw, 44px)",
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            margin: "0 0 8px",
          }}
        >
          THANKS for
          <br />
          stopping by.
        </p>
        <p
          style={{
            fontSize: 20,
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
          screens behind the links are still being built; each one says so.
        </p>
      </div>
    </footer>
  );
}
