/**
 * SpotlightCard — card with a soft amber glow that follows the pointer.
 *
 * ADAPTED from Aceternity UI's SpotlightCard concept (https://ui.aceternity.com/components/spotlight).
 * Not verbatim: pointer position is tracked in CSS custom properties
 * (--hp-spot-x/--hp-spot-y) and the glow is a plain radial-gradient overlay
 * (no blur() filters, per the dashboard performance discipline). The effect
 * is hover-only and purely decorative — content never depends on it.
 */

import { useCallback, useRef, type ReactNode, type MouseEvent } from 'react';

export interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  /** Glow color at the pointer. Keep faint — amber is EARNED. */
  glow?: string;
}

export default function SpotlightCard({
  children,
  className = '',
  glow = 'rgba(255, 178, 36, 0.14)',
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--hp-spot-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--hp-spot-y', `${e.clientY - rect.top}px`);
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={`hp-spotlight-card group relative ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:hidden"
        style={{
          background: `radial-gradient(240px circle at var(--hp-spot-x, 50%) var(--hp-spot-y, 50%), ${glow}, transparent 70%)`,
        }}
      />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
