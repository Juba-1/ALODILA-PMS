import { useCallback, useEffect, useState } from 'react'
import { getCompanyStats } from '../services/companies.js'

export function useCompanyStats() {
  const [stats, setStats] = useState(null)
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getCompanyStats()
      setStats(result.stats)
      setRecent(result.recent || [])
    } catch (e) {
      setStats(null)
      setRecent([])
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { stats, recent, loading, error, reload }
}
