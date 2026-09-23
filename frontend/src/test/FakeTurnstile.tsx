import type { TurnstileInstance, TurnstileProps } from '@marsidev/react-turnstile'
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { turnstileFake } from './turnstileFake'

type FakeTurnstileProps = TurnstileProps & { ref?: Ref<TurnstileInstance | undefined> }

/**
 * Stand-in for the Turnstile widget: no Cloudflare script, no iframe. It exposes the options it was
 * rendered with as data attributes, issues a token on mount and after every option change (the real
 * widget re-renders itself then) and records resets, all driven by `turnstileFake`.
 */
export function FakeTurnstile({ ref, siteKey, options, onSuccess }: FakeTurnstileProps) {
  const latest = useRef(onSuccess)
  useEffect(() => {
    latest.current = onSuccess
  })

  const theme = options?.theme
  const language = options?.language
  useEffect(() => {
    if (turnstileFake.autoSolve) latest.current?.(turnstileFake.token)
  }, [theme, language])

  useImperativeHandle(
    ref,
    () =>
      ({
        reset() {
          turnstileFake.reset()
          if (turnstileFake.autoSolve) latest.current?.(turnstileFake.token)
        },
      }) as unknown as TurnstileInstance,
    [],
  )

  return <div data-testid="turnstile" data-sitekey={siteKey} data-theme={theme} data-language={language} />
}
