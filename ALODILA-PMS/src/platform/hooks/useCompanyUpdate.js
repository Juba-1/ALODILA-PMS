import { useCallback, useState } from 'react'
import { updateCompany } from '../services/companies.js'
import { errorMessageKey } from '../services/companiesErrors.js'

export function useCompanyUpdate(id) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const submit = useCallback(
    async (input) => {
      setSubmitting(true)
      setError(null)
      setFieldErrors({})
      try {
        return await updateCompany(id, input)
      } catch (e) {
        if (e?.code === 'VALIDATION' && e.fields) {
          setFieldErrors(e.fields)
        }
        setError(e)
        throw e
      } finally {
        setSubmitting(false)
      }
    },
    [id],
  )

  return { submit, submitting, error, fieldErrors, errorMessageKey }
}
