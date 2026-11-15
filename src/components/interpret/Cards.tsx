import type { ReactNode } from 'react'
import { MSG_N2_FLOW_CC_MIN, MSG_VOLUME_M3, SMAC_1_HOUR_PPM, SMAC_LONG_TERM_PPM, volumeWhereCoReaches, dilutionTimeMin } from '../../lib/cabin'
import { getClaim } from '../../lib/claims'
import { firstTime, logEntries, M5_POWER_W, M5_TEST, simTime } from '../../lib/interpret'
import { useSim } from '../../lib/interpretStore'
import { o2LimitPct } from '../../lib/physics'
import { Cite } from '../Cite'

const n = (value: ReactNode) => <span className="tabular-nums">{value}</span>

/** NASA's own words, verbatim, in Source Serif 4. Unverified quotes never show (CLAUDE.md rule 3). */
export function NasaQuote({ id }: { id: string }) {
  const claim = getClaim(id)
  if (!claim?.verified || !claim.quote) return null
  return (
    <blockquote className="border-l-2 border-line pl-3 font-serif text-base leading-6 text-ink">
      “{claim.quote}”
      <Cite id={id} />
    </blockquote>
  )
}

/** A text section below the console: a heading and NASA's words, no frame (frames are for instruments). */
function Card({ id, title, children, appear = false }: { id?: string; title: string; children: ReactNode; appear?: boolean }) {
  return (
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      aria-labelledby={id ? `${id}-title` : undefined}
      aria-label={id ? undefined : title}
      className={`flex flex-col gap-4 ${appear ? 'appear origin-top-left' : ''}`}
    >
      <h2 id={id ? `${id}-title` : undefined} className="text-base leading-6 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Test M5's incident (SPEC F4): ignited out of contact, the window damage, the repairs. */
export function IncidentCard() {
  return (
    <Card title="What happened in Test M5">
      <p className="text-sm leading-6 text-muted">It was lit while the crew was out of contact with the ground.</p>
      <NasaQuote id="bass2.note.m5-los" />
      <p className="text-sm leading-6 text-muted">The long burn damaged the glovebox window.</p>
      <NasaQuote id="bass2.m5.window" />
      <NasaQuote id="bass2.m5.leak-repaired" />
      <NasaQuote id="bass2.m5.door-repair" />
    </Card>
  )
}

/** Shown once the model puts a flame out (SPEC F4, N2 preset): the report's advice on suppression. */
export function SuppressionCard() {
  return (
    <Card id="keep-suppressing" title="Keep suppressing until it cools" appear>
      <p className="text-sm leading-6 text-muted">Hot PMMA keeps making vapor bubbles after the flame is gone.</p>
      <NasaQuote id="bass2.vapor-jet" />
      <NasaQuote id="bass2.suppress-until-cool" />
    </Card>
  )
}

/** Plain-text notes for the small-cabin and N2 presets, computed from the model. */
export function PresetNotes() {
  const presetId = useSim((state) => state.presetId)
  const inputs = useSim((state) => state.inputs)
  const run = useSim((state) => state.run)

  if (presetId === 'small-cabin') {
    const fire = { powerW: M5_POWER_W, durationMin: M5_TEST.minutes }
    const v = (limit: number, geometry: 'opposed-slab' | 'concurrent-rod') =>
      n(volumeWhereCoReaches(limit, { ...fire, geometry }).toFixed(1))
    return (
      <section aria-label="About this preset" className="flex flex-col gap-2 text-sm leading-6">
        <h2 className="text-base leading-6 font-semibold">Where the same fire crosses each limit</h2>
        <p>
          The 1-hour limit ({n(SMAC_1_HOUR_PPM)} ppm) is crossed below about {v(SMAC_1_HOUR_PPM, 'opposed-slab')} m³ for opposed
          slabs and {v(SMAC_1_HOUR_PPM, 'concurrent-rod')} m³ for concurrent rods. The long-term limit ({n(SMAC_LONG_TERM_PPM)} ppm)
          below about {v(SMAC_LONG_TERM_PPM, 'opposed-slab')} and {v(SMAC_LONG_TERM_PPM, 'concurrent-rod')} m³{' '}
          <Cite id="cabin.volume-limit" />.
        </p>
        <p className="text-muted">Assumes a sealed, well-mixed volume at 1 atm, with no scrubbing and the same fire.</p>
      </section>
    )
  }

  if (presetId === 'n2' && run[0].valid && inputs.geometry === 'concurrent-rod') {
    const limit = o2LimitPct(inputs.flowCmS ?? 2, inputs.rodMm ?? 6.35)
    const alone = inputs.n2FlowCcMin > 0 ? dilutionTimeMin(inputs.o2InitPct, limit, inputs.volumeM3, inputs.n2FlowCcMin) / 60 : null
    const out = firstTime(logEntries(run), 'extinguished')
    return (
      <section aria-label="About this preset" className="flex flex-col gap-2 text-sm leading-6">
        <h2 className="text-base leading-6 font-semibold">How long dilution takes</h2>
        {alone !== null && (
          <p>
            N2 alone would take about {n(alone.toFixed(1))} h to bring O2 down to the limit
            <Cite id="cabin.dilution-time" />. The fire’s own O2 use shortens that:{' '}
            {out === null ? 'in this run the flame doesn’t go out.' : <>in this run the flame goes out at {n(simTime(out))}.</>}
          </p>
        )}
        <p className="text-muted">
          NASA’s on-orbit N2 flow was {n(MSG_N2_FLOW_CC_MIN)} cm³/min into the {n(MSG_VOLUME_M3)} m³ glovebox
          <Cite id="bass2.cstr.n2-flow" />.
        </p>
      </section>
    )
  }
  return null
}
