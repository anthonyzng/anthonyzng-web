import { Turnstile } from '@marsidev/react-turnstile'
import { TURNSTILE_SITE_KEY } from '../env'
import type { TurnstileWidgetBinding } from './useTurnstile'

interface TurnstileWidgetProps {
  /** From `useTurnstile()`: the widget's handle, theme, language and token callbacks. */
  binding: TurnstileWidgetBinding
  /** Called after a new token is stored, e.g. to withdraw a "complete the verification" left by an early submit. */
  onToken?(): void
  /** The form's message for the widget (already translated), shown under it. */
  error?: string | null
  /** The id of that message, for a control that names it with `aria-describedby`. */
  errorId?: string
}

/**
 * The Cloudflare Turnstile widget as every form here uses it: the site key from the build, the page
 * theme and language, full width, always visible. The token lives in `useTurnstile`; an expired or
 * failed challenge withdraws it.
 */
export function TurnstileWidget({ binding, onToken, error, errorId }: TurnstileWidgetProps) {
  const { widgetRef, theme, language, onToken: store, onLapse } = binding
  return (
    <div>
      <Turnstile
        ref={widgetRef}
        siteKey={TURNSTILE_SITE_KEY}
        options={{ theme, language, size: 'flexible', appearance: 'always' }}
        onSuccess={(token) => {
          store(token)
          onToken?.()
        }}
        onExpire={onLapse}
        onError={onLapse}
      />
      {error ? (
        <p id={errorId} className="mt-2 text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
