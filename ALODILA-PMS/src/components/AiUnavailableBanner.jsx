import { useTranslation } from 'react-i18next'
import { AI_UNAVAILABLE_MESSAGE_AR, AI_UNAVAILABLE_MESSAGE_EN } from '../lib/ai/groqEnv'
import { cn } from './ui/cn'

/**
 * Unified UI banner for any AI surface when `VITE_GROQ_API_KEY` is missing or
 * the Groq request failed with an `AI_UNAVAILABLE` error.
 *
 * Usage:
 *   <AiUnavailableBanner />                        // default → follows active language
 *   <AiUnavailableBanner lang="en" />              // force English
 *   <AiUnavailableBanner title="..." message="..." /> // full override
 */
export function AiUnavailableBanner({ title, message, lang, className = '' }) {
  const { i18n } = useTranslation()
  const effectiveLang = lang || i18n.language || 'ar'
  const isEn = String(effectiveLang).toLowerCase().startsWith('en')
  const titleText = title || (isEn ? 'AI features unavailable' : 'ميزات الذكاء الاصطناعي غير متاحة')
  const body = message || (isEn ? AI_UNAVAILABLE_MESSAGE_EN : AI_UNAVAILABLE_MESSAGE_AR)

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm ring-1 ring-amber-100',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900"
      >
        ✦
      </span>
      <div className="min-w-0">
        <div className="font-extrabold">{titleText}</div>
        <div className="mt-0.5 text-[13px] font-medium leading-6">{body}</div>
      </div>
    </div>
  )
}
