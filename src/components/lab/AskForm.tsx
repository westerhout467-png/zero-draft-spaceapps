import { ArrowUp } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { MAX_QUESTION_CHARS } from '../../lib/labProtocol'
import { labStore } from '../../lib/labStore'

/** The question box. A form, so Enter asks; the button is off while a question runs (CLAUDE.md 12, 13). */
export function AskForm({ busy }: { busy: boolean }) {
  const [question, setQuestion] = useState('')
  const id = useId()
  const empty = question.trim().length === 0

  function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || empty) return
    void labStore.ask(question)
    setQuestion('')
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-t border-line px-6 py-4">
      <label htmlFor={id} className="sr-only">
        Ask Lab Partner
      </label>
      <input
        id={id}
        type="text"
        value={question}
        maxLength={MAX_QUESTION_CHARS}
        onChange={(event) => setQuestion(event.currentTarget.value)}
        placeholder="Ask about the BASS-II fire tests"
        autoComplete="off"
        className="h-9 min-w-0 flex-1 rounded-sm border border-line bg-transparent px-3 text-sm text-ink placeholder:text-muted focus-visible:border-cyan"
      />
      <button
        type="submit"
        disabled={busy || empty}
        aria-label="Ask"
        className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-ink bg-ink text-graphite transition-transform duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-muted disabled:active:scale-100"
      >
        <ArrowUp aria-hidden="true" className="size-4" />
      </button>
    </form>
  )
}
