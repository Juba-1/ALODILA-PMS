import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import OwnerLayout from './components/OwnerLayout.jsx'
import DevLogin from './pages/auth/DevLogin.jsx'
import AccessDenied from './pages/AccessDenied.jsx'
import OwnerDashboard from './pages/owner/OwnerDashboard.jsx'
import OwnerPropertiesList from './pages/owner/OwnerPropertiesList.jsx'
import OwnerPropertyDetail from './pages/owner/OwnerPropertyDetail.jsx'
import OwnerReports from './pages/owner/OwnerReports.jsx'
import OwnerMaintenance from './pages/owner/OwnerMaintenance.jsx'
import { HtmlLangDirSync } from './components/HtmlLangDirSync.jsx'
import i18n from './i18n/config.js'
import { hasSupabaseConfig, supabase } from './lib/supabase/client.js'
import { isIgnorableAuthLockError } from './lib/supabase/authErrors.js'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { ToastProvider } from './components/toast/ToastProvider.jsx'
import { Toaster } from './components/toast/Toaster.jsx'
import { PlatformRoutes } from './platform/index.js'
import CompanyRoutes from './company/CompanyRoutes.jsx'
import { productForUser } from './lib/routing/paths.js'
import { COMPANY_HOME, OWNER_HOME, PLATFORM_HOME } from './lib/routing/paths.js'

function bootDir() {
  try {
    return localStorage.getItem('alodila-lang') === 'en' ? 'ltr' : 'rtl'
  } catch {
    return 'rtl'
  }
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const authAliveRef = useRef(true)

  useEffect(() => {
    authAliveRef.current = true

    async function init() {
      if (!hasSupabaseConfig || !supabase) {
        if (authAliveRef.current) setLoading(false)
        return
      }

      try {
        const { data, error } = await supabase.auth.getSession()
        if (error && !isIgnorableAuthLockError(error)) {
          console.warn('[App] getSession', error.message || error)
        }
        if (authAliveRef.current) setSession(data?.session ?? null)
      } catch (e) {
        if (!isIgnorableAuthLockError(e)) {
          console.warn('[App] getSession', e)
        }
      } finally {
        if (authAliveRef.current) setLoading(false)
      }
    }

    void init()

    if (!supabase) {
      return () => {
        authAliveRef.current = false
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (authAliveRef.current) setSession(newSession ?? null)
    })

    return () => {
      authAliveRef.current = false
      subscription?.unsubscribe?.()
    }
  }, [])

  if (loading) {
    return (
      <div dir={bootDir()} className="min-h-screen bg-slate-900 text-white">
        <div className="p-8 text-sm text-slate-300">{i18n.t('app.init')}</div>
      </div>
    )
  }

  if (!hasSupabaseConfig) {
    return (
      <div dir={bootDir()} className="min-h-screen bg-slate-900 text-white">
        <div className="p-8">
          <div className="text-lg font-bold">{i18n.t('app.supabaseMissing')}</div>
          <div className="mt-2 text-sm text-slate-300">{i18n.t('app.supabaseHint')}</div>
        </div>
      </div>
    )
  }

  const product = session ? productForUser(session.user) : null

  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <HtmlLangDirSync />
          {!session ? (
            <Routes>
              <Route path="*" element={<DevLogin />} />
            </Routes>
          ) : product === 'platform' ? (
            <Routes>
              <Route path="/platform/*" element={<PlatformRoutes user={session.user} />} />
              <Route path="/company/*" element={<Navigate to={PLATFORM_HOME} replace />} />
              <Route path="/owner/*" element={<Navigate to={PLATFORM_HOME} replace />} />
              <Route path="*" element={<Navigate to={PLATFORM_HOME} replace />} />
            </Routes>
          ) : product === 'owner' ? (
            <Routes>
              <Route path="/owner" element={<OwnerLayout />}>
                <Route index element={<OwnerDashboard />} />
                <Route path="properties" element={<OwnerPropertiesList />} />
                <Route path="properties/:id" element={<OwnerPropertyDetail />} />
                <Route path="reports" element={<OwnerReports />} />
                <Route path="maintenance" element={<OwnerMaintenance />} />
              </Route>
              <Route path="/platform/*" element={<AccessDenied user={session.user} />} />
              <Route path="/company/*" element={<Navigate to={OWNER_HOME} replace />} />
              <Route path="*" element={<Navigate to={OWNER_HOME} replace />} />
            </Routes>
          ) : product === 'company' ? (
            <Routes>
              <Route path="/company/*" element={<CompanyRoutes user={session.user} />} />
              {/* Legacy PMS paths → Company Portal */}
              <Route path="/" element={<Navigate to={COMPANY_HOME} replace />} />
              <Route path="/properties/*" element={<Navigate to={COMPANY_HOME + '/properties'} replace />} />
              <Route path="/owners" element={<Navigate to={COMPANY_HOME + '/owners'} replace />} />
              <Route path="/units-inventory" element={<Navigate to={COMPANY_HOME + '/units-inventory'} replace />} />
              <Route path="/tenants/*" element={<Navigate to={COMPANY_HOME + '/tenants'} replace />} />
              <Route path="/contracts/*" element={<Navigate to={COMPANY_HOME + '/contracts'} replace />} />
              <Route path="/finance" element={<Navigate to={COMPANY_HOME + '/finance'} replace />} />
              <Route path="/invoices/*" element={<Navigate to={COMPANY_HOME + '/finance'} replace />} />
              <Route path="/maintenance" element={<Navigate to={COMPANY_HOME + '/maintenance'} replace />} />
              <Route path="/reports" element={<Navigate to={COMPANY_HOME + '/reports'} replace />} />
              <Route path="/smart-import" element={<Navigate to={COMPANY_HOME + '/smart-import'} replace />} />
              <Route path="/platform/*" element={<Navigate to={COMPANY_HOME} replace />} />
              <Route path="/owner/*" element={<Navigate to={COMPANY_HOME} replace />} />
              <Route path="*" element={<Navigate to={COMPANY_HOME} replace />} />
            </Routes>
          ) : (
            <Routes>
              <Route path="*" element={<AccessDenied user={session.user} />} />
            </Routes>
          )}
        </BrowserRouter>
        <Toaster />
      </ToastProvider>
    </ErrorBoundary>
  )
}
