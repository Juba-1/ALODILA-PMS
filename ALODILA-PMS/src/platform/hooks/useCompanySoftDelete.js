import { useCallback, useState } from 'react'
import { softDeleteCompany, restoreCompany } from '../services/companies.js'
import { errorMessageKey } from '../services/companiesErrors.js'

export function useCompanySoftDelete(id) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const softDelete = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      return await softDeleteCompany(id)
    } catch (e) {
      setError(e)
      throw e
    } finally {
      setSubmitting(false)
    }
  }, [id])

  const restore = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      return await restoreCompany(id)
    } catch (e) {
      setError(e)
      throw e
    } finally {
      setSubmitting(false)
    }
  }, [id])

  return { softDelete, restore, submitting, error, errorMessageKey }
}
