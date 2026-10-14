/**
 * TapeEmptyState — relay-style honest empty states.
 *
 * Formula (per the relay "TAPE" reference): dashed-line SVG illustration +
 * headline + ONE plain-language explanation. No fake numbers, no "demo data"
 * buttons, no dead-ends: every state names what is missing and the next real
 * step.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Dashed ticket/tape illustration — the relay-style empty-state mark. */
export function DashedTapeArt({
  className = 'h-20 w-20',
  label = 'Empty',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      role="img"
      aria-label={label}
    >
      {/* dashed tape strip */}
      <rect
        x="10"
        y="30"
        width="76"
        height="36"
        rx="6"
        strokeDasharray="7 6"
        opacity="0.75"
      />
      {/* perforation line down the middle */}
      <line x1="48" y1="30" x2="48" y2="66" strokeDasharray="3 5" opacity="0.5" />
      {/* the tear-off stub: a small hall-pass tag */}
      <rect
        x="30"
        y="44"
        width="14"
        height="8"
        rx="2"
        strokeDasharray="3 3"
        opacity="0.6"
      />
      {/* ledger lines on the tape */}
      <line x1="56" y1="42" x2="76" y2="42" strokeDasharray="2 4" opacity="0.45" />
      <line x1="56" y1="50" x2="70" y2="50" strokeDasharray="2 4" opacity="0.45" />
      <line x1="56" y1="58" x2="76" y2="58" strokeDasharray="2 4" opacity="0.45" />
    </svg>
  );
}

export interface TapeEmptyStateProps {
  /** Headline — one line, plain words. */
  title: string;
  /** The explanation: what is missing and the next real step. */
  copy: string;
  /** Optional action (real button or link only — never decorative). */
  action?: ReactNode;
  /** Extra honest detail, e.g. why something is unavailable. */
  note?: string;
  /**
   * Illustration: 'tape' (default dashed SVG mark) or 'key3d' (the CC0
   * 3D key from 3dicons.co, self-hosted at
   * /assets/icons-3d/key-3d.png — used sparingly for key-related states).
   */
  art?: 'tape' | 'key3d';
}

export default function TapeEmptyState({
  title,
  copy,
  action,
  note,
  art = 'tape',
}: TapeEmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-text/10 bg-text/[0.03] px-6 py-14 text-center md:py-16">
      <div className="mb-6 text-amber/80">
        {art === 'key3d' ? (
          <img
            src="/assets/icons-3d/key-3d.png"
            alt=""
            width={88}
            height={88}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-[88px] w-[88px] select-none"
          />
        ) : (
          <DashedTapeArt label={title} />
        )}
      </div>
      <h2 className="max-w-md font-display text-2xl font-extrabold text-text">
        {title}
      </h2>
      <p className="mt-3 max-w-md leading-relaxed text-text/70">{copy}</p>
      {action ? <div className="mt-8">{action}</div> : null}
      {note ? (
        <p className="mt-6 max-w-md text-sm text-text/45">{note}</p>
      ) : null}
    </div>
  );
}

/** Amber primary CTA used inside tape empty states. ≥44px touch target. */
export function TapePrimaryAction({
  to,
  children,
  onClick,
}: {
  to?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const cls =
    'inline-flex min-h-[56px] items-center rounded-full bg-amber px-8 font-display text-lg font-extrabold text-ink transition-transform duration-200 hover:scale-[1.03] active:scale-[0.99]';
  if (to) {
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
