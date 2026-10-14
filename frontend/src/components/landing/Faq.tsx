/**
 * Faq — six real questions, honest answers. No hand-waving; where the
 * answer is "not yet", we say so.
 *
 * Carry-exact shell; blue accents; all copy byte-identical.
 */

import { motion } from "framer-motion";
import { useHidden, EASE_OUT } from "./reveal";
import { CarrySection, SectionH2 } from "./carry/Section";

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
    <CarrySection id="faq" number="07" label="FAQ">
      <style>{`
        .faq-item { transition: border-color 0.25s ease; }
        .faq-item:hover { border-color: rgba(77,162,255,0.45); }
        .faq-item summary { position: relative; padding-right: 36px; }
        .faq-item summary::-webkit-details-marker { display: none; }
        .faq-item summary::marker { content: ""; }
        .faq-item summary::after {
          content: "+";
          position: absolute; right: 6px; top: 50%;
          transform: translateY(-50%);
          color: #4da2ff; font-size: 22px; font-weight: 700; line-height: 1;
        }
        .faq-item[open] summary::after { content: "\\2013"; }
        @media (prefers-reduced-motion: reduce) {
          .faq-item { transition: none; }
        }
      `}</style>
      <div className="mx-auto max-w-3xl">
        <SectionH2>
          Real <span className="text-white/50">answers.</span>
        </SectionH2>
        <div className="mt-10 flex flex-col gap-3">
          {FAQS.map((f, i) => (
            <motion.details
              key={f.q}
              className="faq-item border border-dashed border-white/20 bg-white/[0.02] px-5 py-4"
              initial={hidden}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: Math.min(i * 0.05, 0.2) }}
            >
              <summary className="min-h-[44px] cursor-pointer list-none text-[17px] font-bold text-white">
                {f.q}
              </summary>
              <p className="mb-0 mt-3 text-[15.5px] font-light leading-[1.65] text-gray-400">
                {f.a}
              </p>
            </motion.details>
          ))}
        </div>
        <p className="mt-5 text-[13px] font-light text-gray-400">
          *policy binds account execution and 4337 validation; mempool/bundler acceptance is not yet proven — disclosed in the build bible §6. gas figures are measured mainnet values, not estimates.
        </p>
      </div>
    </CarrySection>
  );
}
