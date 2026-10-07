'use client'

// =============================================================================
// F&I > Documentos — todos os documentos das fichas da loja, num lugar.
// Consome /api/financing/documents (filtros status/q). Link p/ o arquivo e p/ a
// ficha. O upload/aprovação por documento é feito na própria ficha.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { FolderOpen, RefreshCw, Paperclip, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import SearchBox from '@/components/reports/SearchBox'

type DocStatus = 'PENDENTE' | 'ENVIADO' | 'APROVADO' | 'REPROVADO'
interface Row { id: string; type: string; status: DocStatus; statusLabel: string; required: boolean; hasFile: boolean; fileName: string | null; proposalId: string | null; proposalCode: string | null; proponentNome: string; vehicle: string | null; createdAt: string }

const date = (s: string) => new Date(s).toLocaleDateString('pt-BR')
const DOC_CLS: Record<DocStatus, string> = { PENDENTE: 'bg-amber-100 text-amber-700', ENVIADO: 'bg-blue-100 text-blue-700', APROVADO: 'bg-green-100 text-green-700', REPROVADO: 'bg-red-100 text-red-600' }
const FILTER_LABEL: Record<string, string> = { '': 'Todos', PENDENTE: 'Aguardando envio', ENVIADO: 'Para conferir', APROVADO: 'Aprovados', REPROVADO: 'Recusados' }

export default function FinancingDocumentsPage() {
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams(); if (status) qs.set('status', status); if (q) qs.set('q', q)
      const res = await fetch(`/api/financing/documents?${qs}`, { credentials: 'include' })
      const r = await res.json().catch(() => null)
      if (!res.ok || r?.success === false) { setError(r?.error ?? 'Não foi possível carregar os documentos.'); setItems([]) }
      else { setItems(r?.data ?? []); setError(null) }
    } catch { setError('Erro de rede.'); setItems([]) } finally { setLoading(false) }
  }, [status, q])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const counts = {
    total: items.length,
    pendentes: items.filter((d) => d.status === 'PENDENTE').length,
    semArquivo: items.filter((d) => !d.hasFile).length,
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><FolderOpen size={20} className="text-brand-600" />Documentos</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${counts.total} documento(s) · ${counts.pendentes} pendente(s) · ${counts.semArquivo} sem arquivo`}</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Cliente, documento ou ficha" className="w-60" />
          <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {['', 'PENDENTE', 'ENVIADO', 'APROVADO', 'REPROVADO'].map((sx) => (
          <button key={sx || 'all'} onClick={() => setStatus(sx)} className={cn('rounded-full px-3 py-1 text-xs font-medium', status === sx ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{FILTER_LABEL[sx]}</button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Documento', 'Cliente', 'Veículo', 'Situação', 'Arquivo', 'Data', 'Ficha'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: 7 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="py-14 text-center"><FolderOpen size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum documento encontrado.</p></td></tr>
              ) : items.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-800">{d.type}{d.required && <span className="ml-1 text-[10px] font-semibold text-red-500">obrig.</span>}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{d.proponentNome}</td>
                  <td className="px-4 py-3 text-gray-600">{d.vehicle ?? '—'}</td>
                  <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', DOC_CLS[d.status] ?? 'bg-gray-100 text-gray-600')}>{d.statusLabel}</span></td>
                  <td className="px-4 py-3">{d.hasFile && d.proposalId ? <a href={`/api/financing/proposals/${d.proposalId}/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"><Paperclip size={12} />{d.fileName ?? 'ver'}</a> : <span className="text-xs text-gray-300">—</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{date(d.createdAt)}</td>
                  <td className="px-4 py-3">{d.proposalId ? <Link href={`/financiamento/fichas/${d.proposalId}`} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand-700"><ExternalLink size={13} />{d.proposalCode ?? 'abrir'}</Link> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
