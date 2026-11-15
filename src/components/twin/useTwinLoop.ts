import { useEffect, type RefObject } from 'react'
import { TwinScene } from '../../draw/twinScene'
import { burnStore } from '../../lib/burnStore'
import { earthMarginPts, isPulsing, orbitModel } from '../../lib/burnTwin'
import { stageLayout, type Point } from '../../lib/twinLayout'
import type { FrameBus } from './twinFrame'

/** A frame never advances the model by more than this, so a stall can't skip the drain ahead. */
const MAX_STEP_S = 0.05
/** Sharp on high-DPI screens, but no more than 2× so the canvas stays quick. */
const MAX_DPR = 2

type LoopOptions = {
  stageRef: RefObject<HTMLElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  bus: FrameBus
  reducedMotion: boolean
  /** Called when the stage changes size, so React can lay out the HTML overlay. */
  onResize: (size: { width: number; height: number }) => void
}

/**
 * The Burn Twin's animation loop. Each frame it advances the drain, draws the canvas and
 * publishes the frame for the HTML overlay; React is not re-rendered.
 * It runs while the stage is on screen and the tab is visible. Otherwise, and under reduced
 * motion, it draws single frames only when something changes.
 */
export function useTwinLoop({ stageRef, canvasRef, bus, reducedMotion, onResize }: LoopOptions): void {
  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return

    const scene = new TwinScene(canvas)
    let width = 0
    let height = 0
    let request = 0
    let lastTime = 0
    let onScreen = true
    let drawing = false
    let pointer: Point | null = null

    const shouldRun = () =>
      !document.hidden && onScreen && (!reducedMotion || burnStore.get().drain.phase === 'running')

    const schedule = () => {
      if (request === 0 && !document.hidden) request = requestAnimationFrame(frame)
    }

    function frame(now: number) {
      request = 0
      if (width === 0 || height === 0) return
      drawing = true
      const dt = lastTime === 0 ? 0 : Math.min((now - lastTime) / 1000, MAX_STEP_S)
      lastTime = now
      burnStore.tick(dt * 1000)

      const state = burnStore.get()
      const layout = stageLayout(width, height, state.rodMm)
      const orbit = orbitModel(state.o2Pct, state.flowCmS, state.rodMm)
      const earthMargin = earthMarginPts(state.o2Pct)
      const drawn = scene.render(
        {
          layout,
          o2Pct: state.o2Pct,
          flowCmS: state.flowCmS,
          earth: { lit: state.earth.lit, wentOut: state.earth.outAtPct !== null, marginPts: earthMargin },
          orbit: {
            lit: state.orbit.lit,
            wentOut: state.orbit.outAtPct !== null,
            marginPts: orbit.marginPts,
            stretchRate: orbit.a,
            pulsing: isPulsing(state),
          },
          pointer,
          reducedMotion,
        },
        dt,
      )
      bus.emit({
        layout,
        o2Pct: state.o2Pct,
        flowCmS: state.flowCmS,
        earthMarginPts: earthMargin,
        orbit: { a: orbit.a, limitPct: orbit.limitPct, marginPts: orbit.marginPts },
        ...drawn,
      })
      drawing = false

      if (shouldRun()) schedule()
      else lastTime = 0
    }

    // A change while the loop is idle draws one frame. (A change made by the frame itself, the
    // drain's own tick, must not.)
    const redraw = () => {
      if (!drawing) schedule()
    }

    const resizer = new ResizeObserver(([entry]) => {
      width = Math.round(entry.contentRect.width)
      height = Math.round(entry.contentRect.height)
      scene.resize(width, height, Math.min(window.devicePixelRatio || 1, MAX_DPR))
      onResize({ width, height })
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
    const onPointerMove = (event: PointerEvent) => {
      const box = stage.getBoundingClientRect()
      pointer = {
        x: ((event.clientX - box.left) / box.width) * 2 - 1,
        y: ((event.clientY - box.top) / box.height) * 2 - 1,
      }
    }
    const onPointerLeave = () => {
      pointer = null
    }

    document.addEventListener('visibilitychange', onVisibility)
    stage.addEventListener('pointermove', onPointerMove)
    stage.addEventListener('pointerleave', onPointerLeave)
    const unsubscribe = burnStore.subscribe(redraw)

    return () => {
      cancelAnimationFrame(request)
      resizer.disconnect()
      watcher.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      stage.removeEventListener('pointermove', onPointerMove)
      stage.removeEventListener('pointerleave', onPointerLeave)
      unsubscribe()
    }
  }, [stageRef, canvasRef, bus, reducedMotion, onResize])
}
