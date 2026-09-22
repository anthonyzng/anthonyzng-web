import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANGUAGE, LANGUAGES, resolveLanguage } from './languages'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

// The URL prefix (/en, /zh-hant) is the source of truth once a page is open.
// Detection only decides where "/" redirects on a first visit.
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      'zh-Hant': { translation: zhHant },
    },
    supportedLngs: LANGUAGES.map((lang) => lang.code),
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lang',
      caches: ['localStorage'],
      convertDetectedLanguage: resolveLanguage,
    },
  })

export default i18n
