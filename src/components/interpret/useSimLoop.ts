import { useEffect, type RefObject } from 'react'
import { ChamberScene, type ChamberSceneInput } from '../../draw/chamberScene'
import { PULSE_MARGIN_PTS } from '../../lib/burnTwin'
import { SMAC_1_HOUR_PPM } from '../../lib/cabin'
import { stateAt } from '../../lib/interpret'
import { interpretStore, type SimState } from '../../lib/interpretStore'
import { eq61Branch, o2LimitPct, ROD_DIAMETERS_MM, stretchRate } from '../../lib/physics'

/** A frame never advances the clock by more than this much display time, so a stall can't skip ahead. */
const MAX_STEP_S = 0.05
const MAX_DPR = 2

/** What the chamber should show for the simulation's current state. */
function sceneInput(state: SimState, reducedMotion: boolean): ChamberSceneInput {
  const { inputs } = state
  const now = stateAt(state.run, state.tSec)
  const rodMm = inputs.rodMm ?? ROD_DIAMETERS_MM[0]
  const flowCmS = inputs.flowCmS ?? 2
  const rod = inputs.geometry === 'concurrent-rod'
  const a = stretchRate(flowCmS, rodMm)
  const lit = now.valid && now.flame === 'burning'
  // Rods: points above the Eq. 6.1 limit. Slabs have no limit model, so their flame is only drawn
  // a little smaller as O2 falls (illustration).
  const marginPts = rod ? now.o2Pct - o2LimitPct(flowCmS, rodMm) : Math.max(0, now.o2Pct - 15) * 0.6
  return {
    geometry: inputs.geometry,
    rodMm,
    flowCmS,
    lit,
    wentOut: now.valid && (now.flame === 'out-limit' || now.flame === 'out-duration'),
    marginPts,
    stretchRate: a,
    pulsing: rod && lit && eq61Branch(a) === 'quenching' && marginPts < PULSE_MARGIN_PTS,
    haze: now.valid ? Math.min(1, now.coPpm / SMAC_1_HOUR_PPM) : 0,
    flowing: state.playing,
    reducedMotion,
  }
}

type LoopOptions = {
  stageRef: RefObject<HTMLElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  reducedMotion: boolean
}

/**
 * INTERPRET's one animation loop. Each frame it moves the simulation clock (store.tick) and draws
 * the chamber; the charts and readouts follow through the store at up to 30 Hz. It runs while the
 * simulation plays or the flame is still fading, and only while the chamber is on screen and the
 * tab is visible, so a playing run pauses with it (CLAUDE.md "Interaction details" 4). Under
 * reduced motion, Play jumps straight to the end.
 */
export function useSimLoop({ stageRef, canvasRef, reducedMotion }: LoopOptions): void {
  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return

    const scene = new ChamberScene(canvas)
    let width = 0
    let height = 0
    let request = 0
    let lastTime = 0
    let onScreen = true
    let drawing = false
    let easing = false

    const shouldRun = () => !document.hidden && onScreen && (interpretStore.get().playing || easing)
    const schedule = () => {
      if (request === 0 && !document.hidden) request = requestAnimationFrame(frame)
    }

    function frame(now: number) {
      request = 0
      drawing = true
      const dt = lastTime === 0 ? 0 : Math.min((now - lastTime) / 1000, MAX_STEP_S)
      lastTime = now
      if (onScreen) interpretStore.tick(reducedMotion ? Infinity : dt * 1000)
      if (width > 0 && height > 0) {
        easing = scene.render(sceneInput(interpretStore.get(), reducedMotion), dt)
      }
      drawing = false
      if (shouldRun()) schedule()
      else lastTime = 0
    }

    // A change while the loop is idle draws one frame (and starts it again if playing). A change
    // made by the frame itself, the clock's own tick, must not.
    const redraw = () => {
      if (!drawing) schedule()
    }

    const resizer = new ResizeObserver(([entry]) => {
      width = Math.round(entry.contentRect.width)
      height = Math.round(entry.contentRect.height)
      scene.resize(width, height, Math.min(window.devicePixelRatio || 1, MAX_DPR))
      redraw()
    })
    resizer.observe(stage)

    const watcher = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      if (onScreen) redraw()
    })
    watcher.observe(stage)

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(request)
        request = 0
        lastTime = 0
      } else {
        redraw()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    const unsubscribe = interpretStore.subscribe(redraw)

    return () => {
      cancelAnimationFrame(request)
      resizer.disconnect()
      watcher.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribe()
    }
  }, [stageRef, canvasRef, reducedMotion])
}
