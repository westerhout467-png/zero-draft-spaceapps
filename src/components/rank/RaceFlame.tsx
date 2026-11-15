import { useLayoutEffect, useRef } from 'react'
import { drawRod } from '../../draw/rod'
import { drawStagnationFlame, stagnationFlameShape } from '../../draw/stagnationFlame'
import { TWIN_DEFAULTS } from '../../lib/burnTwin'
import { ROD_DIAMETERS_MM, stretchRate, type RodMm } from '../../lib/physics'
import { RACE_FLAME } from '../../lib/rankCharts'

/** Drawn radius of the 6.35 mm rod, px. The others scale with their diameter. */
const UNIT = 2.6
/** Points of O2 above the limit the little flames are drawn at: a steady, well-lit cup. */
const DRAWN_MARGIN_PTS = 2

/**
 * A small lit rod for the ignition race: the Burn Twin's orbit flame on a clear rod's nose, drawn
 * once, still. An illustration (the race labels it so), not to scale.
 */
export function RaceFlame({ rodMm }: { rodMm: RodMm }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(RACE_FLAME.width * dpr)
    canvas.height = Math.round(RACE_FLAME.height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, RACE_FLAME.width, RACE_FLAME.height)
    const rodRadius = (UNIT * rodMm) / ROD_DIAMETERS_MM[0]
    const shape = stagnationFlameShape({
      unit: UNIT,
      rodRadius,
      stretchRate: stretchRate(TWIN_DEFAULTS.flowCmS, rodMm),
      marginPts: DRAWN_MARGIN_PTS,
    })
    ctx.globalCompositeOperation = 'lighter'
    drawStagnationFlame(ctx, { x: RACE_FLAME.noseX, y: RACE_FLAME.noseY, rodRadius, shape, intensity: 1 })
    drawRod(ctx, {
      x: RACE_FLAME.noseX,
      y: RACE_FLAME.noseY,
      angle: 0,
      radius: rodRadius,
      length: RACE_FLAME.width,
      light: { rgb: '120,184,255', intensity: 1, reach: shape.tail + UNIT * 2 },
    })
  }, [rodMm])
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none"
      style={{ width: RACE_FLAME.width, height: RACE_FLAME.height }}
    />
  )
}
