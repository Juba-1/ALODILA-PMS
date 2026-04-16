import { ALODILA_LOGO_URL } from '../brand/logoUrl'

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function toColumnKeys(columns, rows) {
  if (Array.isArray(columns) && columns.length) return columns.map((c) => ({ key: c.key, label: c.label }))
  const first = (Array.isArray(rows) ? rows : [])[0]
  if (!first || typeof first !== 'object') return []
  return Object.keys(first).map((k) => ({ key: k, label: k }))
}

function buildTableHtml({ columns, rows }) {
  const cols = toColumnKeys(columns, rows)
  const list = Array.isArray(rows) ? rows : []

  const thead = cols
    .map((c) => `<th>${escapeHtml(c.label)}</th>`)
    .join('')

  const tbody =
    list.length === 0
      ? `<tr><td class="empty" colspan="${cols.length}">لا توجد بيانات.</td></tr>`
      : list
          .map((r) => {
            const tds = cols
              .map((c) => {
                const v = r?.[c.key]
                return `<td>${escapeHtml(v)}</td>`
              })
              .join('')
            return `<tr>${tds}</tr>`
          })
          .join('')

  return `
  <table class="doc-table">
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>
  `.trim()
}

function docCss() {
  return `
  @page { size: A4; margin: 14mm 12mm; }
  html, body { padding: 0; margin: 0; }
  body { font-family: system-ui, "Segoe UI", Tahoma, Arial, sans-serif; color: #0f172a; }
  html[dir="rtl"] body { direction: rtl; }
  html[dir="ltr"] body { direction: ltr; }
  .doc { padding: 0; }
  .header { display:flex; align-items:center; justify-content:center; gap:14px; border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:10px; }
  .logo { width:56px; height:56px; border-radius:12px; object-fit:cover; }
  .htext { text-align:center; }
  .brand { font-weight:800; font-size:14px; letter-spacing:.2px; }
  .title { font-weight:900; font-size:16px; margin-top:2px; }
  .subtitle { font-size:11px; color:#334155; margin-top:4px; }
  .meta { margin-top:6px; font-size:11px; color:#334155; display:grid; grid-template-columns:1fr 1fr; gap:2px 12px; }
  .doc-table { width:100%; border-collapse:collapse; font-size:11px; }
  .doc-table thead th { background:#f1f5f9; border-bottom:1px solid #0f172a; padding:6px 8px; text-align:start; }
  .doc-table td { border-bottom:1px solid #e2e8f0; padding:6px 8px; vertical-align:top; text-align:start; }
  .doc-table tr { break-inside: avoid; }
  .empty { text-align:center; color:#64748b; padding:18px 8px; }
  .footer { margin-top:10px; font-size:10px; color:#475569; text-align:center; }
  `.trim()
}

function whenImagesReady(doc, timeoutMs = 1200) {
  try {
    const imgs = Array.from(doc?.images || [])
    if (!imgs.length) return Promise.resolve()

    const waits = imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) return resolve()
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        }),
    )

    return Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, timeoutMs))])
  } catch {
    return Promise.resolve()
  }
}

function openPrintFrame(html, filename) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.tabIndex = -1
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'

  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = iframe.contentDocument || win?.document
  if (!win || !doc) {
    try {
      iframe.remove()
    } catch {
      // ignore
    }
    throw new Error('Unable to create print frame')
  }

  try {
    doc.open()
    doc.write(html)
    doc.close()
    doc.title = filename ? String(filename) : doc.title

    // Ensure the iframe is the active print context.
    ;(async () => {
      await whenImagesReady(doc)
      win.focus()
      // Some browsers need a tick after focus for consistent print capture.
      setTimeout(() => {
        try {
          win.print()
        } finally {
          // Remove after print is triggered; keep a slight delay to avoid blank output in some browsers.
          setTimeout(() => {
            try {
              iframe.remove()
            } catch {
              // ignore
            }
          }, 800)
        }
      }, 50)
    })()
  } catch (e) {
    try {
      iframe.remove()
    } catch {
      // ignore
    }
    throw e
  }
}

/**
 * Targeted, professional PDF via HTML print window (not a dashboard screenshot).
 * This preserves Arabic rendering and paginates huge tables naturally.
 */
export function exportReportPdf({
  title,
  subtitle,
  filename,
  metaLines = [],
  columns,
  rows,
  footer,
  dir,
} = {}) {
  const effectiveDir =
    dir ||
    (typeof document !== 'undefined' && document?.documentElement?.getAttribute?.('dir')) ||
    (typeof document !== 'undefined' && document?.documentElement?.dir) ||
    'rtl'

  const meta = (Array.isArray(metaLines) ? metaLines : [])
    .filter(Boolean)
    .map((x) => `<div>${escapeHtml(x)}</div>`)
    .join('')

  const bodyTable = buildTableHtml({ columns, rows })

  const html = `<!doctype html>
  <html lang="ar" dir="${escapeHtml(effectiveDir)}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title || 'PDF')}</title>
      <style>${docCss()}</style>
    </head>
    <body>
      <div class="doc">
        <div class="header">
          <img class="logo" src="${escapeHtml(ALODILA_LOGO_URL)}" alt="ALODILA" referrerpolicy="no-referrer" />
          <div class="htext">
            <div class="brand">مجموعة العضيلة — ALODILA-PMS</div>
            <div class="title">${escapeHtml(title || '')}</div>
            ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
            ${meta ? `<div class="meta">${meta}</div>` : ''}
          </div>
        </div>
        ${bodyTable}
        <div class="footer">${escapeHtml(footer || 'تم التوليد من ALODILA-PMS')}</div>
      </div>
    </body>
  </html>`

  openPrintFrame(html, filename || title || 'report')
}

