import { useId } from 'react'
import {
  SAMPLE_FAMILY_LABELS,
  SAMPLE_TYPE_LABELS,
  SAMPLE_TYPES,
  sampleFamily,
  type SampleFamily,
} from '../../lib/audit'
import { summarizeStore } from '../../lib/summarizeStore'
import {
  FLOW_FILTER_LABELS,
  OUTCOME_FILTERS,
  type BurnFilter,
  type FlowFilter,
  type OutcomeFilter,
  type SampleFilter,
  type TestFilters,
} from '../../lib/testWall'
import { Segmented } from '../Segmented'

const ALL = 'all'
const O2_STEP = 0.1
const SELECT =
  'h-8 min-w-0 cursor-pointer rounded-sm border border-line bg-graphite px-2 text-sm text-ink hover:border-muted'

type FilterStripProps = {
  filters: TestFilters
  pis: string[]
  domain: { min: number; max: number }
  /** Whether the AI-read outcomes are loaded: the outcome filter shows only then. */
  outcomes?: boolean
}

/** Sample types grouped by family; a family with several types also gets an "All …" option. */
function sampleGroups() {
  const families = new Map<SampleFamily, typeof SAMPLE_TYPES>()
  for (const type of SAMPLE_TYPES) {
    const family = sampleFamily(type)
    families.set(family, [...(families.get(family) ?? []), type])
  }
  return [...families]
}

/** Short names for the outcome filter's options (the tile key spells them out). */
const OUTCOME_FILTER_LABELS: Record<OutcomeFilter, string> = {
  sustained: 'Sustained',
  brief: 'Brief',
  'no-ignition': 'No ignition',
  'not-stated': 'Not stated',
}

/** The filters under the stage: PI, sample type, flow direction, initial O2 range, burn confirmed, and the AI-read outcome. */
export function FilterStrip({ filters, pis, domain, outcomes = false }: FilterStripProps) {
  const piId = useId()
  const sampleId = useId()
  const o2Id = useId()
  const o2 = filters.o2 ?? domain
  const set = summarizeStore.setFilters

  function setO2(min: number, max: number) {
    const lo = Math.min(min, max)
    const hi = Math.max(min, max)
    set({ o2: lo <= domain.min && hi >= domain.max ? null : { min: lo, max: hi } })
  }

  return (
    <div data-lab-target="summarize.filters" className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={piId} className="mb-1 text-sm leading-5 text-muted">
          PI
        </label>
        <select
          id={piId}
          value={filters.pi ?? ALL}
          onChange={(event) => set({ pi: event.target.value === ALL ? null : event.target.value })}
          className={`${SELECT} w-36`}
        >
          <option value={ALL}>All PIs</option>
          {pis.map((pi) => (
            <option key={pi} value={pi}>
              {pi}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={sampleId} className="mb-1 text-sm leading-5 text-muted">
          Sample type
        </label>
        <select
          id={sampleId}
          value={filters.sample ?? ALL}
          onChange={(event) =>
            set({ sample: event.target.value === ALL ? null : (event.target.value as SampleFilter) })
          }
          className={`${SELECT} w-52`}
        >
          <option value={ALL}>All sample types</option>
          {sampleGroups().map(([family, types]) => (
            <optgroup key={family} label={SAMPLE_FAMILY_LABELS[family]}>
              {types.length > 1 && <option value={`family:${family}`}>All {SAMPLE_FAMILY_LABELS[family]}</option>}
              {types.map((type) => (
                <option key={type} value={type}>
                  {SAMPLE_TYPE_LABELS[type]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <Segmented<FlowFilter | typeof ALL>
        label="Flow direction"
        value={filters.flow ?? ALL}
        options={[
          { value: ALL, label: 'All' },
          ...(Object.keys(FLOW_FILTER_LABELS) as FlowFilter[]).map((flow) => ({
            value: flow,
            label: FLOW_FILTER_LABELS[flow],
          })),
        ]}
        onChange={(flow) => set({ flow: flow === ALL ? null : flow })}
      />

      <fieldset className="flex w-48 flex-col gap-1">
        <legend className="mb-1 flex w-full items-baseline justify-between gap-2 text-sm leading-5">
          <span className="text-muted">Initial O2</span>
          <output htmlFor={`${o2Id}-lo ${o2Id}-hi`} className="num">
            {o2.min.toFixed(1)}–{o2.max.toFixed(1)}%
          </output>
        </legend>
        <div className="relative h-8">
          <input
            id={`${o2Id}-lo`}
            type="range"
            aria-label="Lowest initial O2"
            min={domain.min}
            max={domain.max}
            step={O2_STEP}
            value={o2.min}
            onChange={(event) => setO2(Number(event.target.value), o2.max)}
            className="slider range-thumbs-only absolute inset-x-0 top-1 w-full"
          />
          <input
            id={`${o2Id}-hi`}
            type="range"
            aria-label="Highest initial O2"
            min={domain.min}
            max={domain.max}
            step={O2_STEP}
            value={o2.max}
            onChange={(event) => setO2(o2.min, Number(event.target.value))}
            className="slider range-thumbs-only absolute inset-x-0 top-1 w-full"
          />
        </div>
      </fieldset>

      <Segmented<BurnFilter | typeof ALL>
        label="Burn confirmed by sensors"
        value={filters.burn ?? ALL}
        options={[
          { value: ALL, label: 'All' },
          { value: 'confirmed', label: 'Confirmed' },
          { value: 'not-confirmed', label: 'Not confirmed' },
        ]}
        onChange={(burn) => set({ burn: burn === ALL ? null : burn })}
      />

      {/* Only once the outcome reader's file exists: what NASA's notes say, beside what the sensors say. */}
      {outcomes && (
        <Segmented<OutcomeFilter | typeof ALL>
          label="Outcome (AI-read)"
          value={filters.outcome ?? ALL}
          options={[{ value: ALL, label: 'All' }, ...OUTCOME_FILTERS.map((outcome) => ({ value: outcome, label: OUTCOME_FILTER_LABELS[outcome] }))]}
          onChange={(outcome) => set({ outcome: outcome === ALL ? null : outcome })}
        />
      )}
    </div>
  )
}
