import type { TurnstileInstance } from '@marsidev/react-turnstile'
import { useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveLanguage } from '../i18n/languages'
import type { Theme } from '../theme/theme'
import { useDocumentTheme } from '../theme/useDocumentTheme'

/**
 * Turnstile's language for the active locale. Cloudflare's codes are lowercase: `zh-TW` works, but
 * logs "not supported, falling back to: zh-tw" on every render.
 */
export type TurnstileLanguage = 'en' | 'zh-tw'

export function turnstileLanguage(language: string): TurnstileLanguage {
  return resolveLanguage(language) === 'zh-Hant' ? 'zh-tw' : 'en'
}

/** What `TurnstileWidget` needs; spread it onto the widget as is. */
export interface TurnstileWidgetBinding {
  widgetRef: RefObject<TurnstileInstance | undefined>
  theme: Theme
  language: TurnstileLanguage
  onToken(token: string): void
  onLapse(): void
}

export interface TurnstileState {
  /** The current token, or null until the widget has issued one for its current theme and language. */
  token: string | null
  /** Drops the token and runs the challenge again: a token is single-use, so after any request that spent it. */
  reset(): void
  /** Drops the token without touching the widget (it is about to remount and issue a new one). */
  clear(): void
  widget: TurnstileWidgetBinding
}

/**
 * The token state of one Turnstile widget that follows the page theme (`<html data-theme>`) and
 * language. The widget re-renders for a new theme or language and issues a new token; a token issued
 * before that is never returned, so an older one is never sent.
 */
export function useTurnstile(): TurnstileState {
  const { i18n } = useTranslation()
  const theme = useDocumentTheme()
  const language = turnstileLanguage(i18n.language)
  const widgetKey = `${theme}:${language}`
  const [issued, setIssued] = useState<{ token: string; widget: string } | null>(null)
  const widgetRef = useRef<TurnstileInstance | undefined>(undefined)

  const clear = () => setIssued(null)
  return {
    token: issued?.widget === widgetKey ? issued.token : null,
    // Cleared first: a widget that answers the reset at once (a cached challenge) keeps its new token.
    reset() {
      setIssued(null)
      widgetRef.current?.reset()
    },
    clear,
    widget: {
      widgetRef,
      theme,
      language,
      onToken: (token) => setIssued({ token, widget: widgetKey }),
      onLapse: clear,
    },
  }
}
