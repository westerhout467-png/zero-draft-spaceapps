import { useId, type ReactNode } from 'react'

// A small "+" centred on a frame corner. The frame's border is 1px, and an absolutely
// positioned child is placed from the padding edge, so -5px puts the 9px mark's centre
// on the middle of that 1px border.
function CornerTick({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 9 9"
      className={`pointer-events-none absolute size-[9px] text-muted ${className}`}
    >
      <path d="M4.5 0v9M0 4.5h9" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  )
}

type PanelProps = {
  /** Plain-words title, shown above the frame. */
  title?: string
  /** For a panel with no title above it: the name screen readers give the panel. */
  label?: string
  className?: string
  children?: ReactNode
}

/**
 * An instrument panel: a 1px frame with "+" ticks at its four outer corners, and a title above
 * it when one is given. The inside is a window, pure black, so flames and plotted data are the
 * only light in it. Use it for chambers and charts only, never for text sections.
 */
export function Panel({ title, label, className = '', children }: PanelProps) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      aria-label={title ? undefined : label}
      className={`flex min-h-0 flex-col gap-2 ${className}`}
    >
      {title && (
        <h2 id={headingId} className="text-sm leading-6 font-semibold">
          {title}
        </h2>
      )}
      <div className="relative min-h-0 flex-1 border border-line bg-window">
        <CornerTick className="-top-[5px] -left-[5px]" />
        <CornerTick className="-top-[5px] -right-[5px]" />
        <CornerTick className="-bottom-[5px] -left-[5px]" />
        <CornerTick className="-right-[5px] -bottom-[5px]" />
        {children}
      </div>
    </section>
  )
}
