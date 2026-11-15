import { memo, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { isQuarantined, type Bass2Row } from '../../lib/audit'
import { moveInWall, o2FillColor, tileLabel, type WallColumn } from '../../lib/testWall'
import { flyBack, STILL } from './flight'
import { TestTile } from './TestTile'
import { wallHover } from './wallHover'

type TestWallProps = {
  columns: WallColumn[]
  quarantine: boolean
  /** Test ids matched by the filters. */
  matched: ReadonlySet<string>
  domain: { min: number; max: number }
  /** Each quarantined test's place in the bay, for the stagger. */
  bayOrder: ReadonlyMap<string, number>
  onOpen: (testId: string) => void
  /** Shown under the first, shorter PI columns (the mini-record), filling the space beside the tall ones. */
  pocket?: ReactNode
}

/** How many PI columns, from the left, the pocket sits under. */
const POCKET_COLUMNS = 3

/** An empty slot where a quarantined tile was, so the wall keeps its shape and nothing else moves. */
function EmptySlot() {
  return <div aria-hidden="true" className="size-9 border border-dashed border-line @min-[1300px]/stage:size-10" />
}

/**
 * The test wall: one column per PI, three tiles across, ordered by date. One tab stop: arrow keys
 * step through the tiles (CLAUDE.md interaction 8), Enter opens a tile's record. With quarantine
 * on, quarantined tiles leave an empty slot and fly to the bay.
 */
export const TestWall = memo(function TestWall({
  columns,
  quarantine,
  matched,
  domain,
  bayOrder,
  onOpen,
  pocket,
}: TestWallProps) {
  const tiles = useRef(new Map<string, HTMLButtonElement>())
  const inBay = (row: Bass2Row) => quarantine && isQuarantined(row)
  const grid = useMemo(
    () => columns.map((column) => column.rows.map((row) => (quarantine && isQuarantined(row) ? null : row.testId))),
    [columns, quarantine],
  )
  const first = grid.flat().find((id) => id !== null) ?? null
  const [active, setActive] = useState<string | null>(null)
  const activeId = active !== null && grid.some((column) => column.includes(active)) ? active : first

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, testId: string) {
    const next = moveInWall(grid, testId, event.key)
    if (next === null) return
    event.preventDefault()
    setActive(next)
    tiles.current.get(next)?.focus()
  }

  function renderColumn(column: WallColumn) {
    return (
      <section
        key={column.pi}
        aria-label={`${column.pi}, ${column.rows.length} tests`}
        className="flex w-[116px] flex-col gap-2 @min-[1300px]/stage:w-32"
      >
        <h3 className="flex items-baseline justify-between gap-2 text-xs leading-4">
          <span className="truncate">{column.pi}</span>
          <span className="text-muted tabular-nums">{column.rows.length}</span>
        </h3>
        <div className="grid grid-cols-3 gap-1">
          {column.rows.map((row) =>
            inBay(row) ? (
              <EmptySlot key={row.testId} />
            ) : (
              <TestTile
                key={row.testId}
                row={row}
                fill={o2FillColor(row.o2InitPct, domain)}
                dimmed={!matched.has(row.testId)}
                flight={bayOrder.has(row.testId) ? flyBack(bayOrder.get(row.testId) ?? 0) : STILL}
                layoutKey={quarantine}
                label={tileLabel(row)}
                tabIndex={row.testId === activeId ? 0 : -1}
                buttonRef={(element) => {
                  if (element) tiles.current.set(row.testId, element)
                  else tiles.current.delete(row.testId)
                }}
                onClick={() => onOpen(row.testId)}
                onFocus={() => {
                  setActive(row.testId)
                  wallHover.set(row.testId)
                }}
                onPointerEnter={() => wallHover.set(row.testId)}
                onKeyDown={(event) => onKeyDown(event, row.testId)}
              />
            ),
          )}
        </div>
      </section>
    )
  }

  return (
    <div
      role="group"
      aria-label="Test wall: every BASS-II test, in columns by PI and ordered by date. Arrow keys step through the tiles; Enter opens a test's record."
      className="flex items-start gap-4 @min-[1300px]/stage:gap-6"
      onPointerLeave={() => wallHover.set(null)}
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-4 @min-[1300px]/stage:gap-6">{columns.slice(0, POCKET_COLUMNS).map(renderColumn)}</div>
        {/* w-0 min-w-full: the pocket takes the columns' width and never widens them. */}
        {pocket && <div className="w-0 min-w-full">{pocket}</div>}
      </div>
      {columns.slice(POCKET_COLUMNS).map(renderColumn)}
    </div>
  )
})
