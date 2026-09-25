import { useSyncExternalStore } from 'react'
import type { Theme } from './theme'

/**
 * The theme currently applied to `<html data-theme>`, wherever it was set (public/theme-init.js from
 * index.html, `useTheme`, or a system change). For components that must follow the page theme
 * without owning it, such as the Turnstile widget, which is an iframe and cannot read our tokens.
 */
export function useDocumentTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

function subscribe(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

const getSnapshot = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
const getServerSnapshot = (): Theme => 'light'
