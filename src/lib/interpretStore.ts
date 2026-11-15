// INTERPRET's simulator state, in one small store with plain actions: loadPreset, setInput, play,
// pause, setSpeed, seek and reset. The view's controls, its URL (#/interpret?preset=…) and, from
// M6, Lab Partner's tools all call the same actions, so nothing works only by clicking.
//
// The model (cabin.ts) runs in one batch whenever the inputs change, a second at a time from 0 to
// the end (a few milliseconds even for 4 hours). Playing only moves a clock through that run, so
// 600× costs no more per frame than 1×, and the scrubber can jump anywhere at once.
import { useSyncExternalStore } from 'react'
import { simulateCabin, type CabinInputs, type CabinState } from './cabin'
import {
  endSec,
  isPresetId,
  isSpeed,
  mergeInputs,
  PRESETS,
  stepOptions,
  type PresetId,
  type Speed,
} from './interpret'

export interface SimState {
  presetId: PresetId
  /** True once an input differs from the preset's. */
  edited: boolean
  inputs: CabinInputs
  /** The model's whole run for these inputs, one state per simulated second. */
  run: readonly CabinState[]
  playing: boolean
  speed: Speed
  /** Simulated seconds since ignition. */
  tSec: number
  /**
   * What moved the clock last: playback, or a jump (seek, new inputs, a preset). Threshold
   * crossings animate only when playback reaches them.
   */
  cause: 'play' | 'jump'
}

function runFor(inputs: CabinInputs): readonly CabinState[] {
  return simulateCabin(inputs, stepOptions(inputs))
}

function fromPreset(id: PresetId): SimState {
  const preset = PRESETS[id]
  return {
    presetId: id,
    edited: false,
    inputs: preset.inputs,
    run: runFor(preset.inputs),
    playing: false,
    speed: preset.speed,
    tSec: 0,
    cause: 'jump',
  }
}

let state: SimState = fromPreset('m5')
const listeners = new Set<() => void>()

function commit(next: Partial<SimState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

const canPlay = (run: readonly CabinState[]) => run[0].valid && endSec(run) > 0

export const interpretStore = {
  /** The current state. The animation loop reads this every frame, outside React. */
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /** Opens a preset at its start, paused. Unknown ids are ignored; returns whether it loaded. */
  loadPreset(id: PresetId | string): boolean {
    if (!isPresetId(id)) return false
    commit(fromPreset(id))
    return true
  },

  /** Changes inputs and reruns the model. The clock stays where it was (or at the new end). */
  setInput(patch: Partial<CabinInputs>) {
    const inputs = mergeInputs(state.inputs, patch)
    const run = runFor(inputs)
    const end = endSec(run)
    const tSec = Math.min(state.tSec, end)
    const edited = JSON.stringify(inputs) !== JSON.stringify(PRESETS[state.presetId].inputs)
    commit({ inputs, run, tSec, edited, playing: state.playing && canPlay(run) && tSec < end, cause: 'jump' })
  },

  /** Plays from where the clock is, or from the start if it is at the end. No prediction, no play. */
  play() {
    if (!canPlay(state.run)) return
    const atEnd = state.tSec >= endSec(state.run) - 1e-9
    commit({ playing: true, tSec: atEnd ? 0 : state.tSec, cause: atEnd ? 'jump' : state.cause })
  },

  pause() {
    if (state.playing) commit({ playing: false })
  },

  setSpeed(speed: Speed | number) {
    if (isSpeed(speed) && speed !== state.speed) commit({ speed })
  },

  /** Moves the clock to `tSec` simulated seconds, within the run. */
  seek(tSec: number) {
    if (!Number.isFinite(tSec)) return
    commit({ tSec: Math.min(Math.max(tSec, 0), endSec(state.run)), cause: 'jump' })
  },

  /** Puts back a state read earlier with get(), paused: Lab Partner's Undo. */
  restore(snapshot: SimState) {
    commit({ ...snapshot, playing: false, cause: 'jump' })
  },

  /** Back to the current preset's own inputs, at its start, paused. */
  reset() {
    commit(fromPreset(state.presetId))
  },

  /**
   * Advances a playing clock by `dtMs` of display time at the current speed, and stops at the end.
   * Called once per animation frame; Infinity jumps straight to the end (reduced motion).
   */
  tick(dtMs: number) {
    if (!state.playing) return
    const end = endSec(state.run)
    const tSec = Math.min(end, state.tSec + (dtMs / 1000) * state.speed)
    commit({ tSec, playing: tSec < end - 1e-9, cause: 'play' })
  },
}

/**
 * Reads one value from the store. Pick something that changes rarely (the preset, playing, how
 * many alarms have happened): the component re-renders only when that value changes. The clock
 * changes every frame, so values that follow it go to the DOM through refs (useSimFrame).
 */
export function useSim<T>(selector: (state: SimState) => T): T {
  return useSyncExternalStore(interpretStore.subscribe, () => selector(state))
}
