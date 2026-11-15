import { Play, RotateCcw } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { getClaim } from '../../lib/claims'
import type { RodMm } from '../../lib/physics'
import { LONGEST_IGNITION_S, RACE, RACE_FLAME, raceMarkers, raceTicks, raceTimeAt, raceX } from '../../lib/rankCharts'
import { TEST1_IGNITION_S } from '../../lib/risk'
import { Cite } from '../Cite'
import { setText } from '../twin/twinFrame'
import { RaceFlame } from './RaceFlame'

const MARKERS = raceMarkers()
/** Each row's height and where its track runs, px. */
const ROW_H = 64
const TRACK_Y = 42
const TOP_LANE_H = 28
/** A hidden tab stalls requestAnimationFrame; capping each step pauses the race instead of skipping it. */
const MAX_STEP_MS = 50

type Phase = 'ready' | 'playing' | 'done'
/** What the cursor has passed: 'earth' at 25 s, then each rod at its t_s. */
type Passed = { earth: boolean; rods: RodMm[] }
const NOTHING: Passed = { earth: false, rods: [] }
const EVERYTHING: Passed = { earth: true, rods: MARKERS.map((m) => m.rodMm) }

const pct = (timeS: number) => `${(raceX(timeS) * 100).toFixed(3)}%`

/**
 * F3c: the ignition race. A timeline from 0 to 250 s: NASA Test 1's igniter stops at 25 s, and
 * each BASS-II rod needs its solid response time t_s to heat through. Play sweeps a thin cyan
 * streak across in a few seconds; at 25 s the Test 1 bar is stamped "Earth test ends", and as the
 * streak reaches each rod's t_s a small flame lights on its marker. The streak moves through a
 * ref every frame; React only hears about the four moments something lights.
 */
export function IgnitionRace() {
  const reduceMotion = useReducedMotion() ?? false
  const [phase, setPhase] = useState<Phase>('ready')
  const [passed, setPassed] = useState<Passed>(NOTHING)
  const cursorRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)

  function moveCursor(timeS: number) {
    if (cursorRef.current) cursorRef.current.style.transform = `translateX(${pct(timeS)})`
    setText(timeRef.current, `${Math.round(timeS)} s`)
  }

  useEffect(() => {
    if (phase !== 'playing') return
    let frame = 0
    let last = performance.now()
    let elapsed = 0
    let seen = NOTHING
    const tick = (now: number) => {
      elapsed += Math.min(MAX_STEP_MS, now - last)
      last = now
      const timeS = raceTimeAt(elapsed)
      moveCursor(timeS)
      const next: Passed = {
        earth: timeS >= TEST1_IGNITION_S,
        rods: MARKERS.filter((m) => timeS >= m.tsS).map((m) => m.rodMm),
      }
      if (next.earth !== seen.earth || next.rods.length !== seen.rods.length) {
        seen = next
        setPassed(next)
      }
      if (elapsed >= RACE.sweepMs) setPhase('done')
      else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase])

  function play() {
    if (reduceMotion) {
      moveCursor(RACE.endS)
      setPassed(EVERYTHING)
      setPhase('done')
      return
    }
    moveCursor(0)
    setPassed(NOTHING)
    setPhase('playing')
  }

  const quote = getClaim('bass2.ign.test1-too-short')
  return (
    <section aria-labelledby="race-heading" className="flex min-w-0 flex-col gap-4">
      <div className="flex items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="race-heading" className="text-base leading-6 font-semibold">
            Ignition race, PMMA rods
          </h2>
          <p className="text-sm leading-5 text-muted">
            Each BASS-II rod’s solid response time t<sub>s</sub> <Cite id="bass2.ign.ts-def" />, from its radius and PMMA’s
            thermal diffusivity <Cite id="bass2.ign.alpha-pmma" />, against the igniter time of NASA’s Earth test.
          </p>
        </div>
        <button
          type="button"
          disabled={phase === 'playing'}
          onClick={play}
          className="flex h-9 shrink-0 items-center gap-2 rounded-sm border border-ink bg-ink px-4 text-sm font-medium whitespace-nowrap text-graphite transition-transform duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          {phase === 'done' ? <RotateCcw aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
          {phase === 'done' ? 'Play again' : 'Play the race'}
        </button>
      </div>

      <div className="flex gap-4" role="group" aria-label="Ignition timeline, 0 to 250 seconds">
        {/* Row names */}
        <div className="flex w-36 shrink-0 flex-col text-sm leading-5" style={{ paddingTop: TOP_LANE_H }}>
          <div className="flex flex-col justify-end pb-3" style={{ height: ROW_H }}>
            <p>NASA Test 1 igniter</p>
            <p className="text-xs leading-4 text-muted tabular-nums">
              about {TEST1_IGNITION_S} s <Cite id="bass2.ign.test1-25s" />
            </p>
          </div>
          {MARKERS.map((marker) => (
            <p key={marker.rodMm} className="flex items-end pb-3" style={{ height: ROW_H }}>
              PMMA rod, <span className="ml-1 tabular-nums">{marker.rodMm}</span>&nbsp;mm
            </p>
          ))}
        </div>

        {/* The track */}
        <div className="relative min-w-0 flex-1">
          <div className="relative" style={{ height: TOP_LANE_H }}>
            <p className="absolute top-1 left-0 text-xs leading-4 whitespace-nowrap text-muted">
              Play clock{' '}
              <span ref={timeRef} className="num text-ink">
                0 s
              </span>
            </p>
            <p
              className="absolute top-1 text-xs leading-4 whitespace-nowrap text-ink"
              style={{ right: `calc(100% - ${pct(LONGEST_IGNITION_S)} + 6px)` }}
            >
              Longest successful BASS-II ignition, <span className="tabular-nums">{LONGEST_IGNITION_S}</span> s{' '}
              <Cite id="bass2.ign.230s" />
            </p>
          </div>

          <div className="relative" style={{ height: ROW_H * (MARKERS.length + 1) }}>
            {/* The 230 s line, through every row. */}
            <span
              aria-hidden="true"
              className="absolute inset-y-0 border-l border-dashed border-muted/70"
              style={{ left: pct(LONGEST_IGNITION_S) }}
            />

            {/* Earth: the Test 1 igniter bar, stamped when the streak passes its end. */}
            <div className="relative" style={{ height: ROW_H }}>
              <span
                aria-hidden="true"
                className="absolute left-0 h-2 bg-amber"
                style={{ top: TRACK_Y - 4, width: pct(TEST1_IGNITION_S) }}
              />
              {passed.earth && (
                <p
                  className="appear absolute origin-left text-sm leading-5 whitespace-nowrap text-ink"
                  style={{ left: `calc(${pct(TEST1_IGNITION_S)} + 8px)`, top: TRACK_Y - 10 }}
                >
                  Earth test ends
                </p>
              )}
            </div>

            {MARKERS.map((marker) => {
              const lit = passed.rods.includes(marker.rodMm)
              const late = raceX(marker.tsS) > 0.75
              return (
                <div key={marker.rodMm} className="relative" style={{ height: ROW_H }}>
                  <span aria-hidden="true" className="absolute inset-x-0 h-px bg-line" style={{ top: TRACK_Y }} />
                  <p
                    className={`absolute top-3 text-xs leading-4 whitespace-nowrap ${late ? 'bg-window pl-1' : ''}`}
                    style={late ? { right: `calc(100% - ${pct(marker.tsS)} + 10px)` } : { left: `calc(${pct(marker.tsS)} - 4px)` }}
                  >
                    t<sub>s</sub> <span className="tabular-nums">{marker.tsS.toFixed(1)}</span> s <Cite id="rank.solid-time" />
                  </p>
                  {lit && (
                    <div
                      className="appear absolute origin-left"
                      style={{
                        left: `calc(${pct(marker.tsS)} - ${RACE_FLAME.noseX}px)`,
                        top: TRACK_Y - RACE_FLAME.noseY,
                      }}
                    >
                      <RaceFlame rodMm={marker.rodMm} />
                    </div>
                  )}
                  <span
                    aria-hidden="true"
                    className={`absolute -mt-[5px] -ml-[5px] size-2.5 rounded-full border ${lit ? 'border-cyan' : 'border-muted'}`}
                    style={{ left: pct(marker.tsS), top: TRACK_Y }}
                  />
                  <span className="sr-only">{lit ? 'Lit' : 'Not lit yet'}</span>
                </div>
              )
            })}

            {/* One tag for all three little flames, once the first has lit. */}
            {passed.rods.length > 0 && (
              <p className="appear absolute bottom-1 left-0 origin-left text-xs leading-4 text-muted">Illustration</p>
            )}

            {/* The streak, clipped to the track. Its tail shows only while it moves. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <div ref={cursorRef} className="absolute inset-0" style={{ transform: 'translateX(0%)' }}>
                <span className="absolute inset-y-0 left-0 w-px bg-cyan" />
                <span
                  className={`absolute inset-y-0 right-full w-12 transition-opacity duration-200 ${phase === 'playing' ? 'opacity-100' : 'opacity-0'}`}
                  style={{ background: 'linear-gradient(to right, transparent, rgb(6 182 212 / 0.22))' }}
                />
              </div>
            </div>
          </div>

          {/* Axis */}
          <div aria-hidden="true" className="relative h-6 border-t border-line">
            {raceTicks().map((tick) => (
              <span
                key={tick}
                className="num absolute top-1 -translate-x-1/2 text-xs leading-4 text-muted first:translate-x-0 last:-translate-x-full"
                style={{ left: pct(tick) }}
              >
                {tick}
              </span>
            ))}
          </div>
          <p className="text-right text-xs leading-4 text-muted">Seconds of heating</p>
        </div>
      </div>

      {quote?.verified && quote.quote && (
        <blockquote className="font-serif text-base leading-6">
          “{quote.quote}”
          <Cite id="bass2.ign.test1-too-short" />
        </blockquote>
      )}
    </section>
  )
}
