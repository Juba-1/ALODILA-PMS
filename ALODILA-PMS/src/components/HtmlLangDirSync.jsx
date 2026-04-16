import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/** Keeps document lang/dir aligned with i18n (affects native date inputs, spellcheck, etc.). */
export function HtmlLangDirSync() {
  const { i18n } = useTranslation()

  useEffect(() => {
    const apply = () => {
      const lng = i18n.language?.startsWith('en') ? 'en' : 'ar'
      document.documentElement.lang = lng
      document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr'
    }
    apply()
    i18n.on('languageChanged', apply)
    return () => {
      i18n.off('languageChanged', apply)
    }
  }, [i18n])

  return null
}
