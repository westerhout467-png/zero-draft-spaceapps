import { useMemo } from 'react'
import { Eq61Inset } from '../components/twin/Eq61Inset'
import { TwinControls } from '../components/twin/TwinControls'
import { createFrameBus, FrameBusContext } from '../components/twin/twinFrame'
import { TwinStage } from '../components/twin/TwinStage'

/**
 * F1 Earth vs Orbit Burn Twin: the black stage, and under it a slim strip with the controls
 * and, at its right end, the Eq. 6.1 inset. The state lives in lib/burnStore; the frame bus
 * carries each animation frame from the stage's loop to the parts that show live values.
 */
export function BurnTwin() {
  const bus = useMemo(() => createFrameBus(), [])
  return (
    <FrameBusContext.Provider value={bus}>
      <div className="flex h-full min-h-[36rem] flex-col">
        <TwinStage />
        <div className="flex shrink-0 items-stretch gap-8 border-t border-line px-6 py-4">
          <TwinControls />
          <Eq61Inset />
        </div>
      </div>
    </FrameBusContext.Provider>
  )
}
