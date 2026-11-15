import { describe, expect, it } from 'vitest'
import {
  DRAIN,
  drainInstantly,
  drainO2At,
  earthMarginPts,
  flowFromSlider,
  ignite,
  initialTwin,
  isPulsing,
  orbitModel,
  reset,
  resultPts,
  setFlow,
  setO2,
  setRod,
  sliderFromFlow,
  startDrain,
  tickDrain,
  type TwinState,
} from './burnTwin'
import { EQ61_MINIMUM, o2LimitPct } from './physics'

const within = (actual: number | null, expected: number, tolerance = 0.01) => {
  expect(actual).not.toBeNull()
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(tolerance)
}

/** Runs a whole drain in steps of `stepMs`, as the animation loop would. */
function runDrain(start: TwinState, stepMs: number): TwinState {
  let state = startDrain(start)
  for (let guard = 0; state.drain.phase === 'running' && guard < 100_000; guard++) {
    state = tickDrain(state, stepMs)
  }
  return state
}

describe('defaults', () => {
  it('starts with both flames lit at 17.0 %, U = 2 cm/s, the 6.35 mm rod', () => {
    const state = initialTwin()
    expect(state).toMatchObject({ o2Pct: 17, flowCmS: 2, rodMm: 6.35 })
    expect(state.earth.lit).toBe(true)
    expect(state.orbit.lit).toBe(true)
    expect(state.drain.phase).toBe('idle')
    expect(reset()).toEqual(state)
  })
})

describe('Drain oxygen (SPEC F1 acceptance)', () => {
  // The answer must not depend on the frame rate: 144 fps, 60 fps, a slow laptop, one big step.
  it.each([6.94, 16.67, 50, 333, DRAIN.durationMs])(
    'stops the Earth flame at 15.40 and the orbit flame at 13.61 with %s ms steps',
    (stepMs) => {
      const end = runDrain(initialTwin(), stepMs)
      within(end.earth.outAtPct, 15.4)
      within(end.orbit.outAtPct, 13.61)
      expect(end.earth.lit).toBe(false)
      expect(end.orbit.lit).toBe(false)
      expect(end.drain.phase).toBe('done')
      expect(end.o2Pct).toBe(13)
    },
  )

  it('gives the result 1.79 points, computed from the two limits', () => {
    const end = runDrain(initialTwin(), 16.67)
    within(resultPts(end), 1.789, 0.001)
    expect(resultPts(end)!.toFixed(2)).toBe('1.79')
  })

  it('has no result until both flames are out', () => {
    let state = startDrain(initialTwin())
    expect(resultPts(state)).toBeNull()
    state = tickDrain(state, 5_000) // 15.0 %: Earth out, orbit still lit
    expect(state.earth.lit).toBe(false)
    expect(state.orbit.lit).toBe(true)
    expect(resultPts(state)).toBeNull()
  })

  it('falls linearly from 17.0 % to 13.0 % over 10 s', () => {
    expect(drainO2At(0)).toBe(17)
    expect(drainO2At(5_000)).toBe(15)
    expect(drainO2At(10_000)).toBe(13)
    expect(drainO2At(99_000)).toBe(13)
  })

  it('puts each flame out the moment O2 passes its limit, not before', () => {
    let state = startDrain(initialTwin())
    state = tickDrain(state, 3_990) // 15.404 %
    expect(state.earth.lit).toBe(true)
    state = tickDrain(state, 20) // 15.396 %
    expect(state.earth.lit).toBe(false)
    expect(state.orbit.lit).toBe(true)
  })

  it('relights both flames at 17.0 % and keeps the flow and rod', () => {
    const drained = runDrain(setRod(setFlow(initialTwin(), 5), 9.525), 100)
    const again = startDrain(drained)
    expect(again).toMatchObject({ o2Pct: 17, flowCmS: 5, rodMm: 9.525 })
    expect(again.earth).toEqual({ lit: true, outAtPct: null, refusal: null })
    expect(again.orbit).toEqual({ lit: true, outAtPct: null, refusal: null })
  })

  it('is the same end state in one step (reduced motion)', () => {
    const instant = drainInstantly(initialTwin())
    const stepped = runDrain(initialTwin(), 16.67)
    within(instant.earth.outAtPct, stepped.earth.outAtPct!, 1e-9)
    within(instant.orbit.outAtPct, stepped.orbit.outAtPct!, 1e-9)
    expect(instant.drain.phase).toBe('done')
  })

  it('stops when the O2 slider is moved', () => {
    const running = tickDrain(startDrain(initialTwin()), 1_000)
    const moved = setO2(running, 20)
    expect(moved.drain.phase).toBe('idle')
    expect(moved.o2Pct).toBe(20)
    expect(tickDrain(moved, 1_000)).toBe(moved)
  })

  it('reports the orbit flame going out first at very low flow', () => {
    // At U = 0.4 cm/s the Eq. 6.1 limit is above the 1g limit of 15.4 %.
    const end = runDrain(setFlow(initialTwin(), 0.4), 16.67)
    expect(o2LimitPct(0.4, 6.35)).toBeGreaterThan(15.4)
    expect(resultPts(end)!).toBeLessThan(0)
  })

  it('does not light the orbit flame when its limit is above 17.0 %', () => {
    const start = startDrain(setFlow(initialTwin(), 0.2))
    expect(o2LimitPct(0.2, 6.35)).toBeGreaterThan(17)
    expect(start.orbit).toEqual({ lit: false, outAtPct: null, refusal: 'below-limit' })
    expect(resultPts(runDrain(setFlow(initialTwin(), 0.2), 100))).toBeNull()
  })
})

describe('the 1.1 Hz pulse (SPEC F1 acceptance)', () => {
  const limit = o2LimitPct(2, 6.35)

  it('shows on the quenching branch within 0.15 points of the limit', () => {
    expect(orbitModel(limit + 0.1, 2, 6.35).nearQuench).toBe(true)
    expect(isPulsing(setO2(initialTwin(), limit + 0.1))).toBe(true)
  })

  it('does not show 0.15 points or more above the limit', () => {
    expect(orbitModel(limit + 0.15, 2, 6.35).nearQuench).toBe(false)
    expect(orbitModel(limit + 2, 2, 6.35).nearQuench).toBe(false)
  })

  it('does not show on the blowoff branch (a above 10.38)', () => {
    const blowoff = orbitModel(o2LimitPct(20, 6.35) + 0.1, 20, 6.35)
    expect(blowoff.a).toBeGreaterThan(EQ61_MINIMUM.a)
    expect(blowoff.branch).toBe('blowoff')
    expect(blowoff.nearQuench).toBe(false)
  })

  it('does not show once the flame is out', () => {
    const out = setO2(initialTwin(), limit - 0.05)
    expect(out.orbit.lit).toBe(false)
    expect(isPulsing(out)).toBe(false)
    expect(isPulsing(setO2(out, limit + 0.1))).toBe(false)
  })
})

describe('Ignite', () => {
  it("won't light the orbit rod below about 14.5 % O2", () => {
    const out = setO2(initialTwin(), 13)
    const tried = ignite(setO2(out, 14.4))
    expect(tried.orbit.lit).toBe(false)
    expect(tried.orbit.refusal).toBe('below-ignition')
  })

  it('lights the orbit rod at 14.5 % and above, where the Earth flame stays out', () => {
    const tried = ignite(setO2(setO2(initialTwin(), 13), 14.6))
    expect(tried.orbit.lit).toBe(true)
    expect(tried.orbit.outAtPct).toBeNull()
    expect(tried.earth.lit).toBe(false)
    expect(tried.earth.refusal).toBe('below-limit')
  })

  it('lets a flame lit higher survive below the ignition limit', () => {
    const state = setO2(initialTwin(), 13.8)
    expect(state.orbit.lit).toBe(true)
  })

  it("won't light the orbit rod below its Eq. 6.1 limit even above 14.5 %", () => {
    const lowFlow = setFlow(setO2(initialTwin(), 15), 0.3) // limit about 16.4 %
    expect(lowFlow.orbit.lit).toBe(false)
    expect(ignite(lowFlow).orbit.refusal).toBe('below-limit')
  })

  it('leaves lit flames alone and clears a refusal when O2 moves', () => {
    const start = initialTwin()
    expect(ignite(start)).toEqual(start)
    const refused = ignite(setO2(start, 13))
    expect(setO2(refused, 13.5).orbit.refusal).toBeNull()
    expect(setO2(refused, 13.5).earth.refusal).toBeNull()
  })

  it('does not relight a flame just because O2 comes back up', () => {
    const back = setO2(setO2(initialTwin(), 13), 21)
    expect(back.earth.lit).toBe(false)
    expect(back.orbit.lit).toBe(false)
    expect(ignite(back).earth.lit).toBe(true)
    expect(ignite(back).orbit.lit).toBe(true)
  })
})

describe('going out', () => {
  it('records the limit when O2 falls through it', () => {
    const state = setO2(initialTwin(), 14)
    within(state.earth.outAtPct, 15.4, 1e-9)
    expect(state.orbit.lit).toBe(true)
    expect(earthMarginPts(14)).toBeCloseTo(-1.4)
  })

  it('records the current O2 when the limit rises past it (a flow change)', () => {
    const state = setFlow(setO2(initialTwin(), 14), 0.5) // limit 15.28 %
    expect(state.orbit.lit).toBe(false)
    expect(state.orbit.outAtPct).toBe(14)
  })

  it('keeps O2 and flow inside their slider ranges', () => {
    expect(setO2(initialTwin(), 99).o2Pct).toBe(23)
    expect(setO2(initialTwin(), 0).o2Pct).toBe(12)
    expect(setFlow(initialTwin(), 99).flowCmS).toBe(40)
    expect(setFlow(initialTwin(), 0).flowCmS).toBe(0.2)
  })
})

describe('the log flow slider', () => {
  it('runs from 0.2 to 40 cm/s', () => {
    expect(flowFromSlider(0)).toBe(0.2)
    expect(flowFromSlider(1)).toBe(40)
  })

  it('lands on 2.00 cm/s at the position for 2 cm/s, to the nearest of 1000 steps', () => {
    const step = Math.round(sliderFromFlow(2) * 1000)
    expect(flowFromSlider(step / 1000)).toBe(2)
  })

  it('round-trips to three significant figures', () => {
    for (const flow of [0.2, 0.5, 1, 4, 20, 40]) {
      expect(flowFromSlider(sliderFromFlow(flow))).toBeCloseTo(flow, 2)
    }
  })
})
