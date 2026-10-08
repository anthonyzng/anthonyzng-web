import { useEffect, useMemo, useRef } from 'react'
import { paperTile } from '../animations/inkPainting'
import { watchSectionArrivals } from '../animations/sectionArrival'
import { useBambooGrove } from '../animations/useBambooGrove'
import { useMotionAllowed } from '../animations/useMotionAllowed'
import { useNightSky } from '../animations/useNightSky'
import { useDocumentTheme } from '../theme/useDocumentTheme'

/**
 * The one background behind every home page section, fixed to the viewport (`-z-10`, under the
 * transparent sections, above the page colour). Dark: a night sky, three slow nebula glows (CSS,
 * transforms only) and streaming stars with a shooting star per arriving section (`useNightSky`).
 * Light: paper with the faintest grain, and the bamboo grove down both edges that sways as each
 * section arrives and drops a leaf now and then (`useBambooGrove`). Decorative throughout. Mounted
 * after the sections, so it can watch them arrive; `sectionsKey` changes when the set of sections does.
 */
export function PageBackdrop({ sectionsKey = '' }: { sectionsKey?: string }) {
  const theme = useDocumentTheme()
  const motion = useMotionAllowed()

  // Re-watched when a section comes or goes (the archive, with the API's content).
  useEffect(() => watchSectionArrivals(), [sectionsKey])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {theme === 'dark' ? <NightSky motion={motion} /> : <PaperGrove motion={motion} />}
    </div>
  )
}

function NightSky({ motion }: { motion: boolean }) {
  const sky = useRef<HTMLCanvasElement>(null)
  useNightSky(sky, motion)
  return (
    <>
      <div className="backdrop-nebula absolute inset-0">
        <i />
        <i />
        <i />
      </div>
      <canvas ref={sky} className="absolute inset-0 size-full" />
    </>
  )
}

function PaperGrove({ motion }: { motion: boolean }) {
  const grove = useRef<HTMLCanvasElement>(null)
  const leaves = useRef<HTMLCanvasElement>(null)
  useBambooGrove(grove, leaves, motion)
  // Painted once per mount: a 240px tile, repeated (img-src allows data: URLs).
  const paper = useMemo(() => paperTile('#f8f6f0')?.toDataURL() ?? null, [])
  return (
    <>
      {paper ? <div className="absolute inset-0" style={{ backgroundImage: `url(${paper})` }} /> : null}
      <canvas ref={grove} className="absolute inset-0 size-full" />
      <canvas ref={leaves} className="absolute inset-0 size-full" />
    </>
  )
}
