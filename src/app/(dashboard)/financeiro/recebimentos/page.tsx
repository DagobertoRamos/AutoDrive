'use client'

// =============================================================================
// Financeiro › Recebimentos — o que os clientes pagaram/vão pagar nas
// negociações. O financeiro confere o comprovante, preenche a autorização do
// cartão e CONFIRMA (só aqui; na negociação o pagamento entra pendente).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ExternalLink, Loader2, Paperclip, RotateCcw, Search, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row {
  id: string; type: string; method: string | null; status: string; value: number
  dueDate: string | null; paidAt: string | null; bank: string | null; cardBrand: string | null; installments: number | null
  authorizationCode: string | null; notes: string | null
  deal: { id: string; number: string | null; status: string; client: string | null; seller: string | null; vehicle: string | null; plate: string | null }
  receipts: Array<{ id: string; fileName: string; url: string | null; fileType: string }>
}

const TYPE: Record<string, string> = {
  DINHEIRO: 'Dinheiro', PIX: 'Pix', SINAL: 'Sinal', ENTRADA: 'Entrada', FINANCIAMENTO: 'Financiamento', CARTAO_CREDITO: 'Cartão de crédito',
  CARTAO_DEBITO: 'Cartão de débito', BOLETO: 'Boleto', DUPLICATA: 'Duplicata', TRANSFERENCIA: 'Transferência', OUTRO: 'Outro', OUTROS: 'Outro',
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dt = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—')
const isCard = (r: Row) => [r.type, r.method].some((t) => t === 'CARTAO_CREDITO' || t === 'CARTAO_DEBITO')

async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 1_500_000) return file
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const b = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85))
    return b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file
  } catch { return file }
}

export default function RecebimentosPage() {
  const [tab, setTab] = useState<'PENDENTE' | 'CONFIRMADO' | 'CANCELADO'>('PENDENTE')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState(0)
  const [canManage, setCanManage] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [auth, setAuth] = useState<Record<string, string>>({})
  const [paidAt, setPaidAt] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ status: tab, ...(q.trim() ? { q: q.trim() } : {}) })
    const j = await fetch(`/api/finance/receivables?${qs}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (j?.success) { setRows(j.data); setTotal(j.total); setCanManage(!!j.canManage) } else { setRows([]); setMsg({ ok: false, text: j?.error ?? 'Falha ao carregar.' }) }
  }, [tab, q])
  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t) }, [load, q])

  const act = async (r: Row, action: 'CONFIRMAR' | 'CANCELAR' | 'REABRIR') => {
    if (action === 'CANCELAR' && !confirm('Cancelar este pagamento? Ele deixa de contar no saldo da negociação.')) return
    setBusy(r.id); setMsg(null)
    try {
      const body: Record<string, string> = { action }
      if (auth[r.id] !== undefined) body.authorizationCode = auth[r.id]
      if (action === 'CONFIRMAR') { const d = paidAt[r.id] ?? (r.dueDate ? r.dueDate.slice(0, 10) : ''); if (d) body.paidAt = d }
      const res = await fetch(`/api/finance/receivables/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `Erro ${res.status}`)
      setMsg({ ok: true, text: action === 'CONFIRMAR' ? 'Pagamento confirmado.' : action === 'CANCELAR' ? 'Pagamento cancelado.' : 'Pagamento voltou para pendente.' })
      await load()
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const upload = async (r: Row, f: File) => {
    setBusy(r.id); setMsg(null)
    try {
      const fd = new FormData(); fd.append('file', await shrink(f))
      const res = await fetch(`/api/finance/receivables/${r.id}`, { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? `Erro ${res.status}`)
      setMsg({ ok: true, text: j.needsAuthorization ? 'Comprovante anexado. Agora informe o código de autorização do cartão.' : 'Comprovante anexado.' })
      await load()
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Recebimentos</h1>
        <p className="text-sm text-gray-500">Pagamentos dos clientes nas negociações. Confira o comprovante e confirme — na negociação o pagamento entra como pendente.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(['PENDENTE', 'CONFIRMADO', 'CANCELADO'] as const).map((t) => (
          <button key={t} type="button" onClick={() => { setRows(null); setTab(t) }} className={cn('rounded-full border px-3 py-1 text-xs', tab === t ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 bg-white text-gray-600')}>
            {t === 'PENDENTE' ? 'A confirmar' : t === 'CONFIRMADO' ? 'Confirmados' : 'Cancelados'}
          </button>
        ))}
        <label className="relative ml-auto w-full sm:w-72">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Negociação, cliente ou placa" className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none" />
        </label>
      </div>
      {msg && <p role="status" className={cn('rounded-lg px-3 py-2 text-xs', msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{msg.text}</p>}
      {rows && rows.length > 0 && <p className="text-xs text-gray-500">{rows.length} pagamento(s) · total {brl(total)}</p>}
      {!rows ? <Loader2 className="animate-spin text-gray-400" /> : !rows.length ? <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">Nada aqui.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const needAuth = isCard(r) && r.receipts.length > 0 && !(auth[r.id] ?? r.authorizationCode)
            return (
              <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      {TYPE[r.type] ?? r.type}{r.method ? ` · ${TYPE[r.method] ?? r.method}` : ''}{r.installments && r.installments > 1 ? ` · ${r.installments}x` : ''}
                      <span className="ml-2 text-base text-brand-700">{brl(r.value)}</span>
                    </p>
                    <p className="text-xs text-gray-600">
                      <Link href={`/negociacoes/${r.deal.id}`} className="font-medium text-brand-700 hover:underline">Negociação {r.deal.number ?? ''}</Link>
                      {r.deal.client ? ` · ${r.deal.client}` : ''}{r.deal.vehicle ? ` · ${r.deal.vehicle}` : ''}{r.deal.plate ? ` (${r.deal.plate})` : ''}{r.deal.seller ? ` · vendedor ${r.deal.seller}` : ''}
                    </p>
                    <p className="text-xs text-gray-500">Data de pagamento: {dt(r.dueDate)}{r.paidAt ? ` · confirmado em ${dt(r.paidAt)}` : ''}{r.bank ? ` · ${r.bank}` : ''}{r.cardBrand ? ` · ${r.cardBrand}` : ''}</p>
                    {r.notes && <p className="text-xs italic text-gray-400">{r.notes}</p>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {r.receipts.map((a) => (
                    <a key={a.id} href={a.url ?? '#'} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700 hover:bg-gray-100"><Paperclip size={12} />{a.fileName}<ExternalLink size={11} /></a>
                  ))}
                  {!r.receipts.length && <span className="text-amber-700">Sem comprovante</span>}
                  {canManage && tab === 'PENDENTE' && (
                    <label className={cn('inline-flex cursor-pointer items-center gap-1 rounded-md border border-brand-300 px-2 py-1 font-medium text-brand-700 hover:bg-brand-50', busy === r.id && 'pointer-events-none opacity-60')}>
                      <Paperclip size={12} />Anexar comprovante
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(r, f); e.target.value = '' }} />
                    </label>
                  )}
                </div>
                {canManage && tab === 'PENDENTE' && (
                  <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-2 text-xs">
                    {isCard(r) && (
                      <label className="text-gray-600">Autorização do cartão{r.receipts.length ? ' *' : ''}
                        <input value={auth[r.id] ?? r.authorizationCode ?? ''} onChange={(e) => setAuth((a) => ({ ...a, [r.id]: e.target.value }))} placeholder="Nº de autorização" className={cn('mt-0.5 block w-44 rounded-md border px-2 py-1.5 text-sm', needAuth ? 'border-amber-400' : 'border-gray-300')} />
                      </label>
                    )}
                    <label className="text-gray-600">Pago em
                      <input type="date" value={paidAt[r.id] ?? (r.dueDate ? r.dueDate.slice(0, 10) : '')} onChange={(e) => setPaidAt((a) => ({ ...a, [r.id]: e.target.value }))} className="mt-0.5 block rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
                    </label>
                    <button type="button" disabled={busy === r.id || needAuth} title={needAuth ? 'Informe a autorização do cartão' : undefined} onClick={() => void act(r, 'CONFIRMAR')} className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                      {busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}Confirmar recebimento
                    </button>
                    <button type="button" disabled={busy === r.id} onClick={() => void act(r, 'CANCELAR')} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-2 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"><XCircle size={13} />Cancelar</button>
                  </div>
                )}
                {canManage && tab !== 'PENDENTE' && (
                  <div className="mt-2 border-t border-gray-100 pt-2 text-xs">
                    <button type="button" disabled={busy === r.id} onClick={() => void act(r, 'REABRIR')} className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"><RotateCcw size={12} />Voltar para a confirmar</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
