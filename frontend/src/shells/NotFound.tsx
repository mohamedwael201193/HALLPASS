import { Link } from 'react-router-dom'

/** 404 — never a dead end: route the user somewhere useful. */
export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-ink px-6 text-center text-text">
      <p className="font-display text-6xl font-extrabold text-amber">404</p>
      <p className="max-w-sm text-text/70">
        That page doesn't exist. The real stuff is one tap away.
      </p>
      <Link
        to="/"
        className="inline-flex min-h-[48px] items-center rounded-full bg-amber px-8 py-3 font-display font-bold text-ink transition-transform duration-200 hover:scale-105 active:scale-[0.98]"
      >
        Back home
      </Link>
    </div>
  )
}
