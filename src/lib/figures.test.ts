import { describe, expect, it } from 'vitest'
import { numbersIn } from './answerCheck'
import { getClaim, getSource } from './claims'
import { CLAIM_FIGURES, FIGURES, figuresFor, pageHasFigure } from './figures'
import { EQ61_COEFFICIENTS } from './physics'

// The images that exist under public/img, as paths like "img/eq61-bass2-p75.png".
const IMAGES = Object.keys(import.meta.glob('../../public/img/*.png')).map((path) => path.replace('../../public/', ''))

describe('figures', () => {
  it('have their image under public/ and a source in sources.json', () => {
    for (const figure of Object.values(FIGURES)) {
      expect(IMAGES, figure.src).toContain(figure.src)
      expect(getSource(figure.sourceId), figure.sourceId).toBeDefined()
    }
  })

  it('are shown only with verified claims', () => {
    for (const claimId of Object.keys(CLAIM_FIGURES)) expect(getClaim(claimId)?.verified, claimId).toBe(true)
  })

  it('show Eq. 6.1 with exactly the coefficients the physics uses', () => {
    // check:claims finds this text on report p. 75; here, its numbers are the model's.
    expect(numbersIn(FIGURES.eq61.pageText).map(Number)).toEqual([...EQ61_COEFFICIENTS])
    expect(figuresFor('twin.orbit-limit')).toEqual([FIGURES.eq61])
    expect(figuresFor('bass2.co.smac')).toEqual([])
  })

  it('match page text the way the PDF garbles it, after normalize()', () => {
    expect(pageHasFigure('( )2O 6exp 0.5 0.0167 13.4X a a= − + + (6.1)', FIGURES.eq61)).toBe(true)
    expect(pageHasFigure('( )2O 6exp 0.5 0.0168 13.4X', FIGURES.eq61)).toBe(false)
  })
})
