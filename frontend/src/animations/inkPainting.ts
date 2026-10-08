/**
 * Ink-on-paper drawing for the light theme (Canvas 2D): the paper texture, the bamboo stalks that
 * run down the page, the leaves that fall from them, and the hills, rocks and stream of the hero.
 * Everything is painted once into a canvas or a sprite; only falling leaves and water strokes are
 * drawn per frame. Seeded where the same picture must come out twice (the hero and the grove behind
 * the page share their stalks).
 */

export type Ctx = CanvasRenderingContext2D

/** Ink colour (sumi black) as an rgba() with the given alpha. */
export const inkRgba = (alpha: number): string => `rgba(27,28,24,${Math.max(0, alpha).toFixed(3)})`

export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))
export const smooth = (x: number): number => x * x * (3 - 2 * x)
export const easeOut = (x: number): number => 1 - Math.pow(1 - x, 3)
export const rand = (a: number, b: number): number => a + Math.random() * (b - a)

/** A seeded random generator (mulberry32): the same seed paints the same stalk. */
export function rng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A canvas, or null where the environment has none (tests). */
export function makeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas.getContext('2d') ? canvas : null
}

/**
 * A tile of paper: a little grain and a few fibres, and the faintest weave (most of it removed: it
 * fought the text). Seamless: the fibres are drawn wrapped round the tile's edges.
 */
export function paperTile(base: string, size = 240): HTMLCanvasElement | null {
  const canvas = makeCanvas(size, size)
  const g = canvas?.getContext('2d')
  if (!canvas || !g) return null
  g.fillStyle = base
  g.fillRect(0, 0, size, size)
  const image = g.getImageData(0, 0, size, size)
  const d = image.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 3
    d[i] += n
    d[i + 1] += n * 0.95
    d[i + 2] += n * 0.8
  }
  g.putImageData(image, 0, 0)
  for (let y = 0; y < size; y += 2) {
    g.fillStyle = `rgba(90,66,30,${rand(0.002, 0.006).toFixed(4)})`
    g.fillRect(0, y, size, 1)
  }
  for (let k = 0; k < 40; k++) {
    g.strokeStyle = `rgba(120,96,60,${rand(0.02, 0.05).toFixed(3)})`
    g.lineWidth = rand(0.3, 0.8)
    const x = rand(0, size)
    const y = rand(0, size)
    const a = rand(0, Math.PI)
    const l = rand(6, 20)
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      g.beginPath()
      g.moveTo(x + ox, y + oy)
      g.quadraticCurveTo(x + ox + Math.cos(a) * l * 0.5 + rand(-3, 3), y + oy + Math.sin(a) * l * 0.5 + rand(-3, 3), x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l)
      g.stroke()
    }
  }
  return canvas
}

/** The outline of a bamboo leaf, its base at the origin, pointing along +x. */
export function leafPath(g: Ctx, length: number): void {
  const w = length * 0.13
  g.beginPath()
  g.moveTo(0, 0)
  g.quadraticCurveTo(length * 0.3, -w, length, 0)
  g.quadraticCurveTo(length * 0.3, w, 0, 0)
}

export function drawLeaf(g: Ctx, x: number, y: number, angle: number, length: number, alpha: number): void {
  g.save()
  g.translate(x, y)
  g.rotate(angle)
  leafPath(g, length)
  g.fillStyle = inkRgba(alpha)
  g.fill()
  g.restore()
}

/** One falling leaf, pre-rendered: a darker base, a pale midrib. Drawn rotated and squashed per frame. */
export function leafSprite(): HTMLCanvasElement | null {
  const canvas = makeCanvas(132, 26)
  const g = canvas?.getContext('2d')
  if (!canvas || !g) return null
  g.translate(4, 13)
  leafPath(g, 124)
  const gradient = g.createLinearGradient(0, 0, 124, 0)
  gradient.addColorStop(0, 'rgba(20,22,18,.92)')
  gradient.addColorStop(1, 'rgba(40,44,36,.7)')
  g.fillStyle = gradient
  g.fill()
  g.strokeStyle = 'rgba(251,250,246,.35)'
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(6, 0)
  g.lineTo(110, 0)
  g.stroke()
  return canvas
}

/** Draws the leaf sprite: `squash` below 1 flattens it, which reads as the leaf turning in the air. */
export function drawSpriteLeaf(g: Ctx, sprite: HTMLCanvasElement, x: number, y: number, rotation: number, scale: number, alpha: number, squash = 1): void {
  g.save()
  g.translate(x, y)
  g.rotate(rotation)
  g.scale(scale * 0.42, scale * 0.42 * squash)
  g.globalAlpha = alpha
  g.drawImage(sprite, -66, -13)
  g.restore()
}

/**
 * A bamboo stalk from `yBottom` up past `yTop`: segments shaded across their width, a dark node
 * ring at each joint, and, in the upper part, side branches ending in a spray of leaves. Every
 * choice comes from `r`, so a seed always gives the same stalk. `outward` (-1 or 1), when given,
 * sends most branches that way, away from the page's text.
 */
export function bamboo(g: Ctx, x: number, yTop: number, yBottom: number, thick: number, alpha: number, lean: number, leafy: boolean, r: () => number, outward = 0): void {
  const R = (a: number, b: number) => a + r() * (b - a)
  let y = yBottom
  let cx = x
  const nodes: [number, number][] = []
  while (y > yTop) {
    const l = Math.min(R(60, 115) * (thick / 10 + 0.6), y - yTop + 20)
    const y2 = y - l
    const x2 = cx + lean * l
    const gradient = g.createLinearGradient(cx - thick, 0, cx + thick, 0)
    gradient.addColorStop(0, inkRgba(alpha))
    gradient.addColorStop(0.45, inkRgba(alpha * 0.45))
    gradient.addColorStop(1, inkRgba(alpha * 0.9))
    g.fillStyle = gradient
    g.beginPath()
    g.moveTo(cx - thick / 2, y - 2)
    g.lineTo(x2 - (thick / 2) * 0.96, y2 + 2)
    g.lineTo(x2 + (thick / 2) * 0.96, y2 + 2)
    g.lineTo(cx + thick / 2, y - 2)
    g.closePath()
    g.fill()
    g.strokeStyle = inkRgba(Math.min(1, alpha * 1.25))
    g.lineWidth = Math.max(1, thick * 0.22)
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(x2 - thick * 0.75, y2 + 1)
    g.quadraticCurveTo(x2, y2 - thick * 0.25, x2 + thick * 0.75, y2 + 1)
    g.stroke()
    nodes.push([x2, y2])
    y = y2
    cx = x2
  }
  if (!leafy) return
  for (const [nx, ny] of nodes) {
    if (ny > yBottom - (yBottom - yTop) * 0.35 || r() < 0.35) continue
    const dir = outward ? (r() < 0.85 ? outward : -outward) : r() < 0.5 ? -1 : 1
    const bl = R(30, 70) * (thick / 10 + 0.5)
    const bx = nx + dir * bl
    const by = ny - bl * 0.35
    g.strokeStyle = inkRgba(alpha * 0.8)
    g.lineWidth = Math.max(0.8, thick * 0.12)
    g.beginPath()
    g.moveTo(nx, ny)
    g.quadraticCurveTo(nx + dir * bl * 0.5, ny - bl * 0.3, bx, by)
    g.stroke()
    const n = 3 + Math.floor(r() * 3)
    for (let i = 0; i < n; i++) {
      const angle = (dir > 0 ? 0.35 : Math.PI - 0.35) + (i - n / 2) * 0.42 * dir + R(-0.15, 0.15)
      drawLeaf(g, bx, by, angle, R(34, 62) * (thick / 12 + 0.55), alpha * R(0.75, 1))
    }
  }
}

export interface StalkSpec {
  /** Position across the page, 0 to 1. */
  fx: number
  side: -1 | 1
  far: boolean
  thick: number
  alpha: number
  lean: number
  seed: number
}

/**
 * The stalks of the one grove that runs down both edges of the page (and through the hero). Phones
 * get fewer and slimmer stalks in a narrower band.
 */
export function stalkSpecs(phone: boolean): StalkSpec[] {
  const r = rng(53)
  const perSide = phone ? 3 : 4
  const spread = phone ? 0.12 : 0.15
  const specs: StalkSpec[] = []
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < perSide; i++) {
      const far = i % 2 === 0
      const f = ((i + r() * 0.8) / perSide) * spread
      specs.push({
        fx: side < 0 ? f : 1 - f,
        side,
        far,
        thick: far ? 3.5 + r() * 2.5 : (7 + r() * 5) * (phone ? 0.75 : 1),
        alpha: far ? 0.16 + r() * 0.1 : 0.45 + r() * 0.15,
        lean: (r() - 0.5) * 0.04,
        seed: 100 + specs.length * 7,
      })
    }
  }
  return specs
}

function noise1(seed: number): (x: number) => number {
  const r = rng(seed)
  const points = Array.from({ length: 64 }, r)
  return (x) => {
    const i = Math.floor(x)
    const f = x - i
    const a = points[((i % 64) + 64) % 64]
    const b = points[(((i + 1) % 64) + 64) % 64]
    return a + (b - a) * smooth(f)
  }
}

/**
 * A range of hills between x0 and x1: an ink wash under a dry-brush ridge line with short texture
 * strokes below it, painted on its own layer and faded out at both ends (a range never ends in a cut).
 */
export function mountains(target: Ctx, x0: number, x1: number, base: number, amp: number, alpha: number, depth: number, seed: number, freq = 1): void {
  const k = target.getTransform().a || 1
  const oy = base - amp - 12
  const ow = x1 - x0
  const oh = amp + depth + 12
  const layer = makeCanvas(ow * k, oh * k)
  const g = layer?.getContext('2d')
  if (!layer || !g) return
  g.setTransform(k, 0, 0, k, -x0 * k, -oy * k)
  const n = noise1(seed)
  const ridge = (x: number) => {
    const u = (x / 140) * freq
    return n(u) * 0.6 + n(u * 2.3 + 9) * 0.3 + n(u * 5.1 + 3) * 0.1
  }
  const points: [number, number][] = []
  for (let x = x0; x <= x1 + 6; x += 6) points.push([x, base - amp * ridge(x)])
  const top = Math.min(...points.map((p) => p[1]))
  const wash = g.createLinearGradient(0, top, 0, base + depth)
  wash.addColorStop(0, inkRgba(alpha))
  wash.addColorStop(0.55, inkRgba(alpha * 0.35))
  wash.addColorStop(1, inkRgba(0))
  g.beginPath()
  g.moveTo(x0, base + depth)
  for (const [x, y] of points) g.lineTo(x, y)
  g.lineTo(x1, base + depth)
  g.closePath()
  g.fillStyle = wash
  g.fill()
  g.lineCap = 'round'
  for (let i = 0; i < points.length - 1; i++) {
    g.strokeStyle = inkRgba(alpha * rand(1.1, 2))
    g.lineWidth = rand(0.6, 1.8)
    g.beginPath()
    g.moveTo(points[i][0], points[i][1] + rand(-0.5, 0.5))
    g.lineTo(points[i + 1][0], points[i + 1][1])
    g.stroke()
  }
  for (let c = 0; c < points.length / 2; c++) {
    const p = points[Math.floor(rand(0, points.length))]
    g.strokeStyle = inkRgba(alpha * 0.9)
    g.lineWidth = rand(0.5, 1.2)
    g.beginPath()
    g.moveTo(p[0], p[1] + rand(2, 10))
    g.lineTo(p[0] + rand(-6, 6), p[1] + rand(6, 22))
    g.stroke()
  }
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'destination-in'
  const fade = g.createLinearGradient(0, 0, layer.width, 0)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(0.18, '#000')
  fade.addColorStop(0.82, '#000')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = fade
  g.fillRect(0, 0, layer.width, layer.height)
  target.drawImage(layer, x0, oy, ow, oh)
}

/** A rock: an irregular wash, darker at its upper left, with an ink outline. */
export function rock(g: Ctx, x: number, y: number, size: number, alpha: number): void {
  const points = 9
  const radii = Array.from({ length: points }, () => rand(0.7, 1.15))
  g.beginPath()
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2
    const R = size * radii[i % points]
    const px = x + Math.cos(a) * R * 1.3
    const py = y + Math.sin(a) * R * 0.75 * (Math.sin(a) > 0 ? 0.5 : 1)
    if (i) g.lineTo(px, py)
    else g.moveTo(px, py)
  }
  const shade = g.createLinearGradient(x - size, y - size, x + size, y + size)
  shade.addColorStop(0, inkRgba(alpha))
  shade.addColorStop(1, inkRgba(alpha * 0.35))
  g.fillStyle = shade
  g.fill()
  g.strokeStyle = inkRgba(Math.min(1, alpha * 1.4))
  g.lineWidth = 1.2
  g.stroke()
}

export interface PathPoint {
  x: number
  y: number
  /** Width of the stream here. */
  w: number
  tx: number
  ty: number
  nx: number
  ny: number
}

/** A smooth path (Catmull-Rom) through `points`, sampled with its width, tangent and normal. */
export function makePath(points: [number, number][], widths: number[], samples = 180): PathPoint[] {
  const out: PathPoint[] = []
  for (let i = 0; i < samples; i++) {
    const u = (i / (samples - 1)) * (points.length - 1)
    const k = Math.min(points.length - 2, Math.floor(u))
    const f = u - k
    const p0 = points[Math.max(0, k - 1)]
    const p1 = points[k]
    const p2 = points[k + 1]
    const p3 = points[Math.min(points.length - 1, k + 2)]
    const cr = (a: number, b: number, c: number, d: number) =>
      0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f)
    out.push({ x: cr(p0[0], p1[0], p2[0], p3[0]), y: cr(p0[1], p1[1], p2[1], p3[1]), w: widths[k] + (widths[k + 1] - widths[k]) * f, tx: 0, ty: 0, nx: 0, ny: 0 })
  }
  out.forEach((p, i) => {
    const a = out[Math.max(0, i - 1)]
    const b = out[Math.min(samples - 1, i + 1)]
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
    p.tx = (b.x - a.x) / l
    p.ty = (b.y - a.y) / l
    p.nx = -p.ty
    p.ny = p.tx
  })
  return out
}

/** The point at `s` (0 to 1) along the path, interpolated. */
export function pathAt(path: PathPoint[], s: number): PathPoint {
  const f = clamp(s, 0, 1) * (path.length - 1)
  const i = Math.min(path.length - 2, Math.floor(f))
  const t = f - i
  const a = path[i]
  const b = path[i + 1]
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, tx: a.tx, ty: a.ty, nx: a.nx, ny: a.ny }
}

/** The first sample at or below `y` (the path runs downwards), with its position `s`; null above it. */
export function pathAtY(path: PathPoint[], y: number): (PathPoint & { s: number }) | null {
  if (y < path[0].y) return null
  for (let i = 0; i < path.length; i++) if (path[i].y >= y) return { s: i / (path.length - 1), ...path[i] }
  return null
}
