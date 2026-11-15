import { useReducedMotion } from 'motion/react'
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { endSec, stateAt, ticks, timeTickMinutes } from '../../lib/interpret'
import { useSim } from '../../lib/interpretStore'
import { Cite } from '../Cite'
import { chartSpecs, linePath, type ChartSpec, type Tone } from './chartSpecs'
import { CHART_HZ, EASE_OUT, useSimFrame } from './simFrame'

const PLOT_LEFT = 52
const PLOT_RIGHT_PAD = 12
// Room for the title plus half a tick label: a tick at the top of the domain is centred on the plot's top edge.
const TITLE_H = 30
const GAP = 14
const AXIS_H = 40
/** The band wipe: the signature motion may run longer than an interaction (CLAUDE.md). */
const WIPE_MS = 560

const STROKE: Record<Tone, string> = {
  cyan: 'var(--color-cyan)',
  amber: 'var(--color-amber)',
  red: 'var(--color-red)',
  muted: 'var(--color-muted)',
  ink: 'var(--color-ink)',
}
const TEXT: Record<Tone, string> = {
  cyan: 'text-cyan',
  amber: 'text-amber',
  red: 'text-red',
  muted: 'text-muted',
  ink: 'text-ink',
}

/** Where a limit's label goes: above its line, nudged up if it would sit on another label. */
function labelTops(spec: ChartSpec, y: (value: number) => number): number[] {
  const tops = spec.limits.map((limit) => y(limit.value) - 18)
  const order = tops.map((_, i) => i).sort((a, b) => tops[b] - tops[a])
  for (let k = 1; k < order.length; k++) {
    const lower = order[k - 1]
    const upper = order[k]
    if (spec.limits[lower].labelAt === spec.limits[upper].labelAt && tops[lower] - tops[upper] < 16) {
      tops[upper] = tops[lower] - 16
    }
  }
  return tops
}

/**
 * Three strip charts on one time axis (SPEC F4, center): O2 with the Eq. 6.1 limit dotted, CO2,
 * and CO with the 10 ppm and 55 ppm SMAC lines (and the sensor ceiling in the MSG). Thin lines on
 * black, labeled where they are drawn, with no boxes or legends. Each run's lines are built once;
 * playback reveals them through a clip, 30 times a second at most. When the model crosses a limit
 * during playback, that limit's band fills with its color from the crossing on.
 */
export function StripCharts({ children }: { children?: ReactNode }) {
  const run = useSim((state) => state.run)
  const inputs = useSim((state) => state.inputs)
  const reducedMotion = useReducedMotion() ?? false
  const boxRef = useRef<HTMLDivElement>(null)
  const revealRef = useRef<SVGRectElement>(null)
  const headRefs = useRef<(SVGGElement | null)[]>([])
  const bandRefs = useRef(new Map<string, SVGRectElement>())
  const clipId = useId()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const valid = run[0].valid

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }),
    )
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  const specs = useMemo(() => chartSpecs(run, inputs), [run, inputs])
  const end = endSec(run)
  // The charts' scales, rebuilt only when the box or the run's length changes.
  const { plotRight, plotH, top, x, yOf } = useMemo(() => {
    const right = size.width - PLOT_RIGHT_PAD
    const height = Math.max(40, (size.height - AXIS_H - 3 * TITLE_H - 2 * GAP) / 3)
    return {
      plotRight: right,
      plotH: height,
      top: (i: number) => i * (TITLE_H + height + GAP) + TITLE_H,
      x: (tSec: number) => PLOT_LEFT + (end > 0 ? tSec / end : 0) * (right - PLOT_LEFT),
      yOf: (spec: ChartSpec) => (value: number) =>
        height * (1 - (value - spec.domain.min) / (spec.domain.max - spec.domain.min)),
    }
  }, [size.width, size.height, end])
  const paths = useMemo(
    () =>
      size.width > 0 && valid
        ? specs.map((spec) => linePath(run, spec.pick, x, yOf(spec), plotRight - PLOT_LEFT))
        : [],
    [run, specs, size.width, valid, x, yOf, plotRight],
  )

  useSimFrame((state) => {
    if (state.run !== run || size.width === 0) return
    const now = stateAt(run, state.tSec)
    const xNow = x(state.tSec)
    revealRef.current?.setAttribute('width', Math.max(0, xNow + 1).toFixed(1))
    specs.forEach((spec, i) => {
      headRefs.current[i]?.setAttribute('transform', `translate(${xNow.toFixed(1)} ${yOf(spec)(spec.pick(now)).toFixed(1)})`)
    })
    for (const rect of bandRefs.current.values()) {
      const crossAt = Number(rect.dataset.crossAt)
      const shown = state.tSec >= crossAt - 1e-9
      if (String(shown) === rect.dataset.shown) continue
      rect.dataset.shown = String(shown)
      rect.style.visibility = shown ? 'visible' : 'hidden'
      if (shown && state.cause === 'play' && !reducedMotion) {
        rect.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: WIPE_MS, easing: EASE_OUT })
      }
    }
  }, CHART_HZ)

  const minutes = end / 60
  const step = timeTickMinutes(minutes)
  const timeTicks = Array.from({ length: Math.floor(minutes / step + 1e-9) + 1 }, (_, i) => i * step)
  const bottom = top(2) + plotH

  return (
    <div ref={boxRef} className="relative min-h-0 min-w-0">
      {size.width > 0 && (
        <>
          <svg
            width={size.width}
            height={size.height}
            role="img"
            aria-label="Strip charts of oxygen, carbon dioxide and carbon monoxide over simulated time, from the cabin model"
            className={`absolute inset-0 ${valid ? '' : 'opacity-30'}`}
          >
            <defs>
              <clipPath id={clipId}>
                <rect ref={revealRef} x={0} y={0} width={0} height={size.height} />
              </clipPath>
            </defs>
            {specs.map((spec, i) => {
              const y = yOf(spec)
              return (
                <g key={spec.id} transform={`translate(0 ${top(i)})`}>
                  {ticks(spec.domain.min, spec.domain.max, 4).map((value) => (
                    <g key={value}>
                      <line x1={PLOT_LEFT} x2={plotRight} y1={y(value)} y2={y(value)} stroke="var(--color-line)" strokeOpacity={0.55} />
                      <text x={PLOT_LEFT - 8} y={y(value)} textAnchor="end" dominantBaseline="middle" className="num fill-muted text-xs">
                        {spec.formatTick(value)}
                      </text>
                    </g>
                  ))}
                  {spec.limits.map((limit) =>
                    limit.band ? (
                      <rect
                        key={`band-${limit.value}`}
                        ref={(rect) => {
                          const key = `${spec.id}-${limit.value}`
                          if (rect) bandRefs.current.set(key, rect)
                          else bandRefs.current.delete(key)
                        }}
                        data-cross-at={limit.band.crossAt}
                        x={x(limit.band.crossAt)}
                        y={y(limit.band.to)}
                        width={Math.max(0, plotRight - x(limit.band.crossAt))}
                        height={Math.max(0, y(limit.band.from) - y(limit.band.to))}
                        fill={STROKE[limit.tone]}
                        fillOpacity={0.13}
                        style={{ visibility: 'hidden', transformBox: 'fill-box', transformOrigin: '0 50%' }}
                      />
                    ) : null,
                  )}
                  {spec.limits.map((limit) => (
                    <line
                      key={`limit-${limit.value}`}
                      x1={PLOT_LEFT}
                      x2={plotRight}
                      y1={y(limit.value)}
                      y2={y(limit.value)}
                      stroke={STROKE[limit.tone]}
                      strokeWidth={limit.dotted ? 1.5 : 1}
                      strokeDasharray={limit.dotted ? '0.1 5' : undefined}
                      strokeLinecap="round"
                    />
                  ))}
                  {paths[i] && (
                    <g clipPath={`url(#${clipId})`} className="pointer-events-none">
                      <path d={paths[i]} fill="none" stroke={STROKE[spec.tone]} strokeOpacity={0.16} strokeWidth={5} strokeLinejoin="round" />
                      <path d={paths[i]} fill="none" stroke={STROKE[spec.tone]} strokeWidth={1.5} strokeLinejoin="round" />
                    </g>
                  )}
                  {valid && (
                    <g ref={(g) => void (headRefs.current[i] = g)} className="pointer-events-none">
                      <circle r={6} fill={STROKE[spec.tone]} fillOpacity={0.18} />
                      <circle r={2.5} fill={STROKE[spec.tone]} />
                    </g>
                  )}
                </g>
              )
            })}
            {timeTicks.map((minute) => (
              <text key={minute} x={x(minute * 60)} y={bottom + 16} textAnchor="middle" className="num fill-muted text-xs">
                {minute}
              </text>
            ))}
            <text x={plotRight} y={bottom + 34} textAnchor="end" className="fill-muted text-xs">
              Sim time, min
            </text>
          </svg>
          <div className={valid ? '' : 'opacity-30'}>
            {specs.map((spec, i) => {
              const tops = labelTops(spec, yOf(spec))
              return (
                <div key={spec.id}>
                  <h3 className="absolute left-0 text-sm leading-5 font-semibold" style={{ top: top(i) - TITLE_H }}>
                    {spec.title}
                  </h3>
                  {spec.limits.map((limit, k) => (
                    <p
                      key={limit.value}
                      className={`absolute text-xs leading-4 whitespace-nowrap ${TEXT[limit.tone]}`}
                      style={{
                        top: top(i) + tops[k],
                        ...(limit.labelAt === 'right'
                          ? { right: size.width - plotRight + 2 }
                          : { left: PLOT_LEFT + 4 }),
                      }}
                    >
                      {limit.label}
                      {/(ppm|%)$/.test(limit.label) && ' '}
                      <Cite id={limit.cite} />
                    </p>
                  ))}
                </div>
              )
            })}
          </div>
          {children}
        </>
      )}
    </div>
  )
}
