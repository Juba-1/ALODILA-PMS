import i18n from '../../i18n/config.js'
import platformAr from './platform.ar.js'
import platformEn from './platform.en.js'

let registered = false

/** Merge Platform strings into the shared i18n instance (idempotent). */
export function registerPlatformI18n() {
  if (registered) return
  i18n.addResourceBundle('ar', 'translation', platformAr, true, true)
  i18n.addResourceBundle('en', 'translation', platformEn, true, true)
  registered = true
}
