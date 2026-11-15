// What Lab Partner's tools do to the screen (SPEC F5): each ToolResult from the server becomes the
// same store actions a person's clicks call, so nothing works only through Lab Partner. Before
// each one the dock takes a snapshot of every store and the address, so its Undo puts back exactly
// what was there.
import { sampleFamily, type SampleType } from './audit'
import { burnStore } from './burnStore'
import { interpretStore } from './interpretStore'
import type { PresetId } from './interpret'
import type { LabContext, ToolResult } from './labProtocol'
import type { BurnArgs, CabinPatchArgs, FilterArgs, NavigateArgs } from './labTools'
import type { RodMm } from './physics'
import { pulse } from './pulse'
import { rankStore } from './rankStore'
import { formatHash, parseHash, type RouteParams, type ViewId } from './route'
import { summarizeStore } from './summarizeStore'

export interface Snapshot {
  hash: string
  burn: ReturnType<typeof burnStore.get>
  sim: ReturnType<typeof interpretStore.get>
  summarize: ReturnType<typeof summarizeStore.get>
  weights: ReturnType<typeof rankStore.get>
}

export function snapshot(): Snapshot {
  return {
    hash: window.location.hash,
    burn: burnStore.get(),
    sim: interpretStore.get(),
    summarize: summarizeStore.get(),
    weights: rankStore.get(),
  }
}

export function restore(saved: Snapshot): void {
  burnStore.restore(saved.burn)
  interpretStore.restore(saved.sim)
  summarizeStore.restore(saved.summarize)
  rankStore.restore(saved.weights)
  if (window.location.hash !== saved.hash) window.location.hash = saved.hash || '#/'
}

/** What is on screen now, for the server: the view and the stores' current settings. */
export function currentContext(): LabContext {
  const route = parseHash(window.location.hash) ?? { view: 'overview', params: {} }
  const burn = burnStore.get()
  const sim = interpretStore.get()
  return {
    view: route.view,
    params: route.params,
    burn: { o2Pct: burn.o2Pct, flowCmS: burn.flowCmS, rodMm: burn.rodMm },
    interpret: { presetId: sim.presetId, inputs: sim.inputs },
    weights: rankStore.get(),
  }
}

export interface ApplyDeps {
  openCitation: (claimId: string) => void
  reduceMotion: boolean
}

function go(view: ViewId, params: RouteParams = {}) {
  const hash = formatHash(view, params)
  if (window.location.hash !== hash) window.location.hash = hash
}

/** Applies one tool result to the screen, then pulses what changed. Refused calls change nothing. */
export function applyTool(result: ToolResult, deps: ApplyDeps): void {
  if (result.error) return
  const field = (key: string) => result.fields.find((f) => f.key === key)?.value
  const targets: string[] = []

  switch (result.name) {
    case 'set_burn_twin': {
      const args = result.args as BurnArgs
      go('overview')
      if (args.action === 'reset') {
        burnStore.reset()
        targets.push('twin.reset')
      }
      // The rod and airflow the server worked with, so the screen shows the numbers in the answer.
      const rod = field('rodMm')
      const flow = field('flowCmS')
      if (typeof rod === 'number' && rod !== burnStore.get().rodMm) burnStore.setRod(rod as RodMm)
      if (typeof flow === 'number' && flow !== burnStore.get().flowCmS) burnStore.setFlow(flow)
      if (args.rodMm !== undefined) targets.push('twin.rod')
      if (args.flowCmS !== undefined) targets.push('twin.flow')
      if (args.o2Pct !== undefined && args.action !== 'drain') {
        burnStore.setO2(args.o2Pct)
        targets.push('twin.o2')
      }
      if (args.action === 'ignite') {
        burnStore.ignite()
        targets.push('twin.ignite')
      }
      if (args.action === 'drain') {
        burnStore.drain(deps.reduceMotion)
        targets.push('twin.drain')
      }
      break
    }
    case 'run_cabin_preset': {
      const preset = result.args.preset as PresetId
      go('interpret')
      interpretStore.loadPreset(preset)
      interpretStore.play()
      targets.push(`interpret.preset.${preset}`)
      break
    }
    case 'set_cabin': {
      go('interpret')
      interpretStore.setInput(result.args as CabinPatchArgs)
      interpretStore.seek(0)
      interpretStore.play()
      targets.push('interpret.inputs')
      break
    }
    case 'navigate': {
      const { view, params } = result.args as unknown as NavigateArgs
      go(view, params)
      if (view === 'interpret' && params.preset) {
        interpretStore.loadPreset(params.preset)
        targets.push(`interpret.preset.${params.preset}`)
      }
      if (view === 'summarize' && params.test) targets.push(field('quarantined') === 'no' ? 'summarize.filters' : 'summarize.bay')
      break
    }
    case 'filter_tests': {
      const args = result.args as FilterArgs
      go('summarize')
      summarizeStore.clearFilters()
      summarizeStore.setFilters({ pi: args.pi ?? null, sample: args.geometry ? `family:${args.geometry}` : null })
      targets.push('summarize.filters')
      if (args.quarantine !== undefined) {
        summarizeStore.setQuarantine(args.quarantine)
        targets.push('summarize.quarantine')
      }
      break
    }
    case 'highlight_risk_entity': {
      const id = result.args.id as SampleType
      go('rank')
      targets.push(field('rank') !== undefined ? `rank.row.${id}` : `rank.unranked.${sampleFamily(id)}`)
      break
    }
    case 'open_citation':
      deps.openCitation(result.args.claimId as string)
      break
  }
  pulse(targets, deps.reduceMotion)
}
