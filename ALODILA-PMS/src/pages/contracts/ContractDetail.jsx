import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card'
import { FinancialTimeline } from '../../components/FinancialTimeline'
import { AiUnavailableBanner } from '../../components/AiUnavailableBanner'
import { useToastDispatch } from '../../components/toast/ToastProvider'
import { getContractFinance, generateInstallmentsForContract } from '../../lib/db/contractFinance'
import { summarizeContractFinance } from '../../lib/ai/financialAdvisor'
import { hasViteGroqApiKey, isAiUnavailableError } from '../../lib/ai/groqEnv'
import { reportLoadFailure } from '../../lib/supabase/authErrors'
import { centsToMoneyString, moneyToCents } from '../../lib/money/cents'
import { monthsBetween } from '../../lib/finance/schedule'
import { translateBillingCycle, translateContractStatus } from '../../lib/i18n/domainLabels'

function money(v) {
  return centsToMoneyString(moneyToCents(v))
}

function StatPill({ title, value, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-900 ring-slate-200',
    emerald: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-900 ring-amber-200',
    red: 'bg-red-50 text-red-900 ring-red-200',
    gold: 'bg-gradient-to-br from-amber-50 to-amber-100 text-amber-900 ring-amber-300',
  }
  return (
    <div className={`rounded-2xl p-4 ring-1 ${tones[tone] || tones.slate}`}>
      <div className="text-xs font-bold text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-extrabold">{value}</div>
    </div>
  )
}

export default function ContractDetail() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ar'
  const { id } = useParams()
  const { push } = useToastDispatch()
  const toastPushRef = useRef(push)
  toastPushRef.current = push
  const tRef = useRef(t)
  tRef.current = t

  const [busy, setBusy] = useState(true)
  const [data, setData] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiError, setAiError] = useState('')
  const [scheduling, setScheduling] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const res = await getContractFinance(id)
      setData(res)
    } catch (e) {
      reportLoadFailure((p) => toastPushRef.current?.(p), e, tRef.current('contractDetail.loadFail'), true)
    } finally {
      setBusy(false)
    }
  }, [id])

  useEffect(() => {
    refresh()
  }, [refresh])

  const runAdvisor = useCallback(async () => {
    if (!data) return
    setAiBusy(true)
    setAiError('')
    try {
      const text = await summarizeContractFinance({
        contract: data.contract,
        invoices: data.invoices,
        summary: data.summary,
      })
      setAiText(text || tRef.current('contractDetail.advisorEmptyResult'))
    } catch (e) {
      if (isAiUnavailableError(e)) {
        setAiError(e.message)
      } else {
        const msg = String(e?.message || '')
        setAiError(msg || tRef.current('contractDetail.advisorGenerateFail'))
      }
    } finally {
      setAiBusy(false)
    }
  }, [data])

  async function onGenerateSchedule({ replaceExisting } = {}) {
    if (!data?.contract?.id) return
    if (replaceExisting) {
      const ok = window.confirm(t('contractDetail.regenerateConfirm'))
      if (!ok) return
    }
    setScheduling(true)
    try {
      const res = await generateInstallmentsForContract(data.contract, {
        vat_applicable: false,
        replaceExisting: Boolean(replaceExisting),
      })
      push({
        type: res.count ? 'success' : 'info',
        title: res.count ? t('contractDetail.scheduleCreatedTitle') : t('contractDetail.scheduleNoChangeTitle'),
        message: res.count
          ? t('contractDetail.scheduleCreatedMsg', { count: res.count })
          : t('contractDetail.scheduleNoChangeMsg'),
      })
      await refresh()
    } catch (e) {
      reportLoadFailure((p) => toastPushRef.current?.(p), e, t('contractDetail.scheduleFail'), true)
    } finally {
      setScheduling(false)
    }
  }

  const contract = data?.contract
  const summary = data?.summary
  const invoices = data?.invoices || []

  const subtitle = useMemo(() => {
    if (busy) return t('contractDetail.summaryLoading')
    if (!contract) return t('contractDetail.summaryUnavailable')
    const tenantName = contract?.tenant?.full_name || '—'
    const unitName = contract?.unit?.unit_name || '—'
    const propertyName = contract?.unit?.property?.name || '—'
    return `${tenantName} — ${unitName} — ${propertyName}`
  }, [busy, contract, t])

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-extrabold text-slate-900">{t('contractDetail.pageTitle')}</div>
          <div className="mt-1 text-sm text-slate-500">
            <Link to="/contracts" className="font-semibold text-slate-900 hover:underline">
              {t('contractDetail.contractsLink')}
            </Link>{' '}
            / {t('contractDetail.breadcrumb')}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="subtle" onClick={() => onGenerateSchedule({ replaceExisting: false })} disabled={busy || scheduling}>
            {t('contractDetail.generateSchedule')}
          </Button>
          <Button variant="ghost" onClick={() => onGenerateSchedule({ replaceExisting: true })} disabled={busy || scheduling}>
            {t('contractDetail.regenerateSchedule')}
          </Button>
          <Link to="/contracts">
            <Button variant="ghost">{t('contractDetail.back')}</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('contractDetail.summaryTitle')}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : contract ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatPill title={t('contractDetail.statContractValue')} value={`${money(contract.contract_value)} ${t('contractDetail.sar')}`} tone="gold" />
                <StatPill title={t('contractDetail.statTotalInvoiced')} value={`${money(summary?.totalInvoiced)} ${t('contractDetail.sar')}`} tone="slate" />
                <StatPill title={t('contractDetail.statCollected')} value={`${money(summary?.totalPaid)} ${t('contractDetail.sar')}`} tone="emerald" />
                <StatPill
                  title={t('contractDetail.statOutstanding')}
                  value={`${money(summary?.outstanding)} ${t('contractDetail.sar')}`}
                  tone={summary?.outstanding > 0 ? 'amber' : 'slate'}
                />
              </div>
              {(() => {
                const m = contract.start_date && contract.end_date ? monthsBetween(contract.start_date, contract.end_date) : 0
                if (!m) return null
                const monthly = Number(contract.contract_value || 0) / m
                return (
                  <div className="mt-3 rounded-xl bg-gradient-to-r from-amber-50 to-white p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                    <span className="font-extrabold">{t('contractDetail.equivalentMonthly')}</span> {money(monthly)} {t('contractDetail.sar')} × {m} {t('contractDetail.months')}
                  </div>
                )
              })()}
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-[11px] font-bold text-slate-500">{t('contractDetail.billingCycle')}</div>
                  <div className="mt-1 font-extrabold text-slate-900">{translateBillingCycle(contract.billing_cycle, lang) || '—'}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-[11px] font-bold text-slate-500">{t('contractDetail.start')}</div>
                  <div className="mt-1 font-extrabold text-slate-900">{contract.start_date || '—'}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-[11px] font-bold text-slate-500">{t('contractDetail.end')}</div>
                  <div className="mt-1 font-extrabold text-slate-900">{contract.end_date || '—'}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-[11px] font-bold text-slate-500">{t('contractDetail.status')}</div>
                  <div className="mt-1 font-extrabold text-slate-900">{translateContractStatus(contract.status, lang) || '—'}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{t('contractDetail.noData')}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{t('contractDetail.advisorTitle')}</CardTitle>
              <CardDescription>{t('contractDetail.advisorDesc')}</CardDescription>
            </div>
            <Button variant="gold" onClick={runAdvisor} disabled={aiBusy || busy || !data}>
              {aiBusy ? t('contractDetail.advisorRunning') : t('contractDetail.advisorRun')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasViteGroqApiKey() ? <AiUnavailableBanner /> : null}
          {aiError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{aiError}</div>
          ) : null}
          {aiText ? (
            <div className="whitespace-pre-wrap rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 text-sm leading-7 text-slate-800 shadow-sm">
              {aiText}
            </div>
          ) : !aiError ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              {t('contractDetail.advisorHint')}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('contractDetail.timelineTitle')}</CardTitle>
          <CardDescription>{t('contractDetail.timelineDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {busy ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <FinancialTimeline invoices={invoices} summary={summary} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
