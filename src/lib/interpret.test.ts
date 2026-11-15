// INTERPRET's presets, driven through the store the view and Lab Partner use (SPEC F4, §8.2).
// Every number is within 0.5 % of SPEC §8.2, like cabin.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { dilutionTimeMin, MSG_N2_FLOW_CC_MIN, MSG_VOLUME_M3, type CabinState } from './cabin'
import {
  clock,
  coDomain,
  endSec,
  firstTime,
  logEntries,
  M5_POWER_W,
  niceCeil,
  o2Domain,
  passedCount,
  PRESET_IDS,
  PRESETS,
  psia,
  replayPresetFor,
  simTime,
  stateAt,
  ticks,
  timeTickMinutes,
  volumeMarks,
} from './interpret'
import { interpretStore } from './interpretStore'
import { o2LimitPct } from './physics'
import { formatHash, parseHash } from './route'

const within = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThanOrEqual(0.005)

/** Plays the loaded preset to its end at 60 frames a second, the way the view's loop does. */
function playToEnd(): CabinState {
  interpretStore.play()
  for (let frame = 0; frame < 1_000_000 && interpretStore.get().playing; frame++) {
    interpretStore.tick(1000 / 60)
  }
  return now()
}

/** The model state the readouts show now. */
function now(): CabinState {
  const { run, tSec } = interpretStore.get()
  return stateAt(run, tSec)
}

const loggedKinds = () => {
  const { run, tSec } = interpretStore.get()
  const entries = logEntries(run)
  return entries.slice(0, passedCount(entries, tSec)).map((entry) => entry.kind)
}

beforeEach(() => {
  interpretStore.loadPreset('m5')
})

describe('Replay Test M5 (SPEC F4)', () => {
  it('opens in the MSG at 22.2 % O2 with 83.48 W for 27.2 min, paused at T+00:00', () => {
    const { inputs, playing, tSec } = interpretStore.get()
    expect(inputs.volumeM3).toBe(MSG_VOLUME_M3)
    expect(inputs.o2InitPct).toBe(22.2)
    // What the MSG held before M5, from its Table A.4 row: 0.44 % CO2 and 9 ppm CO.
    expect(inputs.co2InitPct).toBe(0.44)
    expect(inputs.coInitPpm).toBe(9)
    expect(inputs.geometry).toBe('opposed-slab')
    expect(inputs.n2FlowCcMin).toBe(0)
    expect(inputs.durationMin).toBe(27.2)
    within(inputs.powerW, 83.48)
    within(M5_POWER_W, 83.48)
    expect(playing).toBe(false)
    expect(tSec).toBe(0)
  })

  it('replays O2 22.2 % → 19.0 %; the fire adds CO2 2.667 % and CO 986.7 ppm to M5’s start, then the burn ends', () => {
    const end = playToEnd()
    within(end.o2Pct, 19.0)
    // SPEC §8.2's values are what the fire makes; the replay adds them to 0.44 % and 9 ppm.
    within(end.co2Pct - 0.44, 2.667)
    within(end.coPpm - 9, 986.7)
    within(end.co2Pct, 3.107)
    within(end.coPpm, 995.7)
    expect(end.flame).toBe('out-duration')
    expect(interpretStore.get().tSec).toBe(27.2 * 60)
    expect(interpretStore.get().playing).toBe(false)
  })

  it('logs both SMACs and the end of the burn, but not the 1,000 ppm sensor ceiling: CO stops at 996', () => {
    playToEnd()
    expect(loggedKinds()).toEqual(['smac-10', 'smac-55', 'burn-ended'])
  })

  it('logs the CSA-CP ceiling only when the model reaches it (a longer burn in the MSG)', () => {
    interpretStore.setInput({ durationMin: 30 })
    playToEnd()
    expect(loggedKinds()).toEqual(['smac-10', 'smac-55', 'sensor-1000', 'burn-ended'])
  })
})

describe('Move that fire into the US Lab', () => {
  it('gives about 2.3 ppm CO (2.327), below both limits, so nothing is logged but the burn ending', () => {
    interpretStore.loadPreset('us-lab')
    expect(interpretStore.get().inputs.volumeM3).toBe(106)
    const end = playToEnd()
    within(end.coPpm, 2.327)
    expect(loggedKinds()).toEqual(['burn-ended'])
  })
})

describe('Same fire, small sealed cabin', () => {
  beforeEach(() => {
    interpretStore.loadPreset('small-cabin')
  })

  it('opens at 3 m³ and crosses 55 ppm partway through the burn', () => {
    expect(interpretStore.get().inputs.volumeM3).toBe(3)
    const end = playToEnd()
    within(end.coPpm, (986.7 * 0.25) / 3)
    const crossed55 = firstTime(logEntries(interpretStore.get().run), 'smac-55')!
    const burnSec = 27.2 * 60
    expect(crossed55).toBeGreaterThan(0.25 * burnSec)
    expect(crossed55).toBeLessThan(0.9 * burnSec)
    expect(loggedKinds()).toEqual(['smac-10', 'smac-55', 'burn-ended'])
  })

  it('marks 4.485 m³ (55 ppm) and 24.67 m³ (10 ppm) on the volume slider for opposed slabs', () => {
    const { inputs, run } = interpretStore.get()
    const marks = volumeMarks(inputs, run)!
    within(marks.find((m) => m.limitPpm === 55)!.volumeM3, 4.485)
    within(marks.find((m) => m.limitPpm === 10)!.volumeM3, 24.67)
  })

  it('moves the marks to 6.667 m³ and 36.67 m³ for concurrent rods', () => {
    interpretStore.setInput({ geometry: 'concurrent-rod' })
    const { inputs, run } = interpretStore.get()
    const marks = volumeMarks(inputs, run)!
    within(marks.find((m) => m.limitPpm === 55)!.volumeM3, 6.667)
    within(marks.find((m) => m.limitPpm === 10)!.volumeM3, 36.67)
  })

  it('crosses 55 ppm just below 4.485 m³ and not just above it', () => {
    interpretStore.setInput({ volumeM3: 4.4 })
    playToEnd()
    expect(loggedKinds()).toContain('smac-55')
    interpretStore.setInput({ volumeM3: 4.6 })
    playToEnd()
    expect(loggedKinds()).toEqual(['smac-10', 'burn-ended'])
  })
})

describe('Nitrogen dilution in the glovebox', () => {
  beforeEach(() => {
    interpretStore.loadPreset('n2')
  })

  it('puts the 6.35 mm rod at 2 cm/s out when O2 falls below 13.61 %, sooner than N2 alone', () => {
    const { inputs } = interpretStore.get()
    expect(inputs).toMatchObject({ volumeM3: 0.25, rodMm: 6.35, flowCmS: 2, o2InitPct: 20.9, powerW: 5 })
    expect(inputs.n2FlowCcMin).toBe(MSG_N2_FLOW_CC_MIN)
    playToEnd()
    const out = firstTime(logEntries(interpretStore.get().run), 'extinguished')!
    const outState = stateAt(interpretStore.get().run, out)
    expect(outState.flame).toBe('out-limit')
    expect(outState.o2Pct).toBeLessThan(13.611)
    expect(outState.o2Pct).toBeGreaterThan(13.6)
    expect(out / 60).toBeLessThan(217.5)
    expect(out / 60).toBeGreaterThan(60)
  })

  it('takes about 3.6 h (217.5 min) with N2 alone at 2 cm/s', () => {
    expect(dilutionTimeMin(20.9, 13.611, 0.25, MSG_N2_FLOW_CC_MIN) / 60).toBeCloseTo(3.6, 1)
    interpretStore.setInput({ powerW: 0 })
    const { run } = interpretStore.get()
    within(run.find((state) => state.o2Pct < 13.611)!.tSec / 60, 217.5)
  })

  it('takes about 2.8 h (169.0 min) with N2 alone at 20 cm/s, inside NASA’s 1 to 3 h', () => {
    within(dilutionTimeMin(20.9, o2LimitPct(20, 6.35), 0.25, MSG_N2_FLOW_CC_MIN), 169.0)
    interpretStore.setInput({ powerW: 0, flowCmS: 20 })
    const { run } = interpretStore.get()
    within(run.find((state) => state.o2Pct < 14.977)!.tSec / 60, 169.0)
  })
})

describe('Lunar lander: 34 % O2 at 8.2 psia', () => {
  it('makes no prediction, and play does nothing', () => {
    interpretStore.loadPreset('lunar')
    const { inputs, run } = interpretStore.get()
    expect(inputs.o2InitPct).toBe(34)
    expect(psia(inputs.pressureAtm)).toBeCloseTo(8.2, 6)
    expect(run).toHaveLength(1)
    expect(run[0].valid).toBe(false)
    expect(run[0].invalidReason).toBe('Pressure is not 1 atm')
    interpretStore.play()
    interpretStore.tick(10_000)
    expect(interpretStore.get().playing).toBe(false)
    expect(interpretStore.get().tSec).toBe(0)
    expect(logEntries(run)).toEqual([])
  })
})

describe('model range', () => {
  it('refuses any pressure other than 1 atm, and runs again at 1 atm', () => {
    for (const pressureAtm of [0.99, 0.7, 0.56, 1.01, 1.5]) {
      interpretStore.setInput({ pressureAtm })
      expect(interpretStore.get().run).toHaveLength(1)
      expect(interpretStore.get().run[0].valid).toBe(false)
      interpretStore.play()
      expect(interpretStore.get().playing).toBe(false)
    }
    interpretStore.setInput({ pressureAtm: 1 })
    expect(interpretStore.get().run[0].valid).toBe(true)
  })

  it('stops a playing run when its new inputs make no prediction', () => {
    interpretStore.play()
    interpretStore.tick(1000)
    interpretStore.setInput({ pressureAtm: 0.5 })
    expect(interpretStore.get().playing).toBe(false)
    expect(interpretStore.get().tSec).toBe(0)
  })
})

describe('alarms come only from model state', () => {
  it('shows a log entry only once the clock reaches the model’s own alarm time', () => {
    interpretStore.loadPreset('small-cabin')
    const { run } = interpretStore.get()
    const at55 = firstTime(logEntries(run), 'smac-55')!
    // The model's state just before has CO under 55; at the alarm it is at or over 55.
    expect(stateAt(run, at55 - 1).coPpm).toBeLessThan(55)
    expect(stateAt(run, at55).coPpm).toBeGreaterThanOrEqual(55)
    interpretStore.seek(at55 - 1)
    expect(loggedKinds()).toEqual(['smac-10'])
    interpretStore.seek(at55)
    expect(loggedKinds()).toEqual(['smac-10', 'smac-55'])
  })

  it('logs exactly the alarms on the model’s last state, plus a slab burn reaching its set length', () => {
    for (const id of PRESET_IDS) {
      interpretStore.loadPreset(id)
      const { run } = interpretStore.get()
      const last = run[run.length - 1]
      const kinds = logEntries(run).map((entry) => entry.kind)
      expect(kinds.filter((kind) => kind !== 'burn-ended')).toEqual(last.alarms.map((alarm) => alarm.kind))
      expect(kinds.includes('burn-ended')).toBe(run.some((state) => state.flame === 'out-duration'))
    }
  })
})

describe('the store’s plain actions', () => {
  it('plays, pauses and keeps time at each speed', () => {
    interpretStore.setSpeed(600)
    interpretStore.play()
    interpretStore.tick(1000)
    expect(interpretStore.get().tSec).toBeCloseTo(600, 6)
    interpretStore.pause()
    interpretStore.tick(1000)
    expect(interpretStore.get().tSec).toBeCloseTo(600, 6)
    interpretStore.setSpeed(1)
    interpretStore.play()
    interpretStore.tick(500)
    expect(interpretStore.get().tSec).toBeCloseTo(600.5, 6)
    interpretStore.setSpeed(7)
    expect(interpretStore.get().speed).toBe(1)
  })

  it('jumps to the end in one tick under reduced motion', () => {
    interpretStore.play()
    interpretStore.tick(Infinity)
    expect(interpretStore.get().tSec).toBe(endSec(interpretStore.get().run))
    expect(interpretStore.get().playing).toBe(false)
  })

  it('seeks within the run, and plays from the start once at the end', () => {
    interpretStore.seek(-50)
    expect(interpretStore.get().tSec).toBe(0)
    interpretStore.seek(1e9)
    expect(interpretStore.get().tSec).toBe(27.2 * 60)
    interpretStore.play()
    expect(interpretStore.get().tSec).toBe(0)
    expect(interpretStore.get().playing).toBe(true)
  })

  it('reruns the model on setInput, keeps the clock, and reset brings the preset back', () => {
    interpretStore.seek(600)
    interpretStore.setInput({ volumeM3: 1 })
    expect(interpretStore.get().edited).toBe(true)
    expect(interpretStore.get().tSec).toBe(600)
    within(stateAt(interpretStore.get().run, 600).coPpm, 9 + 986.7 * 0.25 * (600 / 1632))
    interpretStore.setInput({ durationMin: 5 })
    expect(interpretStore.get().tSec).toBe(300)
    interpretStore.reset()
    expect(interpretStore.get().inputs).toEqual(PRESETS.m5.inputs)
    expect(interpretStore.get().edited).toBe(false)
    expect(interpretStore.get().tSec).toBe(0)
  })

  it('ignores unknown presets and values the model can’t take', () => {
    expect(interpretStore.loadPreset('mars')).toBe(false)
    expect(interpretStore.get().presetId).toBe('m5')
    interpretStore.setInput({ volumeM3: Number.NaN, rodMm: 5 as never })
    expect(interpretStore.get().inputs.volumeM3).toBe(MSG_VOLUME_M3)
    expect(interpretStore.get().inputs.rodMm).toBe(6.35)
  })
})

describe('every preset is reachable by URL', () => {
  it.each(PRESET_IDS)('#/interpret?preset=%s', (id) => {
    const route = parseHash(formatHash('interpret', { preset: id }))
    expect(route).toEqual({ view: 'interpret', params: { preset: id } })
    expect(interpretStore.loadPreset(route!.params.preset)).toBe(true)
    expect(interpretStore.get().presetId).toBe(id)
  })

  it('links Test M5’s record to its replay', () => {
    expect(replayPresetFor('M5')).toBe('m5')
    expect(replayPresetFor('O4')).toBeNull()
  })
})

describe('helpers', () => {
  it('writes sim time as T+mm:ss, with minutes past 59', () => {
    expect(simTime(0)).toBe('T+00:00')
    expect(simTime(872.4)).toBe('T+14:32')
    expect(clock(1632)).toBe('27:12')
    expect(clock(14_400)).toBe('240:00')
  })

  it('finds the state at a time, including a shorter last step', () => {
    interpretStore.setInput({ durationMin: 10.5 / 60 })
    const { run } = interpretStore.get()
    expect(run.map((state) => state.tSec).slice(-2)).toEqual([10, 10.5])
    expect(stateAt(run, 9.9).tSec).toBe(9)
    expect(stateAt(run, 10.2).tSec).toBe(10)
    expect(stateAt(run, 10.5).tSec).toBe(10.5)
  })

  it('scales charts to round numbers that always show the limit lines', () => {
    expect(niceCeil(60.5)).toBe(80)
    expect(niceCeil(90.4)).toBe(100)
    expect(niceCeil(1100)).toBe(1200)
    interpretStore.loadPreset('us-lab')
    const usLab = interpretStore.get().run
    expect(coDomain(usLab, [10, 55]).max).toBeGreaterThan(55)
    const o2 = o2Domain(usLab, null)
    expect(o2.max - o2.min).toBeGreaterThanOrEqual(4)
    expect(ticks(0, 100, 5)).toEqual([0, 25, 50, 75, 100])
    expect(timeTickMinutes(27.2)).toBe(5)
    expect(timeTickMinutes(240)).toBe(60)
  })
})
