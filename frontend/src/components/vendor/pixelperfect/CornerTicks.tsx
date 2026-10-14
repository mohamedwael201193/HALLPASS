/**
 * CornerTicks — dashed corner registration marks for cards.
 *
 * ADAPTED from pixel-perfect.space "borders/border1"
 * (https://github.com/vansh-nagar/Pixel-Perfect/blob/main/registry/new-york/borders/border1.tsx)
 * — the corner-tick frame concept. Not verbatim: recolored to the HALLPASS
 * palette (amber/cream on charcoal), sized by prop, pointer-events-none so
 * it never steals taps, and static (no animation — the tape look is the
 * frame itself).
 *
 * Usage: place inside a `relative` card.
 *   <div className="relative ...">
 *     <CornerTicks />
 *     ...card content...
 *   </div>
 */

export default function CornerTicks({
  size = 22,
  className = '',
}: {
  /** Length of each tick arm in px. */
  size?: number;
  className?: string;
}) {
  const arm = { width: size, height: size };
  const base =
    'pointer-events-none absolute z-10 block border-amber/50';
  return (
    <span aria-hidden="true" className={`absolute inset-0 ${className}`}>
      <span
        className={`${base} left-2 top-2 border-l-2 border-t-2 border-dashed`}
        style={arm}
      />
      <span
        className={`${base} right-2 top-2 border-r-2 border-t-2 border-dashed`}
        style={arm}
      />
      <span
        className={`${base} bottom-2 left-2 border-b-2 border-l-2 border-dashed`}
        style={arm}
      />
      <span
        className={`${base} bottom-2 right-2 border-b-2 border-r-2 border-dashed`}
        style={arm}
      />
    </span>
  );
}
