import { useCallback, useEffect, useState } from 'react'
import { listCompanies } from '../services/companies.js'

/**
 * @param {{ q?: string, status?: string, plan?: string, includeDeleted?: boolean }} filters
 */
export function useCompaniesList(filters) {
  const q = filters?.q ?? ''
  const status = filters?.status ?? ''
  const plan = filters?.plan ?? ''
  const includeDeleted = Boolean(filters?.includeDeleted)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listCompanies({ q, status, plan, includeDeleted, enrich: true })
      setRows(data)
    } catch (e) {
      setRows([])
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [q, status, plan, includeDeleted])

  useEffect(() => {
    void reload()
  }, [reload])

  return { rows, loading, error, reload }
}
