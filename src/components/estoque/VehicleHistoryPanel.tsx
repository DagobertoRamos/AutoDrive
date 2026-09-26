'use client'
/* eslint-disable @next/next/no-img-element -- fotos das avaliações */

// =============================================================================
// Histórico do veículo na loja (mesma placa/chassi/renavam):
//   mode="photos"   → Fotos da avaliação (por avaliação, para comparar)
//   mode="timeline" → avaliações + passagens pelo estoque, da mais recente
//   mode="banner"   → aviso compacto na inspeção quando o carro já passou pela loja
// API: /api/vehicle-history
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Camera, History, Loader2, Warehouse, ClipboardCheck } from 'lucide-react'
import { PhotoGalleryModal } from './avaliacoes/PhotoGalleryModal'
import { getStatusDef } from './avaliacoes/status'
import type { VehicleHistory } from '@/lib/stock/vehicle-history'

const brl = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')
const kmTxt = (k: number | null) => (k == null ? 'km —' : `${k.toLocaleString('pt-BR')} km`)
const STOCK_LABEL: Record<string, string> = {
  DISPONIVEL: 'Disponível', VENDIDO: 'Vendido', COMPRADO: 'Comprado', CANCELADO: 'Cancelado', DEVOLVIDO: 'Devolvido', BLOQUEADO: 'Bloqueado',
  EM_PROMOCAO: 'Em promoção', EM_ATACADO: 'Em atacado', EM_NEGOCIACAO: 'Em negociação', EM_SERVICO: 'Em serviço', RESERVADO: 'Reservado',
  PENDENTE_DOCUMENTACAO: 'Pend. documentação', PENDENTE_AVALIACAO: 'Pend. avaliação', PENDENTE_PREPARACAO: 'Pend. preparação', EM_PRECIFICACAO: 'Em precificação',
}

export function VehicleHistoryPanel({ vehicleId, evaluationId, mode }: { vehicleId?: string; evaluationId?: string; mode: 'photos' | 'timeline' | 'banner' }) {
  const [data, setData] = useState<VehicleHistory | null>(null)
  const [err, setErr] = useState('')
  const [gallery, setGallery] = useState<{ evalId: string; index: number } | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const qs = vehicleId ? `vehicleId=${vehicleId}` : `evaluationId=${evaluationId}`
    fetch(`/api/vehicle-history?${qs}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (!j.success) throw new Error(j.error ?? 'Falha ao carregar o histórico.'); setData(j.data) })
      .catch((e) => setErr((e as Error).message))
  }, [vehicleId, evaluationId])

  // Na inspeção, a avaliação atual e o veículo dela não contam como "passagem anterior".
  const view = useMemo(() => {
    if (!data) return null
    const evaluations = data.evaluations.filter((e) => e.id !== evaluationId)
    const currentVehicle = data.evaluations.find((e) => e.id === evaluationId)?.vehicleId ?? null
    const passages = data.passages.filter((p) => p.id !== currentVehicle && (mode !== 'banner' || p.id !== vehicleId))
    return { evaluations, passages }
  }, [data, evaluationId, vehicleId, mode])

  if (err) return mode === 'banner' ? null : <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>
  if (!view) return mode === 'banner' ? null : <Loader2 className="animate-spin text-gray-400" />

  const openGallery = view.evaluations.find((e) => e.id === gallery?.evalId)

  const photosBlock = (
    <div className="space-y-4">
      {view.evaluations.filter((e) => e.photos.length).map((e) => (
        <div key={e.id} className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">Avaliação de {date(e.createdAt)} <span className="font-normal text-gray-500">· {kmTxt(e.km)} · avaliado {brl(e.evaluatedValue)}</span></p>
            <Link href={`/estoque/avaliacao/${e.id}/inspecao`} className="text-xs font-medium text-brand-700 hover:underline">Abrir avaliação</Link>
          </div>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {e.photos.map((p, i) => (
              <li key={p.id}>
                <button type="button" onClick={() => setGallery({ evalId: e.id, index: i })} className="block w-full overflow-hidden rounded-lg border border-gray-200 hover:border-brand-500" title={p.section ?? undefined}>
                  <img src={p.url} alt={p.section ?? 'Foto da avaliação'} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!view.evaluations.some((e) => e.photos.length) && (
        <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400"><Camera className="mb-2 h-10 w-10" /><p className="text-sm">Nenhuma foto de avaliação deste veículo.</p></div>
      )}
    </div>
  )

  type Row = { at: string; kind: 'eval' | 'stock'; node: React.ReactNode }
  const rows: Row[] = [
    ...view.evaluations.map((e) => ({
      at: e.createdAt, kind: 'eval' as const,
      node: (
        <Link href={`/estoque/avaliacao/${e.id}/inspecao`} className="block hover:underline">
          <b>Avaliação</b> · {getStatusDef(e.status).label} · {kmTxt(e.km)} · avaliado {brl(e.evaluatedValue)} · FIPE {brl(e.fipeValue)}
          {e.evaluatorName ? ` · por ${e.evaluatorName}` : ''}{e.photos.length ? ` · ${e.photos.length} foto(s)` : ''}
        </Link>
      ),
    })),
    ...view.passages.map((p) => ({
      at: p.entryDate ?? p.createdAt, kind: 'stock' as const,
      node: (
        <Link href={`/estoque/${p.id}`} className="block hover:underline">
          <b>Estoque</b> · entrada {date(p.entryDate ?? p.createdAt)}{p.exitDate ? ` · saída ${date(p.exitDate)}` : ''} · {STOCK_LABEL[p.stockStatus ?? ''] ?? p.stockStatus ?? '—'}{!p.active ? ' (inativo)' : ''}
          {' '}· {kmTxt(p.km)} · compra {brl(p.purchasePrice)} · venda {brl(p.salePrice)}
        </Link>
      ),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  const timelineBlock = rows.length === 0
    ? <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400"><History className="mb-2 h-10 w-10" /><p className="text-sm">Sem outras passagens deste veículo pela loja.</p></div>
    : (
      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="flex gap-3 rounded-lg border border-gray-200 bg-white p-2.5 text-xs text-gray-700">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${r.kind === 'eval' ? 'bg-brand-50 text-brand-700' : 'bg-teal-50 text-teal-700'}`}>
              {r.kind === 'eval' ? <ClipboardCheck size={13} /> : <Warehouse size={13} />}
            </span>
            <div className="min-w-0"><p className="text-[10px] text-gray-400">{date(r.at)}</p>{r.node}</div>
          </li>
        ))}
      </ol>
    )

  const modal = openGallery && (
    <PhotoGalleryModal photos={openGallery.photos} initialIndex={gallery!.index} title={`Avaliação de ${date(openGallery.createdAt)}`} onClose={() => setGallery(null)} />
  )

  if (mode === 'banner') {
    if (!rows.length) return null
    return (
      <div className="rounded-xl border-2 border-sky-200 bg-sky-50/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-sky-900"><History size={15} />Este veículo já passou pela loja: {view.evaluations.length} avaliação(ões) e {view.passages.length} passagem(ns) pelo estoque.</p>
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-sky-800 underline">{open ? 'Esconder histórico' : 'Ver histórico e fotos para comparar'}</button>
        </div>
        {open && <div className="mt-3 space-y-4">{timelineBlock}{photosBlock}</div>}
        {modal}
      </div>
    )
  }

  return <>{mode === 'photos' ? photosBlock : timelineBlock}{modal}</>
}
