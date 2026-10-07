'use client'

// =============================================================================
// Configurações › F&I › Exigências e privacidade
//   • Dados que cada banco exige (além do conjunto comum) — enquanto o banco
//     não tem integração oficial, a loja informa o que o banco pede.
//   • Privacidade (LGPD): base legal, versão do aviso e retenção de documentos.
//   • Simulação do site: estimativa com taxa de referência (nunca aprovação).
// Seções recolhidas; só abre o que for mexer.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Save } from 'lucide-react'
import { FieldLabel } from '@/components/ui/field'
import { COMMON_REQUIRED, FIELDS, FIELD_GROUP_LABEL, type FieldGroup } from '@/lib/finance/fi/fields-core'
import { Alert, api, btnPrimary, inputClass, PageHeader } from '@/components/fi/ui'

interface Bank { id: string; name: string; active: boolean }
interface Lgpd { legalBasis: string; privacyVersion: string; privacyUrl?: string; documentRetentionDays: number }
interface SiteSim { enabled: boolean; referenceRate: number | null; installmentsList: number[]; minDownPaymentPct: number }

const LEGAL: { value: string; label: string }[] = [
  { value: 'PROCEDIMENTOS_PRELIMINARES_CONTRATO', label: 'Pedido do cliente para contratar o financiamento' },
  { value: 'PROTECAO_CREDITO', label: 'Proteção do crédito' },
  { value: 'LEGITIMO_INTERESSE', label: 'Legítimo interesse' },
  { value: 'CONSENTIMENTO', label: 'Consentimento' },
]
const COMMON = new Set([...COMMON_REQUIRED.PF, ...COMMON_REQUIRED.PJ])
const EXTRA_FIELDS = FIELDS.filter((f) => !COMMON.has(f.key))
const GROUPS = [...new Set(EXTRA_FIELDS.map((f) => f.group))] as FieldGroup[]

function Block({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <button className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-900" onClick={onToggle} aria-expanded={open}>
        {title}{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && <div className="border-t border-gray-100 p-4">{children}</div>}
    </section>
  )
}

export default function FiRulesPage() {
  const [open, setOpen] = useState<string | null>('bancos')
  const [banks, setBanks] = useState<Bank[]>([])
  const [req, setReq] = useState<Record<string, string[]>>({})
  const [bank, setBank] = useState<string>('')
  const [lgpd, setLgpd] = useState<Lgpd | null>(null)
  const [sim, setSim] = useState<SiteSim | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [b, r, l, s] = await Promise.all([
      api<Bank[]>('/api/financing/banks?active=true'),
      api<Record<string, string[]>>('/api/settings/financing/settings/bank_required_fields'),
      api<Lgpd>('/api/settings/financing/settings/lgpd'),
      api<SiteSim>('/api/settings/financing/settings/site_simulation'),
    ])
    setBanks(b.data ?? []); setReq(r.data ?? {}); setLgpd(l.data); setSim(s.data)
    setBank((cur) => cur || b.data?.[0]?.id || '')
    const err = [b, r, l, s].find((x) => !x.ok)
    if (err) setMsg({ ok: false, text: err.error ?? 'Não foi possível carregar.' })
  }, [])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const save = async (key: string, body: unknown) => {
    setSaving(true); setMsg(null)
    const r = await api(`/api/settings/financing/settings/${key}`, { method: 'PUT', body })
    setSaving(false)
    setMsg(r.ok ? { ok: true, text: 'Salvo.' } : { ok: false, text: r.error ?? 'Erro ao salvar.' })
  }
  const toggleField = (k: string) => setReq((m) => ({ ...m, [bank]: (m[bank] ?? []).includes(k) ? (m[bank] ?? []).filter((x) => x !== k) : [...(m[bank] ?? []), k] }))

  return (
    <div className="space-y-4">
      <PageHeader title="Exigências e privacidade" />
      {msg && <Alert tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Alert>}

      <Block title="Dados exigidos por banco" open={open === 'bancos'} onToggle={() => setOpen(open === 'bancos' ? null : 'bancos')}>
        {banks.length === 0 ? <p className="text-sm text-gray-500">Cadastre os bancos da loja primeiro.</p> : (
          <div className="space-y-4">
            <div className="max-w-xs"><FieldLabel helpText="Além dos dados comuns (nome, CPF, nascimento, contato, endereço, ocupação e renda), marque o que este banco pede.">Banco</FieldLabel>
              <select className={inputClass} value={bank} onChange={(e) => setBank(e.target.value)}>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </div>
            {GROUPS.map((g) => (
              <div key={g}>
                <p className="mb-1.5 text-xs font-medium text-gray-500">{FIELD_GROUP_LABEL[g]}</p>
                <div className="flex flex-wrap gap-2">
                  {EXTRA_FIELDS.filter((f) => f.group === g).map((f) => {
                    const on = (req[bank] ?? []).includes(f.key)
                    return <button key={f.key} type="button" onClick={() => toggleField(f.key)} aria-pressed={on} className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-brand-500 bg-brand-50 font-medium text-brand-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{f.label}{f.for !== 'AMBOS' ? ` (${f.for})` : ''}</button>
                  })}
                </div>
              </div>
            ))}
            <div className="flex justify-end"><button className={btnPrimary} disabled={saving} onClick={() => save('bank_required_fields', req)}><Save size={15} />Salvar</button></div>
          </div>
        )}
      </Block>

      <Block title="Privacidade (LGPD)" open={open === 'lgpd'} onToggle={() => setOpen(open === 'lgpd' ? null : 'lgpd')}>
        {lgpd && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><FieldLabel helpText="Fundamento legal para tratar os dados da ficha. Defina com o jurídico da loja; o consentimento não precisa ser a única base.">Base legal</FieldLabel>
              <select className={inputClass} value={lgpd.legalBasis} onChange={(e) => setLgpd({ ...lgpd, legalBasis: e.target.value })}>{LEGAL.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            </div>
            <div><FieldLabel helpText="Fica registrada junto de cada autorização do cliente.">Versão do aviso de privacidade</FieldLabel><input className={inputClass} value={lgpd.privacyVersion} onChange={(e) => setLgpd({ ...lgpd, privacyVersion: e.target.value })} /></div>
            <div><FieldLabel>Endereço do aviso de privacidade</FieldLabel><input className={inputClass} value={lgpd.privacyUrl ?? ''} onChange={(e) => setLgpd({ ...lgpd, privacyUrl: e.target.value })} placeholder="https://" /></div>
            <div><FieldLabel helpText="Depois de encerrada a ficha (paga, recusada ou cancelada), os arquivos de documentos são apagados após este prazo. O registro do que foi enviado continua.">Guardar documentos por (dias)</FieldLabel><input type="number" min={30} max={3650} className={inputClass} value={lgpd.documentRetentionDays} onChange={(e) => setLgpd({ ...lgpd, documentRetentionDays: Number(e.target.value) })} /></div>
            <div className="flex items-end justify-end sm:col-span-2"><button className={btnPrimary} disabled={saving} onClick={() => save('lgpd', { ...lgpd, privacyUrl: lgpd.privacyUrl || '' })}><Save size={15} />Salvar</button></div>
          </div>
        )}
      </Block>

      <Block title="Simulação no site" open={open === 'site'} onToggle={() => setOpen(open === 'site' ? null : 'site')}>
        {sim && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2"><input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={sim.enabled} onChange={(e) => setSim({ ...sim, enabled: e.target.checked })} />Mostrar parcela estimada ao cliente</label>
            <div><FieldLabel helpText="Taxa usada só para a estimativa do site. O cliente vê que é estimativa e que a aprovação é do banco.">Taxa de referência (% ao mês)</FieldLabel><input className={inputClass} inputMode="decimal" value={sim.referenceRate ?? ''} onChange={(e) => setSim({ ...sim, referenceRate: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })} /></div>
            <div><FieldLabel>Entrada mínima (%)</FieldLabel><input type="number" min={0} max={90} className={inputClass} value={sim.minDownPaymentPct} onChange={(e) => setSim({ ...sim, minDownPaymentPct: Number(e.target.value) })} /></div>
            <div className="sm:col-span-2"><FieldLabel>Prazos oferecidos</FieldLabel>
              <div className="flex flex-wrap gap-2">{[12, 18, 24, 36, 48, 60, 72].map((n) => { const on = sim.installmentsList.includes(n); return <button key={n} type="button" aria-pressed={on} onClick={() => setSim({ ...sim, installmentsList: on ? sim.installmentsList.filter((x) => x !== n) : [...sim.installmentsList, n].sort((a, b) => a - b) })} className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-brand-500 bg-brand-50 font-medium text-brand-800' : 'border-gray-200 text-gray-600'}`}>{n}x</button> })}</div>
            </div>
            <div className="flex justify-end sm:col-span-2"><button className={btnPrimary} disabled={saving || (sim.enabled && !sim.referenceRate)} onClick={() => save('site_simulation', sim)}><Save size={15} />Salvar</button></div>
          </div>
        )}
      </Block>
    </div>
  )
}
