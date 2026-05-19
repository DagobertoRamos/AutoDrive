'use client'

// =============================================================================
// BankCombo — ComboBox com busca de bancos via /api/integrations/brasilapi/banks
//
// - Exibe "Código - Nome" no input.
// - Permite buscar por código ou nome (filtro client-side).
// - Cacheia a lista no escopo do módulo para não refazer fetch entre instâncias.
// - Suporta valor controlado (code: string) e fallback livre.
//
// Uso:
//   <BankCombo value={form.paymentBank} onChange={(v) => setField('paymentBank', v)} />
//
// O valor armazenado é a string "ccc - Nome do Banco" (compatível com
// inputs livres antigos). Para extrair só o código, use parseBankCode().
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Loader2, ChevronDown, X, Check, AlertTriangle } from 'lucide-react'

export interface Bank {
  ispb:     string
  name:     string
  code:     number | null
  fullName: string
}

// ── Cache em escopo de módulo ────────────────────────────────────────────────
let CACHED: Bank[] | null = null
let LOADING_PROMISE: Promise<Bank[]> | null = null

async function fetchBanks(): Promise<Bank[]> {
  if (CACHED) return CACHED
  if (LOADING_PROMISE) return LOADING_PROMISE
  LOADING_PROMISE = (async () => {
    try {
      const res = await fetch('/api/integrations/brasilapi/banks')
      const json = await res.json()
      const list: Bank[] = Array.isArray(json?.data) ? json.data : []
      CACHED = list
      return list
    } catch {
      return []
    } finally {
      LOADING_PROMISE = null
    }
  })()
  return LOADING_PROMISE
}

// ── Helpers públicos ──────────────────────────────────────────────────────────

/** Extrai o código numérico (ex.: "237" de "237 - Bradesco"). */
export function parseBankCode(value: string): string {
  const m = value.match(/^\s*(\d{1,3})\s*[-–]/)
  return m?.[1] ?? value.trim()
}

/** Formata um Bank no padrão "037 - Nome do Banco". */
export function formatBank(b: Bank): string {
  const code = b.code != null ? String(b.code).padStart(3, '0') : '---'
  return `${code} - ${b.name}`
}

// ── Componente ────────────────────────────────────────────────────────────────

interface BankComboProps {
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  className?:   string
  disabled?:    boolean
  /** Se true, salva apenas o código numérico no value (ex: "237") em vez do label completo. */
  codeOnly?:    boolean
}

export function BankCombo({
  value,
  onChange,
  placeholder = 'Buscar banco por código ou nome…',
  className,
  disabled,
  codeOnly = false,
}: BankComboProps) {
  const [banks, setBanks]   = useState<Bank[]>(CACHED ?? [])
  const [loading, setLoading] = useState(!CACHED)
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const [error, setError]   = useState(false)
  const wrapperRef          = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    if (!CACHED) {
      fetchBanks().then((list) => {
        if (!alive) return
        setBanks(list)
        setLoading(false)
        setError(list.length === 0)
      })
    }
    return () => { alive = false }
  }, [])

  // Fecha o popover ao clicar fora
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Filtragem por código ou nome
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return banks.slice(0, 50)
    const isNum = /^\d+$/.test(q)
    return banks
      .filter((b) => {
        if (isNum) return String(b.code ?? '').includes(q)
        return b.name.toLowerCase().includes(q) || b.fullName.toLowerCase().includes(q)
      })
      .slice(0, 50)
  }, [banks, query])

  const selectedLabel = value || ''
  const select = useCallback((b: Bank) => {
    onChange(codeOnly ? String(b.code ?? '').padStart(3, '0') : formatBank(b))
    setOpen(false)
    setQuery('')
  }, [codeOnly, onChange])

  // Permite digitar manualmente caso a lista não carregue (modo degradado)
  const baseInputCls =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-9 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60'

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <div className="relative">
        <input
          className={baseInputCls}
          value={open ? query : selectedLabel}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); setQuery('') }
            if (e.key === 'Enter' && filtered.length > 0) {
              e.preventDefault()
              select(filtered[0])
            }
          }}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {loading && <Loader2 size={13} className="animate-spin text-gray-400" />}
          {!loading && value && !open && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange('') }}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Limpar"
            >
              <X size={12} />
            </button>
          )}
          {!loading && <ChevronDown size={13} className="text-gray-400" />}
        </div>
      </div>

      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="sticky top-0 flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
            <Search size={12} className="text-gray-400" />
            <span className="text-[11px] text-gray-500">
              {loading ? 'Carregando bancos…' : `${filtered.length} de ${banks.length} bancos`}
            </span>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-amber-700">
              <AlertTriangle size={12} />
              Lista de bancos indisponível. Preencha manualmente.
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="px-3 py-3 text-xs text-gray-400">Nenhum banco encontrado.</div>
          )}

          <ul>
            {filtered.map((b) => {
              const label = formatBank(b)
              const isSel = value === label || value === String(b.code).padStart(3, '0')
              return (
                <li key={b.ispb + (b.code ?? '')}>
                  <button
                    type="button"
                    onClick={() => select(b)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50 ${
                      isSel ? 'bg-brand-50/60' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-gray-500 min-w-[2.5rem]">
                        {b.code != null ? String(b.code).padStart(3, '0') : '—'}
                      </span>
                      <span className="text-gray-800">{b.name}</span>
                    </span>
                    {isSel && <Check size={13} className="text-brand-600" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
