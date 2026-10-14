import { motion } from 'framer-motion'
import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * ErrorState — human sentence first, technical detail collapsible (UX law).
 * Keep animations GPU-friendly: transform/opacity only.
 */
export interface ErrorStateProps {
  /** Optional icon node. */
  icon?: ReactNode
  /** Headline in plain words, e.g. "That payment didn't go through". */
  title: string
  /** Human-language explanation of what happened + what to do next. */
  message: string
  /** Raw technical detail (revert reason, error code) — shown collapsed, never the headline. */
  technicalDetail?: string
  /** Retry action label. */
  retryLabel?: string
  onRetry?: () => void
  /** Secondary action (e.g. "Change bounds"). */
  secondaryLabel?: string
  onSecondary?: () => void
}

export function ErrorState({
  icon,
  title,
  message,
  technicalDetail,
  retryLabel = 'Try again',
  onRetry,
  secondaryLabel,
  onSecondary,
}: ErrorStateProps) {
  const [showDetail, setShowDetail] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center rounded-2xl border border-red-400/20 bg-ink px-6 py-12 text-center sm:py-16"
      role="alert"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-400/10 text-red-400">
        {icon ?? (
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.5" />
          </svg>
        )}
      </div>
      <h3 className="font-display text-xl font-semibold text-text sm:text-2xl">{title}</h3>
      <p className="mt-2 max-w-md font-body text-sm text-text/60 sm:text-base">{message}</p>

      {technicalDetail && (
        <div className="mt-4 w-full max-w-md">
          <button
            type="button"
            onClick={() => setShowDetail((s) => !s)}
            className="font-body text-xs text-text/40 underline decoration-dotted underline-offset-4 transition-colors hover:text-text/70"
            aria-expanded={showDetail}
          >
            {showDetail ? 'Hide technical detail' : 'Show technical detail'}
          </button>
          {showDetail && (
            <motion.pre
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-3 text-left font-mono text-xs text-text/50"
            >
              {technicalDetail}
            </motion.pre>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-amber px-6 py-3 font-body text-sm font-semibold text-ink transition-all duration-200 hover:bg-amber/90 active:scale-[0.97]"
          >
            {retryLabel}
          </button>
        )}
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="rounded-full border border-text/20 px-6 py-3 font-body text-sm font-semibold text-text transition-colors hover:border-text/40"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </motion.div>
  )
}

export default ErrorState
