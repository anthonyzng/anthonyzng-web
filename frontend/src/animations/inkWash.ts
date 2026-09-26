/**
 * The ink-wash renderer behind `useInkWash`: one WebGL quad whose fragment shader lays ink over the
 * hero in the page's background colour. Ink blooms where a warped fractal noise field (fixed to the
 * hero, like ink soaking into paper that scrolls with it) falls under a rising threshold; the part of
 * the hero on screen is inked from its edges inwards, and the wet edge frays with a fine fibre
 * texture and pools darker, like ink on rice paper (solid ink is exactly the background colour, so
 * the covered hero is indistinguishable from the page below it). Nothing here touches the DOM beyond its canvas.
 */

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uRes;
uniform vec2 uView;
uniform float uAmount;
uniform float uTime;
uniform vec3 uColor;
uniform float uPool;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  // Hero coordinates, top-based (y = 0 at the hero's top), in hero-width units for round blots.
  vec2 hero = vec2(vUv.x, 1.0 - vUv.y);
  vec2 p = vec2(hero.x, hero.y * uRes.y / uRes.x) * 2.4;
  vec2 warp = vec2(fbm(p + uTime * 0.02), fbm(p + vec2(5.2, 1.3) - uTime * 0.015));
  float blots = fbm(p + 2.2 * warp);

  // Where this point sits on screen: 0 at the edges of the visible part of the hero, 1 at its centre.
  float screenY = clamp((hero.y - uView.x) / max(uView.y - uView.x, 0.001), 0.0, 1.0);
  float edge = min(min(hero.x, 1.0 - hero.x), min(screenY, 1.0 - screenY)) * 2.0;

  // Low values are inked first: blots bloom anywhere, a little sooner towards the screen's edges.
  float order = mix(blots, edge, 0.22);
  float front = uAmount * 1.35 - 0.15;
  float ink = 1.0 - smoothstep(front - 0.05, front + 0.04, order);
  // Water runs ahead of the ink: a faint wash just beyond the front.
  float wash = 1.0 - smoothstep(front - 0.02, front + 0.14, order);

  // Rice-paper fibres fray the wet edge (and only the edge: solid ink and bare paper stay clean).
  float fibre = noise(p * 26.0) * noise(p * 7.0 + 3.1);
  ink = clamp(ink + (fibre - 0.25) * ink * (1.0 - ink) * 1.6, 0.0, 1.0);

  // Ink pools at the wet edge, a darker ring fading into the solid ink behind it; the wash ahead of
  // it is darker and faint.
  float pool = smoothstep(0.0, 0.5, ink) * (1.0 - smoothstep(0.55, 1.0, ink));
  float alpha = max(ink, wash * 0.22 * (0.6 + 0.8 * fibre));
  vec3 color = uColor * (1.0 - uPool * max(pool, (1.0 - ink) * wash * 0.5));
  gl_FragColor = vec4(color * alpha, alpha);
}
`

export interface InkFrame {
  /** 0: no ink, 1: the hero is covered. */
  amount: number
  /** The on-screen part of the hero, as fractions of its height from its top: [top, bottom]. */
  view: readonly [number, number]
  /** Seconds, for the slow drift of the ink. */
  time: number
  /** The ink colour, 0..1 per channel (the page background). */
  color: readonly [number, number, number]
  /** How much darker the wet edge pools, 0..1. */
  pool: number
}

export interface InkRenderer {
  resize(width: number, height: number): void
  draw(frame: InkFrame): void
  dispose(): void
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('ink wash: no shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`ink wash: shader failed: ${log ?? ''}`)
  }
  return shader
}

/**
 * A renderer for `canvas`, or null where WebGL is unavailable (the page then stays static).
 * Throws only on a broken shader, which `runSafely` turns into the static page as well.
 */
export function createInkRenderer(canvas: HTMLCanvasElement): InkRenderer | null {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false })
  if (!gl) return null

  const program = gl.createProgram()
  if (!program) return null
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('ink wash: program failed to link')
  gl.useProgram(program)

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'aPos')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const uniform = (name: string) => gl.getUniformLocation(program, name)
  const uRes = uniform('uRes')
  const uView = uniform('uView')
  const uAmount = uniform('uAmount')
  const uTime = uniform('uTime')
  const uColor = uniform('uColor')
  const uPool = uniform('uPool')

  return {
    resize(width, height) {
      canvas.width = Math.max(1, Math.round(width))
      canvas.height = Math.max(1, Math.round(height))
      gl.viewport(0, 0, canvas.width, canvas.height)
    },
    draw({ amount, view, time, color, pool }) {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (amount <= 0) return
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform2f(uView, view[0], view[1])
      gl.uniform1f(uAmount, Math.min(amount, 1))
      gl.uniform1f(uTime, time)
      gl.uniform3f(uColor, color[0], color[1], color[2])
      gl.uniform1f(uPool, pool)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    dispose() {
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    },
  }
}

/** `#rgb` / `#rrggbb` as 0..1 channels; null for anything else. */
export function parseHexColor(value: string): [number, number, number] | null {
  const hex = value.trim().replace(/^#/, '')
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number]
}
