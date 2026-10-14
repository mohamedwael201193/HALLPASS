import { Link } from 'react-router-dom'

/**
 * Landing route mount — TEMPORARY until the landing worker mounts the real
 * 12-section page (components/landing/*). Honest copy: no fake sections,
 * no invented numbers, one obvious CTA. Single primary button on screen.
 */
export default function LandingShell() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink font-body text-text">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
          Give your agent a <span className="text-amber">hall pass</span>
          <br />
          — not your keys.
        </p>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-text/70 sm:text-lg">
          Policy plugins for smart wallets, live on Arc mainnet. Your agent
          spends only inside the bounds you set — everything else reverts
          on-chain.
        </p>
        <Link
          to="/app"
          className="mt-10 inline-flex min-h-[48px] items-center rounded-full bg-amber px-9 py-4 font-display text-lg font-bold text-ink transition-transform duration-200 hover:scale-105 active:scale-[0.98]"
        >
          Launch app
        </Link>
        <p className="mt-6 text-xs text-text/40">
          The full landing story is still being built — the app below is real.
        </p>
      </div>
    </div>
  )
}
