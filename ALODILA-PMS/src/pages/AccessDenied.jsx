import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/Button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card.jsx'
import { homePathForUser } from '../lib/routing/paths.js'
import { supabase } from '../lib/supabase/client.js'

/**
 * Shown when the signed-in user hits a product they are not allowed to use.
 * @param {{ user?: object | null, code?: number }} props
 */
export default function AccessDenied({ user = null, code = 403 }) {
  const { t, i18n } = useTranslation()
  const dir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'
  const home = homePathForUser(user)

  async function onSignOut() {
    try {
      await supabase?.auth?.signOut?.()
    } catch {
      // ignore
    }
  }

  return (
    <div dir={dir} className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {code} — {t('app.accessDeniedTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <p>{t('app.accessDeniedBody')}</p>
          <div className="flex flex-wrap gap-2">
            <Link to={home}>
              <Button variant="gold">{t('app.accessDeniedHome')}</Button>
            </Link>
            <Button variant="subtle" onClick={onSignOut}>
              {t('nav.signOut')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
