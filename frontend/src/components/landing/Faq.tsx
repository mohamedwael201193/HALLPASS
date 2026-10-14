/**
 * Faq — six real questions, honest answers. No hand-waving; where the
 * answer is "not yet", we say so.
 */

import { motion } from "framer-motion";
import { useHidden, EASE_OUT } from "./reveal";

const TOKENS = {
  bg: "#121110",
  amber: "#FFB224",
  textDark: "#FFF9EF",
  muted: "rgba(255,249,239,0.62)",
  border: "rgba(255,178,36,0.22)",
  card: "rgba(250,246,238,0.045)",
};

const FAQS = [
  {
    q: "What exactly is a session key?",
    a: "A signing key your agent holds that is scoped by the pass: it can only spend within your per-tx cap, spending window, expiry, and destination allowlist. It cannot upgrade the account, uninstall the plugin, change the policy, or move the account's other funds. Your owner key stays untouched.",
  },
  {
    q: "What happens if my agent exceeds the cap?",
    a: "The transaction reverts on-chain — nothing moves. We proved this on Arc mainnet: a 0.05 USDC spend against a 0.01 cap reverted PerTxCapExceeded(0.05, 0.01). The revert carries the exact reason, so your logs can show the user why the spend was blocked.",
  },
  {
    q: "Can I revoke the agent's access instantly?",
    a: "Yes. As owner you call revokeSession() through the account — proven on mainnet with status 1 — and every later spend reverts SessionRevoked(). Caps stay intact and the plugin stays installed, so you can hand the agent a fresh pass whenever you want. Full removal is uninstallPlugin, also owner-only.",
  },
  {
    q: "Which wallets does HALLPASS work with?",
    a: "Any Circle smart account (ERC-6900 v0.7) on Arc mainnet. Two paths: hallpass-first accounts install the plugin at creation; existing accounts — including multisig-owned ones — install it post-creation via an owner-signed ERC-4337 v0.7 userOp. The factory allowlist path is real, so we use the direct-proxy route with identical code paths.",
  },
  {
    q: "Is it audited?",
    a: "Not yet. What we have is stronger than a pitch deck and weaker than an audit: the full install → spend → over-cap revert → revoke → post-revoke revert flow executed as real transactions on Arc mainnet, with every hash checkable on the explorer. An independent audit is on the roadmap before production deployments.",
  },
  {
    q: "What does it cost to run?",
    a: "Arc gas, measured not assumed. On our mainnet sprint the plugin deploy cost ≈ 0.038–0.044 USDC (base fee pinned at 20 gwei), proxy setup ≈ 0.016 USDC, and the install userOp was covered from the EntryPoint deposit. Total sprint gas ≈ 0.25 USDC with zero principal lost.",
  },
];

export default function Faq() {
  const hidden = useHidden(36);
  return (
    <section
      id="faq"
      style={{ background: TOKENS.bg, color: TOKENS.textDark, padding: "96px 24px" }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
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
          FAQ
        </p>
        <h2
          style={{
            fontSize: "clamp(34px, 5vw, 56px)",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            margin: "0 0 40px",
            fontWeight: 800,
          }}
        >
          Real answers.
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {FAQS.map((f, i) => (
            <motion.details
              key={f.q}
              initial={hidden}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: Math.min(i * 0.05, 0.2) }}
              style={{
                background: TOKENS.card,
                border: `1px solid ${TOKENS.border}`,
                borderRadius: 12,
                padding: "18px 22px",
              }}
            >
              <summary
                style={{
                  fontWeight: 700,
                  fontSize: 17,
                  cursor: "pointer",
                  listStyle: "none",
                }}
              >
                {f.q}
              </summary>
              <p
                style={{
                  color: TOKENS.muted,
                  fontSize: 15.5,
                  lineHeight: 1.65,
                  margin: "12px 0 0",
                }}
              >
                {f.a}
              </p>
            </motion.details>
          ))}
        </div>
        <p style={{ fontSize: 13, color: TOKENS.muted, margin: "20px 0 0" }}>
          *policy binds account execution and 4337 validation; mempool/bundler acceptance is not yet proven — disclosed in the build bible §6. gas figures are measured mainnet values, not estimates.
        </p>
      </div>
    </section>
  );
}
