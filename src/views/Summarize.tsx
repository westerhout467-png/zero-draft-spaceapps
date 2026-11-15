import { LayoutGroup, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Note } from '../components/Note'
import { CheckedAgainstNasa } from '../components/summarize/CheckedAgainstNasa'
import { DistributionStrip } from '../components/summarize/DistributionStrip'
import { Investigations } from '../components/summarize/Investigations'
import { RecordInconsistencies } from '../components/summarize/RecordInconsistencies'
import { FilterStrip } from '../components/summarize/FilterStrip'
import { ENTRY_FLIGHT_DELAY_MS, landedAt } from '../components/summarize/flight'
import { QuarantineBay } from '../components/summarize/QuarantineBay'
import { RecordDrawer } from '../components/summarize/RecordDrawer'
import { SummaryHeader } from '../components/summarize/SummaryHeader'
import { TestWall } from '../components/summarize/TestWall'
import { TestBrief, WallLegend } from '../components/summarize/WallKey'
import {
  forensicClaimId,
  isQuarantined,
  o2Forensic,
  type AuditFile,
  type Bass2File,
  type O2Forensic,
} from '../lib/audit'
import { useAuditData } from '../lib/bass2Data'
import { getClaim } from '../lib/claims'
import type { ViewProps } from '../lib/route'
import { summarizeStore, useSummarize } from '../lib/summarizeStore'
import {
  bayGroups,
  bayRows,
  linkFromParams,
  matchesFilters,
  o2Domain,
  wallColumns,
} from '../lib/testWall'
import { useOutcomeFindings, useOutcomeKinds } from '../lib/useOutcome'

/** #/summarize : F2 telemetry explorer. Reads ?audit=, ?pi=, ?flow=, ?sample=, ?burn=, ?outcome=, ?quarantine=on and ?test=. */
export function Summarize({ params }: ViewProps) {
  const data = useAuditData()
  return (
    <>
      <h1 className="sr-only">Summarize</h1>
      {data.status === 'loading' && <Note className="p-6">Loading NASA’s test table…</Note>}
      {data.status === 'error' && <p className="p-6 text-sm text-red">Couldn’t load the test table: {data.message}</p>}
      {data.status === 'ready' && <Explorer bass2={data.bass2} audit={data.audit} params={params} />}
    </>
  )
}

function Explorer({ bass2, audit, params }: { bass2: Bass2File; audit: AuditFile; params: ViewProps['params'] }) {
  const rows = bass2.rows
  const filters = useSummarize((state) => state.filters)
  const quarantineOn = useSummarize((state) => state.quarantine)
  const reduceMotion = useReducedMotion() ?? false
  // The quarantine the wall and bay show. Arriving with quarantine already on, the tiles start in
  // the wall and fly to the bay once the view is in (the F2 signature motion, and the video's
  // "click Quarantined" beat). Under reduced motion they are in the bay at once.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setEntered(true), ENTRY_FLIGHT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])
  const quarantine = quarantineOn && (entered || reduceMotion)
  const recordId = useSummarize((state) => state.recordId)
  const mathId = useSummarize((state) => state.mathId)

  const wall = useMemo(() => {
    const columns = wallColumns(rows)
    const bay = bayRows(columns)
    const forensics = new Map<string, O2Forensic>()
    for (const row of bay) {
      const claim = getClaim(forensicClaimId(row.testId))
      if (row.flags.includes('o2-impossible') && claim?.verified && claim.quote) {
        forensics.set(row.testId, o2Forensic(row, claim.quote))
      }
    }
    // The bay, grouped by cause; tiles fly in group by group, so the first group lands first.
    const groups = bayGroups(columns, (testId) => forensics.get(testId))
    const flightOrder = groups.flatMap((group) => group.rows)
    return {
      columns,
      groups,
      bayOrder: new Map(flightOrder.map((row, order) => [row.testId, order])),
      /** The first test with forensics: its math opens by itself once the tiles land. */
      firstMathId: flightOrder.find((row) => forensics.has(row.testId))?.testId ?? null,
      lastFlight: Math.max(0, flightOrder.length - 1),
      byId: new Map(rows.map((row) => [row.testId, row])),
      domain: o2Domain(rows),
      forensics,
      pis: columns.map((column) => column.pi),
    }
  }, [rows])

  const outcomeKinds = useOutcomeKinds()
  const findings = useOutcomeFindings(rows)
  const shown = useMemo(() => rows.filter((row) => matchesFilters(row, filters, outcomeKinds)), [rows, filters, outcomeKinds])
  const matched = useMemo(() => new Set(shown.map((row) => row.testId)), [shown])

  // Deep links (#/summarize?test=P22b) and links from the audit bar.
  const paramKey = new URLSearchParams(params).toString()
  useEffect(() => {
    const link = linkFromParams(Object.fromEntries(new URLSearchParams(paramKey)))
    if (Object.keys(link).length === 0) return
    summarizeStore.applyLink(link, (testId) => {
      const row = wall.byId.get(testId)
      return row ? isQuarantined(row) : undefined
    })
  }, [paramKey, wall])

  // When quarantine turns on (or the view opens with it on), open the first forensic line once
  // the last tile has landed; at once under reduced motion. Not if a deep link already chose one,
  // and not again after someone hides it.
  useEffect(() => {
    const first = wall.firstMathId
    if (!quarantine || first === null || summarizeStore.get().mathId !== null) return
    const delayMs = reduceMotion ? 0 : landedAt(wall.lastFlight) * 1000
    const timer = window.setTimeout(() => {
      const state = summarizeStore.get()
      if (state.quarantine && state.mathId === null) summarizeStore.openMath(first)
    }, delayMs)
    return () => window.clearTimeout(timer)
  }, [quarantine, wall, reduceMotion])

  const openRecord = useCallback((testId: string) => summarizeStore.openRecord(testId), [])
  const closeRecord = useCallback(() => {
    const testId = summarizeStore.get().recordId
    summarizeStore.closeRecord()
    if (testId) document.querySelector<HTMLElement>(`[data-test-id="${CSS.escape(testId)}"]`)?.focus()
  }, [])

  const record = recordId ? (wall.byId.get(recordId) ?? null) : null

  return (
    <>
      {/* At least one screen tall: stacked under the wall (the Lab Partner dock open), the bay and
          an open "Show the math" make it taller, and it grows instead of running into what's below. */}
      <div className="flex min-h-[max(100%,46rem)] flex-col">
        <SummaryHeader
          audit={audit}
          filters={filters}
          shown={shown.length}
          shownBurning={shown.filter((row) => row.burnConfirmed).length}
          findings={findings}
        />
        <LayoutGroup>
          {/* A container: tiles shrink below a 1300px stage, and below 1100px (the Lab Partner dock
              open) the bay moves under the wall. */}
          <section aria-label="Test wall and quarantine bay" className="@container/stage flex flex-1 flex-col bg-window">
            <div className="flex flex-1 @max-[1100px]/stage:flex-col">
              <div className="flex min-w-0 shrink-0 flex-col gap-3 px-6 py-3">
                <div className="flex h-6 items-baseline gap-3 whitespace-nowrap">
                  <h2 className="text-sm leading-5 font-semibold">Test wall</h2>
                  <p className="text-xs text-muted">Each column in flight order, earliest first.</p>
                </div>
                <TestWall
                  columns={wall.columns}
                  quarantine={quarantine}
                  matched={matched}
                  domain={wall.domain}
                  bayOrder={wall.bayOrder}
                  onOpen={openRecord}
                  pocket={
                    <TestBrief
                      byId={wall.byId}
                      defaultId={audit.lowestBurningO2?.testId ?? null}
                      defaultCaption="Lowest O2 with confirmed burning"
                    />
                  }
                />
                {/* w-0 min-w-full: the key wraps to the wall's width instead of widening the column. */}
                <div className="mt-auto w-0 min-w-full">
                  <WallLegend domain={wall.domain} />
                </div>
              </div>
              <div
                aria-hidden="true"
                className="my-3 w-px shrink-0 bg-line @max-[1100px]/stage:mx-6 @max-[1100px]/stage:my-0 @max-[1100px]/stage:h-px @max-[1100px]/stage:w-auto"
              />
              {/* The wall sets the stage's height; the bay fills it and scrolls inside (absolute, so an
                  open "Show the math" never stretches the stage). Stacked, it takes its own height. */}
              <div className="relative min-w-64 flex-1 @max-[1100px]/stage:static">
                <div className="absolute inset-0 flex flex-col px-6 py-3 @max-[1100px]/stage:static">
                  <QuarantineBay
                    groups={wall.groups}
                    order={wall.bayOrder}
                    quarantine={quarantine}
                    switchOn={quarantineOn}
                    onQuarantine={summarizeStore.setQuarantine}
                    matched={matched}
                    domain={wall.domain}
                    forensics={wall.forensics}
                    mathId={mathId}
                    onToggleMath={summarizeStore.toggleMath}
                    onOpen={openRecord}
                  />
                </div>
              </div>
            </div>
          </section>
        </LayoutGroup>
        <div className="shrink-0 border-t border-line px-6 py-3">
          <FilterStrip filters={filters} pis={wall.pis} domain={wall.domain} outcomes={outcomeKinds !== undefined} />
        </div>
      </div>

      <div className="flex flex-col gap-10 px-6 pt-8 pb-12">
        <section aria-labelledby="distribution-heading" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="distribution-heading" className="text-base leading-6 font-semibold">
              Distributions of the tests shown
            </h2>
            <p className="text-xs text-muted">Quarantined tests are left out: their O2 is unusable</p>
          </div>
          <DistributionStrip rows={shown} />
        </section>
        <CheckedAgainstNasa rows={rows} findings={findings} />
        <Investigations />
        <RecordInconsistencies />
      </div>

      <RecordDrawer
        row={record}
        total={rows.length}
        flow={record ? bass2.flowEvidence[record.testId] : undefined}
        forensic={record ? wall.forensics.get(record.testId) : undefined}
        onClose={closeRecord}
      />
    </>
  )
}
