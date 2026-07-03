'use client'

// =============================================================================
// ExtratoDetalheModal — detalhe do que está sendo pago a um colaborador num
// período. Abre ao clicar numa linha do Extrato. Reusa
// GET /api/commissions/calculations?period=&collaborator= (mesma visibilidade),
// agrupa por tipo (Venda/Retorno/Garantia/Documento/Bônus…) e oferece:
//   • Ver lançamentos (leva à tela filtrada);   • Imprimir / Salvar PDF.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, ExternalLink, Printer, RefreshCw, FileText } from 'lucide-react'

interface Lanc {
  id: string; ruleType: string; commissionScope: string | null; commissionScopeLabel?: string | null
  originalOperationType?: string | null; description: string; baseValue: number; commissionValue: number; status: string
}
export interface ExtratoEntry {
  sellerId: string // chave do colaborador ("s:..."/"m:..."/"u:...")
  responsavel: string; period: string; baseValue: number; finalValue: number; status: string
}

const TYPE_LABEL: Record<string, string> = {
  VENDA: 'Venda / Troca', TROCA: 'Venda / Troca', COMPRA: 'Compra', CONSIGNACAO: 'Consignação',
  GARANTIA: 'Garantia', RETORNO: 'Retorno', SERVICO: 'Serviço', DOCUMENTO: 'Documentação',
  BONUS_META: 'Bônus meta', BONUS_DEZENA: 'Bônus dezenal', EXCECAO: 'Exceção',
}
const STATUS_LABEL: Record<string, string> = { PREVISTO: 'Prevista', APROVADO: 'Liberada', PAGO: 'Paga', AJUSTADO: 'Ajustada', CANCELADO: 'Estornada' }
const fmt = (n: number) => Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
function displayType(r: Pick<Lanc, 'ruleType' | 'originalOperationType'>): string {
  const isPrincipal = r.ruleType === 'VENDA' || r.ruleType === 'COMPRA'
  const op = (r.originalOperationType ?? '').toUpperCase()
  if (isPrincipal && op && TYPE_LABEL[op]) return TYPE_LABEL[op]
  return TYPE_LABEL[r.ruleType] ?? r.ruleType
}
function periodLabel(p: string) {
  const [y, m] = p.split('-').map(Number)
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return m ? `${meses[m - 1]} de ${y}` : p
}

export default function ExtratoDetalheModal({ entry, onClose }: { entry: ExtratoEntry; onClose: () => void }) {
  const router = useRouter()
  const [rows, setRows] = useState<Lanc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ period: entry.period, collaborator: entry.sellerId })
      const res = await fetch(`/api/commissions/calculations?${params}`, { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j?.error ?? 'Não foi possível carregar os detalhes.'); setRows([]) }
      else setRows(j?.data ?? [])
    } catch { setError('Erro de conexão.') } finally { setLoading(false) }
  }, [entry.period, entry.sellerId])
  useEffect(() => { load() }, [load])

  // Agrupa por tipo (com subtotal) mantendo ordem de aparição.
  const groups: Array<{ tipo: string; itens: Lanc[]; subtotal: number }> = []
  for (const r of rows) {
    const tipo = displayType(r)
    let g = groups.find((x) => x.tipo === tipo)
    if (!g) { g = { tipo, itens: [], subtotal: 0 }; groups.push(g) }
    g.itens.push(r); g.subtotal += Number(r.commissionValue) || 0
  }
  const total = rows.reduce((s, r) => s + (Number(r.commissionValue) || 0), 0)

  const verLancamentos = () => {
    router.push(`/comissoes/lancamentos?period=${encodeURIComponent(entry.period)}&colab=${encodeURIComponent(entry.sellerId)}`)
  }

  // Imprimir / Salvar PDF: abre uma janela isolada com o resumo formatado e chama print().
  const imprimir = () => {
    const linhas = groups.map((g) => `
      <tr class="grp"><td colspan="3">${g.tipo}</td><td class="num">${fmt(g.subtotal)}</td></tr>
      ${g.itens.map((it) => `<tr><td></td><td>${(it.description ?? '').replace(/</g, '&lt;')}</td><td class="num">${fmt(it.baseValue)}</td><td class="num">${fmt(it.commissionValue)}</td></tr>`).join('')}
    `).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Resumo de comissão — ${entry.responsavel}</title>
      <style>
        *{font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}
        body{margin:28px;color:#111}
        h1{font-size:18px;margin:0 0 2px} .sub{color:#666;font-size:12px;margin:0 0 16px}
        .cards{display:flex;gap:10px;margin:0 0 16px}
        .card{border:1px solid #ddd;border-radius:8px;padding:10px 12px;flex:1}
        .card .l{font-size:10px;text-transform:uppercase;color:#777;letter-spacing:.04em} .card .v{font-size:16px;font-weight:700}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{text-align:left;border-bottom:2px solid #ccc;padding:6px 8px;font-size:10px;text-transform:uppercase;color:#666}
        td{padding:5px 8px;border-bottom:1px solid #eee} td.num{text-align:right;font-variant-numeric:tabular-nums}
        tr.grp td{background:#f5f5f5;font-weight:700}
        tfoot td{border-top:2px solid #ccc;font-weight:700;font-size:13px;padding-top:8px}
        .foot{margin-top:18px;color:#999;font-size:10px}
      </style></head><body>
      <h1>Resumo de comissão</h1>
      <p class="sub">${entry.responsavel} · ${periodLabel(entry.period)} · status ${STATUS_LABEL[entry.status] ?? entry.status}</p>
      <div class="cards">
        <div class="card"><div class="l">Base</div><div class="v">${fmt(entry.baseValue)}</div></div>
        <div class="card"><div class="l">Total final</div><div class="v">${fmt(total)}</div></div>
        <div class="card"><div class="l">Lançamentos</div><div class="v">${rows.length}</div></div>
      </div>
      <table>
        <thead><tr><th></th><th>Descrição</th><th class="num">Base</th><th class="num">Comissão</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td colspan="3">Total geral</td><td class="num">${fmt(total)}</td></tr></tfoot>
      </table>
      <p class="foot">Gerado pelo AutoDrive em ${new Date().toLocaleString('pt-BR')}. Documento informativo.</p>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`
    const w = window.open('', '_blank', 'width=820,height=900')
    if (!w) { setError('Permita pop-ups para imprimir/salvar em PDF.'); return }
    w.document.write(html); w.document.close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-2xl rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><FileText size={18} className="text-brand-600" />Detalhe da comissão</h2>
            <p className="mt-0.5 text-xs text-gray-500">{entry.responsavel} · {periodLabel(entry.period)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="max-h-[62vh] space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-[11px] uppercase text-gray-500">Base</p><p className="text-base font-bold tabular-nums text-gray-900">{fmt(entry.baseValue)}</p></div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-[11px] uppercase text-gray-500">Lançamentos</p><p className="text-base font-bold tabular-nums text-gray-900">{loading ? '—' : rows.length}</p></div>
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-3"><p className="text-[11px] uppercase text-brand-700">Total final</p><p className="text-base font-bold tabular-nums text-brand-800">{fmt(loading ? entry.finalValue : total)}</p></div>
          </div>

          {loading ? (
            <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Nenhum lançamento neste período.</p>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.tipo} className="overflow-hidden rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between bg-gray-50 px-3 py-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">{g.tipo}</span>
                    <span className="text-sm font-bold tabular-nums text-gray-800">{fmt(g.subtotal)}</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {g.itens.map((it) => (
                      <li key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-gray-700" title={it.description}>{it.description}</span>
                        <span className="tabular-nums text-xs text-gray-400">base {fmt(it.baseValue)}</span>
                        <span className="w-24 text-right font-semibold tabular-nums text-brand-700">{fmt(it.commissionValue)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={verLancamentos} className="btn-secondary text-sm"><ExternalLink size={14} />Ver lançamentos</button>
          <button onClick={imprimir} disabled={loading || rows.length === 0} className="btn-secondary text-sm"><Printer size={14} />Imprimir / Salvar PDF</button>
          <button onClick={onClose} className="btn-primary text-sm">Fechar</button>
        </div>
      </div>
    </div>
  )
}
