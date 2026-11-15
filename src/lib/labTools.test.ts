import { describe, expect, it } from 'vitest'
import flowByTestJson from '../../docs/fixtures/flow-by-test.json'
import csvText from '../../pipeline/sources/PSI-25/PSI-25_Experimental table_BASS-II.csv?raw'
import { compileBass2, type FlowByTest } from './audit'
import { getClaim } from './claims'
import { PRESETS } from './interpret'
import { TOOL_NAMES, type LabContext, type ToolResult } from './labProtocol'
import { runTools } from './labToolRun'
import { checkArgs, DEFAULT_CONTEXT, PIS, sanitizeContext, TOOL_DECLARATIONS, viewParams } from './labTools'

const rows = compileBass2(csvText, flowByTestJson as FlowByTest)
const one = (name: string, args: unknown, context: LabContext = DEFAULT_CONTEXT): ToolResult =>
  runTools([{ name, args }], context, rows)[0]
const value = (result: ToolResult, key: string) => result.fields.find((f) => f.key === key)?.value
const onRank: LabContext = { ...DEFAULT_CONTEXT, view: 'rank' }

describe('the tool list', () => {
  it('declares exactly the seven tools of SPEC F5', () => {
    expect(TOOL_DECLARATIONS.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort())
  })

  it('names the PIs exactly as the CSV does', () => {
    expect([...new Set(rows.map((row) => row.pi))].sort()).toEqual([...PIS].sort())
  })
})

describe('checkArgs', () => {
  it('refuses values outside what the app’s own controls allow', () => {
    expect(checkArgs('set_burn_twin', { o2Pct: 30 })).toMatchObject({ ok: false })
    expect(checkArgs('set_burn_twin', { flowCmS: 'fast' })).toMatchObject({ ok: false })
    expect(checkArgs('set_burn_twin', { rodMm: 7 })).toMatchObject({ ok: false })
    expect(checkArgs('set_burn_twin', {})).toEqual({ ok: false, error: 'nothing to set' })
    expect(checkArgs('run_cabin_preset', { preset: 'mars' })).toMatchObject({ ok: false })
    expect(checkArgs('set_cabin', { volumeM3: 1000 })).toMatchObject({ ok: false })
    expect(checkArgs('open_citation', { claimId: 'made.up' })).toMatchObject({ ok: false })
    expect(checkArgs('filter_tests', { pi: 'Somebody' })).toMatchObject({ ok: false })
  })

  it('reads a rod written loosely as the nearest of the three sizes', () => {
    expect(checkArgs('set_burn_twin', { rodMm: 9.5 })).toEqual({ ok: true, args: { rodMm: 9.525 } })
  })

  it('keeps only the parameters a view reads', () => {
    expect(viewParams('summarize', { test: 'P22b', evil: 'x', pi: 'Olson' })).toEqual({ pi: 'Olson', test: 'P22b' })
    expect(viewParams('summarize', { test: 'DROP TABLE' })).toEqual({})
    expect(viewParams('interpret', { preset: 'small-cabin', test: 'P22b' })).toEqual({ preset: 'small-cabin' })
    expect(viewParams('rank', { preset: 'm5' })).toEqual({})
  })
})

describe('sanitizeContext', () => {
  it('falls back to the app’s defaults for anything missing or wrong', () => {
    expect(sanitizeContext(null)).toEqual(DEFAULT_CONTEXT)
    const context = sanitizeContext({
      view: 'mars',
      burn: { o2Pct: 99, flowCmS: 'x', rodMm: 12.7 },
      interpret: { presetId: 'nope', inputs: { volumeM3: 3, powerW: 'hot' } },
      weights: { lowO2: 0, coYield: 0 },
    })
    expect(context.view).toBe('overview')
    expect(context.burn).toEqual({ o2Pct: 23, flowCmS: 2, rodMm: 12.7 })
    expect(context.interpret.presetId).toBe('m5')
    expect(context.interpret.inputs).toEqual({ ...PRESETS.m5.inputs, volumeM3: 3 })
    expect(context.weights).toEqual({ lowO2: 1, coYield: 1 })
  })
})

describe('set_burn_twin', () => {
  it('drains at 2 cm/s on the 6.35 mm rod: Earth out at 15.4, orbit at 13.61, 1.79 points longer (SPEC §8.1)', () => {
    // The screen was already at 2 cm/s, so the line says only what changed.
    const result = one('set_burn_twin', { flowCmS: 2, action: 'drain' }, onRank)
    expect(result).toMatchObject({ view: 'overview', opensView: true, summary: 'drained the oxygen' })
    expect(value(result, 'stretchRate')).toBe(9.44)
    expect(value(result, 'orbitLimitPct')).toBe(13.61)
    expect(value(result, 'gapPts')).toBe(1.79)
    expect(value(result, 'earthOutAtPct')).toBe(15.4)
    expect(value(result, 'orbitOutAtPct')).toBe(13.61)
    expect(String(value(result, 'branch'))).toContain('quenching')
    expect(String(value(result, 'goldilocks'))).toContain('Goldilocks')
  })

  it('names in its line only what it changed', () => {
    const fromFast: LabContext = { ...DEFAULT_CONTEXT, burn: { ...DEFAULT_CONTEXT.burn, flowCmS: 20 } }
    expect(one('set_burn_twin', { flowCmS: 2, action: 'drain' }, fromFast).summary).toBe(
      'set airflow to 2 cm/s, drained the oxygen',
    )
    // A drain always starts at 17%, so an O2 sent with it isn't news.
    expect(one('set_burn_twin', { o2Pct: 17, flowCmS: 2, rodMm: 6.35, action: 'drain' }).summary).toBe('drained the oxygen')
    expect(one('set_burn_twin', { rodMm: 12.7 }).summary).toBe('chose the 12.7 mm rod')
  })

  it('moves to the blowoff branch at 20 cm/s (14.98%)', () => {
    const result = one('set_burn_twin', { flowCmS: 20 })
    expect(result.opensView).toBe(false)
    expect(value(result, 'orbitLimitPct')).toBe(14.98)
    expect(String(value(result, 'branch'))).toContain('blowoff')
  })

  it('says which flames burn at a set O2', () => {
    const result = one('set_burn_twin', { o2Pct: 15 })
    expect([value(result, 'earthFlame'), value(result, 'orbitFlame')]).toEqual(['goes out', 'burns'])
  })
})

describe('the cabin presets (SPEC §8.2)', () => {
  it('replays Test M5 from its own start: O2 to 19.0, CO 995.7 ppm, past both SMACs, under the sensor ceiling', () => {
    const result = one('run_cabin_preset', { preset: 'm5' })
    expect(result).toMatchObject({ view: 'interpret', opensView: true, summary: 'ran Replay Test M5' })
    expect(value(result, 'co2StartPct')).toBe(0.44)
    expect(value(result, 'coStartPpm')).toBe(9)
    expect(result.fields.find((f) => f.key === 'coStartPpm')?.claimId).toBe('bass2.table.a4-m5')
    expect(value(result, 'o2EndPct')).toBe(19)
    // 0.44 % + the fire's 2.667 %, and 9 ppm + the fire's 986.7 ppm (SPEC §8.2).
    expect(value(result, 'co2EndPct')).toBe(3.11)
    expect(value(result, 'coPeakPpm')).toBe(995.7)
    expect(value(result, 'powerW')).toBe(83.48)
    expect(String(value(result, 'smac55'))).toMatch(/^CO passes the 1-hour SMAC \(55 ppm\) at T\+/)
    expect(String(value(result, 'sensorCeiling'))).toContain('stays under')
    expect(String(value(result, 'lossOfSignal'))).toContain('loss of signal')
  })

  it('moves it into the US Lab: about 2.3 ppm, below both limits', () => {
    const result = one('run_cabin_preset', { preset: 'us-lab' })
    expect(value(result, 'coPeakPpm')).toBe(2.3)
    // A clean cabin: no starting CO2 or CO, so no fields for them.
    expect(result.fields.some((f) => f.key === 'coStartPpm')).toBe(false)
    expect(String(value(result, 'smac10'))).toContain('stays below')
    expect(String(value(result, 'reportUsLab'))).toContain('1.5 ppm')
  })

  it('puts it in a small cabin: 55 ppm below 4.5 m³, 10 ppm below 24.7 m³', () => {
    const result = one('run_cabin_preset', { preset: 'small-cabin' })
    expect(value(result, 'volumeFor55M3')).toBe(4.5)
    expect(value(result, 'volumeFor10M3')).toBe(24.7)
    expect(value(result, 'coPeakPpm')).toBe(82.2)
  })

  it('refuses to predict for the 34% O2, 8.2 psia lunar lander, and says why', () => {
    const result = one('run_cabin_preset', { preset: 'lunar' })
    expect(String(value(result, 'prediction'))).toMatch(/^no prediction: Pressure is not 1 atm\. .*says nothing about whether experiments exist/)
    // The view's refusal banner, as a finding: 8.2 psia is 0.56 atm, inside FLEX's range.
    expect(String(value(result, 'coverage'))).toContain('which includes 8.2 psia (0.56 atm), but it burned liquid droplets')
    // NASA Glenn's 1g burns at this atmosphere exist: the gap is microgravity and lunar gravity.
    expect(String(value(result, 'coverage'))).toContain('in microgravity or lunar gravity')
    expect(String(value(result, 'zayac1g'))).toContain('34% oxygen at 8.2 psi')
    expect(value(result, 'pressurePsia')).toBe(8.2)
    expect(String(value(result, 'flexPressure'))).toContain('0.5')
    expect(String(value(result, 'bass2Pressure'))).toContain('1 atm')
  })

  it('puts the N2 preset’s rod flame out at its Eq. 6.1 limit', () => {
    expect(String(value(one('run_cabin_preset', { preset: 'n2' }), 'flame'))).toMatch(/^goes out at its Eq\. 6\.1 limit at T\+/)
  })

  it('starts set_cabin from the preset a previous tool opened', () => {
    const [, result] = runTools(
      [
        { name: 'run_cabin_preset', args: { preset: 'small-cabin' } },
        { name: 'set_cabin', args: { volumeM3: 1 } },
      ],
      DEFAULT_CONTEXT,
      rows,
    )
    expect(result).toMatchObject({ opensView: false, summary: 'set volume to 1 m³' })
    expect(value(result, 'coPeakPpm')).toBe(246.7)
  })
})

describe('navigate, filter_tests, highlight_risk_entity, open_citation', () => {
  it('shows P22b in the quarantine bay with its math: 19.1 + 20.0 = 39.1', () => {
    const result = one('navigate', { view: 'summarize', params: { test: 'P22b' } })
    expect(result).toMatchObject({ view: 'summarize', summary: 'showed P22b in the quarantine bay' })
    expect(value(result, 'forensicMath')).toBe('19.1 + 20.0 = 39.1')
    expect(value(result, 'o2FinalPct')).toBe(39.1)
    expect(result.claimIds).toEqual(['bass2.o2forensic.p22b'])
  })

  it('reproduces the other forensic rows: T28b 40.4, B2 1.6', () => {
    expect(value(one('navigate', { view: 'summarize', params: { test: 'T28b' } }), 'forensicMath')).toBe('19.7 + 20.7 = 40.4')
    expect(value(one('navigate', { view: 'summarize', params: { test: 'B2' } }), 'forensicMath')).toBe('0.0 + 1.6 = 1.6')
  })

  it('counts Olson’s 27 tests and turns the quarantine on', () => {
    const result = one('filter_tests', { pi: 'Olson', quarantine: true })
    expect(result.summary).toBe('showed Olson’s tests, turned quarantine on')
    expect(value(result, 'tests')).toBe(27)
  })

  it('counts all 129 tests, 7 quarantined', () => {
    const result = one('filter_tests', {})
    expect([value(result, 'tests'), value(result, 'quarantinedTests')]).toEqual([129, 7])
  })

  it('highlights a ranked type with its index, and says why an unranked one isn’t ranked', () => {
    const slab = one('highlight_risk_entity', { id: 'pmma-slab-2' })
    expect([value(slab, 'rank'), value(slab, 'index'), value(slab, 'coYield')]).toEqual([1, 63.5, 400.8])
    expect(String(value(one('highlight_risk_entity', { id: 'sibal-1cm' }), 'ranked'))).toContain('0.07%')
    expect(String(value(one('highlight_risk_entity', { id: 'nomex' }), 'finding1'))).toContain('Nomex')
  })

  it('opens a source without changing the view', () => {
    const result = one('open_citation', { claimId: 'bass2.suppress-until-cool' }, onRank)
    expect(result).toMatchObject({ view: null, opensView: false })
    expect(String(value(result, 'quote'))).toContain('until the burning material has cooled')
  })
})

describe('runTools', () => {
  it('runs at most 3 calls, skips unknown tools, and reports bad arguments without acting', () => {
    const results = runTools(
      [
        { name: 'delete_everything', args: {} },
        { name: 'set_burn_twin', args: { o2Pct: 99 } },
        { name: 'navigate', args: { view: 'rank' } },
        { name: 'navigate', args: { view: 'summarize' } },
        { name: 'navigate', args: { view: 'interpret' } },
      ],
      DEFAULT_CONTEXT,
      rows,
    )
    expect(results.map((r) => [r.id, r.name, r.error ?? null])).toEqual([
      ['tool#1', 'set_burn_twin', 'o2Pct must be between 12 and 23'],
      ['tool#2', 'navigate', null],
      ['tool#3', 'navigate', null],
    ])
    expect(results[0]).toMatchObject({ view: null, opensView: false, fields: [] })
  })

  it('only opens a view once, and only if it wasn’t showing', () => {
    const results = runTools(
      [
        { name: 'run_cabin_preset', args: { preset: 'm5' } },
        { name: 'set_cabin', args: { volumeM3: 3 } },
      ],
      onRank,
      rows,
    )
    expect(results.map((r) => r.opensView)).toEqual([true, false])
  })

  it('cites only verified claims, and never gives a value that isn’t a number', () => {
    const results = runTools(
      [
        { name: 'set_burn_twin', args: { flowCmS: 0.5, action: 'drain' } },
        { name: 'run_cabin_preset', args: { preset: 'm5' } },
        { name: 'navigate', args: { view: 'summarize', params: { test: 'P22b' } } },
      ],
      DEFAULT_CONTEXT,
      rows,
    )
    for (const result of results) {
      for (const claimId of [...result.claimIds, ...result.fields.flatMap((f) => (f.claimId ? [f.claimId] : []))]) {
        expect(getClaim(claimId)?.verified, claimId).toBe(true)
      }
      for (const f of result.fields) if (typeof f.value === 'number') expect(Number.isFinite(f.value), f.key).toBe(true)
    }
  })
})
