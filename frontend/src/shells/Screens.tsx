import { Link } from 'react-router-dom'

/**
 * Temporary mount for a dashboard screen its owner hasn't built yet.
 * Human language: says what's coming and what the next action is —
 * never "placeholder", never jargon, never a dead end.
 */
export function ScreenPlaceholder({ name, next }: { name: string; next: string }) {
  return (
    <div className="rounded-2xl border border-text/10 bg-cream p-8 text-ink sm:p-10">
      <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
        {name}
      </h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink/70 sm:text-base">
        This screen isn't live yet. When it opens, every button will run a
        real on-chain transaction — nothing here will ever be a demo.
      </p>
      <p className="mt-4 text-sm font-semibold">
        Next action: <span className="font-normal">{next}</span>
      </p>
    </div>
  )
}

/** (a) Connect — one obvious connect button lives here (F9 wires the real flow). */
export function ConnectScreen() {
  return (
    <div>
      <ScreenPlaceholder
        name="Connect"
        next="connect your wallet — one button, then you're in"
      />
      <Link
        to="/"
        className="mt-6 inline-block rounded-full border border-text/20 px-6 py-3 text-sm font-semibold text-text transition-colors hover:border-amber hover:text-amber"
      >
        ← Back home
      </Link>
    </div>
  )
}

/** (b) My accounts — smart accounts + installed plugins with status. */
export function AccountsScreen() {
  return (
    <div>
      <ScreenPlaceholder
        name="My accounts"
        next="pick an account to see its hall passes"
      />
      <Link
        to="/app"
        className="mt-6 inline-block rounded-full border border-text/20 px-6 py-3 text-sm font-semibold text-text transition-colors hover:border-amber hover:text-amber"
      >
        ← Back to Connect
      </Link>
    </div>
  )
}

/** (c) Plugin marketplace — install/uninstall via real on-chain userOps. */
export function MarketplaceScreen() {
  return (
    <div>
      <ScreenPlaceholder
        name="Plugin marketplace"
        next="install your first hall pass"
      />
      <Link
        to="/app"
        className="mt-6 inline-block rounded-full border border-text/20 px-6 py-3 text-sm font-semibold text-text transition-colors hover:border-amber hover:text-amber"
      >
        ← Back to Connect
      </Link>
    </div>
  )
}

/** (d) Policy editor — sliders + live "what this allows" preview. */
export function PolicyScreen() {
  return (
    <div>
      <ScreenPlaceholder
        name="Policy editor"
        next="set caps, window, expiry, and destinations"
      />
      <Link
        to="/app"
        className="mt-6 inline-block rounded-full border border-text/20 px-6 py-3 text-sm font-semibold text-text transition-colors hover:border-amber hover:text-amber"
      >
        ← Back to Connect
      </Link>
    </div>
  )
}

/** (e) Activity — every spend attempt: allowed (amber) or blocked (why + fix). */
export function ActivityScreen() {
  return (
    <div>
      <ScreenPlaceholder
        name="Activity"
        next="review what your agent did — and what got stopped"
      />
      <Link
        to="/app"
        className="mt-6 inline-block rounded-full border border-text/20 px-6 py-3 text-sm font-semibold text-text transition-colors hover:border-amber hover:text-amber"
      >
        ← Back to Connect
      </Link>
    </div>
  )
}
