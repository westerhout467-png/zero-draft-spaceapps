import { useMemo } from 'react'
import { Note } from '../components/Note'
import type { FingerprintNotes } from '../components/rank/Fingerprint'
import { FlammabilityMap } from '../components/rank/FlammabilityMap'
import { IgnitionRace } from '../components/rank/IgnitionRace'
import { InvestigationRelevance } from '../components/rank/InvestigationRelevance'
import { Leaderboard } from '../components/rank/Leaderboard'
import { NotRanked } from '../components/rank/NotRanked'
import type { SliderNotes } from '../components/rank/WeightSliders'
import type { Bass2Row } from '../lib/audit'
import { useAuditData } from '../lib/bass2Data'
import { rodRug } from '../lib/rankCharts'
import { useWeights } from '../lib/rankStore'
import {
  burnCountRange,
  familyFlows,
  leaderboard,
  lowestInitialO2,
  riskEntities,
  unrankedGroups,
  type RiskEntity,
  type UnrankedGroup,
} from '../lib/risk'

/** #/rank : F3 Orbital Risk Index, flammability map, ignition race, investigation relevance (F3d). */
export function Rank() {
  const data = useAuditData()
  return (
    <div className="min-h-full bg-window">
      <h1 className="sr-only">Rank</h1>
      {data.status === 'loading' && <Note className="p-6">Loading NASA’s test table…</Note>}
      {data.status === 'error' && <p className="p-6 text-sm text-red">Couldn’t load the test table: {data.message}</p>}
      {data.status === 'ready' && <RankStage rows={data.bass2.rows} />}
    </div>
  )
}

/**
 * One pure black stage, in the Overview's language: no cards, borders or shadows. The first
 * screen holds the leaderboard, its sliders and what isn't ranked; the map and the race sit below.
 */
function RankStage({ rows }: { rows: Bass2Row[] }) {
  const entities = useMemo(() => riskEntities(rows), [rows])
  const groups = useMemo(() => unrankedGroups(entities, rows), [entities, rows])
  const rug = useMemo(() => rodRug(rows), [rows])
  const notes = useMemo(() => fingerprintNotes(entities), [entities])
  const sliderNotes = useMemo(() => ({ lowO2: lowO2Note(rows, entities), coYield: notes.coYield }), [rows, entities, notes])

  return (
    <div className="@container/rank flex flex-col gap-16 px-6 pt-6 pb-16">
      <RiskIndex entities={entities} groups={groups} notes={notes} sliderNotes={sliderNotes} />
      <div className="grid gap-16 @min-[1100px]/rank:grid-cols-2 @min-[1100px]/rank:gap-12">
        <FlammabilityMap rug={rug} />
        <IgnitionRace />
      </div>
      <InvestigationRelevance rows={rows} />
    </div>
  )
}

/**
 * The leaderboard and what isn't ranked: the only part of the view that hears about the weights,
 * so a weight change never re-renders the map or the race.
 */
function RiskIndex({
  entities,
  groups,
  notes,
  sliderNotes,
}: {
  entities: RiskEntity[]
  groups: UnrankedGroup[]
  notes: FingerprintNotes
  sliderNotes: SliderNotes
}) {
  const weights = useWeights()
  const board = useMemo(() => leaderboard(entities, weights), [entities, weights])
  return (
    <div className="grid gap-12 @min-[1000px]/rank:grid-cols-[minmax(0,1fr)_19rem]">
      <Leaderboard board={board} weights={weights} notes={notes} sliderNotes={sliderNotes} />
      <NotRanked groups={groups} unscored={board.unscored} />
    </div>
  )
}

/**
 * Under the low-O2 slider: what was tested bounds what could be seen burning. From bass2.json:
 * the lowest starting O2 of any usable slab and rod test, and how many burn-confirmed tests each
 * ranked type had (a lowest value can only drop as tests are added).
 */
function lowO2Note(rows: Bass2Row[], entities: RiskEntity[]): string | null {
  const slab = lowestInitialO2(rows, 'slab')
  const rod = lowestInitialO2(rows, 'rod')
  const slabN = burnCountRange(entities, 'slab')
  const rodN = burnCountRange(entities, 'rod')
  if (slab === null || rod === null || !slabN || !rodN) return null
  const range = ({ min, max }: { min: number; max: number }) => (min === max ? `${min}` : `${min} to ${max}`)
  return (
    `Also reflects what was tested: slab tests never started below ${slab.toFixed(1)}% O2; rod tests started as ` +
    `low as ${rod.toFixed(1)}%. And how often: rods had ${range(rodN)} burn-confirmed tests each, slabs ` +
    `${range(slabN)}, and a lowest value only drops as tests are added.`
  )
}

/** The sentence the CO-yield hover and slider add, only if the data bears it out. */
function fingerprintNotes(entities: RiskEntity[]): FingerprintNotes {
  const slabFlows = familyFlows(entities, 'slab')
  const rodFlows = familyFlows(entities, 'rod')
  return {
    coYield:
      slabFlows.length === 1 && slabFlows[0] === 'Opposed' && rodFlows.length > 1
        ? 'Also reflects flow direction: slabs were only tested in opposed flow; rods mix flow directions.'
        : null,
  }
}
