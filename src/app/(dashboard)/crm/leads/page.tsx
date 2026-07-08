'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, RefreshCw, Save, Search, UserCheck, XCircle } from 'lucide-react'
import { crmPriorityLabel, crmPriorityTone, crmSourceLabel, crmStageLabel } from '@/lib/crm/shared'
import { cn } from '@/lib/utils'

interface LeadRow {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  source: string | null
  status: string
  unitName: string | null
  assignedToUserName: string | null
  convertedDealId: string | null
  lastContactAt: string | null
  lostReason: string | null
  priority: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW'
}

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const stageOptions = ['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'CONVERTED', 'LOST', 'DISCARDED', 'RECYCLED']

export default function CrmLeadsPage() {
  const [rows, setRows] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [priority, setPriority] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', email: '', source: 'MANUAL' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (status) params.set('status', status)
      if (source) params.set('source', source)
      if (priority) params.set('priority', priority)
      const res = await fetch(`/api/crm/leads?${params}`, { credentials: 'include' })
      const json = await res.json().catch(() => null) as { data?: LeadRow[] } | null
      setRows(json?.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [search, status, source, priority])

  useEffect(() => {
    void load()
  }, [load])

  const createLead = async () => {
    setSaving(true)
    try {
      await fetch('/api/crm/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      setForm({ name: '', phone: '', email: '', source: 'MANUAL' })
      await load()
    } finally {
      setSaving(false)
    }
  }

  const patchLead = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/crm/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    await load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Leads</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando leads...' : `${rows.length} lead(s) neste filtro`}</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-card lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone, e-mail ou origem" className={`${inputCls} pl-9`} />
        </div>
        <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nome do cliente" className={inputCls} />
        <input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Telefone" className={inputCls} />
        <button onClick={() => void createLead()} disabled={saving} className="btn-primary text-sm">
          <Save size={15} />
          {saving ? 'Salvando...' : 'Novo lead'}
        </button>
        <input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="E-mail" className={inputCls} />
        <input value={form.source} onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))} placeholder="Origem" className={inputCls} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          <option value="">Todas as etapas</option>
          {stageOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
          <option value="">Todas as origens</option>
          <option value="AUTOCONF">Só AutoConf</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
          <option value="">Todas as prioridades</option>
          <option value="URGENT">Urgente</option>
          <option value="HIGH">Alta</option>
          <option value="NORMAL">Normal</option>
          <option value="LOW">Baixa</option>
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { key: 'URGENT', label: 'Urgentes' },
          { key: 'HIGH', label: 'Alta prioridade' },
          { key: 'AUTOCONF', label: 'Vindos do AutoConf' },
          { key: 'NO_CONTACT', label: 'Sem contato recente' },
        ].map((item) => {
          const total = item.key === 'AUTOCONF'
            ? rows.filter((row) => row.source === 'AUTOCONF').length
            : item.key === 'NO_CONTACT'
              ? rows.filter((row) => !row.lastContactAt).length
              : rows.filter((row) => row.priority === item.key).length
          return (
            <div key={item.key} className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</p>
              <p className="mt-3 text-3xl font-black text-gray-900">{loading ? '...' : total}</p>
            </div>
          )
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Cliente', 'Origem', 'Prioridade', 'Responsável', 'Unidade', 'Etapa', 'Último contato', 'Ações'].map((item) => (
                  <th key={item} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{item}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{row.name ?? row.phone ?? row.email ?? 'Lead sem identificação'}</p>
                    <p className="text-xs text-gray-500">{row.phone ?? row.email ?? 'Sem contato'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{crmSourceLabel(row.source)}</td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', crmPriorityTone(row.priority))}>
                      {crmPriorityLabel(row.priority)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.assignedToUserName ?? 'Sem responsável'}</td>
                  <td className="px-4 py-3 text-gray-600">{row.unitName ?? 'Sem unidade'}</td>
                  <td className="px-4 py-3">
                    <select value={row.status} onChange={(e) => void patchLead(row.id, { status: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700">
                      {stageOptions.map((option) => <option key={option} value={option}>{crmStageLabel(option)}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{row.lastContactAt ? new Date(row.lastContactAt).toLocaleString('pt-BR') : 'Sem contato'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void patchLead(row.id, { registerContact: true })} className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                        <UserCheck size={13} className="mr-1 inline" />
                        Contato
                      </button>
                      <Link href={`/crm/leads/${row.id}`} className="rounded-lg border border-sky-200 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50">
                        Ver detalhe
                      </Link>
                      <button onClick={() => void patchLead(row.id, { status: 'CONVERTED' })} className="rounded-lg border border-green-200 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50">
                        <CheckCircle2 size={13} className="mr-1 inline" />
                        Converter
                      </button>
                      <button onClick={() => void patchLead(row.id, { status: 'LOST', lostReason: 'Marcado no CRM' })} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                        <XCircle size={13} className="mr-1 inline" />
                        Perder
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum lead encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
