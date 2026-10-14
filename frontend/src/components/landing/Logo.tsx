export default function Logo({
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
      aria-label="Hall Pass logo"
    >
      {/* The slip — a bold permission ticket tilted in motion */}
      <g transform="rotate(8 24 24)">
        <rect
          x="13"
          y="6"
          width="22"
          height="36"
          rx="4"
          stroke="#FFB224"
          strokeWidth="3"
          fill="none"
        />
        {/* Punched slot — the tear-off that marks a real hall pass */}
        <rect x="20.5" y="10.5" width="7" height="3" rx="1.5" fill="#FFB224" />
        {/* The allowed check — amber, inside the bounds */}
        <path
          d="M19.5 25.5 L23 29 L29.5 21.5"
          stroke="#FFB224"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* The bound — a permission ring clipped by the slip edge */}
        <path
          d="M16 34.5 C20 37.5 28 37.5 32 34.5"
          stroke="#FFB224"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.75"
        />
      </g>
    </svg>
  );
}
