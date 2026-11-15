import { useId } from 'react'

type SegmentedProps<T extends string> = {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}

/**
 * A row of mutually exclusive options (native radio buttons, so arrow keys move between them).
 * The selected one has a cyan border and ink text; nothing changes weight.
 */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const name = useId()
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-sm leading-5 text-muted">{label}</legend>
      <div className="flex">
        {options.map((option, index) => {
          const checked = option.value === value
          return (
            <label
              key={option.value}
              className={`-ml-px flex h-8 cursor-pointer items-center border px-2.5 text-sm whitespace-nowrap has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan ${
                index === 0 ? 'ml-0 rounded-l-sm' : ''
              } ${index === options.length - 1 ? 'rounded-r-sm' : ''} ${
                checked ? 'relative z-10 border-cyan text-ink' : 'border-line text-muted hover:text-ink'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
