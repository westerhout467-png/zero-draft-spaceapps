import { CircleAlert, CircleCheck } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { DROP_REASON_TEXT, REFUSAL, type LabStage } from '../../lib/labProtocol'
import { labStore, type Turn } from '../../lib/labStore'
import { chipsFor } from '../../lib/labChips'
import { SupportChip } from './SupportChip'
import { Stamp } from './Stamp'
import { ToolLineRow } from './ToolLineRow'

const STAGE_TEXT: Record<LabStage, string> = {
  searching: 'Searching NASA’s sources…',
  'choosing-tools': 'Choosing what to show…',
  'running-tools': 'Running the app’s models…',
  writing: 'Writing the answer…',
  checking: 'Checking every quote and number…',
}

/** One question and everything Lab Partner did about it. */
export function LabTurn({ turn, busy }: { turn: Turn; busy: boolean }) {
  const reduceMotion = useReducedMotion() ?? false
  const tools = turn.tools.map((line) => line.result)
  const reasons = turn.dropped ? [...new Set(turn.dropped.reasons.map((r) => DROP_REASON_TEXT[r]))] : []
  return (
    <li className="flex flex-col gap-3">
      <div className="flex gap-3">
        <Stamp ms={turn.atMs} />
        <p className="min-w-0 flex-1 text-sm leading-5">
          <span className="sr-only">You asked: </span>
          {turn.question}
        </p>
      </div>

      {turn.tools.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="What Lab Partner changed on screen">
          {turn.tools.map((line, index) => (
            <li key={line.result.id}>
              <ToolLineRow line={line} onUndo={() => labStore.undo(turn.id, index)} />
            </li>
          ))}
        </ul>
      )}

      {turn.stage && (
        <p role="status" className="pl-15 text-sm leading-5 text-muted">
          {STAGE_TEXT[turn.stage]}
        </p>
      )}

      {turn.sentences.length > 0 && (
        <div className="flex flex-col gap-2 pl-15">
          {turn.sentences.map((sentence, index) => (
            <motion.p
              key={index}
              className="text-sm leading-6 text-ink"
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            >
              {sentence.text}
              {chipsFor(sentence.supports, tools).map((chip) => (
                <SupportChip key={chip.key} chip={chip} />
              ))}
            </motion.p>
          ))}
        </div>
      )}

      {turn.status === 'done' && turn.refused && <p className="pl-15 text-sm leading-6 text-ink">{REFUSAL}</p>}

      {turn.dropped && (
        <p className="pl-15 text-xs leading-5 text-muted">
          {turn.dropped.count === 1 ? '1 sentence was' : `${turn.dropped.count} sentences were`} removed before you saw
          {turn.dropped.count === 1 ? ' it' : ' them'}: {reasons.join('; ')}.
        </p>
      )}

      {turn.error && (
        <p className="flex gap-2 pl-15 text-sm leading-5 text-muted">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber" />
          {turn.error}
        </p>
      )}

      {turn.status === 'done' && turn.sentences.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-15 text-xs leading-5 text-muted">
          <span className="flex items-center gap-1.5">
            <CircleCheck aria-hidden="true" className="size-3.5 text-emerald" />
            AI-written, checked
          </span>
          {turn.source === 'cached' ? (
            <>
              <span>Cached answer</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void labStore.ask(turn.question)}
                className="text-cyan hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
              >
                Ask live
              </button>
            </>
          ) : (
            turn.model && <span>{turn.model}</span>
          )}
        </div>
      )}
    </li>
  )
}
