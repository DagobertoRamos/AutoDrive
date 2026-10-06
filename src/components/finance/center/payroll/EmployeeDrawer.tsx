'use client'

// Painel do colaborador na folha: fechamento do mês, salário fixo e benefícios
// (despesas fixas via /api/finance/recurrences) e adiantamentos/vales
// (/api/finance/payroll/advances).

import { useState } from 'react'
import { Ban, CheckCircle2, Pencil, Plus, Printer, Save, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FieldLabel } from '@/components/ui/field'
import { MoneyInput } from '@/components/ui/money-input'
import { Badge, Toggle, api, brl, dateBR, iconBtn, inputClass, todayYmd } from '../config/ui'
import { DocumentsPanel } from '@/components/documents/DocumentsPanel'
import { payrollEntityId } from '@/lib/documents/attachment-types'
import { DealPeekLink } from '@/components/deals/DealPeek'
import { STATUS_LABEL, STATUS_TONE, type PayrollEmployee, type PayrollMonthData, type PayrollRecurrenceRow } from './types'

type Tab = 'resumo' | 'fixos' | 'adiantamentos'

interface Props {
  employee: PayrollEmployee
  data: PayrollMonthData
  onClose: () => void
  onChanged: () => void
  onPay: () => void
  onPrint: () => void
}

interface RecForm { id?: string; kind: 'SALARIO' | 'BENEFICIO'; description: string; amount: number | null; dayOfMonth: number; startDate: string; accountId: string }
interface AdvForm { kind: 'ADIANTAMENTO' | 'BENEFICIO'; amount: number | null; date: string; paid: boolean; accountId: string; description: string; notes: string }

const ENTRY_STATUS: Record<string, string> = { PREVISTO: 'A pagar', PAGO: 'Pago', CANCELADO: 'Cancelado' }

export default function EmployeeDrawer({ employee: emp, data, onClose, onChanged, onPay, onPrint }: Props) {
  const [tab, setTab] = useState<Tab>('resumo')
  const [rec, setRec] = useState<RecForm | null>(null)
  const [adv, setAdv] = useState<AdvForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const s = emp.summary
  const month = data.month

  const salaryRec = emp.recurrences.find((r) => r.active && r.kind === 'SALARIO')
  const benefitRecs = emp.recurrences.filter((r) => r.active && r.kind === 'BENEFICIO')

  const openRec = (kind: RecForm['kind'], r?: PayrollRecurrenceRow) => {
    setError(null)
    setRec(r
      ? { id: r.id, kind, description: r.description, amount: r.amount, dayOfMonth: r.dayOfMonth, startDate: r.startDate.slice(0, 10), accountId: r.accountId ?? '' }
      : { kind, description: kind === 'SALARIO' ? `Salário — ${emp.name}` : '', amount: null, dayOfMonth: 5, startDate: `${month}-01`, accountId: '' })
  }

  const saveRec = async () => {
    if (!rec) return
    if (!rec.amount || rec.amount <= 0 || !rec.description.trim() || !rec.dayOfMonth) { setError('Preencha os campos obrigatórios.'); return }
    setSaving(true); setError(null)
    const categoryId = rec.kind === 'SALARIO' ? data.categories.salaryId : data.categories.benefitId
    const body = {
      type: 'DESPESA', description: rec.description.trim(), amount: rec.amount, dayOfMonth: Math.min(31, Math.max(1, rec.dayOfMonth)),
      accountId: rec.accountId || null, categoryId, employeeUserId: emp.userId, counterparty: emp.name,
      ...(rec.id ? {} : { startDate: rec.startDate }),
    }
    const r = await api(rec.id ? `/api/finance/recurrences/${rec.id}` : '/api/finance/recurrences', { method: rec.id ? 'PATCH' : 'POST', body })
    setSaving(false)
    if (!r.ok) { setError(r.error); return }
    setRec(null); onChanged()
  }

  const endRec = async (r: PayrollRecurrenceRow) => {
    if (!confirm(`Encerrar "${r.description}"? Os meses já pagos ficam no histórico.`)) return
    const res = await api(`/api/finance/recurrences/${r.id}`, { method: 'DELETE' })
    if (!res.ok) { setError(res.error); return }
    onChanged()
  }

  const saveAdv = async () => {
    if (!adv) return
    if (!adv.amount || adv.amount <= 0 || !adv.date || (adv.paid && !adv.accountId)) { setError('Preencha os campos obrigatórios.'); return }
    setSaving(true); setError(null)
    const r = await api('/api/finance/payroll/advances', {
      method: 'POST',
      body: { userId: emp.userId, kind: adv.kind, amount: adv.amount, date: adv.date, paid: adv.paid, accountId: adv.accountId || null, description: adv.description.trim() || null, notes: adv.notes.trim() || null },
    })
    setSaving(false)
    if (!r.ok) { setError(r.error); return }
    setAdv(null); onChanged()
  }

  const markDiscounted = async (id: string, discounted: boolean) => {
    const note = discounted ? prompt('Observação (opcional):') : null
    if (discounted && note === null) return
    const r = await api(`/api/finance/payroll/advances/${id}`, { method: 'PATCH', body: { discounted, month, note } })
    if (!r.ok) { setError(r.error); return }
    onChanged()
  }
  const cancelAdv = async (id: string) => {
    if (!confirm('Cancelar este lançamento?')) return
    await api(`/api/finance/payroll/advances/${id}`, { method: 'DELETE' })
    onChanged()
  }

  const advances = emp.entries.filter((e) => e.kind === 'ADIANTAMENTO')
  const fixedEntries = emp.entries.filter((e) => e.kind !== 'ADIANTAMENTO')

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-gray-900">{emp.name}</h2>
            <p className="text-sm text-gray-500">{[emp.cargo, emp.unit].filter(Boolean).join(' · ') || '—'}</p>
          </div>
          <div className="flex items-center gap-1">
            <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
            <button onClick={onPrint} className={iconBtn} title="Recibo"><Printer size={16} /></button>
            <button onClick={onClose} className={iconBtn} aria-label="Fechar"><X size={18} /></button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-gray-100 px-5">
          {([['resumo', `Fechamento ${data.monthLabel}`], ['fixos', 'Salário e benefícios'], ['adiantamentos', 'Adiantamentos']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); setError(null) }} className={cn('-mb-px border-b-2 px-3 py-2.5 text-sm font-medium', tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-800')}>{label}</button>
          ))}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {tab === 'resumo' && <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[['Salário', s.salary.total], ['Comissões', s.commissions.total], ['Benefícios', s.benefits.total], ['Adiant. a descontar', s.advances.toDiscount]].map(([l, v]) => (
                <div key={l as string} className="rounded-lg border border-gray-200 px-3 py-2"><p className="text-[11px] text-gray-500">{l}</p><p className="font-semibold tabular-nums">{brl(v as number)}</p></div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
              <div><p className="text-xs text-gray-500">Líquido a pagar</p><p className="text-xl font-bold tabular-nums">{brl(s.net)}</p></div>
              {s.net > 0 && <button onClick={onPay} className="btn-primary text-sm"><CheckCircle2 size={15} />Pagar</button>}
            </div>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Salário e benefícios do mês</h3>
              {fixedEntries.length === 0 ? <p className="text-sm text-gray-400">Nenhum lançamento no mês.</p> : (
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {fixedEntries.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1"><span className="block truncate">{e.description}</span><span className="text-xs text-gray-400">{dateBR(e.paidDate ?? e.date)}{e.originalAmount != null && e.originalAmount !== e.amount ? ` · bruto ${brl(e.originalAmount)}` : ''}</span></span>
                      <Badge tone={e.status === 'PAGO' ? 'green' : 'amber'}>{ENTRY_STATUS[e.status] ?? e.status}</Badge>
                      <span className="w-28 text-right tabular-nums">{brl(e.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Comissões do período</h3>
              {emp.commissions.length === 0 ? <p className="text-sm text-gray-400">Nenhuma comissão no período.</p> : <>
                <div className="mb-2 flex flex-wrap gap-2">
                  {s.commissions.byType.map((t) => <Badge key={t.ruleType} tone="blue">{t.label}: {brl(t.total)} ({t.count})</Badge>)}
                </div>
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {emp.commissions.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1"><span className="block truncate">{c.dealId ? <DealPeekLink dealId={c.dealId} className="text-brand-700 hover:underline">{c.description}</DealPeekLink> : c.description}</span><span className="text-xs text-gray-400">{c.label}</span></span>
                      <Badge tone={c.paid ? 'green' : c.status === 'PREVISTO' ? 'gray' : 'amber'}>{c.paid ? 'Paga' : c.status === 'PREVISTO' ? 'Prevista' : c.status === 'AJUSTADO' ? 'Ajustada' : 'Aprovada'}</Badge>
                      <span className="w-28 text-right tabular-nums">{brl(c.value)}</span>
                    </div>
                  ))}
                </div>
              </>}
            </section>

            <DocumentsPanel entityType="PAYROLL" entityId={payrollEntityId(emp.userId, month)} defaultDocType="RECIBO" title={`Documentos — ${data.monthLabel}`} className="rounded-lg border border-gray-200 p-3" />
          </>}

          {tab === 'fixos' && <>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Salário fixo</h3>
                {!salaryRec && !rec && <button onClick={() => openRec('SALARIO')} className="btn-secondary text-xs"><Plus size={14} />Configurar salário</button>}
              </div>
              {salaryRec ? (
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{salaryRec.description}</span><span className="text-xs text-gray-400">Todo dia {salaryRec.dayOfMonth} · desde {dateBR(salaryRec.startDate)}</span></span>
                  <span className="font-semibold tabular-nums">{brl(salaryRec.amount)}</span>
                  <button onClick={() => openRec('SALARIO', salaryRec)} className={iconBtn} title="Editar"><Pencil size={15} /></button>
                  <button onClick={() => endRec(salaryRec)} className={iconBtn} title="Encerrar"><Ban size={15} /></button>
                </div>
              ) : !rec && <p className="text-sm text-gray-400">Sem salário fixo configurado.</p>}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Benefícios fixos</h3>
                {!rec && <button onClick={() => openRec('BENEFICIO')} className="btn-secondary text-xs"><Plus size={14} />Novo benefício</button>}
              </div>
              {benefitRecs.length === 0 ? (!rec && <p className="text-sm text-gray-400">Nenhum benefício fixo.</p>) : (
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {benefitRecs.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1"><span className="block truncate">{b.description}</span><span className="text-xs text-gray-400">Todo dia {b.dayOfMonth}</span></span>
                      <span className="tabular-nums">{brl(b.amount)}</span>
                      <button onClick={() => openRec('BENEFICIO', b)} className={iconBtn} title="Editar"><Pencil size={15} /></button>
                      <button onClick={() => endRec(b)} className={iconBtn} title="Encerrar"><Ban size={15} /></button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {rec && (
              <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/30 p-4">
                <p className="text-sm font-semibold text-gray-900">{rec.id ? 'Editar' : 'Novo'} {rec.kind === 'SALARIO' ? 'salário' : 'benefício'}</p>
                <div><FieldLabel required>Descrição</FieldLabel><input className={cn(inputClass, 'mt-1')} value={rec.description} onChange={(e) => setRec({ ...rec, description: e.target.value })} placeholder={rec.kind === 'BENEFICIO' ? 'Vale-transporte, plano de saúde...' : ''} /></div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div><FieldLabel required>Valor mensal</FieldLabel><div className="mt-1"><MoneyInput className={inputClass} value={rec.amount} onChange={(v) => setRec({ ...rec, amount: v })} /></div></div>
                  <div><FieldLabel required>Dia do pagamento</FieldLabel><input type="number" min={1} max={31} className={cn(inputClass, 'mt-1')} value={rec.dayOfMonth} onChange={(e) => setRec({ ...rec, dayOfMonth: Number(e.target.value) })} /></div>
                  {!rec.id && <div><FieldLabel required>Início</FieldLabel><input type="date" className={cn(inputClass, 'mt-1')} value={rec.startDate} onChange={(e) => setRec({ ...rec, startDate: e.target.value })} /></div>}
                </div>
                <div><FieldLabel>Conta de pagamento</FieldLabel>
                  <select className={cn(inputClass, 'mt-1')} value={rec.accountId} onChange={(e) => setRec({ ...rec, accountId: e.target.value })}>
                    <option value="">Definir no pagamento</option>
                    {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setRec(null)} className="btn-secondary text-sm">Cancelar</button>
                  <button onClick={saveRec} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button>
                </div>
              </div>
            )}
          </>}

          {tab === 'adiantamentos' && <>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Adiantamentos e vales</h3>
              {!adv && <button onClick={() => { setError(null); setAdv({ kind: 'ADIANTAMENTO', amount: null, date: todayYmd(), paid: true, accountId: data.accounts.length === 1 ? data.accounts[0].id : '', description: '', notes: '' }) }} className="btn-secondary text-xs"><Plus size={14} />Novo adiantamento</button>}
            </div>

            {adv && (
              <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/30 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><FieldLabel required>Tipo</FieldLabel>
                    <select className={cn(inputClass, 'mt-1')} value={adv.kind} onChange={(e) => setAdv({ ...adv, kind: e.target.value as AdvForm['kind'] })}>
                      <option value="ADIANTAMENTO">Adiantamento / vale</option>
                      <option value="BENEFICIO">Benefício avulso</option>
                    </select>
                  </div>
                  <div><FieldLabel required>Valor</FieldLabel><div className="mt-1"><MoneyInput className={inputClass} value={adv.amount} onChange={(v) => setAdv({ ...adv, amount: v })} /></div></div>
                  <div><FieldLabel required>{adv.paid ? 'Data do pagamento' : 'Vencimento'}</FieldLabel><input type="date" className={cn(inputClass, 'mt-1')} value={adv.date} onChange={(e) => setAdv({ ...adv, date: e.target.value })} /></div>
                  <div><FieldLabel required={adv.paid}>Conta</FieldLabel>
                    <select className={cn(inputClass, 'mt-1')} value={adv.accountId} onChange={(e) => setAdv({ ...adv, accountId: e.target.value })}>
                      <option value="">Selecione</option>
                      {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
                <Toggle checked={adv.paid} onChange={(v) => setAdv({ ...adv, paid: v })} label="Pago agora" />
                <div><FieldLabel>Descrição</FieldLabel><input className={cn(inputClass, 'mt-1')} value={adv.description} onChange={(e) => setAdv({ ...adv, description: e.target.value })} placeholder={`${adv.kind === 'ADIANTAMENTO' ? 'Adiantamento' : 'Benefício'} — ${emp.name}`} /></div>
                <div><FieldLabel>Observação</FieldLabel><input className={cn(inputClass, 'mt-1')} value={adv.notes} onChange={(e) => setAdv({ ...adv, notes: e.target.value })} /></div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setAdv(null)} className="btn-secondary text-sm">Cancelar</button>
                  <button onClick={saveAdv} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button>
                </div>
              </div>
            )}

            {advances.length === 0 ? <p className="text-sm text-gray-400">Nenhum adiantamento em aberto ou no mês.</p> : (
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {advances.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{a.description}</span>
                      <span className="text-xs text-gray-400">{dateBR(a.paidDate ?? a.date)}{a.discountedMonth ? ` · descontado em ${a.discountedMonth.slice(5)}/${a.discountedMonth.slice(0, 4)}` : ''}</span>
                    </span>
                    <Badge tone={a.status !== 'PAGO' ? 'gray' : a.discountedMonth ? 'green' : 'amber'}>{a.status !== 'PAGO' ? 'Agendado' : a.discountedMonth ? 'Descontado' : 'A descontar'}</Badge>
                    <span className="w-24 text-right tabular-nums">{brl(a.amount)}</span>
                    {a.status === 'PAGO' && (a.discountedMonth
                      ? <button onClick={() => markDiscounted(a.id, false)} className={iconBtn} title="Desfazer desconto"><Undo2 size={15} /></button>
                      : <button onClick={() => markDiscounted(a.id, true)} className={iconBtn} title="Marcar como descontado"><CheckCircle2 size={15} /></button>)}
                    {!a.discountedMonth && <button onClick={() => cancelAdv(a.id)} className={iconBtn} title="Cancelar"><Ban size={15} /></button>}
                  </div>
                ))}
              </div>
            )}
          </>}
        </div>
      </div>
    </div>
  )
}
