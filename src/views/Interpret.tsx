import { useEffect } from 'react'
import { AlarmLog } from '../components/interpret/AlarmLog'
import { IncidentCard, PresetNotes, SuppressionCard } from '../components/interpret/Cards'
import { Chamber } from '../components/interpret/Chamber'
import { NasaChecks } from '../components/interpret/NasaChecks'
import { PresetRow } from '../components/interpret/PresetRow'
import { Readouts } from '../components/interpret/Readouts'
import { RefusalBanner } from '../components/interpret/RefusalBanner'
import { SimInputs } from '../components/interpret/SimInputs'
import { StripCharts } from '../components/interpret/StripCharts'
import { TimeControls } from '../components/interpret/TimeControls'
import { stateAt } from '../lib/interpret'
import { interpretStore, useSim } from '../lib/interpretStore'
import type { ViewProps } from '../lib/route'

/** The charts' plot insets, shared with the scrubber so it sits exactly under the time axis. */
const PLOT_LEFT = 52
const PLOT_RIGHT_PAD = 12

/**
 * #/interpret : F4 cabin fire, toxicity and suppression simulator. Reads ?preset= (m5, us-lab,
 * small-cabin, n2, lunar). The state lives in lib/interpretStore, so the URL, these controls and
 * Lab Partner (M6) all drive it through the same plain actions.
 *
 * One pure black stage in the Overview's language. The first screen holds the presets, the
 * chamber, the charts, the readouts, the alarm log and the time controls; the inputs scroll in
 * the right column. The cards and the NASA checks sit below.
 */
export function Interpret({ params }: ViewProps) {
  const preset = params.preset
  useEffect(() => {
    if (preset) interpretStore.loadPreset(preset)
  }, [preset])

  return (
    // The root is exactly one screen tall, so the first screen can fill it; what is below overflows
    // into the view's own scroll.
    <div className="h-full">
      <h1 className="sr-only">Interpret</h1>
      <div className="flex h-full min-h-[44rem] flex-col gap-4 bg-window px-6 pt-5 pb-4">
        <PresetRow />
        <div className="grid min-h-0 flex-1 grid-cols-[18.5rem_minmax(0,1fr)_21rem] grid-rows-[minmax(0,1fr)_auto] gap-x-6 gap-y-3">
          <Chamber />
          <StripCharts>
            <RefusalBanner />
          </StripCharts>
          <aside aria-label="Readouts, alarm log and inputs" className="row-span-2 flex min-h-0 flex-col gap-5">
            <Readouts />
            <AlarmLog onShowSuppression={showSuppression} />
            <div data-lab-target="interpret.inputs" className="-mr-3 min-h-0 flex-1 overflow-y-auto border-t border-line pt-4 pr-3">
              <h2 className="sr-only">Inputs</h2>
              <SimInputs />
            </div>
          </aside>
          <TimeControls plotLeft={PLOT_LEFT} plotRightPad={PLOT_RIGHT_PAD} />
        </div>
      </div>
      <BelowTheFold />
    </div>
  )
}

/** Scrolls to the suppression card and moves focus to it. */
function showSuppression() {
  const card = document.getElementById('keep-suppressing')
  if (!card) return
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  card.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' })
  card.focus({ preventScroll: true })
}

function BelowTheFold() {
  const presetId = useSim((state) => state.presetId)
  // The suppression card appears when the model puts the flame out, not before.
  const out = useSim((state) => stateAt(state.run, state.tSec).flame === 'out-limit')
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-12 bg-window px-6 pt-10 pb-16">
      <div className="flex flex-col gap-8">
        {presetId === 'm5' && <IncidentCard />}
        {out && <SuppressionCard />}
        <PresetNotes />
      </div>
      <NasaChecks />
    </div>
  )
}
