import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isSuperAdminUser, isCompanyOperatorUser } from '../../lib/auth/roles.js'
import { COMPANY_HOME } from '../../lib/routing/paths.js'
import AccessDenied from '../../pages/AccessDenied.jsx'

/**
 * Allows only Platform Super Admin into /platform/*.
 * Company operators → /company. Owners → 403. Others → 403.
 * @param {{ user: object | null, children: import('react').ReactNode }} props
 */
export function PlatformGuard({ user, children }) {
  const { t } = useTranslation()

  if (isSuperAdminUser(user)) {
    return children
  }

  if (isCompanyOperatorUser(user)) {
    return (
      <Navigate
        to={COMPANY_HOME}
        replace
        state={{ platformDenied: true, message: t('platform.common.unauthorized') }}
      />
    )
  }

  return <AccessDenied user={user} />
}
