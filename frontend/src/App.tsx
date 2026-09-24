import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, Route, Routes } from 'react-router'
import { SmoothScrollProvider } from './animations/SmoothScrollProvider'
import { ADMIN_RELOAD_FLAG, AdminLoadError } from './components/AdminLoadError'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LanguageLayout } from './components/LanguageLayout'
import { resolveLanguage, slugFromLanguage } from './i18n/languages'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'

// The admin panel is its own chunk (code, schemas and strings), fetched only when /admin is opened.
// If it cannot be fetched (typically a chunk name from before a deploy), one reload gets the current
// build; the flag (cleared by the admin once it runs) stops a broken build from reloading forever,
// and a second failure shows AdminLoadError (through the boundary below) instead of a blank page.
const AdminApp = lazy(() =>
  import('./admin/AdminApp').catch((error: unknown) => {
    try {
      if (!sessionStorage.getItem(ADMIN_RELOAD_FLAG)) {
        sessionStorage.setItem(ADMIN_RELOAD_FLAG, '1')
        location.reload()
        return new Promise<never>(() => {})
      }
    } catch {
      // No storage, no reload: never risk a loop.
    }
    throw error
  }),
)

export function App() {
  return (
    <Routes>
      <Route index element={<RedirectToLanguage />} />
      {/* Outside the smooth-scroll and language layouts: no Lenis, no GSAP, no language prefix. */}
      <Route
        path="admin/*"
        element={
          <ErrorBoundary fallback={<AdminLoadError />}>
            <Suspense fallback={null}>
              <AdminApp />
            </Suspense>
          </ErrorBoundary>
        }
      />
      {/* Pathless layout: one Lenis instance survives /en <-> /zh-hant. */}
      <Route
        element={
          <SmoothScrollProvider>
            <Outlet />
          </SmoothScrollProvider>
        }
      >
        <Route path=":lang" element={<LanguageLayout />}>
          <Route index element={<HomePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

/** "/" -> "/en" or "/zh-hant", based on the saved or browser language. */
function RedirectToLanguage() {
  const { i18n } = useTranslation()
  return <Navigate to={`/${slugFromLanguage(resolveLanguage(i18n.language))}`} replace />
}
