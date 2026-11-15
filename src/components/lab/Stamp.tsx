/** "T+00:12": time since the session's first question, mission-control style (SPEC F5). */
export function Stamp({ ms }: { ms: number }) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const text = `T+${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  return <span className="num w-12 shrink-0 text-xs leading-5 text-muted">{text}</span>
}
