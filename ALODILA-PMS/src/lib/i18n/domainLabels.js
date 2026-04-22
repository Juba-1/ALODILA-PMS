/**
 * DB / business layer stores canonical Arabic lifecycle labels (enums).
 * This module maps them to English for the EN UI without changing the DB.
 *
 * Keep the tables tight (no regex) so they're cheap to import anywhere.
 */

const MAINTENANCE_STATUS_EN = {
  مفتوح: 'Open',
  'قيد المعالجة': 'In progress',
  مكتمل: 'Completed',
}

const INVOICE_PAYMENT_STATUS_EN = {
  'غير مدفوعة': 'Unpaid',
  'مدفوعة جزئياً': 'Partially paid',
  'مدفوعة بالكامل': 'Paid in full',
}

const CONTRACT_STATUS_EN = {
  ساري: 'Active',
  منتهي: 'Expired',
  ملغى: 'Cancelled',
  'نزاع قانوني': 'Legal dispute',
}

const UNIT_STATUS_EN = {
  مؤجرة: 'Leased',
  شاغرة: 'Vacant',
  'تحت الصيانة': 'Under maintenance',
  محجوزة: 'Reserved',
  'غير متاحة': 'Unavailable',
}

const BILLING_CYCLE_EN = {
  شهري: 'Monthly',
  'ربع سنوي': 'Quarterly',
  'نصف سنوي': 'Semi-annual',
  سنوي: 'Annual',
}

const UTILITY_PAYMENT_EN = {
  مستقل: 'Independent',
  مشترك: 'Shared',
  شامل: 'Included',
  مقطوع: 'Flat rate',
}

const PROPERTY_CATEGORY_EN = {
  عمارة: 'Apartment building',
  'مجمع سكني': 'Residential compound',
  فيلا: 'Villa',
  دوبلكس: 'Duplex',
  مستودع: 'Warehouse',
  معرض: 'Showroom',
  أرض: 'Land',
  'مبنى تجاري': 'Commercial building',
}

const PROPERTY_TYPE_EN = {
  Residential: 'Residential',
  Commercial: 'Commercial',
  Mixed: 'Mixed',
}

const PROPERTY_TYPE_AR = {
  Residential: 'سكني',
  Commercial: 'تجاري',
  Mixed: 'مختلط',
}

function mapOrFallback(table, status, lang) {
  if (!status) return ''
  if (lang !== 'en') return String(status)
  return table[status] || String(status)
}

export function translateMaintenanceStatus(status, lang) {
  return mapOrFallback(MAINTENANCE_STATUS_EN, status, lang)
}

export function translateInvoicePaymentStatus(status, lang) {
  return mapOrFallback(INVOICE_PAYMENT_STATUS_EN, status, lang)
}

export function translateContractStatus(status, lang) {
  return mapOrFallback(CONTRACT_STATUS_EN, status, lang)
}

export function translateUnitStatus(status, lang) {
  return mapOrFallback(UNIT_STATUS_EN, status, lang)
}

export function translateBillingCycle(cycle, lang) {
  return mapOrFallback(BILLING_CYCLE_EN, cycle, lang)
}

export function translateUtilityPayment(type, lang) {
  return mapOrFallback(UTILITY_PAYMENT_EN, type, lang)
}

export function translatePropertyCategory(category, lang) {
  return mapOrFallback(PROPERTY_CATEGORY_EN, category, lang)
}

export function translatePropertyType(type, lang) {
  if (!type) return ''
  if (lang === 'en') return PROPERTY_TYPE_EN[type] || String(type)
  return PROPERTY_TYPE_AR[type] || String(type)
}
