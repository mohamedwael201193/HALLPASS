/**
 * RouteFallback — skeleton region shown while a route chunk loads (design §6:
 * skeleton regions for page loading; spinner only inside a clicked button).
 * The pulse is opacity-only (GPU-friendly) and killed under
 * prefers-reduced-motion by the global CSS rule in index.css.
 */
export default function RouteFallback() {
  return (
    <div
      className="min-h-[100dvh] bg-ink px-6 py-10"
      role="status"
      aria-label="Loading page"
    >
      <div className="mx-auto max-w-6xl">
        <div className="h-8 w-44 animate-pulse rounded-lg bg-text/10" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl bg-text/5"
              style={{ animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
