'use client'

// =============================================================================
// FichaDetail — ficha profissional de F&I (Fase 7a).
// Documentos obrigatórios (checklist), envio multi-banco (via ManualAdapter) e
// linha do tempo de status por banco. Consome /api/financing/proposals/[id]/*
// e /api/financing/submissions/[id]. Envio gated por documentos (override
// supervisionado). Sem automação oculta de banco.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileCheck2, Send, Plus, Trash2, Clock, Landmark, AlertTriangle, Check, Lock, Paperclip, Bot, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFiPermissions } from './useFiPermissions'

type DocStatus = 'PENDENTE' | 'APROVADO' | 'REPROVADO'
interface Proposal { id: string; vehicle: string | null; status: string; amountRequested: number; downPayment: number; installments: number | null; proponent: { nomeCompleto: string; occupation: string | null } | null; bank: { name: string } | null }
interface DocRow { id: string; type: string; required: boolean; status: DocStatus; notes: string | null; fileUrl: string | null; fileName: string | null }
interface Docs { documents: DocRow[]; requiredNames: string[]; pending: string[] }
interface EventRow { id: string; type: string; status: string | null; message: string | null; source: string | null; createdAt: string }
interface Submission { id: string; bankId: string | null; bankName: string; status: string; externalId: string | null; environment: string; submittedAt: string; events: EventRow[] }
interface Bank { id: string; name: string }

const inputCls = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dt = (s: string) => new Date(s).toLocaleString('pt-BR')
const SUB_STATUS: string[] = ['ENVIADA', 'EM_ANALISE', 'PENDENTE', 'APROVADA', 'RECUSADA', 'CANCELADA']
const DOC_CLS: Record<DocStatus, string> = { PENDENTE: 'bg-amber-100 text-amber-700', APROVADO: 'bg-green-100 text-green-700', REPROVADO: 'bg-red-100 text-red-600' }
const SUB_CLS: Record<string, string> = { ENVIADA: 'bg-blue-100 text-blue-700', EM_ANALISE: 'bg-indigo-100 text-indigo-700', PENDENTE: 'bg-amber-100 text-amber-700', APROVADA: 'bg-green-100 text-green-700', RECUSADA: 'bg-red-100 text-red-600', CANCELADA: 'bg-gray-100 text-gray-500' }

export default function FichaDetail({ id }: { id: string }) {
  const { perms } = useFiPermissions()
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [docs, setDocs] = useState<Docs>({ documents: [], requiredNames: [], pending: [] })
  const [subs, setSubs] = useState<Submission[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)
  const [newDoc, setNewDoc] = useState('')
  const [pickBanks, setPickBanks] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadDocs = useCallback(async () => {
    const r = await fetch(`/api/financing/proposals/${id}/documents`, { credentials: 'include' }).then((x) => x.json()).catch(() => null)
    if (r?.success) setDocs(r.data)
  }, [id])
  const loadSubs = useCallback(async () => {
    const r = await fetch(`/api/financing/proposals/${id}/submissions`, { credentials: 'include' }).then((x) => x.json()).catch(() => null)
    if (r?.success) setSubs(r.data)
  }, [id])
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [p, , , b] = await Promise.all([
        fetch(`/api/financing/proposals/${id}`, { credentials: 'include' }).then((x) => x.json()).catch(() => null),
        loadDocs(), loadSubs(),
        fetch('/api/financing/banks?active=true', { credentials: 'include' }).then((x) => x.json()).catch(() => null),
      ])
      if (p?.success) setProposal(p.data)
      if (b?.data) setBanks(b.data.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })))
    } finally { setLoading(false) }
  }, [id, loadDocs, loadSubs])
  useEffect(() => { loadAll() }, [loadAll])

  // ── Documentos ──
  const seedRequired = async () => {
    await fetch(`/api/financing/proposals/${id}/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ seedRequired: true }) })
    await loadDocs()
  }
  const addDoc = async () => {
    const type = newDoc.trim(); if (!type) return
    await fetch(`/api/financing/proposals/${id}/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ type, required: false }) })
    setNewDoc(''); await loadDocs()
  }
  const setDocStatus = async (docId: string, status: DocStatus) => {
    await fetch(`/api/financing/proposals/${id}/documents/${docId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status }) })
    await loadDocs()
  }
  const removeDoc = async (docId: string) => {
    await fetch(`/api/financing/proposals/${id}/documents/${docId}`, { method: 'DELETE', credentials: 'include' }); await loadDocs()
  }
  const uploadFile = async (docId: string, file: File) => {
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch(`/api/financing/proposals/${id}/documents/${docId}/file`, { method: 'POST', credentials: 'include', body: fd })
    const json = await res.json().catch(() => null)
    if (!res.ok) { setMsg({ ok: false, text: json?.error ?? 'Erro no upload.' }); return }
    await loadDocs()
  }
  const removeFile = async (docId: string) => {
    await fetch(`/api/financing/proposals/${id}/documents/${docId}/file`, { method: 'DELETE', credentials: 'include' }); await loadDocs()
  }
  // Analisa o arquivo anexado com IA (lê do storage local /uploads/).
  const [analyzingDoc, setAnalyzingDoc] = useState<string | null>(null)
  const [docAnalysis, setDocAnalysis] = useState<{ type: string; summary: string; needsReview: boolean; mock: boolean } | null>(null)
  const analyzeFile = async (docId: string, fileUrl: string, type: string) => {
    setAnalyzingDoc(docId); setDocAnalysis(null)
    try {
      const res = await fetch('/api/ai/documents/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ fileUrl }) })
      const json = await res.json()
      if (!json.success && !json.data) { setMsg({ ok: false, text: json?.error ?? 'Não foi possível analisar.' }); return }
      setDocAnalysis({ type, summary: json.data?.summary ?? '', needsReview: !!json.data?.needsHumanReview, mock: !!json.mock })
    } catch { setMsg({ ok: false, text: 'Erro de rede ao analisar.' }) } finally { setAnalyzingDoc(null) }
  }

  // ── Envio ──
  const toggleBank = (bankId: string) => setPickBanks((b) => b.includes(bankId) ? b.filter((x) => x !== bankId) : [...b, bankId])
  const submit = async (force = false) => {
    if (pickBanks.length === 0) { setMsg({ ok: false, text: 'Selecione ao menos um banco.' }); return }
    setSending(true); setMsg(null)
    try {
      const res = await fetch(`/api/financing/proposals/${id}/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ bankIds: pickBanks, force }) })
      const json = await res.json()
      if (res.status === 422 && json?.pendingDocuments) {
        if (confirm(`Documentos obrigatórios pendentes:\n\n• ${json.pendingDocuments.join('\n• ')}\n\nEnviar mesmo assim?`)) { await submit(true); return }
        setMsg({ ok: false, text: 'Envio cancelado: documentos pendentes.' }); return
      }
      if (!res.ok) { setMsg({ ok: false, text: json?.error ?? 'Erro ao enviar.' }); return }
      setMsg({ ok: true, text: `Ficha enviada a ${json.created} banco(s).` }); setPickBanks([])
      await Promise.all([loadSubs(), loadAll()])
    } catch { setMsg({ ok: false, text: 'Erro de rede.' }) } finally { setSending(false) }
  }
  const updateSub = async (subId: string, status: string) => {
    await fetch(`/api/financing/submissions/${subId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status }) })
    await Promise.all([loadSubs(), loadAll()])
  }

  if (loading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />))}</div>
  if (!proposal) return <div className="py-20 text-center text-sm text-gray-400">Ficha não encontrada.</div>

  return (
    <div className="space-y-5">
      <Link href="/financiamento/fichas" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft size={15} />Voltar às fichas</Link>

      {/* Cabeçalho */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{proposal.proponent?.nomeCompleto ?? 'Ficha'}</h1>
            <p className="mt-0.5 text-sm text-gray-500">{proposal.vehicle ?? 'Sem veículo'} · {proposal.installments ?? '—'}x · {fmt(proposal.amountRequested)}</p>
          </div>
          <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', SUB_CLS[proposal.status] ?? 'bg-gray-100 text-gray-600')}>{proposal.status}</span>
        </div>
      </div>

      {msg && <div className={cn('rounded-lg border px-4 py-2.5 text-sm', msg.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700')}>{msg.text}</div>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Documentos */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-gray-900"><FileCheck2 size={17} className="text-brand-600" />Documentos</h2>
            {docs.requiredNames.length > 0 && <button onClick={seedRequired} className="btn-secondary text-xs"><Plus size={13} />Obrigatórios</button>}
          </div>

          {docs.pending.length > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>Pendentes: {docs.pending.join(', ')}</span>
            </div>
          )}

          <ul className="space-y-1.5">
            {docs.documents.length === 0 ? (
              <li className="py-6 text-center text-sm text-gray-400">Nenhum documento. {docs.requiredNames.length > 0 ? 'Use “Obrigatórios”.' : ''}</li>
            ) : docs.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-gray-800">{d.type}{d.required && <span className="ml-1 text-[10px] font-semibold text-red-500">obrig.</span>}</span>
                  {d.fileUrl && <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-[11px] text-brand-600 hover:underline"><Paperclip size={11} className="shrink-0" /><span className="truncate">{d.fileName ?? 'arquivo'}</span></a>}
                </div>
                {d.fileUrl && (
                  <button onClick={() => analyzeFile(d.id, d.fileUrl!, d.type)} disabled={analyzingDoc === d.id} className="rounded p-1 text-gray-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50" title="Analisar com IA">
                    {analyzingDoc === d.id ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                  </button>
                )}
                {d.fileUrl ? (
                  <button onClick={() => removeFile(d.id)} className="rounded p-1 text-gray-400 hover:bg-amber-50 hover:text-amber-600" title="Remover arquivo"><Paperclip size={14} /></button>
                ) : (
                  <label className="cursor-pointer rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600" title="Anexar arquivo">
                    <Paperclip size={14} />
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(d.id, f); e.currentTarget.value = '' }} />
                  </label>
                )}
                <select value={d.status} onChange={(e) => setDocStatus(d.id, e.target.value as DocStatus)} className={cn('rounded-full border-0 px-2 py-0.5 text-xs font-semibold', DOC_CLS[d.status])}>
                  {(['PENDENTE', 'APROVADO', 'REPROVADO'] as DocStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => removeDoc(d.id)} className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600" title="Remover documento"><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex gap-2">
            <input className={cn(inputCls, 'flex-1')} value={newDoc} onChange={(e) => setNewDoc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDoc() } }} placeholder="Adicionar documento..." />
            <button onClick={addDoc} className="btn-secondary px-2.5 text-sm"><Plus size={15} /></button>
          </div>
        </div>

        {/* Envio multi-banco */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-gray-900"><Send size={16} className="text-brand-600" />Enviar para bancos</h2>
          {!perms.enviarFicha ? (
            <p className="flex items-center gap-2 text-sm text-gray-400"><Lock size={14} />Seu perfil não pode enviar fichas (Permissões F&amp;I da loja).</p>
          ) : banks.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum banco ativo. Cadastre em Bancos da Loja.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {banks.map((b) => (
                  <button key={b.id} onClick={() => toggleBank(b.id)} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium', pickBanks.includes(b.id) ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
                    {pickBanks.includes(b.id) && <Check size={12} />}{b.name}
                  </button>
                ))}
              </div>
              <button onClick={() => submit(false)} disabled={sending || pickBanks.length === 0} className="btn-primary mt-3 w-full justify-center text-sm disabled:opacity-50"><Send size={15} />{sending ? 'Enviando...' : `Enviar a ${pickBanks.length || ''} banco(s)`}</button>
              <p className="mt-2 text-[11px] text-gray-400">Envio registrado de forma supervisionada (sem automação de tela de banco). Envie a ficha pelo canal oficial e acompanhe o status aqui.</p>
            </>
          )}
        </div>
      </div>

      {/* Submissões + linha do tempo */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-gray-900"><Clock size={17} className="text-brand-600" />Submissões e status</h2>
        {subs.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Nenhum envio ainda.</p>
        ) : (
          <ul className="space-y-3">
            {subs.map((s) => (
              <li key={s.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-medium text-gray-900"><Landmark size={14} className="text-gray-400" />{s.bankName}{s.externalId && <span className="font-mono text-[11px] text-gray-400">#{s.externalId}</span>}</span>
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', SUB_CLS[s.status] ?? 'bg-gray-100 text-gray-600')}>{s.status}</span>
                    <select value={s.status} onChange={(e) => updateSub(s.id, e.target.value)} className={cn(inputCls, 'py-1 text-xs')} title={!perms.aprovar ? 'Aprovar/recusar restrito (Permissões F&I)' : undefined}>
                      {SUB_STATUS.filter((st) => perms.aprovar || st === s.status || (st !== 'APROVADA' && st !== 'RECUSADA')).map((st) => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                </div>
                {s.events.length > 0 && (
                  <ol className="mt-2 space-y-1 border-l-2 border-gray-100 pl-3">
                    {s.events.map((e) => (
                      <li key={e.id} className="text-xs text-gray-500"><span className="font-medium text-gray-700">{e.status ?? e.type}</span>{e.message ? ` — ${e.message}` : ''} <span className="text-gray-300">· {dt(e.createdAt)} · {e.source}</span></li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Análise de documento por IA */}
      {docAnalysis && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setDocAnalysis(null)}>
          <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-bold text-gray-900"><Bot size={16} className="text-brand-600" />Análise: {docAnalysis.type}</h2>
              <button onClick={() => setDocAnalysis(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
            </div>
            {docAnalysis.needsReview && <p className="mb-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Precisa de conferência humana</p>}
            <p className="whitespace-pre-wrap text-sm text-gray-700">{docAnalysis.summary}</p>
            {docAnalysis.mock && <p className="mt-3 rounded bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">Análise simulada (MockAI) — configure um provedor de IA no painel Master.</p>}
            <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] text-gray-400">IA auxilia a leitura; confira os dados sensíveis manualmente.</p>
          </div>
        </div>
      )}
    </div>
  )
}
