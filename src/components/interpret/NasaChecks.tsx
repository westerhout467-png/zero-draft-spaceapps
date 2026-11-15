import { useMemo, type ReactNode } from 'react'
import { CO_SENSOR_CEILING_PPM, coFromCo2RisePpm, dilutionTimeMin, MSG_N2_FLOW_CC_MIN, MSG_VOLUME_M3, simulateCabin } from '../../lib/cabin'
import { useAuditData } from '../../lib/bass2Data'
import { N2_PRESET, PRESETS, M5_TEST } from '../../lib/interpret'
import { o2LimitPct } from '../../lib/physics'
import { Cite } from '../Cite'
import { NasaQuote } from './Cards'

const n = (value: ReactNode) => <span className="tabular-nums">{value}</span>
/** Blowoff side of Eq. 6.1 at 20 cm/s, for the dilution check (SPEC F4). */
const BLOWOFF_FLOW_CM_S = 20

/**
 * "Checked against NASA" (SPEC F4): the simulator's numbers beside what NASA reported. Every model
 * value is recomputed here from cabin.ts; M5's measured CO2 and its CO cell come from the raw CSV.
 */
export function NasaChecks() {
  const data = useAuditData()
  const m5Row = data.status === 'ready' ? data.bass2.rows.find((row) => row.testId === 'M5') : undefined

  const model = useMemo(() => {
    const last = (inputs: (typeof PRESETS)['m5']['inputs']) => {
      const run = simulateCabin(inputs)
      return run[run.length - 1]
    }
    const m5 = last(PRESETS.m5.inputs)
    const usLab = last(PRESETS['us-lab'].inputs)
    const limit = o2LimitPct(BLOWOFF_FLOW_CM_S, N2_PRESET.rodMm)
    const dilution = dilutionTimeMin(N2_PRESET.o2InitPct, limit, MSG_VOLUME_M3, MSG_N2_FLOW_CC_MIN)
    return { m5, usLab, limit, dilution }
  }, [])

  const measuredRise = m5Row?.dCo2Pct ?? null
  // The replay starts from what the MSG held before M5, so the fire's own CO is the end minus that.
  const m5Start = PRESETS.m5.inputs
  const ppm = (value: number) => n(Math.round(value).toLocaleString('en-US'))
  const rows: { check: ReactNode; model: ReactNode; nasa: ReactNode }[] = [
    {
      check: (
        <>
          Dilution time with N2 only (no fire), {n(N2_PRESET.o2InitPct)}%
          <Cite id="bass2.cstr.c0" /> to the blowoff limit at {n(BLOWOFF_FLOW_CM_S)} cm/s (
          {n(model.limit.toFixed(2))}%)
          <Cite id="twin.orbit-limit" />
        </>
      ),
      model: (
        <>
          {n(model.dilution.toFixed(0))} min ({n((model.dilution / 60).toFixed(1))} h)
          <Cite id="cabin.dilution-time" />
        </>
      ),
      nasa: <NasaQuote id="bass2.cstr.hours" />,
    },
    {
      check: (
        <>
          Test <span className="test-id">M5</span> O2, {n(M5_TEST.o2InitPct)}% to {n(M5_TEST.o2FinalPct.toFixed(1))}%
        </>
      ),
      model: (
        <>
          {n(model.m5.o2Pct.toFixed(1))}% <span className="text-muted">(replay, by construction)</span>
        </>
      ),
      nasa: (
        <span className="flex flex-col gap-1">
          <span className="text-xs text-muted">Table 5.1, row M5</span>
          <NasaQuote id="bass2.m5.row" />
        </span>
      ),
    },
    {
      check: (
        <>
          Test <span className="test-id">M5</span> CO
        </>
      ),
      model: (
        <span className="flex flex-col gap-1">
          <span>
            {ppm(model.m5.coPpm)} ppm: the {n(m5Start.coInitPpm)} ppm already in the MSG
            <Cite id="bass2.table.a4-m5" />, plus {ppm(model.m5.coPpm - m5Start.coInitPpm)} from the stoichiometric CO2 rise (
            {n((model.m5.co2Pct - m5Start.co2InitPct).toFixed(2))}%)
            <Cite id="cabin.model" />
          </span>
          {measuredRise !== null && m5Row && (
            <span>
              or {ppm(m5Start.coInitPpm + coFromCo2RisePpm(measuredRise, 'opposed-slab'))} ppm with the measured rise (
              {n(measuredRise.toFixed(2))}%, CSV {n(m5Row.co2InitPct)} to {n(m5Row.co2FinalPct)})
            </span>
          )}
        </span>
      ),
      nasa: (
        <span className="flex flex-col gap-2">
          {m5Row && (
            <span className="text-sm leading-6">
              The CSV’s final CO cell reads <span className="tabular-nums">{m5Row.raw['Final CO (ppm)']}</span>, as does its row in Table A.4
              <Cite id="bass2.table.a4-m5" />. The report text:
            </span>
          )}
          <NasaQuote id="bass2.co.over-range" />
          <span className="text-sm leading-6 text-muted">Both fit about {n(CO_SENSOR_CEILING_PPM.toLocaleString('en-US'))} ppm.</span>
        </span>
      ),
    },
    {
      check: <>The biggest test diluted into the US Lab</>,
      model: <>≈ {n(model.usLab.coPpm.toFixed(1))} ppm</>,
      nasa: <NasaQuote id="bass2.co.smac" />,
    },
  ]

  return (
    <section aria-labelledby="interpret-checks" className="flex flex-col gap-3">
      <h2 id="interpret-checks" className="text-base leading-6 font-semibold">
        Checked against NASA
      </h2>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="w-[30%] pr-6 pb-2 font-normal">Check</th>
            <th className="w-[28%] pr-6 pb-2 font-normal">Model</th>
            <th className="pb-2 font-normal">NASA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-line align-top">
              <td className="py-3 pr-6 leading-6">{row.check}</td>
              <td className="py-3 pr-6 leading-6">{row.model}</td>
              <td className="py-3">{row.nasa}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.status === 'error' && <p className="text-sm text-red">Couldn’t load the test table: {data.message}</p>}
    </section>
  )
}
