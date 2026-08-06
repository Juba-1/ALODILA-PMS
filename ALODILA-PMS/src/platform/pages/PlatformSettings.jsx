import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx'
import { LanguageToggle } from '../../components/LanguageToggle.jsx'
import { PlatformPageHeader } from '../components/PlatformPageHeader.jsx'
import { supabase } from '../../lib/supabase/client.js'
import { signOutPlatform } from '../services/companies.js'
import { ALODILA_LOGO_URL } from '../../lib/brand/logoUrl.js'

export default function PlatformSettings() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('—')
  const [role, setRole] = useState('—')

  useEffect(() => {
    let cancelled = false
    supabase?.auth
      ?.getUser?.()
      .then(({ data }) => {
        if (cancelled) return
        setEmail(data?.user?.email || '—')
        setRole(String(data?.user?.app_metadata?.role || '—'))
      })
      .catch(() => {
        if (!cancelled) {
          setEmail('—')
          setRole('—')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onSignOut() {
    try {
      await signOutPlatform()
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-5">
      <PlatformPageHeader title={t('platform.settings.title')} subtitle={t('platform.settings.subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('platform.settings.system')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-700">
          <div className="flex items-center gap-3">
            <img
              src={ALODILA_LOGO_URL}
              alt=""
              className="h-12 w-12 rounded-xl object-cover ring-1 ring-slate-200"
              referrerPolicy="no-referrer"
            />
            <div>
              <div className="font-bold text-slate-900">{t('platform.brand')}</div>
              <div className="text-xs text-slate-500">{t('platform.brandSubtitle')}</div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('platform.settings.systemName')}
              </div>
              <div className="mt-1 font-semibold text-slate-900">{t('platform.brand')}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('platform.settings.timezone')}
              </div>
              <div className="mt-1 font-semibold text-slate-900">Asia/Riyadh</div>
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('platform.settings.language')}
            </div>
            <LanguageToggle />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('platform.settings.account')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('platform.settings.accountEmail')}
            </div>
            <div className="mt-1 font-semibold text-slate-900">{email}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('platform.settings.accountRole')}
            </div>
            <div className="mt-1 font-mono text-sm text-slate-800">{role}</div>
          </div>
          <Button variant="subtle" onClick={() => void onSignOut()}>
            {t('nav.signOut')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
