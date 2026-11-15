import { RotateCcw } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { rankStore } from '../../lib/rankStore'
import {
  COMPONENT_CLAIMS,
  COMPONENT_LABELS,
  INDEX_KEYS,
  isEqualWeights,
  WEIGHT_MAX,
  WEIGHT_STEP,
  type IndexKey,
  type Weights,
} from '../../lib/risk'
import { Cite } from '../Cite'
import { SEGMENT_STYLE } from './segments'

const HINTS: Record<IndexKey, ReactNode> = {
  lowO2: 'Lowest O2 where BASS-II saw it burn',
  coYield: 'Median ppm CO per 1% CO2',
}

/**
 * The two weight sliders. Each takes effect at once and the leaderboard reorders (CLAUDE.md
 * interaction 13). At least one weight always stays above 0 (risk.setWeight), so the last one
 * up stops at its first step. Each label has a swatch in its segment's color.
 */
/** What each component also reflects besides the sample type, worked out from the data by the view. */
export type SliderNotes = Partial<Record<IndexKey, ReactNode | null>>

export function WeightSliders({ weights, notes }: { weights: Weights; notes: SliderNotes }) {
  return (
    <div className="flex items-start gap-8">
      <div className="grid flex-1 grid-cols-2 gap-8">
        {INDEX_KEYS.map((key) => (
          <WeightSlider key={key} component={key} weight={weights[key]} note={notes[key] ?? null} />
        ))}
      </div>
      <button
        type="button"
        disabled={isEqualWeights(weights)}
        onClick={rankStore.reset}
        className="mt-5 flex h-8 shrink-0 items-center gap-2 rounded-sm border border-line px-3 text-sm whitespace-nowrap transition-transform duration-150 ease-out hover:border-muted active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        Equal weights
      </button>
    </div>
  )
}

function WeightSlider({ component, weight, note }: { component: IndexKey; weight: number; note: ReactNode | null }) {
  const id = useId()
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-sm leading-5 whitespace-nowrap">
        <span className="flex items-baseline">
          <span
            aria-hidden="true"
            className="mr-2 inline-block size-2.5 shrink-0 self-center"
            style={{ background: SEGMENT_STYLE[component].fill }}
          />
          <label htmlFor={id} className="text-ink">
            {COMPONENT_LABELS[component]}
          </label>
          <Cite id={COMPONENT_CLAIMS[component]} />
        </span>
        <output htmlFor={id} className="num text-muted">
          {weight.toFixed(2)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={WEIGHT_MAX}
        step={WEIGHT_STEP}
        value={weight}
        aria-valuetext={`Weight ${weight.toFixed(2)}`}
        onChange={(event) => rankStore.setWeight(component, Number(event.currentTarget.value))}
        className="slider mt-1 block w-full"
      />
      <p className="text-xs leading-4 text-muted">{HINTS[component]}</p>
      {note && <p className="mt-1 text-xs leading-4 text-muted tabular-nums">{note}</p>}
    </div>
  )
}
