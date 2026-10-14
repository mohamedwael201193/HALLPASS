"use client";

import Link from "next/link";
import Logo from "./Logo";

/**
 * Minimal confident nav. The wallet button is an honest placeholder —
 * it routes to /app where the real Reown connect flow lives (F9 wires it).
 * Never renders a fake connect dialog.
 */
export default function Nav() {
  const links = [
    { label: "How it works", href: "#how-it-works" },
    { label: "Live proof", href: "#live-proof" },
    { label: "Builders", href: "#builders" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
        <Link href="/" className="flex items-center gap-3" aria-label="Hall Pass home">
          <Logo size={34} />
          <span className="text-xl font-extrabold uppercase tracking-tight text-[#FFF9EF]">
            Hall&nbsp;Pass
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-[#FFF9EF]/70 transition-colors hover:text-[#FFB224]"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {/* Placeholder wallet entry — honest link to the real flow in /app */}
          <Link
            href="/app"
            className="hidden rounded-full border border-[#FFF9EF]/25 px-5 py-2.5 text-sm font-semibold text-[#FFF9EF] transition-colors hover:border-[#FFB224] hover:text-[#FFB224] sm:inline-block"
          >
            Connect wallet
          </Link>
          <Link
            href="/app"
            className="rounded-full bg-[#FFB224] px-6 py-2.5 text-sm font-bold text-[#121110] transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Launch app
          </Link>
        </div>
      </div>
    </header>
  );
}
