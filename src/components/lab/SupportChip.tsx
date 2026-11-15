import type { Chip } from '../../lib/labChips'
import { useCitation } from '../citationContext'

const CHIP = 'ml-1.5 inline-flex h-5 items-center rounded-sm border px-1.5 align-[1px] text-xs leading-none whitespace-nowrap'

export function SupportChip({ chip }: { chip: Chip }) {
  const { openCitation } = useCitation()
  if (chip.opens === null) return <span className={`${CHIP} border-line text-muted`}>{chip.label}</span>
  const opens = chip.opens
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`Source: ${chip.label}. Show source`}
      onClick={() => openCitation(opens)}
      className={`${CHIP} border-line text-cyan hover:border-cyan`}
    >
      {chip.label}
    </button>
  )
}
