import { useCallback, useEffect, useState } from 'react'
import { getCompany } from '../services/companies.js'

export function useCompanyDetail(id) {
  const companyId = String(id || '').trim()
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(Boolean(companyId))
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    if (!companyId) {
      setCompany(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await getCompany(companyId)
      setCompany(data)
    } catch (e) {
      setCompany(null)
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { company, loading, error, reload }
}
