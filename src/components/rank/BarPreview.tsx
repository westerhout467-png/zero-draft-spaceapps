import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { placePreview } from '../../lib/footnotes'

type BarPreviewProps = {
  id: string
  anchor: RefObject<HTMLElement | null>
  children: ReactNode
  onPointerEnter: () => void
  onPointerLeave: () => void
}

/**
 * A fingerprint bar's hover preview: a few lines on the overlay panel, above the bar (below it
 * when there's no room). It holds no buttons or links (CLAUDE.md interaction 10): the bar itself
 * opens the source. It appears without animation, like the footnote previews.
 */
export function BarPreview({ id, anchor, children, onPointerEnter, onPointerLeave }: BarPreviewProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const target = anchor.current?.getBoundingClientRect()
    const box = boxRef.current?.getBoundingClientRect()
    if (!target || !box) return
    setPosition(placePreview(target, box, document.documentElement.clientWidth))
  }, [anchor, children])

  return createPortal(
    <div
      ref={boxRef}
      id={id}
      role="tooltip"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={position ?? { top: 0, left: 0, visibility: 'hidden' }}
      className="fixed z-[60] flex w-72 flex-col gap-1.5 rounded-sm border border-line bg-panel px-3 py-2 text-xs leading-4 text-ink"
    >
      {children}
    </div>,
    document.body,
  )
}
