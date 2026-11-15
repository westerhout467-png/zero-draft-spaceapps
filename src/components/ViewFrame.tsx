import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

type ViewFrameProps = {
  /** Changing this key crossfades to the new children. */
  viewKey: string
  children: ReactNode
}

/**
 * The main area. One view fills it; when the view changes, the old and new views fade
 * across each other in 150 ms. A view taller than the area scrolls inside it, so the page
 * itself never scrolls. Under reduced motion the change is instant.
 *
 * `MotionConfig reducedMotion="user"` only turns off movement, not opacity, so the
 * duration is set to 0 here as well.
 */
export function ViewFrame({ viewKey, children }: ViewFrameProps) {
  const reduceMotion = useReducedMotion()
  return (
    <main className="relative min-h-0 flex-1">
      <AnimatePresence initial={false}>
        <motion.div
          key={viewKey}
          className="absolute inset-0 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.15, ease: 'linear' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </main>
  )
}
