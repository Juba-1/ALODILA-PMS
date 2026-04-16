import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import DashboardLayout from './components/DashboardLayout.jsx'
import OwnerLayout from './components/OwnerLayout.jsx'
import DevLogin from './pages/auth/DevLogin.jsx'
import PropertiesList from './pages/properties/PropertiesList.jsx'
import PropertyCreate from './pages/properties/PropertyCreate.jsx'
import PropertyDetail from './pages/properties/PropertyDetail.jsx'
import TenantsList from './pages/tenants/TenantsList.jsx'
import TenantStatement from './pages/tenants/TenantStatement.jsx'
import OwnersList from './pages/owners/OwnersList.jsx'
import ContractsList from './pages/contracts/ContractsList.jsx'
import InvoicesList from './pages/finance/InvoicesList.jsx'
import InvoiceDetail from './pages/finance/InvoiceDetail.jsx'
import UnitsInventory from './pages/units/UnitsInventory.jsx'
import DashboardOverview from './pages/dashboard/DashboardOverview.jsx'
import MaintenanceList from './pages/maintenance/MaintenanceList.jsx'
import ReportsCenter from './pages/reports/ReportsCenter.jsx'
import SmartImport from './pages/import/SmartImport.jsx'
import OwnerDashboard from './pages/owner/OwnerDashboard.jsx'
import OwnerPropertiesList from './pages/owner/OwnerPropertiesList.jsx'
import OwnerPropertyDetail from './pages/owner/OwnerPropertyDetail.jsx'
import OwnerReports from './pages/owner/OwnerReports.jsx'
import OwnerMaintenance from './pages/owner/OwnerMaintenance.jsx'
import { HtmlLangDirSync } from './components/HtmlLangDirSync.jsx'
import i18n from './i18n/config.js'
import { hasSupabaseConfig, supabase } from './lib/supabase/client.js'
import { isOwnerPortalUser } from './lib/auth/roles.js'
import { isIgnorableAuthLockError } from './lib/supabase/authErrors.js'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { ToastProvider } from './components/toast/ToastProvider.jsx'
import { Toaster } from './components/toast/Toaster.jsx'

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

  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <HtmlLangDirSync />
          {!session ? (
            <Routes>
              <Route path="*" element={<DevLogin />} />
            </Routes>
          ) : isOwnerPortalUser(session.user) ? (
            <Routes>
              <Route path="/owner" element={<OwnerLayout />}>
                <Route index element={<OwnerDashboard />} />
                <Route path="properties" element={<OwnerPropertiesList />} />
                <Route path="properties/:id" element={<OwnerPropertyDetail />} />
                <Route path="reports" element={<OwnerReports />} />
                <Route path="maintenance" element={<OwnerMaintenance />} />
              </Route>
              <Route path="*" element={<Navigate to="/owner" replace />} />
            </Routes>
          ) : (
            <Routes>
              <Route path="/" element={<DashboardLayout />}>
                <Route index element={<DashboardOverview />} />
                <Route path="properties" element={<PropertiesList />} />
                <Route path="properties/new" element={<PropertyCreate />} />
                <Route path="properties/:id" element={<PropertyDetail />} />
                <Route path="units-inventory" element={<UnitsInventory />} />
                <Route path="owners" element={<OwnersList />} />
                <Route path="tenants" element={<TenantsList />} />
                <Route path="tenants/:id/statement" element={<TenantStatement />} />
                <Route path="contracts" element={<ContractsList />} />
                <Route path="finance" element={<InvoicesList />} />
                <Route path="invoices/:id" element={<InvoiceDetail />} />
                <Route path="maintenance" element={<MaintenanceList />} />
                <Route path="reports" element={<ReportsCenter />} />
                <Route path="smart-import" element={<SmartImport />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          )}
        </BrowserRouter>
        <Toaster />
      </ToastProvider>
    </ErrorBoundary>
  )
}

