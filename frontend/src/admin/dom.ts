/** The current page's h1 (focusable, see PageHeading): where focus goes when the element that had it is gone. */
export const pageHeading = (): HTMLElement | null => document.querySelector<HTMLElement>('#admin-main h1')
