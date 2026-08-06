import { useCallback, useState } from 'react'
import { setCompanyStatus } from '../services/companies.js'
import { errorMessageKey } from '../services/companiesErrors.js'

export function useCompanyStatus(id) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const changeStatus = useCallback(
    async (nextStatus) => {
      setSubmitting(true)
      setError(null)
      try {
        return await setCompanyStatus(id, nextStatus)
      } catch (e) {
        setError(e)
        throw e
      } finally {
        setSubmitting(false)
      }
    },
    [id],
  )

  return { changeStatus, submitting, error, errorMessageKey }
}
