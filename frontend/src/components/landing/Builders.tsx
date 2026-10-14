/**
 * Builders — the real install call shape. Source: hallpass-build-bible.md
 * §4 (verified selectors, manifest rule) and §5 (install flow). The plugin
 * address and manifest hash below are the proven mainnet deployment.
 */

import { motion } from "framer-motion";
import { useHidden, EASE_OUT } from "./reveal";

const TOKENS = {
  bg: "#121110",
  amber: "#FFB224",
  cream: "#FAF6EE",
  textDark: "#FFF9EF",
  muted: "rgba(255,249,239,0.62)",
  border: "rgba(255,178,36,0.22)",
};

const SNIPPET = `// Install Hallpass on any Circle smart account (ERC-6900 v0.7, Arc mainnet)
// Proven plugin: 0x5780e3DEd211ee13494909432C89Be7b8D6441A3
// Manifest hash:  0xb058e6dcf9dcd9bf9b20674c96c796223c9ddb030e5b84332dfc8e52c7185a64

account.installPlugin(
    plugin:            0x5780e3DEd211ee13494909432C89Be7b8D6441A3,
    manifestHash:      keccak256(abi.encode(plugin.pluginManifest())),
    pluginInstallData: abi.encode(sessionKey, owner, perTxCap, windowCap, windowSecs, expiry, allowlist),
    dependencies:      []
);
// selector f85730f4 — call directly as owner on hallpass-first accounts,
// or as an owner-signed v0.7 userOp on existing (e.g. multisig) accounts.
// The account reverts ValidationFunctionAlreadySet if the manifest
// claims validation slots another plugin already owns.`;

export default function Builders() {
  const hidden = useHidden(40);
  return (
    <section
      id="builders"
      style={{ background: TOKENS.bg, color: TOKENS.textDark, padding: "clamp(96px, 10vw, 128px) 24px" }}
    >
      <style>{`
        .builder-btn { transition: background 0.2s ease, color 0.2s ease; }
        .builder-btn:hover { background: #FFB224 !important; color: #121110 !important; }
      `}</style>
      <motion.div
        initial={hidden}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
        style={{ maxWidth: 1080, margin: "0 auto" }}
      >
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
          For builders
        </p>
        <h2
          style={{
            fontSize: "clamp(30px, 4.5vw, 48px)",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            margin: "0 0 12px",
            fontWeight: 800,
          }}
        >
          One call. That&rsquo;s the integration.
        </h2>
        <p style={{ color: TOKENS.muted, fontSize: 18, maxWidth: 720, margin: "0 0 32px" }}>
          Install the plugin on any Circle smart account and every spend your
          agent makes goes through the policy gate — caps, windows, expiry,
          allowlists, typed data. The snippet below is the real call shape.
        </p>
        <pre
          style={{
            background: "#0C0B0A",
            border: `1px solid ${TOKENS.border}`,
            borderRadius: 14,
            padding: 24,
            overflowX: "auto",
            fontSize: 14,
            lineHeight: 1.7,
            color: TOKENS.cream,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            margin: "0 0 24px",
          }}
        >
          {SNIPPET}
        </pre>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
          }}
        >
          <a
            href="#live-proof"
            className="builder-btn"
            style={{
              display: "inline-block",
              background: "transparent",
              color: TOKENS.amber,
              fontWeight: 700,
              padding: "12px 24px",
              borderRadius: 10,
              textDecoration: "none",
              border: `2px solid ${TOKENS.amber}`,
            }}
          >
            See the proof on-chain
          </a>
          <p style={{ color: TOKENS.muted, fontSize: 14, margin: 0 }}>
            Full install flows and contract specs ship in the HALLPASS build
            bible (the project&rsquo;s technical reference).
          </p>
        </div>
      </motion.div>
    </section>
  );
}
