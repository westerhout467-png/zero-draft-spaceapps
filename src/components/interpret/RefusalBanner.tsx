import { getClaim, isVerified } from '../../lib/claims'
import { psia } from '../../lib/interpret'
import { useSim } from '../../lib/interpretStore'
import { Cite } from '../Cite'

/** NASA's own words, verbatim, in Source Serif 4, with the footnote. Hidden if unverified. */
function Quote({ id }: { id: string }) {
  const claim = getClaim(id)
  if (!claim?.verified || !claim.quote) return null
  return (
    <span className="block font-serif text-base leading-6 text-ink">
      “{claim.quote}”
      <Cite id={id} />
    </span>
  )
}

/**
 * What sits over the dimmed charts when the model won't predict (CLAUDE.md rule 6). For any
 * pressure other than 1 atm, SPEC F4's lunar refusal: BASS-II's solid tests ran at 1 atm; FLEX's
 * tests were planned across 0.5 to 1.5 atm but burned droplets, so nothing we indexed covers solid
 * cabin materials there. The Zayac atmosphere line shows on the lunar preset only.
 */
export function RefusalBanner() {
  const reason = useSim((state) => state.run[0].invalidReason)
  const pressureAtm = useSim((state) => state.inputs.pressureAtm)
  const lunar = useSim((state) => state.presetId === 'lunar' && !state.edited)
  if (!reason) return null
  const offPressure = pressureAtm !== 1
  // FLEX's planned range, 0.5 to 1.5 atm (psi69.pressure).
  const inFlexRange = pressureAtm >= 0.5 && pressureAtm <= 1.5

  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div role="status" className="flex max-w-[36rem] flex-col gap-4 bg-window/85 p-6">
        <h3 className="text-base leading-6 font-semibold">Outside tested range: no prediction</h3>
        {!offPressure ? (
          <p className="text-sm leading-6">{reason}.</p>
        ) : (
          <>
            {lunar && isVerified('zayac.atmospheres') && (
              <p className="flex flex-col gap-1 text-sm leading-6">
                NASA Glenn names the atmospheres of interest for the lunar lander and rover:
                <Quote id="zayac.atmospheres" />
              </p>
            )}
            <p className="flex flex-col gap-1 text-sm leading-6">
              BASS-II’s solid-material tests ran at 1 atm.
              <Quote id="bass2.pressure-1atm" />
            </p>
            <p className="flex flex-col gap-1 text-sm leading-6">
              <span>
                FLEX’s tests were planned at 0.5 to 1.5 atm
                {inFlexRange && (
                  <>
                    , which includes <span className="tabular-nums">{psia(pressureAtm).toFixed(1)}</span> psia (
                    <span className="tabular-nums">{pressureAtm.toFixed(2)}</span> atm)
                  </>
                )}
                , but it burned liquid droplets, not solids.
              </span>
              <Quote id="psi69.pressure" />
              <Quote id="psi69.droplets" />
            </p>
            {lunar && isVerified('zayac.burns-34') && (
              <p className="flex flex-col gap-1 text-sm leading-6">
                NASA Glenn’s 1g lab tests do burn solids in this atmosphere:
                <Quote id="zayac.burns-34" />
              </p>
            )}
            <p className="text-sm leading-6">
              Nothing we indexed covers solids at this pressure in microgravity or lunar gravity, so ZERO-DRAFT won’t
              predict here.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
