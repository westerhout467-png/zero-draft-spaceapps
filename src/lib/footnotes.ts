// Footnote numbering and preview placement for <Cite>. Pure, so it can be tested without a DOM.

/**
 * Numbers footnotes ¹ ² ³ in order of first appearance. Takes claim ids in document order.
 * A claim cited twice keeps its first number, as in a paper's reference list.
 */
export function numberFootnotes(idsInOrder: readonly string[]): Map<string, number> {
  const numbers = new Map<string, number>()
  for (const id of idsInOrder) {
    if (!numbers.has(id)) numbers.set(id, numbers.size + 1)
  }
  return numbers
}

/** True when two numberings give every id the same number. */
export function sameNumbers(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false
  for (const [id, n] of a) if (b.get(id) !== n) return false
  return true
}

export interface AnchorRect {
  top: number
  bottom: number
  left: number
  width: number
}

/** Space between the footnote and its preview, and between the preview and the window edge. */
export const PREVIEW_GAP_PX = 8

/**
 * Where a footnote's preview goes, in viewport pixels: centred above the footnote, or below it
 * when there is no room above (the header), and kept inside the window's left and right edges.
 */
export function placePreview(
  anchor: AnchorRect,
  box: { width: number; height: number },
  viewportWidth: number,
): { top: number; left: number } {
  const above = anchor.top - PREVIEW_GAP_PX - box.height
  const top = above >= PREVIEW_GAP_PX ? above : anchor.bottom + PREVIEW_GAP_PX
  const centred = anchor.left + anchor.width / 2 - box.width / 2
  const maxLeft = viewportWidth - PREVIEW_GAP_PX - box.width
  const left = Math.max(PREVIEW_GAP_PX, Math.min(centred, maxLeft))
  return { top, left }
}
