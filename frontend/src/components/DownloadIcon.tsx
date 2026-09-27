interface DownloadIconProps {
  className?: string
}

/** An arrow down onto a tray; decorative (the link's text names the download). */
export function DownloadIcon({ className = 'size-4' }: DownloadIconProps) {
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
      <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" />
    </svg>
  )
}
