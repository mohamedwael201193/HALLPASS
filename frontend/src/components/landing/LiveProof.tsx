/**
 * LiveProof — "Don't trust us. Verify."
 *
 * HARD RULE: every value below is copied character-for-character from
 * hallpass-build-bible.md §6 (Test evidence ledger, H9 sprint, all Arc
 * mainnet chain 5042). Anything truncated in the bible is OMITTED here.
 * No invented hashes or addresses.
 *
 * Carry-exact shell; only styling changed. All copy byte-identical.
 */

import { motion } from "framer-motion";
import { useHidden, EASE_OUT } from "./reveal";
import { CarrySection, SectionH2, SectionBody } from "./carry/Section";

const EXPLORER = "https://explorer.arc.io";

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
      "Session key execute(payee, 0.005). Status 1 — the agent spends inside bounds. The on-chain accounting stayed exact: windowSpent 0 → 0.005.",
  },
  {
    group: "Enforcement",
    label: "Real v0.7 userOp, session-key signature — sent directly",
    value:
      "0x8579d7b6f321d098b3ab6f12bc6e7cec3b6cd75c2d3d78a51eb059a850428ad4",
    kind: "tx",
    proves:
      "A genuine ERC-4337 userOp, not a raw wallet call. windowSpent 0.005 → 0.006, counted atomically. (No public v0.7 bundler on Arc — userOps were self-relayed, disclosed honestly.)",
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
  const hidden = useHidden(40);
  const groups = ["Install", "Enforcement", "Typed-data gate"];
  return (
    <CarrySection id="live-proof" number="04" label="Live proof">
      <style>{`
        .proof-card { transition: border-color 0.25s ease, transform 0.25s ease; }
        .proof-card:hover { border-color: rgba(255,178,36,0.5); transform: translateY(-2px); }
        @media (prefers-reduced-motion: reduce) {
          .proof-card { transition: none; }
          .proof-card:hover { transform: none; }
        }
      `}</style>
      <motion.div
        initial={hidden}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
      >
        <SectionH2>
          Don&rsquo;t trust us. <span className="text-white/50">Verify.</span>
        </SectionH2>
        <SectionBody>
          Every value below is a real Arc mainnet (chain 5042) record from our
          test ledger — the contract, the install userOp, the allowed spend,
          the blocked spend, the revocation. Click any card to check it on the
          Arc explorer yourself.
        </SectionBody>

        <div className="mt-14">
          {groups.map((g) => (
            <div key={g} className="mb-10">
              <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-[#FFB224]">
                {g}
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {PROOFS.filter((p) => p.group === g).map((p, i) => (
                  <motion.div
                    key={p.value}
                    initial={hidden}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.6, ease: EASE_OUT, delay: (i % 3) * 0.07 }}
                  >
                    <a
                      href={linkFor(p)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="proof-card block h-full min-h-[44px] border border-dashed border-white/20 bg-white/[0.02] p-5 text-white no-underline"
                    >
                      <p className="mb-3 text-[15px] font-bold">
                        {p.label}
                      </p>
                      <code
                        title={p.value}
                        className="font-geist mb-3 inline-block break-all border border-[#FFB224]/25 bg-[#FFB224]/[0.08] px-2.5 py-1.5 text-[13px] text-[#FFB224]"
                      >
                        {short(p.value)}
                      </code>
                      <p className="m-0 text-sm leading-[1.55] text-gray-400">
                        <span className="font-semibold text-white">
                          What it proves:{" "}
                        </span>
                        {p.proves}
                      </p>
                      <p className="mb-0 mt-3 text-[13px] font-semibold text-[#FFB224]">
                        View on Arc explorer ↗
                      </p>
                    </a>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="max-w-xl text-[13px] font-light leading-relaxed text-gray-400">
          *no public ERC-4337 v0.7 bundler exists on Arc yet, so userOps were self-relayed; the policy binds account execution either way. sprint gas ≈ 0.25 USDC, no principal lost, keys never printed.
        </p>
      </motion.div>
    </CarrySection>
  );
}
