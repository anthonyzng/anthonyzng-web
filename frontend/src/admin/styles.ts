/**
 * Shared class lists for the admin panel: the site's semantic tokens only, 44px targets
 * (`min-h-11` / `size-11`), and `aria-disabled` rather than `disabled` for busy or unavailable
 * actions, so a focused button never drops focus to <body> when it becomes unavailable.
 *
 * Bundle note: Tailwind builds one stylesheet from every source file, so a utility used only here
 * would still ship to every visitor of the public site. The admin therefore sticks to utilities the
 * public pages already use (square cards like the site's, the same gutters and spacing steps);
 * check `npm run build` before reaching for a new one.
 */

const BUTTON =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 px-5 text-sm font-medium ' +
  'transition-colors duration-200 aria-disabled:cursor-not-allowed aria-disabled:opacity-60'

export const PRIMARY_BUTTON = `${BUTTON} bg-accent text-accent-fg hover:opacity-90`
export const SECONDARY_BUTTON = `${BUTTON} border border-line bg-surface text-fg hover:text-accent`
export const DANGER_BUTTON = `${BUTTON} border border-line bg-surface text-error underline-offset-4 hover:underline`

export const ICON_BUTTON =
  'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center border border-line bg-surface text-muted ' +
  'transition-colors duration-200 hover:text-fg aria-disabled:cursor-not-allowed aria-disabled:opacity-60'

export const INPUT =
  'block min-h-11 w-full border border-line bg-surface px-3 py-1.5 text-fg placeholder:text-muted ' +
  'transition-colors duration-200 focus:border-fg aria-[invalid=true]:border-error'

/**
 * A native file input, fully accessible as is. Preflight strips its button bare, so the whole input
 * is drawn as a bordered 44px field instead (styling ::file-selector-button would add CSS to the
 * public stylesheet); the label above it says what it does.
 */
export const FILE_INPUT =
  'mt-2 block min-h-11 w-full cursor-pointer border border-line bg-surface px-3 py-3 text-sm text-fg ' +
  'transition-colors duration-200 hover:text-accent'

export const LABEL = 'block text-sm font-medium text-fg'
export const HINT = 'text-sm text-muted'
export const ERROR_TEXT = 'text-sm text-error'
export const CARD = 'border border-line bg-surface'
export const TEXT_LINK =
  'text-accent underline decoration-muted underline-offset-4 transition-colors duration-200 hover:decoration-accent'
export const BADGE = 'inline-flex items-center rounded-full border px-3 py-1 font-mono text-xs'
export const EYEBROW = 'font-mono text-xs uppercase tracking-label text-muted'
export const HEADING = 'text-title font-semibold tracking-tight text-balance'

/** A navigation entry or filter; the current one is underlined, so it stays marked in forced-colours mode. */
export const NAV_ITEM =
  'flex min-h-11 items-center justify-between gap-3 px-3 text-sm transition-colors duration-200 hover:bg-surface hover:text-fg'
export const NAV_ITEM_CURRENT = 'bg-surface font-medium text-fg underline decoration-muted underline-offset-8'
export const NAV_ITEM_IDLE = 'text-muted'
