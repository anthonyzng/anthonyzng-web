import type { ReactNode } from 'react'

export type IconName = 'up' | 'down' | 'remove' | 'menu' | 'external' | 'plus'

// Stroked with currentColor, so forced-colours mode repaints them with the text.
const PATHS: Record<IconName, ReactNode> = {
  up: <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />,
  down: <path d="M12 5v14M18.5 12.5 12 19l-6.5-6.5" />,
  remove: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M3 8.5h18M3 15.5h18" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  plus: <path d="M12 5v14M5 12h14" />,
}

/** A decorative icon: always `aria-hidden`, the control it sits in carries the name. */
export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  )
}
