/**
 * Footer — minimal, honest. Real links only: the Arc explorer. No socials,
 * no invented URLs. Contract references point at their explorer addresses.
 */

const TOKENS = {
  bg: "#0C0B0A",
  amber: "#FFB224",
  textDark: "#FFF9EF",
  muted: "rgba(255,249,239,0.5)",
  border: "rgba(255,178,36,0.15)",
};

const EXPLORER = "https://explorer.arc.io";

const CONTRACTS = [
  {
    name: "HallpassMinimalPlugin",
    address: "0x5780e3DEd211ee13494909432C89Be7b8D6441A3",
  },
  {
    name: "SigGate (typed-data guard)",
    address: "0x202034589739214Dd4daC17C66FCf53e875B6531",
  },
  {
    name: "Policy-bound account (MSCA)",
    address: "0x2829f88DB9D8f86E57E9606b56cAC1039b6Bf89a",
  },
];

export default function Footer() {
  return (
    <footer
      style={{
        background: TOKENS.bg,
        color: TOKENS.textDark,
        padding: "56px 24px 32px",
        borderTop: `1px solid ${TOKENS.border}`,
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          gap: 40,
          justifyContent: "space-between",
        }}
      >
        <div style={{ maxWidth: 340 }}>
          <p style={{ fontWeight: 800, fontSize: 20, margin: "0 0 10px" }}>
            HALLPASS
          </p>
          <p style={{ color: TOKENS.muted, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Scoped session keys for AI agents — enforced on-chain by an
            ERC-6900 plugin on Arc mainnet.
          </p>
        </div>

        <div>
          <p
            style={{
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: TOKENS.amber,
              fontWeight: 700,
              margin: "0 0 12px",
            }}
          >
            Contracts
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {CONTRACTS.map((c) => (
              <li key={c.address} style={{ marginBottom: 8 }}>
                <a
                  href={`${EXPLORER}/address/${c.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: TOKENS.muted,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  {c.name} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p
            style={{
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: TOKENS.amber,
              fontWeight: 700,
              margin: "0 0 12px",
            }}
          >
            Project
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            <li style={{ marginBottom: 8 }}>
              <a
                href="#live-proof"
                style={{ color: TOKENS.muted, fontSize: 14, textDecoration: "none" }}
              >
                Live proof
              </a>
            </li>
            <li style={{ marginBottom: 8 }}>
              <a
                href="#faq"
                style={{ color: TOKENS.muted, fontSize: 14, textDecoration: "none" }}
              >
                FAQ
              </a>
            </li>
            <li style={{ marginBottom: 8 }}>
              <a
                href={EXPLORER}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: TOKENS.muted, fontSize: 14, textDecoration: "none" }}
              >
                Arc explorer ↗
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div
        style={{
          maxWidth: 1080,
          margin: "40px auto 0",
          paddingTop: 24,
          borderTop: "1px solid rgba(255,249,239,0.08)",
        }}
      >
        <p style={{ color: TOKENS.muted, fontSize: 13, margin: 0 }}>
          Every address and transaction hash on this page is a real Arc
          mainnet (chain 5042) record. Nothing here is a demo, mock, or
          placeholder.
        </p>
      </div>
    </footer>
  );
}
