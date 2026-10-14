import TagMark from "./Logo";
import { GradientCta } from "./carry/Section";

/**
 * Nav — carry-exact grammar.
 * Wrapper: max-w-7xl border-x border-dashed border-white/20, pt-6.
 * Bar: flex h-14 items-center justify-between px-6.
 * Left: tag mark + "HALL PASS" (Satoshi text-2xl font-light tracking-[0.14em]).
 * Center (md+): gap-8 text-sm font-medium text-gray-400 hover:text-white.
 * Right: small gradient "Launch app" → /app.
 * Wallet connect lives inside /app (the real Reown flow) — no fake connect here.
 */
export default function Nav() {
  const links = [
    { label: "How it works", href: "#how-it-works" },
    { label: "Live proof", href: "#live-proof" },
    { label: "Builders", href: "#builders" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl border-x border-dashed border-white/20 pt-6">
      <div className="flex h-14 items-center justify-between px-6">
        <a href="#top" className="flex min-h-[44px] items-center gap-3" aria-label="Hall Pass home">
          <TagMark size={30} />
          <span className="text-2xl font-light tracking-[0.14em] text-white">
            HALL&nbsp;PASS
          </span>
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-gray-400 transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <GradientCta href="/app" small>
            Launch app
          </GradientCta>
        </div>
      </div>
    </div>
  );
}
