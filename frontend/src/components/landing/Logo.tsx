/**
 * TagMark — the HALLPASS tag glyph, rebuilt for the carry-exact grammar.
 * An ORIGINAL dependency-free SVG: one continuous stroke draws itself
 * (stroke-dasharray) in the spirit of pixel-perfect.space stroke work —
 * never hotlinked, never copied. Reduced-motion safe (renders complete).
 */
export default function TagMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Hall Pass tag mark"
    >
      {/* one continuous path: lanyard loop → tag body → punched corner.
          dasharray 240 covers the full path length; it draws on mount. */}
      <path
        className="tag-draw-path"
        d="M24 4 C17 4 12 9 12 15 L12 21 L8 25 L8 40 C8 42.2 9.8 44 12 44 L36 44 C38.2 44 40 42.2 40 40 L40 25 L36 21 L36 15 C36 9 31 4 24 4 Z"
        stroke="#FFB224"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* punched hole — fades in after the draw completes */}
      <circle className="tag-draw-hole" cx="24" cy="12" r="3.2" fill="none" stroke="#FFB224" strokeWidth="2.5" />
    </svg>
  );
}
