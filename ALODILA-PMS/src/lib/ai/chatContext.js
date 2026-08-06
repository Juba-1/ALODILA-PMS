import { getActiveProperties } from '../db/properties'
import { getOwners } from '../db/owners'
import { loadAdminLedgerForAi } from '../db/dashboard'
import { getReportingActiveLeases } from '../db/reports'
import {
  getOwnerActiveContracts,
  getOwnerProperties,
  getOwnerReportingBundle,
  getOwnerUnitsSummary,
} from '../db/ownerPortal'
import { chatUserRole, ownerCrmIdFromUser } from '../auth/roles'

function truncateJson(obj, maxChars) {
  const s = JSON.stringify(obj, null, 0)
  if (s.length <= maxChars) return s
  return `${s.slice(0, maxChars)}\n…(مختصر)`
}

function calendarMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Rich portfolio + P&L snapshot for super_admin and staff (RLS-scoped to their session).
 */
async function buildAdminStaffContextData() {
  const now = new Date()
  const monthKey = calendarMonthKey(now)

  const [ledger, props, leases, owners] = await Promise.all([
    loadAdminLedgerForAi(monthKey),
    getActiveProperties(),
    getReportingActiveLeases(80),
    getOwners(),
  ])

  const { stats, payRoll, maintRoll } = ledger

  const totalRevenueSar = payRoll.totalAllTime
  const totalMaintenanceOpexSar = maintRoll.totalAllTime
  const netProfitAllTimeSar = totalRevenueSar - totalMaintenanceOpexSar

  const revenueThisMonthSar = payRoll.revenueThisCalendarMonth
  const maintenanceThisMonthSar = maintRoll.maintenanceThisCalendarMonth
  const netProfitThisMonthSar = revenueThisMonthSar - maintenanceThisMonthSar

  const ownerNameById = new Map((owners || []).map((o) => [o.id, String(o.full_name || '').trim() || null]))

  const ownersSummary = (owners || []).slice(0, 40).map((o) => ({
    id: o.id,
    full_name: o.full_name || '',
  }))

  const propertiesSummary = (props || []).slice(0, 50).map((p) => ({
    id: p.id,
    name: p.name || '',
    owner_crm_id: p.owner_crm_id || null,
    owner_name: p.owner_crm_id ? ownerNameById.get(p.owner_crm_id) || null : null,
  }))

  const activeLeasesSummary = (leases || []).map((row) => ({
    tenant: row.tenant_full_name,
    unit: row.unit_name,
    property: row.property_name,
    rent_sar: row.monthly_rent_sar,
  }))

  return {
    dashboard: stats,
    currentCalendarMonth: monthKey,
    financials: {
      totalRevenueCollectedSar: totalRevenueSar,
      totalMaintenanceOpexSar,
      netProfitAfterMaintenanceSar: netProfitAllTimeSar,
      revenueThisCalendarMonthSar: revenueThisMonthSar,
      maintenanceThisCalendarMonthSar: maintenanceThisMonthSar,
      netProfitThisCalendarMonthSar: netProfitThisMonthSar,
      note:
        'صافي الربح = مجموع الدفعات المحصّلة (payments) ناقص مجموع تكاليف الصيانة المسجّلة (maintenance_requests.cost_amount). للأسئلة عن «هذا الشهر» استخدم الحقول التي تنتهي بـ ThisCalendarMonth.',
    },
    ownersSummary,
    propertiesSummary,
    activeLeasesSummary,
    activeLeasesListedCount: activeLeasesSummary.length,
  }
}

/**
 * Live snapshot for the AI system prompt (role-aware, minimal PII).
 */
export async function loadAiChatContext(user) {
  if (!user) {
    return { chatRole: 'staff', contextData: { note: 'لا يوجد مستخدم مسجّل' } }
  }

  const chatRole = chatUserRole(user)

  if (chatRole === 'super_admin') {
    const contextData = await buildAdminStaffContextData()
    return { chatRole: 'super_admin', contextData }
  }

  if (chatRole === 'owner') {
    const oid = String(ownerCrmIdFromUser(user) || '').trim()
    if (!oid) {
      return {
        chatRole: 'owner',
        contextData: {
          error: 'لا يوجد owner_crm_id في بيانات الجلسة — أعد تسجيل الدخول أو راجع app_metadata في Supabase Auth (Gate A).',
        },
      }
    }
    const [props, contracts, units, bundle] = await Promise.all([
      getOwnerProperties(oid),
      getOwnerActiveContracts(oid),
      getOwnerUnitsSummary(oid),
      getOwnerReportingBundle(oid),
    ])
    const s = bundle?.summary || {}
    const monthKey = s.calendarMonthKey || calendarMonthKey()

    const activeLeasesSummary = (contracts || []).slice(0, 50).map((c) => ({
      tenant: c.tenant_full_name || '',
      unit: c.unit_name || '',
      property: c.property_name || '',
      rent_sar: Number(c.monthly_rent ?? c.rent_amount ?? 0),
    }))

    return {
      chatRole: 'owner',
      contextData: {
        owner_crm_id: oid,
        propertyCount: (props || []).length,
        propertyNames: (props || []).map((p) => p.name),
        activeContractsCount: (contracts || []).length,
        unitsTotal: units.totalUnits,
        unitsRented: units.rentedUnits,
        invoicesInScopeCount: (bundle?.invoices || []).length,
        financials: {
          totalRevenueCollectedSar: s.totalPaymentsCollected ?? 0,
          totalMaintenanceOpexSar: s.totalMaintenanceCost ?? 0,
          netProfitAfterMaintenanceSar: s.netCollectedMinusMaintenance ?? 0,
          revenueThisCalendarMonthSar: s.paymentsThisCalendarMonth ?? 0,
          currentCalendarMonth: monthKey,
          maintenanceRequestCount: s.maintenanceRequestCount ?? 0,
          note:
            'الأرقام من دفعات الفواتير وطلبات الصيانة على وحدات عقارات هذا المالك فقط (RLS). صافي الربح = إجمالي المحصّل ناقص إجمالي الصيانة.',
        },
        activeLeasesSummary,
        note:
          'لسؤال «دخلي هذا الشهر» استخدم financials.revenueThisCalendarMonthSar و financials.currentCalendarMonth. للعقود النشطة استخدم activeLeasesSummary.',
      },
    }
  }

  const contextData = await buildAdminStaffContextData()
  return {
    chatRole: 'staff',
    contextData: {
      ...contextData,
      note: 'مستخدم إداري (staff): نفس لقطة المحفظة المعروضة أعلاه ضمن صلاحيات الجلسة — لا تفترض بيانات خارج الـ JSON.',
    },
  }
}

export function stringifyContextForPrompt(contextData, maxChars = 6000) {
  return truncateJson(contextData ?? {}, maxChars)
}
