import i18n from '../i18n'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

/**
 * The admin panel's UI strings: an i18next namespace of its own, registered when the lazy admin
 * chunk is evaluated, so none of it ships in the public bundle. Components read it with
 * `useTranslation(ADMIN_NS)`; the public namespace (`translation`) is left untouched.
 */
export const ADMIN_NS = 'admin'

i18n.addResourceBundle('en', ADMIN_NS, en, true, true)
i18n.addResourceBundle('zh-Hant', ADMIN_NS, zhHant, true, true)

/** A translate function as the helpers outside components need it (the `t` of `useTranslation(ADMIN_NS)`). */
export type Translate = (key: string, options?: Record<string, unknown>) => string
