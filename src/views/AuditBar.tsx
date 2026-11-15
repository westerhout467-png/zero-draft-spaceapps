import { animate, useMotionValue, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { AuditCounter } from '../components/audit/AuditCounter'
import { AuditSegments } from '../components/audit/AuditSegments'
import { isQuarantined } from '../lib/audit'
import { AUDIT_BAR_TITLE, AUDIT_INTRO, auditCounters, auditSegments, INTRO_DONE } from '../lib/auditBar'
import { useAuditData } from '../lib/bass2Data'
import { formatHash } from '../lib/route'
import { summarizeStore } from '../lib/summarizeStore'
import { paramsFromLink, type SummarizeLink } from '../lib/testWall'

function introPlayed(): boolean {
  try {
    return window.sessionStorage.getItem(AUDIT_INTRO.sessionKey) !== null
  } catch {
    return false
  }
}

function markIntroPlayed() {
  try {
    window.sessionStorage.setItem(AUDIT_INTRO.sessionKey, 'played')
  } catch {
    // Storage can be blocked; the intro then plays again next load, which is harmless.
  }
}

/**
 * F0 data hygiene audit bar: a 40px strip on every view. Counts come from public/data/audit.json
 * and the segments from bass2.json, both through lib/auditBar.ts; this file holds no number
 * literals. On first load the counters tick up and the segments fill left to right, once per
 * session; under reduced motion the final values show at once. Clicking a counter or a segment
 * opens SUMMARIZE with that filter on and the quarantine bay open.
 */
export function AuditBar() {
  const data = useAuditData()
  const reduceMotion = useReducedMotion()
  const [playIntro] = useState(() => !introPlayed())
  const progress = useMotionValue(playIntro ? AUDIT_INTRO.from : INTRO_DONE)
  const ready = data.status === 'ready'

  const view = useMemo(() => {
    if (data.status !== 'ready') return null
    const rows = data.bass2.rows
    const byId = new Map(rows.map((row) => [row.testId, row]))
    return {
      counters: auditCounters(data.audit, rows),
      segments: auditSegments(rows),
      quarantined: (testId: string) => {
        const row = byId.get(testId)
        return row ? isQuarantined(row) : undefined
      },
    }
  }, [data])

  useEffect(() => {
    if (!ready) return
    if (!playIntro || reduceMotion) {
      progress.set(INTRO_DONE)
      return
    }
    markIntroPlayed()
    const controls = animate(progress, INTRO_DONE, { duration: AUDIT_INTRO.durationS, ease: AUDIT_INTRO.ease })
    return () => controls.stop()
  }, [ready, playIntro, reduceMotion, progress])

  function follow(link: SummarizeLink, navigate: boolean) {
    if (!view) return
    summarizeStore.applyLink(link, view.quarantined)
    if (navigate) window.location.hash = formatHash('summarize', paramsFromLink(link))
  }

  return (
    // A size container: with the Lab Partner dock open on a narrow screen, the title gives way so
    // the counters keep their room.
    <section aria-label="Data audit" className="@container/audit flex h-10 min-w-0 shrink-0 items-center gap-6 px-6">
      <p className="shrink-0 text-sm text-muted @max-[62rem]/audit:hidden">{AUDIT_BAR_TITLE}</p>
      {data.status === 'error' && (
        <p className="truncate text-sm text-red">Couldn’t load the audit data: {data.message}</p>
      )}
      {view && (
        <>
          <ul className="flex shrink-0 items-center gap-5">
            {view.counters.map((counter) => (
              <AuditCounter
                key={counter.id}
                counter={counter}
                progress={progress}
                onFollow={(c) => follow(c.link, false)}
              />
            ))}
          </ul>
          <AuditSegments segments={view.segments} progress={progress} onFollow={(s) => follow(s.link, true)} />
        </>
      )}
    </section>
  )
}
