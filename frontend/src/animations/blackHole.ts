/**
 * The black hole behind the dark hero: one WebGL quad whose fragment shader draws, in units of the
 * shadow's radius, a lensed starfield (light bending round the hole), dust spiralling inwards
 * (features fixed in log r + t sink towards the centre), dark rings sliding in over the edge with a
 * slow breath (time passing at the horizon), the photon ring and the lensed far side of the disk
 * arching over the top, the tilted accretion disk whose near half passes in front of the shadow
 * (Doppler-brighter on the approaching side), and up to nine meteors as glowing line segments.
 * Crisp at full resolution: the ring and the shadow's edge are a pixel or two wide, and the noise is
 * cheap (two or three octaves, only where it shows).
 */

const VERTEX = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform vec2 uC; uniform float uRs; uniform float uT; uniform float uOct; uniform float uFlash;
uniform vec4 uM[9]; uniform vec2 uMB[9];
const float TAU=6.2831853;
float sst(float e0,float e1,float x){float t=clamp((x-e0)/(e1-e0),0.,1.);return t*t*(3.-2.*t);}
float h21(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}
float vnp(vec2 p,float per){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float x0=mod(i.x,per),x1=mod(i.x+1.,per);
  return mix(mix(h21(vec2(x0,i.y)),h21(vec2(x1,i.y)),f.x),mix(h21(vec2(x0,i.y+1.)),h21(vec2(x1,i.y+1.)),f.x),f.y);}
float fbmP(vec2 p,float per){float v=0.,a=.5,n=0.;for(int i=0;i<3;i++){if(float(i)>=uOct)break;v+=a*vnp(p,per);n+=a;p=p*2.+vec2(0.,7.3);per*=2.;a*=.5;}return v/n;}
vec3 stars(vec2 q,float sc,float th){vec2 g=q*sc;vec2 id=floor(g);float h=h21(id);if(h<th)return vec3(0.);
  vec2 f=fract(g)-.5;vec2 o=vec2(h21(id+3.1),h21(id+7.7))-.5;float d=length(f-o*.6);
  float s=sst(.1,0.,d)*(h-th)/(1.-th);float tw=.6+.4*sin(uT*1.7+h*40.);
  return s*tw*mix(vec3(.75,.85,1.),vec3(1.,.86,.72),h21(id+1.7));}
void main(){
  vec2 fc=gl_FragCoord.xy;vec2 p=(fc-uC)/uRs;float r=length(p);float a=atan(p.y,p.x);float t=uT;float px=1./uRs;
  float rsh=1.+.03*sin(t*.7);
  vec2 q=p-normalize(p+1e-5)*(1.15/max(r,.2));
  vec3 col=vec3(.006,.009,.02)+vec3(.01,.016,.035)*(1.-sst(0.,8.,r));
  col+=stars(q,1.1,.94)*1.5+stars(q+11.3,2.6,.97)*.9;
  float lr=log(max(r,.01));
  if(r>1.&&r<6.){float sw=a+1.5/r;float dust=fbmP(vec2(sw/TAU*10.,(lr+t*.09)*5.),10.);
    dust=sst(.55,.85,dust)*sst(6.,2.,r)*sst(1.,1.8,r);
    col+=dust*mix(vec3(.06,.26,.22),vec3(.9,.42,.12),sst(4.5,1.4,r))*.42;}
  float rip=pow(.5+.5*sin(lr*26.+t*2.4),3.);float breath=.5+.5*sin(t*.55);
  col*=1.-sst(2.2,1.,r)*(.25+.6*rip*(.35+.65*breath));
  float rw=max(.016,1.1*px);
  float ring=exp(-pow((r-rsh*1.06)/rw,2.))*1.7+exp(-max(r-rsh*1.06,0.)*5.)*.22*step(rsh,r);
  float top=sst(-.3,.9,p.y/max(r,1e-3));
  float arcN=.5+.5*vnp(vec2(a/TAU*32.-t*1.3,r*6.),32.);
  float arc=exp(-pow((r-1.3)/.085,2.))*(.15+.9*top)*arcN;
  col+=(ring*(1.+uFlash*2.5)+arc*.9)*vec3(1.,.8,.56);
  float shadow=sst(rsh+px*1.5,rsh-px*1.5,r);
  col*=1.-shadow;
  vec2 dp=vec2(p.x,p.y/.24);float dr=length(dp);
  float band=sst(1.48,1.6,dr)*sst(4.4,2.6,dr);
  if(band>0.){float da=atan(dp.y,dp.x);
    float streak=sst(.3,.8,fbmP(vec2((da/TAU+t*.3*pow(dr,-1.5))*24.,dr*7.),24.));
    float dop=1.+.65*(-dp.x/dr);vec3 dcol=mix(vec3(.85,.3,.08),vec3(1.,.92,.8),sst(4.,1.6,dr));
    float vis=p.y<0.?1.:1.-shadow;col+=dcol*band*(.18+streak*1.2)*dop*vis;}
  for(int i=0;i<9;i++){vec2 b=uMB[i];if(b.x<=0.)continue;vec4 m=uM[i];vec2 pa=fc-m.zw,ba=m.xy-m.zw;
    float hh=clamp(dot(pa,ba)/max(dot(ba,ba),1.),0.,1.);float d=length(pa-ba*hh);
    col+=(exp(-d*d/(b.y*b.y))*hh*hh*1.3+exp(-length(fc-m.xy)/(b.y*2.4))*.8)*b.x*vec3(.78,.92,1.);}
  vec2 uv=fc/uRes;col*=mix(.7,1.,sst(1.1,.3,length((uv-.5)*vec2(uRes.x/uRes.y,1.))*.8));
  col=1.-exp(-col*1.5);
  gl_FragColor=vec4(col,1.);
}`

export const MAX_METEORS = 9

export interface MeteorSegment {
  /** Head and tail, in canvas pixels with y up (WebGL's frame). */
  head: [number, number]
  tail: [number, number]
  brightness: number
  /** Core width, canvas pixels. */
  width: number
}

export interface BlackHoleFrame {
  /** Centre and shadow radius, in canvas pixels, y up. */
  center: [number, number]
  radius: number
  time: number
  octaves: number
  flash: number
  meteors: MeteorSegment[]
}

export interface BlackHoleRenderer {
  readonly canvas: HTMLCanvasElement
  draw(frame: BlackHoleFrame): void
  dispose(): void
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}

/** A renderer on `canvas`, or null without WebGL (or a shader the GPU refuses): the hero stays plain. */
export function createBlackHole(canvas: HTMLCanvasElement): BlackHoleRenderer | null {
  let gl: WebGLRenderingContext | null = null
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false })
  } catch {
    return null
  }
  if (!gl) return null
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  const program = gl.createProgram()
  if (!vs || !fs || !program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'a')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const u = (name: string) => gl.getUniformLocation(program, name)
  const U = { res: u('uRes'), c: u('uC'), rs: u('uRs'), t: u('uT'), oct: u('uOct'), flash: u('uFlash'), m: u('uM'), mb: u('uMB') }
  const segments = new Float32Array(MAX_METEORS * 4)
  const looks = new Float32Array(MAX_METEORS * 2)
  const ctx = gl

  return {
    canvas,
    draw(frame) {
      if (ctx.isContextLost()) return
      segments.fill(0)
      looks.fill(0)
      frame.meteors.slice(0, MAX_METEORS).forEach((m, i) => {
        segments.set([m.head[0], m.head[1], m.tail[0], m.tail[1]], i * 4)
        looks.set([m.brightness, m.width], i * 2)
      })
      ctx.viewport(0, 0, canvas.width, canvas.height)
      ctx.uniform2f(U.res, canvas.width, canvas.height)
      ctx.uniform2f(U.c, frame.center[0], frame.center[1])
      ctx.uniform1f(U.rs, frame.radius)
      // Wrapped well before float precision runs out; the wrap is a one-frame jump every 10 minutes.
      ctx.uniform1f(U.t, frame.time % 600)
      ctx.uniform1f(U.oct, frame.octaves)
      ctx.uniform1f(U.flash, frame.flash)
      ctx.uniform4fv(U.m, segments)
      ctx.uniform2fv(U.mb, looks)
      ctx.drawArrays(ctx.TRIANGLES, 0, 3)
    },
    dispose() {
      ctx.deleteBuffer(buffer)
      ctx.deleteProgram(program)
      ctx.deleteShader(vs)
      ctx.deleteShader(fs)
      // The context itself is left to the canvas: losing it here would also break a later renderer on
      // the same canvas (React runs effects twice in development, and re-runs them on a change).
    },
  }
}
