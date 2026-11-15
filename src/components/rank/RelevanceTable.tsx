import type { ReactNode } from 'react'
import { PSIA_PER_ATM } from '../../lib/interpret'
import { PHENOMENA, PHENOMENON_LABELS, type Range } from '../../lib/investigations'
import type { Scored, Target } from '../../lib/relevance'
import { getSource } from '../../lib/claims'
import { Cite } from '../Cite'

const n = (value: ReactNode) => <span className="tabular-nums">{value}</span>
const trim = (value: number) => String(Number(value.toFixed(2)))
const span = (r: Range, format: (v: number) => string) =>
  r.min === r.max ? format(r.min) : `${format(r.min)}–${format(r.max)}`

/** Text ending in a footnote that never wraps onto a line by itself: its last word holds it. */
function Cited({ text, id }: { text: string; id: string }) {
  const cut = text.lastIndexOf(' ') + 1
  return (
    <>
      {text.slice(0, cut)}
      <span className="whitespace-nowrap">
        {text.slice(cut)}
        <Cite id={id} />
      </span>
    </>
  )
}

/** "covers it" or "doesn't reach it": a word, never color alone. */
function Verdict({ ok }: { ok: boolean }) {
  return <span className={ok ? 'text-ink' : 'text-muted'}>{ok ? ', covers it' : ', doesn’t reach it'}</span>
}

function Atmosphere({ scored, target }: { scored: Scored; target: Target }) {
  const { o2Pct, pressurePsia } = scored.investigation
  return (
    <div className="flex flex-col gap-1">
      <p>
        {o2Pct ? (
          <>
            O2 {n(`${span(o2Pct.value, trim)}%`)}
            <Cite id={o2Pct.claimId} />
            <Verdict ok={scored.o2 === true} />
          </>
        ) : (
          <span className="text-muted">O2 not stated</span>
        )}
      </p>
      <p>
        {pressurePsia ? (
          <>
            {n(`${span(pressurePsia.value, (v) => trim(v / PSIA_PER_ATM))} atm`)}
            <Cite id={pressurePsia.claimId} />
            <Verdict ok={scored.pressure === true} />
          </>
        ) : (
          <span className="text-muted">Pressure not stated</span>
        )}
      </p>
      <p className="sr-only">
        Target: {target.o2Pct}% O2 at {target.psia} psia
      </p>
    </div>
  )
}

function Phenomena({ scored }: { scored: Scored }) {
  const named = PHENOMENA.flatMap((p) => {
    const claimId = scored.investigation.phenomena[p]
    return claimId ? [{ p, claimId }] : []
  })
  return (
    <div className="flex flex-col gap-1">
      <p>
        {named.map(({ p, claimId }, i) => (
          <span key={p}>
            <Cited text={i === 0 ? PHENOMENON_LABELS[p] : PHENOMENON_LABELS[p].toLowerCase()} id={claimId} />
            {i < named.length - 1 && ', '}
          </span>
        ))}
      </p>
      <p className="text-xs text-muted">
        {n(named.length)} of {n(PHENOMENA.length)}
      </p>
    </div>
  )
}

/** The ranked investigations: every cell is a cited fact or "Not stated". */
export function RelevanceTable({ ranked, target }: { ranked: Scored[]; target: Target }) {
  return (
    <table className="w-full table-fixed text-sm leading-5">
      <caption className="sr-only">
        Indexed investigations ranked by relevance to {target.o2Pct}% O2 at {target.psia} psia
      </caption>
      <colgroup>
        <col className="w-10" />
        <col className="w-[22%]" />
        <col className="w-[19%]" />
        <col className="w-[12%]" />
        <col />
        <col className="w-[13%]" />
        <col className="w-[9%]" />
        <col className="w-20" />
      </colgroup>
      <thead>
        <tr className="text-left text-xs text-muted">
          <th className="pb-2 font-normal">Rank</th>
          <th className="pb-2 font-normal">Investigation</th>
          <th className="pb-2 font-normal">Atmosphere tested</th>
          <th className="pb-2 font-normal">Gravity</th>
          <th className="pb-2 font-normal">Phenomena its record names</th>
          <th className="pb-2 font-normal">Spacecraft materials</th>
          <th className="pb-2 font-normal">Test table</th>
          <th className="pb-2 text-right font-normal">Relevance</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((scored, i) => {
          const inv = scored.investigation
          return (
            <tr key={inv.id} className="border-t border-line align-top">
              <td className="num py-3 text-muted">{i + 1}</td>
              <td className="py-3 pr-4">
                <p className="font-semibold">
                  {inv.name} <span className="font-normal text-muted">{getSource(inv.sourceId)?.short}</span>
                </p>
                <p className="text-muted">
                  <Cited text={inv.burned.value} id={inv.burned.claimId} />
                </p>
                <p className="text-xs text-muted">
                  <Cited text={inv.platform.value} id={inv.platform.claimId} />
                </p>
              </td>
              <td className="py-3 pr-4">
                <Atmosphere scored={scored} target={target} />
              </td>
              <td className="py-3 pr-4">
                <p>
                  <Cited text={inv.gravity.value === 'normal' ? 'A ground study' : 'Microgravity'} id={inv.gravity.claimId} />
                </p>
                <p className="text-xs text-muted">
                  {scored.components.gravity > 0 ? 'Not lunar gravity: half credit' : 'No gravity credit'}
                </p>
              </td>
              <td className="py-3 pr-4">
                <Phenomena scored={scored} />
              </td>
              <td className="py-3 pr-4">
                {inv.spacecraftMaterials ? (
                  <Cited text="Named" id={inv.spacecraftMaterials} />
                ) : (
                  <span className="text-muted">Not stated</span>
                )}
                {inv.caveat && (
                  <p className="text-xs text-muted">
                    <Cited text={inv.caveat.value} id={inv.caveat.claimId} />
                  </p>
                )}
              </td>
              <td className="py-3 pr-4">
                {inv.testTable ? (
                  <Cited text="In our sources" id={inv.testTable} />
                ) : (
                  <span className="text-muted">None indexed</span>
                )}
              </td>
              <td className="py-3 text-right">
                <p className="num text-xl leading-6">{scored.relevance.toFixed(1)}</p>
                {scored.unknown.length > 0 && (
                  <p className="text-xs text-muted">
                    {n(scored.unknown.length)} {scored.unknown.length === 1 ? 'part' : 'parts'} not stated
                  </p>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
