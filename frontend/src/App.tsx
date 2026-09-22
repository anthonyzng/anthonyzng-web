import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router'
import { LanguageLayout } from './components/LanguageLayout'
import { resolveLanguage, slugFromLanguage } from './i18n/languages'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'

export function App() {
  return (
    <Routes>
      <Route index element={<RedirectToLanguage />} />
      <Route path=":lang" element={<LanguageLayout />}>
        <Route index element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

/** "/" -> "/en" or "/zh-hant", based on the saved or browser language. */
function RedirectToLanguage() {
  const { i18n } = useTranslation()
  return <Navigate to={`/${slugFromLanguage(resolveLanguage(i18n.language))}`} replace />
}
