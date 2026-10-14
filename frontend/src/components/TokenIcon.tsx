/**
 * TokenIcon — official Circle-brand token marks, self-hosted.
 *
 * Renders /assets/tokens/usdc.png (181×181) and /assets/tokens/eurc.png
 * (250×250). NEVER hotlinked. Design standard §9 identity: amber/charcoal/
 * cream only — the marks themselves carry the brand color.
 *
 * Crispness rules:
 *  - `size` is the display size in CSS px.
 *  - The rendered size is clamped to the file's natural pixel size, so the
 *    mark is never upscaled into a blurry mess.
 *  - Explicit width/height attributes (no layout shift), lazy decoding,
 *    subtle ring per the design law.
 */

export type TokenKind = 'USDC' | 'EURC';

const SOURCES: Record<TokenKind, { src: string; natural: number; label: string }> = {
  USDC: { src: '/assets/tokens/usdc.png', natural: 181, label: 'USDC' },
  EURC: { src: '/assets/tokens/eurc.png', natural: 250, label: 'EURC' },
};

export interface TokenIconProps {
  token: TokenKind;
  /** Display size in px. Clamped to the file's natural size — never upscaled. */
  size: number;
  className?: string;
  /** Accessible label override. Defaults to "<TOKEN> token". */
  alt?: string;
}

export default function TokenIcon({ token, size, className = '', alt }: TokenIconProps) {
  const meta = SOURCES[token];
  const px = Math.max(1, Math.min(Math.round(size), meta.natural));
  return (
    <img
      src={meta.src}
      alt={alt ?? `${meta.label} token`}
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      draggable={false}
      style={{ width: px, height: px }}
      className={`shrink-0 select-none rounded-full ring-1 ring-white/15 ${className}`}
    />
  );
}
