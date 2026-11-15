import { X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import type { Bass2Row, CheckedFlowEvidence, O2Forensic } from '../../lib/audit'
import { FootnoteScope } from '../FootnoteScope'
import { RecordDetails } from './RecordDetails'

const SLIDE_MS = 220
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

type RecordDrawerProps = {
  row: Bass2Row | null
  total: number
  flow: CheckedFlowEvidence | undefined
  forensic: O2Forensic | undefined
  onClose: () => void
}

/**
 * A test's full record (F2): every field with the raw CSV cell behind it, its flags, burn check,
 * flow direction with NASA's Appendix A row, and its sources. Slides in like the citation drawer
 * and sits under it, so its footnotes open the citation drawer on top. Focus moves in and is
 * trapped; Esc, Close or a click outside closes it.
 */
export function RecordDrawer({ row, total, flow, forensic, onClose }: RecordDrawerProps) {
  const reduceMotion = useReducedMotion()
  const panelRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const open = row !== null

  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [open, row?.testId])

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (items.length === 0) return
    const index = items.indexOf(document.activeElement as HTMLElement)
    const last = items.length - 1
    const next = event.shiftKey ? (index <= 0 ? last : null) : index === -1 || index === last ? 0 : null
    if (next !== null) {
      event.preventDefault()
      items[next].focus()
    }
  }

  const duration = reduceMotion ? 0 : SLIDE_MS / 1000
  return (
    <AnimatePresence>
      {row && (
        <div className="fixed inset-0 z-40" onKeyDown={onKeyDown}>
          <motion.div
            className="absolute inset-0 bg-graphite/60"
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration }}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            className="absolute inset-y-0 right-0 flex w-[36rem] max-w-full flex-col gap-6 overflow-y-auto border-l border-line bg-panel p-6"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration, ease: 'easeOut' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-base leading-6 font-semibold">
                  Test <span className="test-id">{row.testId}</span>
                </h2>
                <p className="text-sm text-muted">
                  {row.pi}, <span className="tabular-nums">{row.date}</span>, CSV row{' '}
                  <span className="tabular-nums">{row.rowIndex}</span> of <span className="tabular-nums">{total}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex shrink-0 items-center gap-2 text-sm text-muted hover:text-ink"
              >
                <X aria-hidden="true" className="size-4" />
                Close
              </button>
            </div>
            <FootnoteScope>
              <RecordDetails key={row.testId} row={row} flow={flow} forensic={forensic} />
            </FootnoteScope>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}
