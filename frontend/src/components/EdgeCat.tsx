import { useId } from 'react'
import type { CatKind } from './cats'

interface EdgeCatProps {
  kind: CatKind
  /** `lap`: one run across and back; longer for wide parents (cards) so the pace stays the same. */
  lap?: 'short' | 'long'
}

/**
 * A tiny cartoon cat that runs back and forth along the top edge of its positioned parent, turning
 * round at each end, legs paddling (all CSS: `.edge-cat*` in index.css, transforms and opacity
 * only). The parent decides when it shows (`group-hover`, focus, a data attribute); with reduced
 * motion the cat sits still at the left end. Purely decorative. Colours come from the
 * `data-cat` tokens in index.css; the rainbow cat fills with a gradient of its own.
 */
export function EdgeCat({ kind, lap = 'short' }: EdgeCatProps) {
  const gradient = `cat-rainbow-${useId().replace(/:/g, '')}`
  const fill = kind === 'rainbow' ? `url(#${gradient})` : 'var(--cat-fill)'

  return (
    <span aria-hidden="true" className="edge-cat-track" data-lap={lap}>
      <span className="edge-cat" data-cat={kind}>
        <svg viewBox="0 0 20 14" width="20" height="14" className="block overflow-visible">
          {kind === 'rainbow' ? (
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" className="cat-rainbow-1" />
                <stop offset="0.25" className="cat-rainbow-2" />
                <stop offset="0.5" className="cat-rainbow-3" />
                <stop offset="0.75" className="cat-rainbow-4" />
                <stop offset="1" className="cat-rainbow-5" />
              </linearGradient>
            </defs>
          ) : null}
          <g className="edge-cat-body" stroke="var(--cat-line)" strokeWidth="0.6" strokeLinejoin="round">
            {/* Tail, then the two pairs of legs (alternating frames), body, head and ears. */}
            <path d="M4.6 7.4 C2 6.8 1.4 4 3 2.9" fill="none" stroke={fill} strokeWidth="1.5" strokeLinecap="round" />
            <g className="edge-cat-legs-a" stroke={fill} strokeWidth="1.3" strokeLinecap="round">
              <path d="M6.2 10 L5 12.6" />
              <path d="M11.6 10 L12.8 12.6" />
            </g>
            <g className="edge-cat-legs-b" stroke={fill} strokeWidth="1.3" strokeLinecap="round">
              <path d="M6.6 10 L7.6 12.6" />
              <path d="M11.2 10 L10.2 12.6" />
            </g>
            <ellipse cx="9" cy="8" rx="5.2" ry="3" fill={fill} />
            <path d="M12.6 4.4 L13 1.4 L14.8 3.4 Z" fill={fill} />
            <path d="M15.7 3.3 L17.6 1.4 L17.8 4.4 Z" fill={fill} />
            <circle cx="15.3" cy="6" r="3.1" fill={fill} />
          </g>
          <circle cx="16.4" cy="5.6" r="0.6" fill="var(--cat-eye)" />
          <circle cx="17.6" cy="7.1" r="0.45" fill="var(--cat-nose)" />
        </svg>
      </span>
    </span>
  )
}
