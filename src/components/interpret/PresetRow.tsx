import { RotateCcw } from 'lucide-react'
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { CO_PPM_PER_PCT_CO2, US_LAB_VOLUME_M3 } from '../../lib/cabin'
import { getClaim } from '../../lib/claims'
import { LUNAR_ATMOSPHERE, M5_POWER_W, M5_TEST, N2_PRESET, PRESET_IDS, PRESETS, type PresetId } from '../../lib/interpret'
import { interpretStore, useSim } from '../../lib/interpretStore'
import { formatHash } from '../../lib/route'
import { Cite } from '../Cite'

const n = (value: ReactNode) => <span className="tabular-nums">{value}</span>

/** One line under the presets: what this one is, in a sentence, with its sources. */
const CAPTIONS: Record<PresetId, () => ReactNode> = {
  m5: () => (
    <>
      Replay: Test M5’s own fire, {n(M5_POWER_W.toFixed(2))} W for {n(M5_TEST.minutes)} min, from its O2 drop in the MSG
      <Cite id="cabin.m5-power" />. A consistency check, not proof: the {n(CO_PPM_PER_PCT_CO2['opposed-slab'])} ppm average has large
      scatter
      <Cite id="bass2.co.scatter" />.
    </>
  ),
  'us-lab': () => (
    <>
      The same fire, diluted into the US Lab’s {n(US_LAB_VOLUME_M3)} m³{' '}
      <Cite id="bass2.us-lab-volume" />. The report puts a BASS-II-scale fire there at about{' '}
      {n(getClaim('bass2.co.smac')?.value)} ppm CO
      <Cite id="bass2.co.smac" />.
    </>
  ),
  'small-cabin': () => (
    <>The same fire in a small sealed cabin. Assumes sealed, well mixed, no scrubbing, 1 atm, the same fire.</>
  ),
  n2: () => (
    <>
      BASS-II used N2 dilution to set test oxygen levels, not to fight fires
      <Cite id="bass2.cstr.hours" />. Here it starts from {n(N2_PRESET.o2InitPct)}% O2, as NASA’s dilution calibration did
      <Cite id="bass2.cstr.c0" />, with a small rod fire burning.
    </>
  ),
  lunar: () => (
    <>
      Atmosphere of interest for the lunar lander and rover: {n(LUNAR_ATMOSPHERE.o2Pct)}% O2 at {n(LUNAR_ATMOSPHERE.psia)} psia{' '}
      <Cite id="zayac.atmospheres" />.
    </>
  ),
}

/** Opens a preset and puts it in the address, so the URL always says what is loaded. */
function choose(id: PresetId) {
  interpretStore.loadPreset(id)
  const hash = formatHash('interpret', { preset: id })
  if (window.location.hash !== hash) window.location.hash = hash
}

/**
 * The five presets (SPEC F4), as a row of buttons; arrow keys move along it. Choosing one again
 * starts it over. Once an input is changed, "Edited" and a reset button appear beside the row.
 */
export function PresetRow() {
  const presetId = useSim((state) => state.presetId)
  const edited = useSim((state) => state.edited)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    buttons.current[(index + step + PRESET_IDS.length) % PRESET_IDS.length]?.focus()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Presets" className="flex flex-wrap gap-2">
          {PRESET_IDS.map((id, index) => (
            <button
              key={id}
              data-lab-target={`interpret.preset.${id}`}
              ref={(button) => void (buttons.current[index] = button)}
              type="button"
              aria-pressed={id === presetId}
              onClick={() => choose(id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`h-8 rounded-sm border px-3 text-sm whitespace-nowrap transition-transform duration-150 ease-out active:scale-[0.97] ${
                id === presetId ? 'border-cyan text-ink' : 'border-line text-muted hover:border-muted hover:text-ink'
              }`}
            >
              {PRESETS[id].label}
            </button>
          ))}
        </div>
        {edited && (
          <p className="flex items-center gap-3 text-sm text-muted">
            Edited
            <button
              type="button"
              onClick={() => interpretStore.reset()}
              className="flex items-center gap-1.5 text-ink hover:text-cyan"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Back to the preset
            </button>
          </p>
        )}
      </div>
      <p className="text-sm leading-5 text-muted">{CAPTIONS[presetId]()}</p>
    </div>
  )
}
