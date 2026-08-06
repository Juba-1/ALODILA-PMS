import { Navigate, Route, Routes } from 'react-router-dom'
import { PlatformGuard } from './components/PlatformGuard.jsx'
import PlatformLayout from './layout/PlatformLayout.jsx'
import PlatformDashboard from './pages/PlatformDashboard.jsx'
import CompaniesList from './pages/CompaniesList.jsx'
import CompanyCreate from './pages/CompanyCreate.jsx'
import CompanyEdit from './pages/CompanyEdit.jsx'
import CompanyDetail from './pages/CompanyDetail.jsx'
import PlatformSettings from './pages/PlatformSettings.jsx'

/**
 * Platform Console routes — MVP surface only.
 * Other scaffolding pages remain in the repo but are not routed.
 * @param {{ user: object | null }} props
 */
export default function PlatformRoutes({ user }) {
  return (
    <Routes>
      <Route
        element={
          <PlatformGuard user={user}>
            <PlatformLayout />
          </PlatformGuard>
        }
      >
        <Route index element={<PlatformDashboard />} />
        <Route path="companies" element={<CompaniesList />} />
        <Route path="companies/new" element={<CompanyCreate />} />
        <Route path="companies/:id/edit" element={<CompanyEdit />} />
        <Route path="companies/:id" element={<CompanyDetail />} />
        <Route path="settings" element={<PlatformSettings />} />
        <Route path="*" element={<Navigate to="/platform" replace />} />
      </Route>
    </Routes>
  )
}
