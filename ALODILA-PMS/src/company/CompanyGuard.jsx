/**
 * Company Portal gate — platform SA and owners never render this layout.
 */
import { Navigate } from 'react-router-dom'
import { isCompanyOperatorUser, isOwnerPortalUser, isSuperAdminUser } from '../lib/auth/roles.js'
import { OWNER_HOME, PLATFORM_HOME } from '../lib/routing/paths.js'
import AccessDenied from '../pages/AccessDenied.jsx'

/**
 * @param {{ user: object | null, children: import('react').ReactNode }} props
 */
export function CompanyGuard({ user, children }) {
  if (isSuperAdminUser(user)) {
    return <Navigate to={PLATFORM_HOME} replace />
  }
  if (isOwnerPortalUser(user)) {
    return <Navigate to={OWNER_HOME} replace />
  }
  if (!isCompanyOperatorUser(user)) {
    return <AccessDenied user={user} />
  }
  return children
}
