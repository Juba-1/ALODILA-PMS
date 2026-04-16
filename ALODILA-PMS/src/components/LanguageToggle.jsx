import { useTranslation } from 'react-i18next'
import { persistLanguage } from '../i18n/config'

export function LanguageToggle({ className = '' }) {
  const { i18n, t } = useTranslation()
  const lng = i18n.language?.startsWith('en') ? 'en' : 'ar'

  function setLang(next) {
    if (next === lng) return
    void i18n.changeLanguage(next)
    persistLanguage(next)
  }

  return (
    <div
      className={`inline-flex items-center rounded-full bg-slate-100 p-0.5 text-xs font-bold ring-1 ring-slate-200/80 ${className}`}
      role="group"
      aria-label={t('lang.toggle')}
    >
      <button
        type="button"
        onClick={() => setLang('ar')}
        className={[
          'rounded-full px-3 py-1 transition',
          lng === 'ar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
        ].join(' ')}
      >
        {t('lang.ar')}
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={[
          'rounded-full px-3 py-1 transition',
          lng === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
        ].join(' ')}
      >
        {t('lang.en')}
      </button>
    </div>
  )
}
