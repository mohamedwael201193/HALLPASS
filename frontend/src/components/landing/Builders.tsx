/**
 * Builders — the real install call shape. Source: hallpass-build-bible.md
 * §4 (verified selectors, manifest rule) and §5 (install flow). The plugin
 * address and manifest hash below are the proven mainnet deployment.
 *
 * Carry-exact shell; all copy byte-identical.
 */

import { motion } from "framer-motion";
import { useHidden, EASE_OUT } from "./reveal";
import { CarrySection, SectionH2, SectionBody } from "./carry/Section";

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
    <CarrySection id="builders" number="06" label="For builders">
      <style>{`
        .builder-btn { transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease; }
        .builder-btn:hover { background: rgba(77,162,255,0.12) !important; border-color: #4da2ff !important; color: #4da2ff !important; }
      `}</style>
      <motion.div
        initial={hidden}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
      >
        <SectionH2>
          One call. <span className="text-white/50">That&rsquo;s the integration.</span>
        </SectionH2>
        <SectionBody>
          Install the plugin on any Circle smart account and every spend your
          agent makes goes through the policy gate — caps, windows, expiry,
          allowlists, typed data. The snippet below is the real call shape.
        </SectionBody>
        <pre className="font-geist mb-6 mt-10 overflow-x-auto border border-dashed border-white/20 bg-[#030303] p-6 text-sm leading-[1.7] text-gray-200">
          {SNIPPET}
        </pre>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="#live-proof"
            className="builder-btn inline-flex min-h-[44px] items-center border-2 border-[#4da2ff]/60 bg-transparent px-6 py-3 font-bold text-[#4da2ff] no-underline"
          >
            See the proof on-chain
          </a>
          <p className="m-0 text-sm font-light text-gray-400">
            Full install flows and contract specs ship in the HALLPASS build
            bible (the project&rsquo;s technical reference).
          </p>
        </div>
      </motion.div>
    </CarrySection>
  );
}
