import type { IndexKey } from '../../lib/risk'

// The two cyan intensities of the index bar's segments, one per component, and the matching
// swatches beside the weight sliders. On the black stage, cyan at an opacity is cyan mixed with
// black. Each label color keeps at least 4.5:1 contrast on its segment.
export const SEGMENT_STYLE: Record<
  IndexKey,
  {
    /** Fill of the segment and its slider swatch. */
    fill: string
    /** Color of the component name written inside the segment. */
    text: string
    /**
     * Hides that name when the segment is narrower than it needs. A Tailwind container query
     * written out in full, so Tailwind sees it; the widths are the name at 12 px plus padding.
     */
    fit: string
  }
> = {
  lowO2: { fill: 'var(--color-cyan)', text: 'text-window', fit: '@max-[104px]:hidden' },
  coYield: { fill: 'color-mix(in srgb, var(--color-cyan) 55%, black)', text: 'text-ink', fit: '@max-[64px]:hidden' },
}
