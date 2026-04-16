import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/Button'
import { Textarea } from './ui/Input'
import { supabase } from '../lib/supabase/client'
import { isIgnorableAuthLockError } from '../lib/supabase/authErrors'
import { chatUserRole } from '../lib/auth/roles'
import { loadAiChatContext } from '../lib/ai/chatContext'
import { sendChatMessage } from '../lib/ai/aiChat'
import { hasViteGroqApiKey } from '../lib/ai/groqEnv'
import { useToastDispatch } from './toast/ToastProvider'
import { cn } from './ui/cn'

const MAX_HISTORY = 24

export function AIChatbot() {
  const { t, i18n } = useTranslation()
  const panelDir = i18n.language?.startsWith('en') ? 'ltr' : 'rtl'
  const { push } = useToastDispatch()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [user, setUser] = useState(null)
  const contextRef = useRef({ chatRole: 'staff', contextData: {}, loadedAt: 0 })
  const groqKeyToastShownRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error && !isIgnorableAuthLockError(error)) {
          console.warn('[AIChatbot] getUser', error.message || error)
        }
        setUser(data?.user ?? null)
      })
      .catch((e) => {
        if (cancelled) return
        if (!isIgnorableAuthLockError(e)) console.warn('[AIChatbot] getUser', e)
      })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!cancelled) setUser(session?.user ?? null)
    })
    return () => {
      cancelled = true
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  const scrollRef = useRef(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open])

  const refreshContext = useCallback(async () => {
    let u = user
    if (!u) {
      try {
        const { data, error } = await supabase.auth.getUser()
        if (error) {
          if (isIgnorableAuthLockError(error)) return contextRef.current
          throw new Error(error.message || String(error))
        }
        u = data?.user ?? null
      } catch (e) {
        if (isIgnorableAuthLockError(e)) return contextRef.current
        throw e
      }
    }
    const { chatRole, contextData } = await loadAiChatContext(u)
    contextRef.current = { chatRole, contextData, loadedAt: Date.now() }
    return contextRef.current
  }, [user])

  useEffect(() => {
    if (!open) return
    if (!hasViteGroqApiKey() && !groqKeyToastShownRef.current) {
      groqKeyToastShownRef.current = true
      push({
        type: 'error',
        title: t('ai.toastKeyTitle'),
        message: t('ai.toastKeyMsg'),
      })
    }
    let cancelled = false
    ;(async () => {
      try {
        await refreshContext()
      } catch (e) {
        if (cancelled || isIgnorableAuthLockError(e)) return
        console.error('[AIChatbot] refreshContext', e)
        push({
          type: 'error',
          title: t('ai.toastContextTitle'),
          message: e?.message || t('ai.toastContextMsg'),
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, refreshContext, push, t])

  async function onSend() {
    const text = String(input || '').trim()
    if (!text || busy) return

    setInput('')
    const userMsg = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setBusy(true)

    if (!hasViteGroqApiKey()) {
      push({
        type: 'error',
        title: t('ai.toastSendBlockedTitle'),
        message: t('ai.toastSendBlockedMsg'),
      })
      setMessages((prev) => (prev.length && prev[prev.length - 1]?.role === 'user' ? prev.slice(0, -1) : prev))
      setInput(text)
      setBusy(false)
      return
    }

    try {
      const now = Date.now()
      if (now - contextRef.current.loadedAt > 45_000) {
        await refreshContext()
      }

      const { chatRole, contextData } = contextRef.current
      const historyForModel = [...messages, userMsg].slice(-MAX_HISTORY)
      const reply = await sendChatMessage({
        history: historyForModel,
        userRole: chatRole,
        contextData,
      })

      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      if (isIgnorableAuthLockError(e)) return
      console.error('[AIChatbot] send', e)
      const msg = String(e?.message || '')
      const title =
        msg.includes('مفتاح Groq') || msg.includes('VITE_GROQ')
          ? t('ai.toastGroqSetup')
          : msg.includes('Groq') || msg.includes('429')
            ? t('ai.toastModelFailTitle')
            : t('ai.toastGenericFailTitle')
      push({
        type: 'error',
        title,
        message: msg || t('ai.toastGenericFailMsg'),
      })
      setMessages((prev) => (prev.length && prev[prev.length - 1]?.role === 'user' ? prev.slice(0, -1) : prev))
      setInput(text)
    } finally {
      setBusy(false)
    }
  }

  const roleLabel = user ? chatUserRole(user) : '—'

  return (
    <div className="no-print pointer-events-none fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-2 print:hidden">
      {open ? (
        <div
          className="pointer-events-auto flex h-[min(32rem,calc(100vh-8rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          dir={panelDir}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
            <div>
              <div className="text-sm font-extrabold">{t('ai.title')}</div>
              <div className="text-[10px] font-semibold text-slate-300">
                {t('ai.subtitleModel', { model: t('ai.modelName'), role: roleLabel })}
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-xs font-bold text-white/90 hover:bg-white/10"
              onClick={() => setOpen(false)}
              aria-label={t('ai.close')}
            >
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
            {messages.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600">
                {t('ai.emptyHint')}
              </div>
            ) : null}
            {messages.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm',
                    m.role === 'user'
                      ? 'rounded-br-md border border-amber-200 bg-amber-50 text-slate-800'
                      : 'rounded-bl-md border border-slate-200 bg-white text-slate-800',
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                  {t('ai.thinking')}
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-200 bg-white p-2">
            <Textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('ai.placeholder')}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void onSend()
                }
              }}
              className="text-sm"
            />
            <div className="mt-2 flex justify-between gap-2">
              <Button type="button" variant="subtle" size="sm" disabled={busy} onClick={() => setMessages([])}>
                {t('ai.clear')}
              </Button>
              <Button type="button" variant="gold" size="sm" disabled={busy || !input.trim()} onClick={() => void onSend()}>
                {t('ai.send')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-xl text-white shadow-lg ring-2 ring-white/40 transition hover:scale-105 hover:ring-white/60"
        aria-label={open ? t('ai.close') : t('ai.open')}
        title={t('ai.title')}
      >
        ✦
      </button>
    </div>
  )
}
