import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useRef, useState, type KeyboardEvent } from 'react'
import type { Leaderboard as Board } from '../../lib/risk'
import { INDEX_KEYS, type Weights } from '../../lib/risk'
import { Cite } from '../Cite'
import { Fingerprint, SLOT_ROOM, type FingerprintCell, type FingerprintNotes } from './Fingerprint'
import { useReorder } from './reorder'
import { RiskHeadline } from './RiskHeadline'
import { WeightSliders, type SliderNotes } from './WeightSliders'

/** Every row is this tall, so the still rank numerals line up with the rows sliding past them. */
const ROW_H = 'h-13'
/** Name, index, then the bar filling the rest: the same columns for the rows and the scale above them. */
const ROW_GRID = 'grid grid-cols-[minmax(0,15rem)_6rem_minmax(0,1fr)] items-center gap-x-8'

type LeaderboardProps = {
  board: Board
  weights: Weights
  notes: FingerprintNotes
  /** Shown under each slider's caption: what else the component reflects. */
  sliderNotes: SliderNotes
}

/**
 * F3a: the Orbital Risk Index leaderboard. The rank numerals stand still in their own column;
 * when a weight changes, the rows slide past them to their new places and the bars' segments
 * resize (the signature motion). Nothing else moves. Arrow keys step through the segments, up and
 * down the rows and across the components.
 */
export function Leaderboard({ board, weights, notes, sliderNotes }: LeaderboardProps) {
  const { move, fade } = useReorder()
  const listRef = useRef<HTMLOListElement>(null)
  const [active, setActive] = useState<FingerprintCell>({ row: 0, col: 0 })
  const rows = board.rows

  const onArrow = useCallback(
    (event: KeyboardEvent, cell: FingerprintCell) => {
      const step: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      }
      const delta = step[event.key]
      if (!delta) return
      event.preventDefault()
      const row = Math.min(rows.length - 1, Math.max(0, cell.row + delta[0]))
      const col = Math.min(INDEX_KEYS.length - 1, Math.max(0, cell.col + delta[1]))
      listRef.current?.querySelector<HTMLElement>(`[data-fingerprint="${row}-${col}"]`)?.focus()
    },
    [rows.length],
  )

  // A row that leaves (no longer scored) can take the tab stop with it; fall back to the top.
  const tabCell = active.row < rows.length ? active : { row: 0, col: active.col }

  return (
    <section aria-labelledby="risk-heading" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="risk-heading" className="text-xl leading-7 font-semibold">
          Orbital Risk Index
          <Cite id="rank.index" />
        </h2>
        <p className="text-sm leading-5 text-muted">
          ZERO-DRAFT Orbital Risk Index: our composite of measured BASS-II indicators. Not a NASA rating.
        </p>
        <p className="text-sm leading-5 text-muted">
          Index = 100 × Σ w<sub>i</sub>c<sub>i</sub> ÷ Σ w<sub>i</sub>, over low-O2 burning and CO yield. Each score
          c<sub>i</sub> runs from 0 to 1 across the ranked types: 1 for the lowest O2 or the highest CO yield.
        </p>
        <p className="text-sm leading-5 text-muted">
          Ignition time isn’t in the index: a rod’s t<sub>s</sub> comes from its diameter alone
          <Cite id="rank.solid-time" />, the same on Earth as in orbit. The ignition race below shows it.
        </p>
      </div>

      <RiskHeadline board={board} weights={weights} />

      <WeightSliders weights={weights} notes={sliderNotes} />

      {/* The shared scale every bar is drawn on. */}
      <div aria-hidden="true" className={`${ROW_GRID} -mb-2 pl-[4.5rem] text-xs leading-4 text-muted`}>
        <span />
        <span className="text-right">Index</span>
        <span className="num flex justify-between" style={{ width: `calc(100% - ${SLOT_ROOM})` }}>
          <span>0</span>
          <span>100</span>
        </span>
      </div>

      <div className="flex gap-2">
        {/* The rank numerals: still, while the rows slide past. The list itself says the rank. */}
        <div aria-hidden="true" className="flex w-16 shrink-0 flex-col">
          {rows.map((row, i) => (
            <span
              key={i}
              className={`num flex ${ROW_H} items-center text-[2.5rem] leading-none ${i === 0 ? 'text-ink' : 'text-muted'}`}
            >
              {row.rank}
            </span>
          ))}
        </div>
        <ol ref={listRef} aria-label="Sample types, highest index first" className="relative min-w-0 flex-1">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((row, i) => {
              return (
                <motion.li
                  key={row.entity.id}
                  data-lab-target={`rank.row.${row.entity.id}`}
                  layout="position"
                  transition={{ layout: move, opacity: fade }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`${ROW_GRID} ${ROW_H}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-base leading-6">
                      <span className="sr-only">Rank {row.rank}: </span>
                      {row.entity.label}
                    </p>
                    <p className="text-xs leading-4 text-muted tabular-nums">
                      {row.entity.tests} tests, {row.entity.burnConfirmed} burn confirmed
                    </p>
                  </div>
                  <p className="num text-right text-[2rem] leading-none">
                    <span className="sr-only">Index </span>
                    {row.index.toFixed(1)}
                  </p>
                  <Fingerprint
                    entity={row.entity}
                    scores={row.scores}
                    weights={weights}
                    index={row.index}
                    row={i}
                    active={tabCell}
                    onActivate={setActive}
                    onArrow={onArrow}
                    notes={notes}
                    move={move}
                  />
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ol>
      </div>
    </section>
  )
}
