/**
 * Footer — a sign-off, not a link farm.
 * Pattern: one mixed-case line → made-by line → ≤3 minimal links.
 * Carry-exact: dark shell with dashed top border, blue link underlines.
 *
 * Links are real only: the Arc explorer and the two proven contracts.
 * No socials, no invented URLs. All copy byte-identical.
 */

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
    <footer className="relative mx-auto w-full max-w-7xl border-x border-t border-dashed border-white/20 bg-[#050505] px-6 pb-8 pt-16 text-center text-white">
      <style>{`
        .foot-link { transition: color 0.2s ease, border-color 0.2s ease; }
        .foot-link:hover { color: #FFB224; border-color: #FFB224 !important; }
      `}</style>
      <div className="mx-auto max-w-3xl">
        <p className="mb-2 text-3xl font-normal leading-[1.2] tracking-tight md:text-4xl">
          Thanks for stopping by.
        </p>
        <p className="mb-7 text-[17px] font-bold">
          The list is closed.
        </p>
        <nav className="mb-8 flex flex-wrap items-center justify-center gap-6">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="foot-link inline-flex min-h-[44px] items-center border-b-2 border-[#FFB224]/60 pb-0.5 text-[15px] font-semibold text-white no-underline"
            >
              {l.label} ↗
            </a>
          ))}
        </nav>
        <p className="mb-1.5 text-sm font-light text-gray-400">
          Made for the Arc builder community © 2026.
        </p>
        <p className="m-0 text-xs font-light text-gray-400/70">
          *every address and transaction hash on this page is a real Arc mainnet
          record — click any card to check it on the explorer yourself. The app
          is live: every control executes a real transaction or says exactly
          why it can&apos;t.
        </p>
      </div>
    </footer>
  );
}
