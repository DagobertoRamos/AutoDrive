'use client'

// =============================================================================
// Financiamento — Clientes da ficha (PF e PJ) — AutoDrive
// Lista + cadastro em 2 passos: identificação rápida (com e-mail) e ficha
// cadastral completa (mesma tela da ficha e do link do cliente).
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { maskCNPJ, maskCPF, maskPhone } from '@/lib/masks'
import SearchBox from '@/components/reports/SearchBox'
import { FieldLabel } from '@/components/ui/field'
import { CadastroForm, internalEndpoints } from '@/components/fi/CadastroForm'
import { api, btnPrimary, btnSecondary, inputClass, Modal } from '@/components/fi/ui'

interface Row { id: string; personType: string; nomeCompleto: string; razaoSocial: string | null; cpf: string | null; cnpj: string | null; celular: string | null; email: string | null; cidade: string | null; estado: string | null; proposals: number }

export default function ProponentesPage() {
  const [items, setItems] = useState<Row[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const role = useSession().data?.user?.role

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams(); if (q) qs.set('q', q)
    const r = await api<Row[]>(`/api/financing/proponents?${qs}`)
    setItems(r.data ?? []); setLoading(false)
  }, [q])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const remove = async (r: Row) => {
    if (!confirm(`Excluir o cliente "${r.razaoSocial ?? r.nomeCompleto}"? As fichas dele também serão removidas.`)) return
    await api(`/api/financing/proponents/${r.id}`, { method: 'DELETE' }); await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clientes</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} clientes`}</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Nome, CPF, CNPJ, e-mail..." className="w-64" />
          <button onClick={() => setCreating(true)} className="btn-primary text-sm"><Plus size={15} />Novo cliente</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Nome', 'CPF / CNPJ', 'Celular', 'E-mail', 'Cidade/UF', 'Fichas', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: 7 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="py-14 text-center"><Users size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum cliente.</p></td></tr>
              ) : items.map((r) => {
                const name = r.personType === 'PJ' ? (r.razaoSocial ?? r.nomeCompleto) : r.nomeCompleto
                return (
                  <tr key={r.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setEditing({ id: r.id, name })}>
                    <td className="px-4 py-3 font-medium text-gray-900">{name}{r.personType === 'PJ' && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">PJ</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">{r.personType === 'PJ' ? (r.cnpj ? maskCNPJ(r.cnpj) : '—') : (r.cpf ? maskCPF(r.cpf) : '—')}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.celular ? maskPhone(r.celular) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{r.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{[r.cidade, r.estado].filter(Boolean).join('/') || '—'}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-gray-500">{r.proposals}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditing({ id: r.id, name })} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label={`Editar ${name}`}><Pencil size={15} /></button>
                      <button onClick={() => remove(r)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Excluir ${name}`}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {creating && <QuickCreate onClose={() => setCreating(false)} onCreated={(id, name) => { setCreating(false); setEditing({ id, name }); load() }} />}
      {editing && (
        <Modal title={`Ficha cadastral — ${editing.name}`} onClose={() => { setEditing(null); load() }} xl>
          <Cadastro id={editing.id} role={role} />
        </Modal>
      )}
    </div>
  )
}

function Cadastro({ id, role }: { id: string; role: string | undefined }) {
  const endpoints = useMemo(() => internalEndpoints(id, role), [id, role])
  return <CadastroForm endpoints={endpoints} highlight />
}

function QuickCreate({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, name: string) => void }) {
  const [type, setType] = useState<'PF' | 'PJ'>('PF')
  const [f, setF] = useState({ nomeCompleto: '', razaoSocial: '', cpf: '', cnpj: '', dataNascimento: '', celular: '', email: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))
  const only = (v: string) => v.replace(/\D/g, '')

  const create = async () => {
    const need = type === 'PF' ? [f.nomeCompleto, f.cpf, f.dataNascimento, f.celular, f.email] : [f.razaoSocial, f.cnpj, f.celular, f.email]
    if (need.some((x) => !x.trim())) { setErr('Preencha os campos obrigatórios.'); return }
    setBusy(true); setErr(null)
    const body = type === 'PF'
      ? { personType: 'PF', nomeCompleto: f.nomeCompleto, cpf: f.cpf, dataNascimento: f.dataNascimento, celular: f.celular, email: f.email }
      : { personType: 'PJ', razaoSocial: f.razaoSocial, cnpj: f.cnpj, celular: f.celular, email: f.email }
    const r = await api<{ id: string }>('/api/financing/proponents/quick', { method: 'POST', body })
    setBusy(false)
    if (!r.ok || !r.data) { setErr(r.error); return }
    onCreated(r.data.id, type === 'PF' ? f.nomeCompleto : f.razaoSocial)
  }

  return (
    <Modal title="Novo cliente" onClose={onClose} wide footer={<><button className={btnSecondary} onClick={onClose}>Cancelar</button><button className={btnPrimary} onClick={create} disabled={busy}>{busy ? 'Salvando…' : 'Continuar para a ficha'}</button></>}>
      <div className="space-y-4">
        <div className="flex gap-2" role="radiogroup" aria-label="Tipo de cliente">
          {(['PF', 'PJ'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t} className={`rounded-full px-3 py-1 text-xs font-medium ${type === t ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{t === 'PF' ? 'Pessoa física' : 'Empresa'}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {type === 'PF' ? <>
            <div className="sm:col-span-2"><FieldLabel required htmlFor="q-nome">Nome completo</FieldLabel><input id="q-nome" className={inputClass} value={f.nomeCompleto} onChange={(e) => set('nomeCompleto', e.target.value)} /></div>
            <div><FieldLabel required htmlFor="q-cpf">CPF</FieldLabel><input id="q-cpf" className={inputClass} inputMode="numeric" placeholder="000.000.000-00" value={maskCPF(f.cpf)} onChange={(e) => set('cpf', only(e.target.value))} /></div>
            <div><FieldLabel required htmlFor="q-nasc">Data de nascimento</FieldLabel><input id="q-nasc" type="date" className={inputClass} value={f.dataNascimento} onChange={(e) => set('dataNascimento', e.target.value)} /></div>
          </> : <>
            <div className="sm:col-span-2"><FieldLabel required htmlFor="q-razao">Razão social</FieldLabel><input id="q-razao" className={inputClass} value={f.razaoSocial} onChange={(e) => set('razaoSocial', e.target.value)} /></div>
            <div className="sm:col-span-2"><FieldLabel required htmlFor="q-cnpj">CNPJ</FieldLabel><input id="q-cnpj" className={inputClass} inputMode="numeric" placeholder="00.000.000/0000-00" value={maskCNPJ(f.cnpj)} onChange={(e) => set('cnpj', only(e.target.value))} /></div>
          </>}
          <div><FieldLabel required htmlFor="q-cel">Celular</FieldLabel><input id="q-cel" className={inputClass} inputMode="tel" placeholder="(00) 00000-0000" value={maskPhone(f.celular)} onChange={(e) => set('celular', only(e.target.value))} /></div>
          <div><FieldLabel required htmlFor="q-email">E-mail</FieldLabel><input id="q-email" type="email" inputMode="email" className={inputClass} value={f.email} onChange={(e) => set('email', e.target.value.trim())} /></div>
        </div>
        {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      </div>
    </Modal>
  )
}
