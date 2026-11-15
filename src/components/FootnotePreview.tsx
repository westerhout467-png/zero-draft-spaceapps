import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { placePreview } from '../lib/footnotes'

type FootnotePreviewProps = {
  /** The id the footnote's aria-describedby points at. */
  id: string
  /** The footnote it belongs to. */
  anchor: RefObject<HTMLElement | null>
  /** One line, such as "BASS-II report, p. 76". */
  text: string
  /** Keep it open while the pointer is on it, so it can be read and selected. */
  onPointerEnter: () => void
  onPointerLeave: () => void
}

/**
 * The one-line footnote preview. It is placed on document.body, so the scrolling view it
 * belongs to can't clip it, and measured before paint, so it never shows in the wrong spot.
 * It appears without animation: footnotes are hovered often, and the drawer is the motion.
 */
export function FootnotePreview({
  id,
  anchor,
  text,
  onPointerEnter,
  onPointerLeave,
}: FootnotePreviewProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const target = anchor.current?.getBoundingClientRect()
    const box = boxRef.current?.getBoundingClientRect()
    if (!target || !box) return
    setPosition(placePreview(target, box, document.documentElement.clientWidth))
  }, [anchor, text])

  return createPortal(
    <div
      ref={boxRef}
      id={id}
      role="tooltip"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={position ?? { top: 0, left: 0, visibility: 'hidden' }}
      className="fixed z-[60] rounded-sm border border-line bg-panel px-2 py-1 text-xs leading-4 whitespace-nowrap text-ink"
    >
      {text}
    </div>,
    document.body,
  )
}
