import { useId } from 'react'

type SwitchProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/**
 * A toggle that takes effect at once (CLAUDE.md interaction 13). The word "On" or "Off" sits
 * beside the track, so its state never rests on color alone. Clicking the label toggles it too.
 */
export function Switch({ label, checked, onChange }: SwitchProps) {
  const id = useId()
  return (
    <div className="flex items-center gap-3 text-sm">
      <label htmlFor={id} className="cursor-pointer">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="group flex cursor-pointer items-center gap-2"
      >
        <span
          aria-hidden="true"
          className={`relative h-4 w-7 rounded-sm border transition-colors duration-150 ${
            checked ? 'border-cyan bg-cyan/20' : 'border-line bg-graphite'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 size-2.5 rounded-[1px] transition-transform duration-150 ease-out ${
              checked ? 'translate-x-3 bg-cyan' : 'bg-muted'
            }`}
          />
        </span>
        <span className="w-6 text-left text-muted">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  )
}
