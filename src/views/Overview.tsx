import { BurnTwin } from './BurnTwin'

/** #/ : the Burn Twin fills the main area. Receives `params` (ViewProps) but reads none yet. */
export function Overview() {
  return (
    <>
      <h1 className="sr-only">Overview</h1>
      <BurnTwin />
    </>
  )
}
