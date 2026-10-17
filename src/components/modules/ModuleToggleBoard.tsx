'use client'

// =============================================================================
// ModuleToggleBoard — quadro único de módulos/ferramentas (MASTER → loja).
// Mostra cada MÓDULO com chave geral, cada PARTE com "tudo / nada" e cada
// FERRAMENTA com sua chave; topo com busca e "Ligar tudo / Desligar tudo".
// Não decide cascata: devolve as mudanças (chave → ligado) e quem usa aplica
// applyModuleChanges (modules-catalog), igual ao servidor.
// =============================================================================

import { useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ALL_FEATURE_KEYS, SYSTEM_MODULES } from '@/lib/modules-catalog'

interface Props {
  /** Chaves ligadas (efetivas). */
  enabled: Set<string>
  onChange: (changes: Record<string, boolean>) => void
  disabled?: boolean
  /** Mostra a chave técnica abaixo do nome (MASTER). */
  showKeys?: boolean
}

function Switch({ on, onClick, disabled, size = 'md', title }: { on: boolean; onClick: () => void; disabled?: boolean; size?: 'sm' | 'md'; title?: string }) {
  const sm = size === 'sm'
  return (
    <button
      type="button" role="switch" aria-checked={on} onClick={onClick} disabled={disabled} title={title}
      className={cn('relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:opacity-50', sm ? 'h-5 w-9' : 'h-6 w-11', on ? 'bg-brand-600' : 'bg-gray-300')}
    >
      <span className={cn('inline-block transform rounded-full bg-white shadow transition-transform', sm ? 'h-4 w-4' : 'h-5 w-5', on ? (sm ? 'translate-x-4' : 'translate-x-5') : 'translate-x-0.5')} />
    </button>
  )
}

function setAll(keys: string[], on: boolean): Record<string, boolean> {
  return Object.fromEntries(keys.map((k) => [k, on]))
}

export function ModuleToggleBoard({ enabled, onChange, disabled, showKeys }: Props) {
  const [q, setQ] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const ql = q.trim().toLowerCase()

  const modules = useMemo(() => {
    if (!ql) return SYSTEM_MODULES
    return SYSTEM_MODULES.map((m) => {
      const hitModule = m.label.toLowerCase().includes(ql)
      return {
        ...m,
        parts: m.parts
          .map((p) => ({ ...p, features: hitModule || p.label.toLowerCase().includes(ql) ? p.features : p.features.filter((f) => f.label.toLowerCase().includes(ql) || f.key.includes(ql)) }))
          .filter((p) => p.features.length),
      }
    }).filter((m) => m.parts.length)
  }, [ql])

  const onCount = ALL_FEATURE_KEYS.filter((k) => enabled.has(k)).length
  const modulesOn = SYSTEM_MODULES.filter((m) => enabled.has(m.root)).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-card">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar módulo ou ferramenta…" className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <span className="text-xs text-gray-500">{modulesOn}/{SYSTEM_MODULES.length} módulos · {onCount}/{ALL_FEATURE_KEYS.length} ferramentas</span>
        <button type="button" disabled={disabled} onClick={() => onChange(setAll(ALL_FEATURE_KEYS, true))} className="btn-secondary text-xs">Ligar tudo</button>
        <button type="button" disabled={disabled} onClick={() => onChange(setAll(SYSTEM_MODULES.map((m) => m.root), false))} className="btn-secondary text-xs">Desligar tudo</button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {modules.map((m) => {
          const keys = m.parts.flatMap((p) => p.features.map((f) => f.key))
          const rootOn = enabled.has(m.root)
          const count = keys.filter((k) => enabled.has(k)).length
          const isClosed = closed.has(m.id) && !ql
          return (
            <div key={m.id} className={cn('overflow-hidden rounded-xl border bg-white shadow-card', rootOn ? 'border-gray-200' : 'border-gray-200 opacity-90')}>
              <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                <button type="button" onClick={() => setClosed((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <ChevronDown size={14} className={cn('shrink-0 text-gray-400 transition-transform', isClosed && '-rotate-90')} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-800">{m.label}</span>
                    <span className="block truncate text-[11px] text-gray-500">{rootOn ? `${count} de ${keys.length} ligadas` : 'Módulo desligado'} · {m.description}</span>
                  </span>
                </button>
                <button type="button" disabled={disabled} onClick={() => onChange(setAll(keys, true))} className="text-[11px] font-medium text-brand-600 hover:underline disabled:opacity-50">Tudo</button>
                <button type="button" disabled={disabled} onClick={() => onChange({ [m.root]: false })} className="text-[11px] font-medium text-gray-500 hover:underline disabled:opacity-50">Nada</button>
                <Switch on={rootOn} disabled={disabled} onClick={() => onChange({ [m.root]: !rootOn })} title={rootOn ? 'Módulo ligado — clique p/ desligar tudo' : 'Módulo desligado — clique p/ ligar'} />
              </div>
              {!isClosed && m.parts.map((p) => {
                const pKeys = p.features.map((f) => f.key)
                const multi = m.parts.length > 1
                return (
                  <div key={p.label}>
                    {multi && (
                      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 pb-1 pt-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{p.label}</p>
                        {pKeys.some((k) => k !== m.root) && <span className="flex gap-2">
                          <button type="button" disabled={disabled} onClick={() => onChange(setAll(pKeys, true))} className="text-[11px] text-brand-600 hover:underline disabled:opacity-50">tudo</button>
                          <button type="button" disabled={disabled} onClick={() => onChange(setAll(pKeys.filter((k) => k !== m.root), false))} className="text-[11px] text-gray-500 hover:underline disabled:opacity-50">nada</button>
                        </span>}
                      </div>
                    )}
                    <ul className="divide-y divide-gray-50">
                      {p.features.map((f) => {
                        const on = enabled.has(f.key)
                        const isRoot = f.key === m.root
                        return (
                          <li key={f.key} className={cn('flex items-center justify-between gap-3 px-4 py-2', isRoot && 'bg-brand-50/40')}>
                            <div className="min-w-0">
                              <p className={cn('break-words text-sm', on ? 'text-gray-800' : 'text-gray-400', isRoot && 'font-medium')}>{f.label}{f.sensitive && <span className="ml-1.5 rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-700">sensível</span>}</p>
                              {showKeys && <p className="font-mono text-[10px] text-gray-400">{f.key}</p>}
                            </div>
                            <Switch size="sm" on={on} disabled={disabled} onClick={() => onChange({ [f.key]: !on })} title={on ? 'Ligada — clique p/ desligar' : 'Desligada — clique p/ ligar'} />
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
