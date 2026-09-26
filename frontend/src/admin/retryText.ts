type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * "Too many attempts" with the wait from `Retry-After`: in seconds under a minute (a busy
 * password check asks for a few seconds; "1 minute" would overstate it), else in minutes.
 */
export function retryText(retryAfter: number | null, t: Translate): string {
  if (retryAfter === null) return t('login.errors.rateLimited')
  return retryAfter < 60
    ? t('login.errors.rateLimitedInSeconds', { count: Math.max(1, Math.ceil(retryAfter)) })
    : t('login.errors.rateLimitedIn', { count: Math.ceil(retryAfter / 60) })
}
