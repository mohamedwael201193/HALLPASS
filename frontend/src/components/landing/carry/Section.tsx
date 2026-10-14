import type { ReactNode } from "react";

/**
 * Shared carry-exact section grammar (usecarry.xyz visual spec, our content).
 * Section shell: max-w-7xl border-x border-t border-dashed border-white/20 bg-[#050505].
 * Label row: mono number + hairline divider + amber uppercase label.
 */

export function CarrySection({
  id,
  number,
  label,
  children,
  className = "",
}: {
  id?: string;
  number?: string;
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`relative mx-auto w-full max-w-7xl border-x border-t border-dashed border-white/20 bg-[#050505] px-6 py-20 md:py-28 ${className}`}
    >
      {number && label ? (
        <div className="mb-10 flex items-center gap-4 md:mb-14">
          <span className="font-geist text-sm tracking-tighter text-white/40">
            {number}
          </span>
          <span aria-hidden className="h-4 w-px bg-[#FFB224]/50" />
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#FFB224]">
            {label}
          </span>
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** H2: Satoshi, text-4xl→md:text-6xl, font-normal, leading 1.05, tracking-tight, white. */
export function SectionH2({ children }: { children: ReactNode }) {
  return (
    <h2 className="max-w-4xl text-4xl font-normal leading-[1.05] tracking-tight text-white md:text-6xl">
      {children}
    </h2>
  );
}

/** Body: text-lg font-light text-gray-400 max-w-md. */
export function SectionBody({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 max-w-md text-lg font-light leading-relaxed text-gray-400">
      {children}
    </p>
  );
}

/**
 * Gradient-border CTA — exact carry construction.
 * Outer span carries the gradient border (p-px) + glow shadow (radial, no blur filter);
 * inner span is the dark gradient fill; label sits relative z-10.
 */
export function GradientCta({
  href,
  children,
  small = false,
}: {
  href: string;
  children: ReactNode;
  small?: boolean;
}) {
  return (
    <a
      href={href}
      className={`group relative inline-flex min-h-[44px] items-center justify-center rounded-none bg-gradient-to-r from-[#78350f] via-[#f59e0b] to-[#fbbf24] p-px shadow-[0_0_20px_-5px_rgba(255,178,36,0.5)] transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_0_35px_-5px_rgba(255,178,36,0.85)] active:scale-[0.97]`}
    >
      {/* side glow via radial-gradient — no blur() filter */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-10 bg-[radial-gradient(closest-side,rgba(255,178,36,0.22),transparent)]"
      />
      <span
        className={`block size-full bg-gradient-to-b from-[#451a03] to-black ${
          small
            ? "px-7 py-3 text-[11px] tracking-[0.15em]"
            : "px-10 py-4 text-sm tracking-[0.2em]"
        } font-bold uppercase text-white`}
      >
        <span className="relative z-10">{children}</span>
      </span>
    </a>
  );
}
