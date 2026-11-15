import { formatHash, type ViewId } from '../lib/route'
import { Cite } from './Cite'

const NAV: readonly { view: ViewId; label: string }[] = [
  { view: 'overview', label: 'Overview' },
  { view: 'summarize', label: 'Summarize' },
  { view: 'rank', label: 'Rank' },
  { view: 'interpret', label: 'Interpret' },
]

type HeaderProps = {
  active: ViewId
}

export function Header({ active }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-stretch justify-between gap-6 border-b border-line px-6">
      <div className="flex items-center gap-4">
        <a href={formatHash('overview')} className="text-lg font-bold">
          ZERO-DRAFT
        </a>
        <p className="hidden text-sm lg:block">
          NASA screens spacecraft materials with a 1g test that ignores low gravity.
          <Cite id="psi26.impacts" />
        </p>
      </div>
      <nav aria-label="Views" className="flex items-stretch gap-6">
        {NAV.map(({ view, label }) => (
          <a
            key={view}
            href={formatHash(view)}
            aria-current={view === active ? 'page' : undefined}
            className={`-mb-px flex items-center border-b-2 text-sm ${
              view === active ? 'border-cyan' : 'border-transparent hover:border-line'
            }`}
          >
            {label}
          </a>
        ))}
      </nav>
    </header>
  )
}
