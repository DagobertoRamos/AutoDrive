'use client'

// =============================================================================
// StepCliente — Etapa 1 do wizard de Avaliação.
// Busca por CPF/CNPJ/telefone/nome com debounce. Suporta cadastro rápido.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { Search, UserPlus, X, CheckCircle, User as UserIcon, Phone, Mail } from 'lucide-react'
import { maskCPF, maskCNPJ, maskPhone } from '@/lib/masks'

export interface CustomerLite {
  id:    string
  name:  string
  cpf?:  string | null
  phone?: string | null
  email?: string | null
}

interface StepClienteProps {
  selected:  CustomerLite | null
  onSelect:  (c: CustomerLite | null) => void
}

function formatDoc(doc?: string | null): string {
  if (!doc) return ''
  const d = String(doc).replace(/\D/g, '')
  if (d.length === 11) return maskCPF(d)
  if (d.length === 14) return maskCNPJ(d)
  return d
}

function Avatar({ name }: { name: string }) {
  const letter = (name?.trim()?.[0] ?? '?').toUpperCase()
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
      {letter}
    </div>
  )
}

const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full'

export function StepCliente({ selected, onSelect }: StepClienteProps) {
  const [q,       setQ]       = useState('')
  const [results, setResults] = useState<CustomerLite[]>([])
  const [loading, setLoading] = useState(false)
  const [drawer,  setDrawer]  = useState(false)
  const [err,     setErr]     = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (selected) { setResults([]); return }
    const term = q.trim()
    if (term.length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/customers/search?q=${encodeURIComponent(term)}`, { cache: 'no-store' })
        const d = await r.json()
        setResults(Array.isArray(d?.data) ? d.data : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q, selected])

  // ── Selecionado: render card de confirmação ─────────────────────────────────
  if (selected) {
    return (
      <div className="rounded-xl border-2 border-brand-200 bg-brand-50/40 p-4 flex items-start gap-4">
        <Avatar name={selected.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold text-gray-900 truncate">{selected.name}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            {selected.cpf   && <span className="font-mono">{formatDoc(selected.cpf)}</span>}
            {selected.phone && <span>{maskPhone(selected.phone)}</span>}
            {selected.email && <span className="truncate">{selected.email}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => { onSelect(null); setQ('') }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Trocar cliente
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={inputCls + ' pl-9'}
            placeholder="Buscar por CPF, CNPJ, telefone ou nome..."
          />
        </div>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-400 bg-white px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50 whitespace-nowrap"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Cadastrar cliente rápido
        </button>
      </div>

      {/* Resultados */}
      {loading && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-xs text-gray-500 text-center">
          Buscando...
        </div>
      )}
      {!loading && q.trim().length >= 2 && results.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-xs text-gray-500 text-center">
          Nenhum cliente encontrado. Use "Cadastrar cliente rápido" para criar um novo.
        </div>
      )}
      {!loading && q.trim().length < 2 && results.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-3 py-4 text-xs text-gray-500 text-center">
          Digite para buscar ou cadastre um novo cliente.
        </div>
      )}
      {!loading && results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c)}
                className="w-full text-left flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
              >
                <Avatar name={c.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    {c.cpf   && <span className="font-mono inline-flex items-center gap-1"><UserIcon className="h-3 w-3" />{formatDoc(c.cpf)}</span>}
                    {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{maskPhone(c.phone)}</span>}
                    {c.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{c.email}</span>}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Drawer cadastro rápido */}
      {drawer && (
        <QuickCreateDrawer
          onClose={() => { setDrawer(false); setErr('') }}
          onCreated={(c) => { onSelect(c); setDrawer(false); setErr('') }}
          onError={setErr}
        />
      )}
      {err && (
        <p className="text-xs text-red-600">{err}</p>
      )}
    </div>
  )
}

// ── Drawer cadastro rápido ──────────────────────────────────────────────────
function QuickCreateDrawer({
  onClose, onCreated, onError,
}: {
  onClose: () => void
  onCreated: (c: CustomerLite) => void
  onError: (msg: string) => void
}) {
  const [name,  setName]  = useState('')
  const [tipo,  setTipo]  = useState<'FISICA' | 'JURIDICA'>('FISICA')
  const [doc,   setDoc]   = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || name.trim().length < 2) { onError('Nome é obrigatório.'); return }
    setSubmitting(true)
    onError('')
    try {
      const r = await fetch('/api/customers/quick-create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:  name.trim(),
          doc:   doc.replace(/\D/g, '') || null,
          phone: phone.replace(/\D/g, '') || null,
          email: email.trim() || null,
        }),
      })
      const d = await r.json()
      if (!r.ok || !d?.data?.id) {
        onError(d?.error ?? 'Erro ao criar cliente.')
      } else {
        onCreated(d.data as CustomerLite)
      }
    } catch {
      onError('Erro de conexão.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-xl flex flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Cadastrar cliente rápido</h3>
            <p className="text-xs text-gray-500">Preencha os dados mínimos. Você pode completar depois.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </header>
        <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Nome <span className="text-red-500">*</span></span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo / Razão social" autoFocus />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Tipo</span>
            <select className={inputCls} value={tipo} onChange={(e) => { setTipo(e.target.value as 'FISICA' | 'JURIDICA'); setDoc('') }}>
              <option value="FISICA">Pessoa Física (CPF)</option>
              <option value="JURIDICA">Pessoa Jurídica (CNPJ)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">{tipo === 'JURIDICA' ? 'CNPJ' : 'CPF'}</span>
            <input
              className={inputCls + ' font-mono'}
              value={tipo === 'JURIDICA' ? maskCNPJ(doc) : maskCPF(doc)}
              onChange={(e) => setDoc(e.target.value)}
              placeholder={tipo === 'JURIDICA' ? '00.000.000/0000-00' : '000.000.000-00'}
              inputMode="numeric"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Telefone / WhatsApp</span>
            <input className={inputCls} value={maskPhone(phone)} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" inputMode="tel" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">E-mail</span>
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </label>

          <div className="mt-auto flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
              {submitting ? 'Salvando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </aside>
    </>
  )
}
