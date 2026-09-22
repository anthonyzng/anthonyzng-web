import { useCallback, useEffect, useState } from 'react'
import {
  applyTheme,
  getStoredTheme,
  getSystemTheme,
  onSystemThemeChange,
  storeTheme,
  type Theme,
} from './theme'

/**
 * Current theme: follows the OS until the user picks one, then the choice is persisted.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? getSystemTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(
    () =>
      onSystemThemeChange((systemTheme) => {
        if (getStoredTheme() === null) setTheme(systemTheme)
      }),
    [],
  )

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    storeTheme(next)
    setTheme(next)
  }, [theme])

  return { theme, toggleTheme }
}
