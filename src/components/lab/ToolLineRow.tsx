import { Undo2 } from 'lucide-react'
import { VIEW_LABELS } from '../../lib/labTools'
import type { ToolLine } from '../../lib/labStore'
import { Stamp } from './Stamp'

/** "Lab Partner → Interpret: opened Interpret, ran Replay Test M5", with its Undo (SPEC F5). */
export function ToolLineRow({ line, onUndo }: { line: ToolLine; onUndo: () => void }) {
  const { result } = line
  const view = result.view ? VIEW_LABELS[result.view] : null
  const opened = result.opensView && result.name !== 'navigate' && view ? `opened ${view}, ` : ''
  if (result.error) {
    return (
      <p className="flex gap-3 text-xs leading-5 text-muted">
        <Stamp ms={line.atMs} />
        <span>
          Lab Partner couldn’t use a tool: {result.error}. Nothing on screen changed.
        </span>
      </p>
    )
  }
  return (
    <div className="flex gap-3 text-sm leading-5">
      <Stamp ms={line.atMs} />
      <p className={`min-w-0 flex-1 ${line.undone ? 'text-muted line-through decoration-muted/60' : 'text-ink'}`}>
        <span className="text-muted">Lab Partner {view ? `→ ${view}` : ''}:</span> {opened}
        {result.summary}
      </p>
      {line.undone ? (
        <span className="shrink-0 text-xs leading-5 text-muted">Undone</span>
      ) : (
        <button
          type="button"
          onClick={onUndo}
          className="flex h-5 shrink-0 items-center gap-1 text-xs text-muted hover:text-ink"
        >
          <Undo2 aria-hidden="true" className="size-3.5" />
          Undo
        </button>
      )}
    </div>
  )
}
