import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { AskForm } from '../components/lab/AskForm'
import { LabTurn } from '../components/lab/LabTurn'
import { SuggestedQuestions } from '../components/lab/SuggestedQuestions'
import { useCitation } from '../components/citationContext'
import { labStore, useLab } from '../lib/labStore'

type LabPartnerDockProps = {
  open: boolean
  onToggle: () => void
}

/**
 * F5 Lab Partner dock: full height on the right of every view, a 48px rail by default and 384px
 * when open. A text section on the page background, so no frame. Questions go to
 * /api/lab-partner; the tools it runs change the views behind it, each with an Undo.
 */
export function LabPartnerDock({ open, onToggle }: LabPartnerDockProps) {
  return (
    <aside
      id="lab-partner-dock"
      aria-label="Lab Partner"
      className={`flex shrink-0 flex-col border-l border-line ${open ? 'w-96' : 'w-12'}`}
    >
      {open ? (
        <OpenDock onClose={onToggle} />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          aria-controls="lab-partner-dock"
          aria-label="Open Lab Partner"
          className="flex h-full w-full flex-col items-center text-sm text-muted hover:text-ink focus-visible:outline-offset-[-2px]"
        >
          <span className="flex h-10 items-center">
            <PanelRightOpen aria-hidden="true" className="size-4" />
          </span>
          <span className="py-2 [writing-mode:vertical-rl]">Lab Partner</span>
        </button>
      )}
    </aside>
  )
}

function OpenDock({ onClose }: { onClose: () => void }) {
  const { openCitation } = useCitation()
  const reduceMotion = useReducedMotion() ?? false
  const turns = useLab((state) => state.turns)
  const busy = useLab((state) => state.busy)
  const [showSuggested, setShowSuggested] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Tools Lab Partner runs need the citation drawer and the motion setting from React.
  useEffect(() => {
    labStore.connect({ openCitation, reduceMotion })
  }, [openCitation, reduceMotion])

  // Keep the newest line in view as the answer arrives.
  useEffect(() => {
    const box = scrollRef.current
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [turns, reduceMotion])

  const empty = turns.length === 0
  return (
    <>
      <div className="flex h-10 shrink-0 items-center justify-between px-6">
        <h2 className="text-sm font-semibold">Lab Partner</h2>
        <button
          type="button"
          onClick={onClose}
          aria-expanded={true}
          aria-controls="lab-partner-dock"
          className="flex items-center gap-2 text-sm text-muted hover:text-ink"
        >
          <PanelRightClose aria-hidden="true" className="size-4" />
          Close
        </button>
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pt-2 pb-6">
        {empty && (
          <p className="text-sm leading-6 text-muted">
            Ask about the BASS-II fire tests. Lab Partner runs the app’s own models, changes the views to show you, and
            cites a source for every sentence: NASA’s words, or the model or audit a number came from. A script checks
            each quote and number before you see it.
          </p>
        )}
        {empty && <SuggestedQuestions busy={busy} />}
        {!empty && (
          <ol aria-label="Transcript" aria-live="polite" className="flex flex-col gap-8">
            {turns.map((turn) => (
              <LabTurn key={turn.id} turn={turn} busy={busy} />
            ))}
          </ol>
        )}
      </div>

      {!empty && (
        <div className="shrink-0 border-t border-line px-6 py-2">
          <button
            type="button"
            aria-expanded={showSuggested}
            onClick={() => setShowSuggested((shown) => !shown)}
            className="text-xs leading-5 text-muted hover:text-ink"
          >
            {showSuggested ? 'Hide suggested questions' : 'Suggested questions'}
          </button>
          {showSuggested && (
            <div className="pt-2 pb-1">
              <SuggestedQuestions busy={busy} onPick={() => setShowSuggested(false)} />
            </div>
          )}
        </div>
      )}
      <AskForm busy={busy} />
    </>
  )
}
