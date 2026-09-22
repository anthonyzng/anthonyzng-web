import type { CSSProperties } from 'react'

type SkeletonVariant = 'bar' | 'pill' | 'field' | 'button' | 'card'

interface SkeletonProps {
  variant: SkeletonVariant
  /** Any CSS width, passed inline (fixed values only, never dynamic Tailwind classes). */
  width?: string
  /** Bar thickness. */
  height?: 'sm' | 'md'
}

/**
 * Textless, token-coloured placeholder shape for section shells until real content lands.
 * Always aria-hidden. The card's hatch `[data-plane]` gets image-style parallax, and project images
 * will later drop into the same frame.
 */
export function Skeleton({ variant, width, height = 'sm' }: SkeletonProps) {
  const style: CSSProperties | undefined = width ? { width } : undefined

  switch (variant) {
    case 'bar':
      return <div aria-hidden="true" className={`${height === 'md' ? 'h-5' : 'h-3'} rounded-sm bg-line`} style={style} />
    case 'pill':
      return <div aria-hidden="true" className="h-10 rounded-full border border-line" style={style} />
    case 'field':
      return (
        <div aria-hidden="true" className="flex flex-col gap-3" style={style}>
          <div className="h-3 w-24 rounded-sm bg-line" />
          <div className="h-12 border-b border-line" />
        </div>
      )
    case 'button':
      return <div aria-hidden="true" className="h-12 w-40 rounded-full border border-accent" style={style} />
    case 'card':
      return (
        <div aria-hidden="true" className="border border-line bg-surface" style={style}>
          <div className="relative aspect-[4/3] overflow-hidden border-b border-line">
            <div data-plane className="absolute inset-0 bg-hatch" />
          </div>
          <div className="flex flex-col gap-3 p-5">
            <Skeleton variant="bar" height="md" width="60%" />
            <Skeleton variant="bar" width="40%" />
          </div>
        </div>
      )
  }
}
