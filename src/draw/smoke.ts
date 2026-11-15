// A thin wisp of smoke: soft grey puffs that rise, wander, spread and fade. Only the Earth flame
// has one, because only on Earth does hot gas rise. An illustration.
import { glow, noise } from './noise'

const MAX_PUFFS = 90
const COLOR = '168,162,154'

interface Puff {
  x: number
  y: number
  rise: number
  size: number
  alpha: number
  age: number
  life: number
  seed: number
}

export class Smoke {
  private puffs: Puff[] = []
  private owed = 0

  /** Releases puffs at (x, y) at `perSecond`, each starting `size` px across at `alpha`. */
  emit(dt: number, x: number, y: number, perSecond: number, size: number, alpha: number): void {
    this.owed += perSecond * dt
    while (this.owed >= 1) {
      this.owed -= 1
      if (this.puffs.length >= MAX_PUFFS) this.puffs.shift()
      this.puffs.push({
        x: x + (Math.random() - 0.5) * size * 0.5,
        y,
        rise: 34 + Math.random() * 22,
        size: size * (0.8 + Math.random() * 0.5),
        alpha: alpha * (0.7 + Math.random() * 0.5),
        age: 0,
        life: 2.6 + Math.random() * 2,
        seed: Math.random() * 100,
      })
    }
  }

  update(dt: number): void {
    for (const puff of this.puffs) {
      puff.age += dt
      puff.y -= puff.rise * dt
      puff.rise *= 1 - 0.25 * dt
      puff.x += noise(puff.age * 0.9, puff.seed) * 16 * dt
    }
    this.puffs = this.puffs.filter((puff) => puff.age < puff.life)
  }

  clear(): void {
    this.puffs = []
    this.owed = 0
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const puff of this.puffs) {
      const t = puff.age / puff.life
      // Fades in quickly, then out slowly, growing all the while.
      const fade = Math.min(1, t / 0.12) * (1 - t) * (1 - t)
      const radius = puff.size * (1 + 2.6 * t)
      glow(ctx, puff.x, puff.y, radius, radius * 1.25, COLOR, puff.alpha * fade)
    }
  }
}

/** A still wisp above (x, y), for reduced motion: the same look with nothing moving. */
export function drawStillWisp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha: number,
): void {
  for (let i = 0; i < 7; i++) {
    const t = i / 6
    const radius = size * (1 + 2.2 * t)
    glow(ctx, x + noise(i * 0.7, 9) * size * 1.4 * t, y - t * size * 11, radius, radius * 1.3, COLOR, alpha * (1 - t) * 0.9)
  }
}
