// Bloom: a blurred copy of everything bright, added back on top, so light spills past its edges
// the way it does in a camera. Two copies: a tight glow and a wide haze. Both are blurred on
// canvases a quarter of the stage's size, which keeps it cheap enough for 60 fps, and are
// already smooth enough that stretching them back up doesn't show.

const DIVISOR = 4
/** Blur radii on the quarter-size canvases, px. On the stage they are four times as wide. */
const TIGHT_BLUR_PX = 2.5
const WIDE_BLUR_PX = 10

export class Bloom {
  private readonly tight = document.createElement('canvas')
  private readonly wide = document.createElement('canvas')
  private readonly canBlur: boolean

  constructor() {
    const probe = this.tight.getContext('2d')
    this.canBlur = probe !== null && 'filter' in probe
  }

  /**
   * Adds bloom to `ctx` from what `source` (the stage canvas itself) shows now.
   * `width` and `height` are the stage's CSS size; `ctx` must be scaled so those are its units.
   */
  apply(
    ctx: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    width: number,
    height: number,
    strength = 1,
  ): void {
    const w = width / DIVISOR
    const h = height / DIVISOR
    if (!this.copy(this.tight, source, w, h, TIGHT_BLUR_PX)) return
    if (!this.copy(this.wide, this.tight, w, h, WIDE_BLUR_PX)) return
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.globalAlpha = 0.32 * strength
    ctx.drawImage(this.tight, 0, 0, width, height)
    ctx.globalAlpha = 0.42 * strength
    ctx.drawImage(this.wide, 0, 0, width, height)
    ctx.restore()
  }

  /** Draws `source` into `target` at this size, blurred. */
  private copy(
    target: HTMLCanvasElement,
    source: HTMLCanvasElement,
    width: number,
    height: number,
    blurPx: number,
  ): boolean {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (target.width !== w) target.width = w
    if (target.height !== h) target.height = h
    const g = target.getContext('2d')
    if (!g || source.width === 0 || source.height === 0) return false
    g.globalCompositeOperation = 'copy'
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    if (this.canBlur) g.filter = `blur(${blurPx}px)`
    g.drawImage(source, 0, 0, w, h)
    return true
  }
}
