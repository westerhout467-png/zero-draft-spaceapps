import { motion, type Transition } from 'motion/react'
import type { Ref } from 'react'
import { severityOf, type Bass2Row } from '../../lib/audit'
import { OUTCOME_LABELS } from '../../lib/generatedData'
import { useOutcome } from '../../lib/useOutcome'
import { FlowGlyph, OutcomeGlyph, StatusGlyph } from './glyphs'

/** A tile the filters don't match stays in place, dimmed to this. */
const DIMMED_OPACITY = 0.18
/** Filter changes fade the dimming in 200 ms (an interaction, CLAUDE.md interaction 1). */
const DIM_FADE = { duration: 0.2, ease: 'easeOut' } as const

/** The faint red glow of a quarantined tile. A shadow, so it never takes a click. */
const QUARANTINE_GLOW = '0 0 10px 1px rgb(239 68 68 / 0.45), 0 0 0 1px rgb(239 68 68 / 0.35)'

type TestTileProps = {
  row: Bass2Row
  /** Initial O2 on the cyan scale. */
  fill: string
  /** Not matched by the filters: dimmed in place. */
  dimmed: boolean
  /** The flight between wall and bay (motion's shared layout), for this tile's destination. */
  flight: Transition
  /** Changes when the quarantine toggles: the only time a tile measures for a flight. */
  layoutKey: boolean
  label: string
  tabIndex?: number
  buttonRef?: Ref<HTMLButtonElement>
  onClick: () => void
  onFocus?: () => void
  onPointerEnter?: () => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void
}

/**
 * One test: a small square, its id in mono, its fill only from data (initial O2). Corner marks
 * give its flow direction (bottom left), its most serious flag (top right) and, once the outcome
 * reader has run, what NASA's notes say the flame did (bottom right). The same tile, by its
 * layoutId, flies between the wall and the quarantine bay.
 */
export function TestTile({
  row,
  fill,
  dimmed,
  flight,
  layoutKey,
  label,
  tabIndex,
  buttonRef,
  onClick,
  onFocus,
  onPointerEnter,
  onKeyDown,
}: TestTileProps) {
  const severity = severityOf(row.flags)
  const outcome = useOutcome(row.testId)
  // What the mark shows, in words, for a screen reader: the outcome, or why there isn't one.
  const outcomeWords = outcome && `outcome from NASA’s notes: ${(outcome.reason ?? OUTCOME_LABELS[outcome.outcome]).toLowerCase()}`
  return (
    <motion.button
      ref={buttonRef}
      type="button"
      layoutId={`tile-${row.testId}`}
      layoutDependency={layoutKey}
      // Motion owns the opacity: a shared-layout flight writes it inline, so a CSS class for the
      // filter dimming would be overridden after the first flight.
      initial={false}
      animate={{ opacity: dimmed ? DIMMED_OPACITY : 1 }}
      transition={{ ...flight, opacity: DIM_FADE }}
      tabIndex={tabIndex}
      aria-label={outcomeWords ? `${label}, ${outcomeWords}` : label}
      data-test-id={row.testId}
      onClick={onClick}
      onFocus={onFocus}
      onPointerEnter={onPointerEnter}
      onKeyDown={onKeyDown}
      style={{ backgroundColor: fill, boxShadow: severity === 'quarantined' ? QUARANTINE_GLOW : 'none' }}
      className={`test-id relative grid size-9 shrink-0 @min-[1300px]/stage:size-10 cursor-pointer place-items-center text-xs leading-none text-ink after:pointer-events-none after:absolute after:inset-0 after:border after:border-transparent hover:after:border-ink/70 ${
        severity === 'quarantined' ? 'z-10' : ''
      }`}
    >
      {row.testId}
      <StatusGlyph severity={severity} className="absolute top-1 right-1" />
      <FlowGlyph flow={row.flowConfig} className="absolute bottom-1 left-1 text-ink/70" />
      {outcome && <OutcomeGlyph outcome={outcome.outcome} className="absolute right-1 bottom-[3px] text-ink/80" />}
    </motion.button>
  )
}
