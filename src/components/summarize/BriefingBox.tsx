import { ChevronDown } from 'lucide-react'
import type { BriefingFile } from '../../lib/generatedData'

/**
 * The AI dataset briefing (F2), written by the pipeline in M7 from the computed statistics only,
 * with every number checked. SUMMARIZE renders these only when public/data/briefing.json exists.
 * The toggle sits at the right end of the header row, and the text opens under that row.
 */
export function BriefingToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="flex shrink-0 items-center gap-2 text-sm leading-6"
    >
      <ChevronDown
        aria-hidden="true"
        className={`size-4 text-muted transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
      />
      AI dataset briefing
      <span className="text-muted">AI-written, numbers checked</span>
    </button>
  )
}

export function BriefingText({ id, briefing }: { id: string; briefing: BriefingFile }) {
  return (
    <p id={id} className="max-w-3xl text-sm leading-6 text-ink">
      {briefing.sentences.join(' ')}
    </p>
  )
}
