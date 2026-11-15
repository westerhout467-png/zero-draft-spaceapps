import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

type AnimatedNumberProps = {
  value: number
  decimals?: number
  className?: string
}

/** Summary numbers glide to a new value in 200 ms (written through a ref). Archivo tabular-nums, for sentences. */
export function AnimatedNumber({ value, decimals = 0, className = '' }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef(value)
  // React renders the first value once and never changes that text again; the effect writes
  // every later value straight to the element.
  const [first] = useState(value)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const write = (v: number) => {
      shown.current = v
      element.textContent = v.toFixed(decimals)
    }
    if (reduceMotion || shown.current === value) {
      write(value)
      return
    }
    const controls = animate(shown.current, value, { duration: 0.2, ease: [0.23, 1, 0.32, 1], onUpdate: write })
    return () => controls.stop()
  }, [value, decimals, reduceMotion])

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {first.toFixed(decimals)}
    </span>
  )
}
