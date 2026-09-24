import { Route, Routes } from 'react-router'
import { useAdminDocument } from './hooks/useAdminDocument'
import './i18n'
import { AdminNotFound } from './pages/AdminNotFound'
import { ContentEditorPage } from './pages/ContentEditorPage'
import { ContentListPage } from './pages/ContentListPage'
import { CvPage } from './pages/CvPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MessagesPage } from './pages/MessagesPage'
import { AdminSessionProvider } from './session/AdminSessionProvider'
import { RequireAuth } from './session/RequireAuth'

/**
 * The admin panel, loaded lazily for `/admin/*` (App.tsx), outside the public site's smooth
 * scrolling and language layout. Everything it needs, its strings included, lives in this chunk.
 */
export default function AdminApp() {
  useAdminDocument()
  return (
    <AdminSessionProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route index element={<DashboardPage />} />
          <Route path="content/:collection" element={<ContentListPage />} />
          <Route path="content/:collection/new" element={<ContentEditorPage mode="create" />} />
          <Route path="content/:collection/:slug" element={<ContentEditorPage mode="edit" />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="cv" element={<CvPage />} />
          <Route path="*" element={<AdminNotFound />} />
        </Route>
      </Routes>
    </AdminSessionProvider>
  )
}
