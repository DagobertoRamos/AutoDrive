'use client'

// =============================================================================
// PeriodFilter — seletor de período (de/até) reutilizável nos relatórios.
// Datas no formato YYYY-MM-DD; string vazia = sem limite.
// =============================================================================

const inputCls = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function PeriodFilter({
  from, to, onChange,
}: {
  from: string; to: string; onChange: (from: string, to: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Período</span>
      <input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} className={inputCls} aria-label="Data inicial" />
      <span className="text-xs text-gray-400">até</span>
      <input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} className={inputCls} aria-label="Data final" />
      {(from || to) && (
        <button onClick={() => onChange('', '')} className="text-xs text-gray-400 underline-offset-2 hover:text-gray-700 hover:underline">limpar</button>
      )}
    </div>
  )
}
