import { motion } from 'framer-motion'
import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * EmptyState — every empty screen names a next action (UX law).
 * Keep it GPU-friendly: only transform/opacity animations.
 */
export interface EmptyStateProps {
  /** Small icon (SVG/emoji-free; pass a ReactNode). Optional. */
  icon?: ReactNode
  /** Headline — plain words, what is empty. */
  title: string
  /** One plain sentence explaining why it's empty or what comes next. */
  description: string
  /** The next action to take. Omit only when the parent names it inline. */
  actionLabel?: string
  onAction?: () => void
  /** When true, the button is disabled and `disabledReason` is shown inline. */
  actionDisabled?: boolean
  /** WHY the action is disabled — always shown when actionDisabled. */
  disabledReason?: string
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled,
  disabledReason,
}: EmptyStateProps) {
  const [ripples, setRipples] = useState<number[]>([])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-text/15 bg-ink px-6 py-12 text-center sm:py-16"
      role="status"
    >
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber/10 text-amber">
          {icon}
        </div>
      )}
      <h3 className="font-display text-xl font-semibold text-text sm:text-2xl">{title}</h3>
      <p className="mt-2 max-w-sm font-body text-sm text-text/60 sm:text-base">{description}</p>
      {actionLabel && onAction && (
        <div className="mt-6">
          <button
            type="button"
            disabled={actionDisabled}
            onClick={() => {
              if (actionDisabled) return
              const id = Date.now()
              setRipples((r) => [...r, id])
              setTimeout(() => setRipples((r) => r.filter((x) => x !== id)), 600)
              onAction()
            }}
            className={`relative overflow-hidden rounded-full px-6 py-3 font-body text-sm font-semibold transition-all duration-200 ${
              actionDisabled
                ? 'cursor-not-allowed bg-text/10 text-text/40'
                : 'bg-amber text-ink hover:bg-amber/90 active:scale-[0.97]'
            }`}
          >
            {ripples.map((id) => (
              <span
                key={id}
                className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-white/30"
              />
            ))}
            {actionLabel}
          </button>
          {actionDisabled && disabledReason && (
            <p className="mt-3 max-w-xs font-body text-xs text-text/50">{disabledReason}</p>
          )}
        </div>
      )}
    </motion.div>
  )
}

export default EmptyState
