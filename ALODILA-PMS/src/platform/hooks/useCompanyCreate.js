import { useCallback, useState } from 'react'
import { createCompany } from '../services/companies.js'
import { errorMessageKey } from '../services/companiesErrors.js'

export function useCompanyCreate() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const reset = useCallback(() => {
    setError(null)
    setFieldErrors({})
  }, [])

  const submit = useCallback(async (input) => {
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    try {
      const row = await createCompany(input)
      return row
    } catch (e) {
      if (e?.code === 'VALIDATION' && e.fields) {
        setFieldErrors(e.fields)
      }
      setError(e)
      throw e
    } finally {
      setSubmitting(false)
    }
  }, [])

  return { submit, submitting, error, fieldErrors, reset, errorMessageKey }
}
