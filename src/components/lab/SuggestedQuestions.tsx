import { cachedAnswer, labStore } from '../../lib/labStore'
import { SUGGESTED } from '../../lib/labSuggested'

/** The suggested questions (SPEC F5). Cached ones answer at once, with the network off too. */
export function SuggestedQuestions({ busy, onPick }: { busy: boolean; onPick?: () => void }) {
  return (
    <section aria-labelledby="lab-suggested" className="flex flex-col gap-2">
      <h3 id="lab-suggested" className="text-xs leading-5 text-muted">
        Suggested questions
      </h3>
      <ul className="flex flex-col gap-1">
        {SUGGESTED.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onPick?.()
                void labStore.askSuggested(item.id)
              }}
              className="w-full rounded-sm py-1 text-left text-sm leading-5 text-ink hover:text-cyan disabled:cursor-not-allowed disabled:text-muted"
            >
              {item.question}
              {!cachedAnswer(item.id) && <span className="sr-only"> (asks live)</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
