/** Shared read-only field row for Company Detail panels. */
export function DetailField({ label, children }) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-0 sm:grid sm:grid-cols-3 sm:gap-4">
      <div className="text-sm font-semibold text-slate-600">{label}</div>
      <div className="mt-1 text-sm text-slate-900 sm:col-span-2 sm:mt-0">{children}</div>
    </div>
  )
}
