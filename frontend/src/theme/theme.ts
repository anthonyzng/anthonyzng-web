export type Theme = 'light' | 'dark'

/** localStorage key; keep in sync with public/theme-init.js (run before first paint by index.html). */
export const THEME_STORAGE_KEY = 'theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage may be unavailable (private mode); the choice then lasts for this page view only.
  }
}

export function getSystemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

/** Subscribe to OS theme changes. Returns an unsubscribe function. */
export function onSystemThemeChange(callback: (theme: Theme) => void): () => void {
  const media = window.matchMedia(DARK_QUERY)
  const listener = (event: MediaQueryListEvent) => callback(event.matches ? 'dark' : 'light')
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}
