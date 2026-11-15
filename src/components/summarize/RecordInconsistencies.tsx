import { getClaim, quotedField as field } from '../../lib/claims'
import { saffire1TableSize } from '../../lib/investigations'
import { Cite } from '../Cite'

/** NASA's words, in Source Serif, with their footnote. */
function Quoted({ id }: { id: string }) {
  return (
    <span className="font-serif">
      “{getClaim(id)?.quote}”
      <Cite id={id} />
    </span>
  )
}

/** A date or measurement inside a sentence: Archivo, tabular, never split at its hyphens. */
const n = (value: string) => <span className="whitespace-nowrap tabular-nums">{value}</span>

/**
 * F7: fields in NASA's PSI records that contradict each other, found while indexing the
 * investigations. Flagged, never fixed: the app uses each record's own description. Every value is
 * read from a quoted claim; nothing is typed in.
 */
export function RecordInconsistencies() {
  const size = saffire1TableSize()

  return (
    <section aria-labelledby="inconsistencies-heading" className="flex max-w-[60rem] flex-col gap-3">
      <h2 id="inconsistencies-heading" className="text-base leading-6 font-semibold">
        Record inconsistencies we flagged in NASA’s PSI catalog
      </h2>
      <p className="text-sm leading-6 text-muted">
        Fields in the investigation records that disagree with each other. We flag them and don’t fix them; the
        investigation index on Rank uses each record’s own description.
      </p>
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm leading-6 marker:text-muted">
        <li>
          Saffire-I’s record gives the same dates as SAME’s: it starts {n(field('psi98.start'))}
          <Cite id="psi98.start" /> and ends {n(field('psi98.end'))}
          <Cite id="psi98.end" />, and SAME’s starts {n(field('psi102.start'))}
          <Cite id="psi102.start" /> and ends {n(field('psi102.end'))}
          <Cite id="psi102.end" />. Saffire-II, its follow-on, starts {n(field('psi99.start'))}
          <Cite id="psi99.start" />.
        </li>
        <li>
          Saffire-I’s record also gives its proposal title as <Quoted id="psi98.proposal-title" />, which is about
          smoke and fire detection, SAME’s subject
          <Cite id="psi102.detector" />. Saffire-I’s own objectives are fire growth and flammability limits
          <Cite id="psi98.objective" />.
        </li>
        <li>
          Saffire-I’s Flight Platform field says{' '}
          <span className="font-serif">
            “{field('psi98.platform-field')}”
            <Cite id="psi98.platform-field" />
          </span>
          , and so does Saffire-III’s
          <Cite id="psi100.platform-field" />. But Saffire-I’s description says it ran on a Cygnus after it left the
          ISS
          <Cite id="psi98.cygnus" />, and so does Saffire-III’s
          <Cite id="psi100.cygnus" />.
        </li>
        <li>
          Saffire-III’s Research Impacts paragraph is Saffire-I’s, word for word: it begins{' '}
          <Quoted id="psi100.impacts-copied" />. Its end date is blank
          <Cite id="psi100.start" />.
        </li>
        {size && (
          <li>
            Saffire-I’s data table
            <Cite id="psi98.table-header" /> gives its sample a length of {n(size.lengthCm)} cm and a width of{' '}
            {n(size.widthCm)} cm
            <Cite id="psi98.table-s1" />, but its description says <Quoted id="psi98.size" />: the table swaps
            length and width.
          </li>
        )}
      </ol>
    </section>
  )
}
