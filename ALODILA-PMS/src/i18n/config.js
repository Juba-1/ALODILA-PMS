import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from './locales/ar.json'
import en from './locales/en.json'
import phase2Ar from './locales/phase2.ar.js'
import phase2En from './locales/phase2.en.js'

const STORAGE_KEY = 'alodila-lang'

function deepMerge(base, extra) {
  const out = { ...base }
  for (const key of Object.keys(extra || {})) {
    const b = out[key]
    const e = extra[key]
    if (e && typeof e === 'object' && !Array.isArray(e) && b && typeof b === 'object' && !Array.isArray(b)) {
      out[key] = deepMerge(b, e)
    } else {
      out[key] = e
    }
  }
  return out
}

function initialLanguage() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'ar') return v
  } catch {
    // ignore
  }
  return 'ar'
}

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: deepMerge(ar, phase2Ar) },
    en: { translation: deepMerge(en, phase2En) },
  },
  lng: initialLanguage(),
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
})

export function persistLanguage(lng) {
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    // ignore
  }
}

export default i18n
