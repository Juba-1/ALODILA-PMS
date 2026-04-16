import { supabase } from '../supabase/client'
import { createProperty, updateProperty } from './properties'
import { createTenant, updateTenant } from './tenants'
import { createOwner, getOwners } from './owners'
import { updateUnit } from './units'

function normStr(v) {
  return String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function canonicalKey(v) {
  return normStr(v)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, '')
}

function clipStr(s, max) {
  const t = normStr(s)
  return t.length > max ? t.slice(0, max) : t
}

function toRent(v) {
  let rent = Number(v ?? 0)
  if (!Number.isFinite(rent) || rent < 0) rent = 0
  if (rent > 99_999_999) rent = 99_999_999
  return Math.round(rent * 100) / 100
}

function toRooms(v) {
  let rooms = Number.isFinite(Number(v)) ? Math.max(1, Math.floor(Number(v))) : 1
  if (rooms > 50) rooms = 50
  return rooms
}

function makeSyntheticTenantId({ tenantName, phone, sourceIndex }) {
  const a = canonicalKey(tenantName || 'tenant').slice(0, 12) || 'tenant'
  const digits = String(phone || '').replace(/[^\d]/g, '').slice(-6) || '000000'
  return `AUTO-${a}-${digits}-${String(sourceIndex ?? 0).padStart(4, '0')}`
}

async function fetchActivePropertiesLite() {
  const { data, error } = await supabase
    .from('properties')
    .select('id,name,category,type,total_units_capacity,owner_crm_id')
    .eq('is_deleted', false)
  if (error) throw error
  return data || []
}

async function fetchActiveUnitsLite() {
  const { data, error } = await supabase
    .from('units')
    .select('id,property_id,unit_name,target_rent_value,rooms_count,status,electricity_meter_ref,water_meter_ref')
    .eq('is_deleted', false)
  if (error) throw error
  return data || []
}

async function fetchActiveTenantsLite() {
  const { data, error } = await supabase
    .from('tenants')
    .select('id,national_id_or_cr,full_name,phone,tenant_type,national_address')
    .eq('is_deleted', false)
  if (error) throw error
  return data || []
}

async function createUnitDirect(payload) {
  const { data, error } = await supabase
    .from('units')
    .insert({ ...payload, is_deleted: false })
    .select('id,property_id,unit_name,target_rent_value,rooms_count,status,electricity_meter_ref,water_meter_ref')
    .single()
  if (error) throw error
  return data
}

function buildTenantLookupKey(row) {
  const nid = canonicalKey(row.national_id_or_cr)
  if (nid) return `nid:${nid}`
  const name = canonicalKey(row.tenant_full_name)
  const phone = String(row.phone || '').replace(/[^\d]/g, '')
  if (name || phone) return `np:${name}|${phone}`
  return ''
}

export async function executeSmartImport({ propertyId, rows }) {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')

  const list = Array.isArray(rows) ? rows : []
  if (!list.length) throw new Error('No rows to import')

  const [properties, units, tenants, owners] = await Promise.all([
    fetchActivePropertiesLite(),
    fetchActiveUnitsLite(),
    fetchActiveTenantsLite(),
    getOwners(),
  ])

  const propertyByName = new Map()
  for (const p of properties) propertyByName.set(canonicalKey(p.name), p)

  const ownerByName = new Map()
  for (const o of owners || []) {
    const k = canonicalKey(o.full_name)
    if (k && !ownerByName.has(k)) ownerByName.set(k, o)
  }

  const unitByPropertyAndName = new Map()
  for (const u of units) unitByPropertyAndName.set(`${u.property_id}::${canonicalKey(u.unit_name)}`, u)

  const tenantByKey = new Map()
  for (const t of tenants) {
    const byNid = canonicalKey(t.national_id_or_cr)
    if (byNid) tenantByKey.set(`nid:${byNid}`, t)
    const byNamePhone = `np:${canonicalKey(t.full_name)}|${String(t.phone || '').replace(/[^\d]/g, '')}`
    tenantByKey.set(byNamePhone, t)
  }

  const summary = {
    propertiesCreated: 0,
    propertiesMatched: 0,
    unitsInserted: 0,
    unitsUpdated: 0,
    unitsSkipped: 0,
    tenantsCreated: 0,
    tenantsUpdated: 0,
    warnings: 0,
    successRows: [],
    failedRows: [],
  }

  for (let i = 0; i < list.length; i += 1) {
    const raw = list[i] || {}
    const row = { ...raw }
    const sourceIndex = row.__source_index ?? i
    const warnings = []

    try {
      if (row._skip === true) {
        summary.unitsSkipped += 1
        summary.successRows.push({ ...row, _import_status: 'skipped', _import_message: row._reason || 'تم تجاهل الصف' })
        continue
      }

      let ownerCrmId = null
      const ownerName = clipStr(row.owner_name, 200)
      if (ownerName) {
        const k = canonicalKey(ownerName)
        const existingOwner = ownerByName.get(k)
        if (existingOwner?.id) {
          ownerCrmId = existingOwner.id
        } else {
          warnings.push('اسم المالك موجود لكن لا يمكن إنشاء مالك جديد بدون هوية/جوال؛ سيتم حفظ العقار بدون ربط مالك.')
        }
      }

      let property = null
      const propertyName = clipStr(row.property_name, 200)
      if (propertyName) {
        const key = canonicalKey(propertyName)
        property = propertyByName.get(key) || null
        if (!property) {
          property = await createProperty({
            name: propertyName,
            category: 'غير مصنف',
            type: 'Residential',
            deed_number: null,
            maps_link: null,
            total_units_capacity: 0,
            electricity_meter_count: 0,
            water_meter_count: 0,
            owner_crm_id: ownerCrmId,
            management_start_date: null,
          })
          propertyByName.set(key, property)
          summary.propertiesCreated += 1
        } else {
          summary.propertiesMatched += 1
          if (ownerCrmId && !property.owner_crm_id) {
            try {
              const updated = await updateProperty(property.id, { owner_crm_id: ownerCrmId })
              property = { ...property, ...updated }
              propertyByName.set(key, property)
            } catch {
              warnings.push('تعذر ربط المالك بالعقار القائم، وتمت متابعة الاستيراد.')
            }
          }
        }
      } else if (propertyId) {
        property = properties.find((p) => String(p.id) === String(propertyId)) || null
        if (!property) throw new Error('العقار الاحتياطي المحدد غير موجود.')
        warnings.push('لم يتم العثور على اسم العقار في الصف، فتم استخدام العقار المختار يدوياً.')
      } else {
        throw new Error('اسم العقار غير متوفر ولا يوجد عقار احتياطي محدد.')
      }

      const unitName = clipStr(row.unit_name, 120)
      if (!unitName) throw new Error('اسم الوحدة غير موجود في الصف.')

      const rent = toRent(row.rent_value ?? row.rent)
      const rooms = toRooms(row.rooms_count)
      const unitKey = `${property.id}::${canonicalKey(unitName)}`
      let unit = unitByPropertyAndName.get(unitKey) || null

      if (!unit) {
        unit = await createUnitDirect({
          property_id: property.id,
          unit_name: unitName,
          type: 'Residential',
          target_rent_value: rent,
          rooms_count: rooms,
          status: 'شاغرة',
          electricity_meter_ref: null,
          water_meter_ref: null,
        })
        unitByPropertyAndName.set(unitKey, unit)
        summary.unitsInserted += 1
      } else {
        const nextPayload = {
          target_rent_value: rent || unit.target_rent_value,
          rooms_count: rooms || unit.rooms_count,
        }
        const changed =
          Number(nextPayload.target_rent_value) !== Number(unit.target_rent_value) || Number(nextPayload.rooms_count) !== Number(unit.rooms_count)
        if (changed) {
          const updatedUnit = await updateUnit(unit.id, nextPayload)
          unit = { ...unit, ...updatedUnit }
          unitByPropertyAndName.set(unitKey, unit)
          summary.unitsUpdated += 1
        } else {
          summary.unitsSkipped += 1
        }
      }

      const tenantName = clipStr(row.tenant_full_name ?? row.tenant_name, 200)
      const tenantPhone = clipStr(row.phone, 24)
      let tenantIdentity = clipStr(row.national_id_or_cr ?? row.national_id, 32)
      if (!tenantIdentity && tenantName) {
        tenantIdentity = makeSyntheticTenantId({ tenantName, phone: tenantPhone, sourceIndex })
        warnings.push('لا يوجد رقم هوية/سجل للمستأجر؛ تم إنشاء معرّف مؤقت لمنع التكرار.')
      }

      if (tenantName) {
        const tenantRow = {
          tenant_full_name: tenantName,
          national_id_or_cr: tenantIdentity,
          phone: tenantPhone || '',
        }
        const key = buildTenantLookupKey(tenantRow)
        let tenant = key ? tenantByKey.get(key) || null : null

        if (!tenant) {
          const created = await createTenant({
            full_name: tenantName,
            national_id_or_cr: tenantIdentity || makeSyntheticTenantId({ tenantName, phone: tenantPhone, sourceIndex }),
            tenant_type: 'individual',
            phone: tenantPhone || `000000${String(sourceIndex).padStart(4, '0')}`,
            national_address: null,
          })
          tenant = created
          tenantByKey.set(buildTenantLookupKey({ tenant_full_name: created.full_name, national_id_or_cr: created.national_id_or_cr, phone: created.phone }), created)
          summary.tenantsCreated += 1
          if (!tenantPhone) warnings.push('لا يوجد رقم جوال للمستأجر؛ تم إنشاء قيمة تقنية مؤقتة ويمكن تعديلها لاحقاً.')
        } else {
          const needsUpdate = (!tenant.phone && tenantPhone) || (!canonicalKey(tenant.full_name) && tenantName)
          if (needsUpdate) {
            const updated = await updateTenant(tenant.id, {
              full_name: tenant.full_name || tenantName,
              phone: tenant.phone || tenantPhone,
            })
            tenant = { ...tenant, ...updated }
            summary.tenantsUpdated += 1
          }
        }
      } else {
        warnings.push('لا يوجد اسم مستأجر في الصف؛ تم حفظ العقار/الوحدة فقط.')
      }

      if (row._flagged === true || row._reason) warnings.push(normStr(row._reason))
      if (warnings.length) summary.warnings += 1

      summary.successRows.push({
        ...row,
        property_id: property.id,
        unit_id: unit.id,
        _import_status: 'success',
        _import_message: warnings.filter(Boolean).join(' | '),
      })
    } catch (e) {
      summary.failedRows.push({
        ...row,
        _import_status: 'failed',
        _import_message: String(e?.message || e).slice(0, 300),
      })
    }
  }

  return summary
}
