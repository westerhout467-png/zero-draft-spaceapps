import { motion, type Transition } from 'motion/react'
import { useId, useRef, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { citePreview, getClaim } from '../../lib/claims'
import {
  COMPONENT_CLAIMS,
  COMPONENT_LABELS,
  componentShares,
  INDEX_KEYS,
  MIN_BURN_CONFIRMED,
  type IndexKey,
  type RiskEntity,
  type Scores,
  type Weights,
} from '../../lib/risk'
import { useCitation } from '../citationContext'
import { useFootnoteNumber } from '../footnoteContext'
import { useHoverPreview } from '../useHoverPreview'
import { BarPreview } from './BarPreview'
import { SEGMENT_STYLE } from './segments'

/** Room kept at the right of every bar for a "Not measured" slot, so all rows share one 0–100 scale. */
export const SLOT_ROOM = '7rem'
/** The gap between segments, px. It is cut from the segment's fill, so lengths stay exact. */
const GAP_PX = 2

/** Sentences the hover adds, worked out from the data by the view. Null hides one. */
export type FingerprintNotes = { coYield: ReactNode | null }

export type FingerprintCell = { row: number; col: number }

type FingerprintProps = {
  entity: RiskEntity
  scores: Scores
  weights: Weights
  index: number
  row: number
  /** The one segment on the leaderboard that is in the tab order (roving tabindex). */
  active: FingerprintCell
  onActivate: (cell: FingerprintCell) => void
  onArrow: (event: KeyboardEvent, cell: FingerprintCell) => void
  notes: FingerprintNotes
  move: Transition
}

/**
 * A row's risk fingerprint: one horizontal bar whose length is the index on a 0–100 scale shared
 * by every row, cut into one segment per component. A segment's length is the points it adds,
 * wᵢcᵢ ÷ Σwᵢ × 100, so the segments add up exactly to the index. On a weight change they resize
 * while the rows slide. A missing component is a short dashed slot labelled "Not measured".
 * Each segment is its component's citation: hover or focus previews it, click opens the source.
 */
export function Fingerprint(props: FingerprintProps) {
  const { entity, scores, weights, row } = props
  const shares = componentShares(scores, weights)
  const lastFilled = [...INDEX_KEYS].reverse().find((key) => (shares[key] ?? 0) > 0)
  return (
    <div
      role="group"
      aria-label={`Index ${props.index.toFixed(1)} of 100 for ${entity.label}, by component`}
      className="relative flex h-6 items-center"
      style={{ width: `calc(100% - ${SLOT_ROOM})` }}
    >
      {/* Where 100 is, so lengths read against the same scale on every row. */}
      <span aria-hidden="true" className="absolute inset-y-0 right-0 w-px bg-line" />
      {INDEX_KEYS.map((key, col) =>
        entity.components[key] ? (
          <Segment
            key={key}
            {...props}
            component={key}
            share={shares[key] ?? 0}
            score={scores[key]}
            last={key === lastFilled}
            cell={{ row, col }}
          />
        ) : (
          <Segment key={key} {...props} component={key} share={0} score={undefined} last={false} cell={{ row, col }} />
        ),
      )}
    </div>
  )
}

type SegmentProps = FingerprintProps & {
  component: IndexKey
  share: number
  score: number | undefined
  last: boolean
  cell: FingerprintCell
}

function Segment({ component, entity, share, score, last, index, weights, cell, active, onActivate, onArrow, notes, move }: SegmentProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const claimId = COMPONENT_CLAIMS[component]
  const claim = getClaim(claimId)
  const number = useFootnoteNumber(claim?.verified ? claimId : null, ref)
  const { openCitation } = useCitation()
  const preview = useHoverPreview()
  const previewId = useId()
  const measured = entity.components[component]
  const label = COMPONENT_LABELS[component]
  const style = SEGMENT_STYLE[component]
  const spoken = measured
    ? `${label}: ${valueWords(component, entity)}, score ${score?.toFixed(2)}, adds ${share.toFixed(1)} points`
    : `${label}: not measured`

  const shared = {
    'data-fingerprint': `${cell.row}-${cell.col}`,
    tabIndex: active.row === cell.row && active.col === cell.col ? 0 : -1,
    'aria-label': `${spoken}. Footnote ${number ?? ''}, show source`,
    'aria-describedby': preview.open ? previewId : undefined,
    'aria-haspopup': 'dialog' as const,
    onClick: () => {
      preview.hide(true)
      openCitation(claimId)
    },
    ...preview.triggerProps,
    onFocus: (event: FocusEvent<HTMLElement>) => {
      onActivate(cell)
      preview.triggerProps.onFocus(event)
    },
    onKeyDown: (event: KeyboardEvent) => {
      preview.triggerProps.onKeyDown(event)
      onArrow(event, cell)
    },
  }

  return (
    <>
      {measured ? (
        <motion.button
          ref={ref}
          type="button"
          {...shared}
          // A size container, so the name inside shows only when the segment is wide enough.
          className="@container relative h-6 shrink-0 cursor-pointer focus-visible:outline-offset-1"
          initial={false}
          animate={{ width: `${share}%` }}
          transition={move}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0"
            style={{ right: last ? 0 : GAP_PX, background: style.fill }}
          />
          <span
            aria-hidden="true"
            className={`absolute inset-y-0 left-2 flex items-center text-xs leading-4 whitespace-nowrap ${style.text} ${style.fit}`}
          >
            {label}
          </span>
        </motion.button>
      ) : (
        <button
          ref={ref}
          type="button"
          {...shared}
          className="ml-1 flex h-6 w-24 shrink-0 cursor-pointer items-center justify-center border border-dashed border-muted/70 text-xs leading-4 text-muted"
        >
          Not measured
        </button>
      )}
      {preview.open && (
        <BarPreview id={previewId} anchor={ref} {...preview.previewProps}>
          <p className="font-semibold">
            {label}
            {number !== undefined && <sup className="ml-0.5 font-semibold text-cyan">{number}</sup>}
          </p>
          {measured && score !== undefined ? (
            <>
              <p className="tabular-nums">{valueLine(component, entity)}</p>
              <p className="text-muted tabular-nums">
                Score {score.toFixed(2)} of 1, weight {weights[component].toFixed(2)}: adds {share.toFixed(1)} of its{' '}
                {index.toFixed(1)} index points
              </p>
              {component === 'coYield' && notes.coYield && <p className="text-muted">{notes.coYield}</p>}
            </>
          ) : (
            <p>Not measured: {missingReason()}</p>
          )}
          {claim && <p className="text-muted">{citePreview(claim)}. Click or press Enter for the source.</p>}
        </BarPreview>
      )}
    </>
  )
}

/** The measured value and the n tests behind it, in a line of the hover. */
function valueLine(component: IndexKey, entity: RiskEntity): ReactNode {
  const measured = entity.components[component]
  if (!measured) return null
  if (component === 'lowO2') {
    return (
      <>
        Lowest final O2 {measured.value.toFixed(1)}% (<span className="test-id">{measured.testId}</span>), over{' '}
        {measured.n} burn-confirmed tests
      </>
    )
  }
  return (
    <>
      Median {measured.value.toFixed(1)} ppm CO per 1% CO2, over {measured.n} burn-confirmed tests
    </>
  )
}

/** The same, for screen readers, without markup. */
function valueWords(component: IndexKey, entity: RiskEntity): string {
  const measured = entity.components[component]
  if (!measured) return 'not measured'
  if (component === 'lowO2') return `lowest final O2 ${measured.value.toFixed(1)}% in test ${measured.testId}, ${measured.n} tests`
  return `median ${measured.value.toFixed(1)} ppm CO per 1% CO2, ${measured.n} tests`
}

function missingReason(): string {
  return `fewer than ${MIN_BURN_CONFIRMED} burn-confirmed tests.`
}
