// A test's AI-read outcome for the views (SPEC F2b): the generated file joined with where the
// test's row is in Appendix A. Undefined until test-outcomes.json has loaded, and for good when
// it was never generated, so everything that shows an outcome renders nothing without it.
import { useAuditData } from './bass2Data'
import type { Bass2Row } from './audit'
import { useTestOutcomes, type Outcome, type TestOutcome, type TestOutcomesFile } from './generatedData'
import { outcomeFindings, outcomeView, type OutcomeFindings, type OutcomeView } from './outcomes'

/** Each loaded file's outcomes by test id, built once per file. */
const indexes = new WeakMap<TestOutcomesFile, Map<string, TestOutcome>>()
function byTestId(file: TestOutcomesFile): Map<string, TestOutcome> {
  let index = indexes.get(file)
  if (!index) {
    index = new Map(file.outcomes.map((outcome) => [outcome.testId, outcome]))
    indexes.set(file, index)
  }
  return index
}

export function useOutcome(testId: string): OutcomeView | undefined {
  const file = useTestOutcomes()
  const data = useAuditData()
  if (!file || data.status !== 'ready') return undefined
  const outcome = byTestId(file).get(testId)
  return outcome && outcomeView(outcome, data.bass2.flowEvidence[testId])
}

const kinds = new WeakMap<TestOutcomesFile, Map<string, Outcome>>()

/** Each test's outcome, for the outcome filter; undefined until the file has loaded (or for good without it). */
export function useOutcomeKinds(): ReadonlyMap<string, Outcome> | undefined {
  const file = useTestOutcomes()
  if (!file) return undefined
  let map = kinds.get(file)
  if (!map) {
    map = new Map(file.outcomes.map((outcome) => [outcome.testId, outcome.outcome]))
    kinds.set(file, map)
  }
  return map
}

const findings = new WeakMap<TestOutcomesFile, WeakMap<readonly Bass2Row[], OutcomeFindings>>()

/** What the reader found, set beside the sensors, over all the rows; undefined without the outcomes. */
export function useOutcomeFindings(rows: readonly Bass2Row[]): OutcomeFindings | undefined {
  const file = useTestOutcomes()
  if (!file) return undefined
  let perRows = findings.get(file)
  if (!perRows) {
    perRows = new WeakMap()
    findings.set(file, perRows)
  }
  let found = perRows.get(rows)
  if (!found) {
    found = outcomeFindings(rows, file.outcomes)
    perRows.set(rows, found)
  }
  return found
}
