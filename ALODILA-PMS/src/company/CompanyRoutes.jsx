import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout.jsx'
import PropertiesList from '../pages/properties/PropertiesList.jsx'
import PropertyCreate from '../pages/properties/PropertyCreate.jsx'
import PropertyDetail from '../pages/properties/PropertyDetail.jsx'
import TenantsList from '../pages/tenants/TenantsList.jsx'
import TenantStatement from '../pages/tenants/TenantStatement.jsx'
import OwnersList from '../pages/owners/OwnersList.jsx'
import ContractsList from '../pages/contracts/ContractsList.jsx'
import ContractDetail from '../pages/contracts/ContractDetail.jsx'
import InvoicesList from '../pages/finance/InvoicesList.jsx'
import InvoiceDetail from '../pages/finance/InvoiceDetail.jsx'
import UnitsInventory from '../pages/units/UnitsInventory.jsx'
import DashboardOverview from '../pages/dashboard/DashboardOverview.jsx'
import MaintenanceList from '../pages/maintenance/MaintenanceList.jsx'
import ReportsCenter from '../pages/reports/ReportsCenter.jsx'
import SmartImport from '../pages/import/SmartImport.jsx'
import { CompanyGuard } from './CompanyGuard.jsx'
import { COMPANY_HOME } from '../lib/routing/paths.js'

/**
 * Company Portal route tree mounted at `/company/*`.
 * UI/pages unchanged — only base path moved under `/company`.
 * @param {{ user: object | null }} props
 */
export default function CompanyRoutes({ user }) {
  return (
    <Routes>
      <Route
        element={
          <CompanyGuard user={user}>
            <DashboardLayout />
          </CompanyGuard>
        }
      >
        <Route index element={<DashboardOverview />} />
        <Route path="properties" element={<PropertiesList />} />
        <Route path="properties/new" element={<PropertyCreate />} />
        <Route path="properties/:id" element={<PropertyDetail />} />
        <Route path="units-inventory" element={<UnitsInventory />} />
        <Route path="owners" element={<OwnersList />} />
        <Route path="tenants" element={<TenantsList />} />
        <Route path="tenants/:id/statement" element={<TenantStatement />} />
        <Route path="contracts" element={<ContractsList />} />
        <Route path="contracts/:id" element={<ContractDetail />} />
        <Route path="finance" element={<InvoicesList />} />
        <Route path="invoices/:id" element={<InvoiceDetail />} />
        <Route path="maintenance" element={<MaintenanceList />} />
        <Route path="reports" element={<ReportsCenter />} />
        <Route path="smart-import" element={<SmartImport />} />
        <Route path="*" element={<Navigate to={COMPANY_HOME} replace />} />
      </Route>
    </Routes>
  )
}
