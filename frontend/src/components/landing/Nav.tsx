import Logo from "./Logo";

/**
 * Minimal fixed nav: logo left, text links, ONE CTA.
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
    <header className="fixed inset-x-0 top-0 z-50 bg-[#121110]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
        <a href="#top" className="flex items-center gap-3" aria-label="Hall Pass home">
          <Logo size={34} />
          <span className="text-xl font-extrabold uppercase tracking-tight text-[#FFF9EF]">
            Hall&nbsp;Pass
          </span>
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-[#FFF9EF]/70 transition-colors hover:text-[#FFB224]"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <a
          href="/app"
          className="rounded-full bg-[#FFB224] px-6 py-3 text-sm font-bold text-[#121110] transition-colors hover:bg-[#e6a41f] active:bg-[#d6951a]"
        >
          Launch app
        </a>
      </div>
    </header>
  );
}
