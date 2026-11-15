import type { ReactNode } from 'react'

/** One line of muted text, used where a later milestone will put real content. */
export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm text-muted ${className}`}>{children}</p>
}
