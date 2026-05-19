'use client'

// =============================================================================
// Disparo Manual — AutoDrive
// Busca clientes/pendências e envia mensagem avulsa via WhatsApp
// =============================================================================

import { useState, useCallback } from 'react'
import {
  Search, Send, Phone, User, Car, MessageSquare,
  CheckCircle2, AlertCircle, X, Loader2,
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import type { PendencyWithRelations } from '@/types'

interface SendResult {
  success: boolean
  message: string
}

export default function DisparoManualPage() {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<PendencyWithRelations[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected]   = useState<PendencyWithRelations | null>(null)
  const [customMsg, setCustomMsg] = useState('')
  const [sending, setSending]     = useState(false)
  const [result, setResult]       = useState<SendResult | null>(null)

  // ── Busca ─────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    if (!query.trim() || query.length < 2) return
    setSearching(true)
    setResults([])
    try {
      const params = new URLSearchParams({ search: query, perPage: '20' })
      const res  = await fetch(`/api/pendencies?${params}`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) setResults(data.data ?? [])
    } catch {
      // silent
    } finally {
      setSearching(false)
    }
  }, [query])

  // ── Envio ─────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!selected) return
    const phone = selected.responsible?.whatsapp ?? selected.manager?.whatsapp
    if (!phone) {
      setResult({ success: false, message: 'Nenhum número de WhatsApp vinculado a esta pendência.' })
      return
    }

    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/communication/dispatch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pendencyId: selected.id,
          phone,
          message:    customMsg.trim() || undefined,
        }),
      })
      const data = await res.json()
      setResult({
        success: data.success,
        message: data.success
          ? 'Mensagem enviada com sucesso!'
          : (data.error ?? 'Falha ao enviar mensagem.'),
      })
      if (data.success) {
        setSelected(null)
        setCustomMsg('')
      }
    } catch {
      setResult({ success: false, message: 'Erro de conexão ao tentar enviar.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Disparo Manual</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Busque uma pendência pelo nome do cliente, placa ou veículo e envie uma mensagem avulsa.
        </p>
      </div>

      {/* ── Busca ─────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="section-header">
          <Search size={15} className="text-brand-700" />
          <h2 className="text-sm font-semibold text-gray-800">Buscar Pendência</h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Cliente, placa ou veículo..."
                className="input pl-9"
              />
            </div>
            <button onClick={handleSearch} disabled={searching || query.length < 2} className="btn-primary">
              {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Buscar
            </button>
          </div>

          {/* Resultados */}
          {results.length > 0 && (
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelected(p); setResult(null) }}
                  className={cn(
                    'w-full text-left px-4 py-3 transition-colors hover:bg-gray-50',
                    selected?.id === p.id && 'bg-brand-50 border-l-2 border-l-brand-600',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <User size={13} className="shrink-0 text-gray-400" />
                        <span className="font-medium text-gray-800 truncate">{p.customerName}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                        {p.plate && (
                          <span className="flex items-center gap-1">
                            <Car size={11} />
                            <span className="font-mono">{p.plate}</span>
                          </span>
                        )}
                        {(p.vehicleLabel || p.vehicle) && <span>{p.vehicleLabel ?? p.vehicle?.plate ?? p.vehicle?.model ?? ''}</span>}
                        {p.responsible && (
                          <span className="flex items-center gap-1">
                            <Phone size={11} />
                            {p.responsible.shortName ?? p.responsible.fullName}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                      p.priority === 'URGENTE' ? 'bg-red-100 text-red-700' :
                      p.priority === 'ALTA'    ? 'bg-orange-100 text-orange-700' :
                      p.priority === 'MEDIA'   ? 'bg-blue-100 text-blue-700' :
                                                 'bg-gray-100 text-gray-600',
                    )}>
                      {p.priority}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!searching && query.length >= 2 && results.length === 0 && (
            <p className="text-center py-6 text-sm text-gray-400">Nenhuma pendência encontrada para "{query}"</p>
          )}
        </div>
      </div>

      {/* ── Painel de envio ───────────────────────────────────────────────── */}
      {selected && (
        <div className="card animate-fade-in">
          <div className="section-header">
            <MessageSquare size={15} className="text-brand-700" />
            <h2 className="text-sm font-semibold text-gray-800">Enviar Mensagem</h2>
            <button onClick={() => setSelected(null)} className="ml-auto rounded p-1 hover:bg-gray-100">
              <X size={14} className="text-gray-400" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            {/* Dados da pendência selecionada */}
            <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1.5">
              <div className="flex gap-2">
                <span className="w-24 text-xs text-gray-500 shrink-0">Cliente</span>
                <span className="font-medium text-gray-800">{selected.customerName}</span>
              </div>
              {selected.plate && (
                <div className="flex gap-2">
                  <span className="w-24 text-xs text-gray-500 shrink-0">Placa</span>
                  <span className="font-mono text-xs">{selected.plate}</span>
                </div>
              )}
              {selected.responsible && (
                <div className="flex gap-2">
                  <span className="w-24 text-xs text-gray-500 shrink-0">Responsável</span>
                  <span className="text-gray-700">{selected.responsible.fullName}</span>
                </div>
              )}
              {(selected.responsible?.whatsapp || selected.manager?.whatsapp) && (
                <div className="flex gap-2">
                  <span className="w-24 text-xs text-gray-500 shrink-0">WhatsApp</span>
                  <span className="font-mono text-xs text-brand-700">
                    {selected.responsible?.whatsapp ?? selected.manager?.whatsapp}
                  </span>
                </div>
              )}
            </div>

            {/* Mensagem customizada */}
            <div>
              <label className="label">
                Mensagem personalizada <span className="text-gray-400 font-normal">(opcional — usa template padrão se vazio)</span>
              </label>
              <textarea
                value={customMsg}
                onChange={(e) => setCustomMsg(e.target.value)}
                rows={4}
                placeholder="Digite uma mensagem personalizada para este cliente..."
                className="input resize-none"
              />
            </div>

            {/* Resultado */}
            {result && (
              <div className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-3 text-sm',
                result.success
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200',
              )}>
                {result.success
                  ? <CheckCircle2 size={15} className="shrink-0" />
                  : <AlertCircle  size={15} className="shrink-0" />}
                {result.message}
              </div>
            )}

            {/* Botão de envio */}
            <div className="flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="btn-secondary text-sm">
                Cancelar
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="btn-primary text-sm"
              >
                {sending
                  ? <><Loader2 size={14} className="animate-spin" />Enviando...</>
                  : <><Send size={14} />Enviar mensagem</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
