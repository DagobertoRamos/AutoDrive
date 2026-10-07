'use client'

// =============================================================================
// Configurações › Operações — provedores (RENAVE, fiscal, transferência), o que
// a loja acompanha, o que impede a venda, certificado digital e dados fiscais
// das filiais. Capacidades por estado: leitura (MASTER edita em "Avançado").
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Upload } from 'lucide-react'
import { FieldLabel } from '@/components/ui/field'
import { btn, ErrorLine, fmtDate, Hint, input, Modal, postJson, Section, StatusBadge } from '@/components/operations/ui'

type Enf = 'OFF' | 'WARN' | 'BLOCK'
interface Config {
  providers: { renave: string; fiscal: string; transfer: string }
  tracking: { renave: boolean; fiscalSale: boolean; fiscalPurchase: boolean; transfer: boolean; inspection: boolean }
  enforcement: { renaveEntry: Enf; fiscalEntry: Enf; inspection: Enf; documents: Enf }
  capabilities: Record<string, boolean>
  units: Record<string, { ie?: string | null; im?: string | null; fiscalSeries?: string | null; uf?: string | null }>
}
interface Data {
  tenant: string | null
  config: Config
  units: { id: string; name: string; cnpj: string; state: string | null }[]
  certificates: { id: string; unitId: string | null; subjectName: string | null; validUntil: string | null }[]
  uf: string | null
  effective: Record<string, boolean>
  providers: Record<'renave' | 'fiscal' | 'transfer', { id: string; label: string }[]>
  capabilityKeys: string[]
  capabilityLabels: Record<string, string>
  global?: Record<string, Record<string, boolean>>
}

const ENF_LABEL: Record<Enf, string> = { OFF: 'Não verificar', WARN: 'Avisar', BLOCK: 'Impedir a venda' }

export default function OperacoesConfigPage() {
  const [data, setData] = useState<Data | null>(null)
  const [cfg, setCfg] = useState<Config | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [certOpen, setCertOpen] = useState(false)

  const load = async () => {
    const r = await fetch('/api/settings/operations', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
    if (!r?.success) return setError(r?.error ?? 'Não foi possível carregar.')
    setData(r.data); setCfg(r.data.config ?? null)
  }
  useEffect(() => { load() }, [])

  if (error) return <div className="p-6"><ErrorLine text={error} /></div>
  if (!data) return <div className="m-6 h-40 animate-pulse rounded-xl bg-white" />
  if (!data.tenant || !cfg) return <div className="p-6 text-sm text-gray-500">Escolha uma loja no topo da tela.</div>

  const save = async () => {
    setSaving(true); setSaved(false)
    const r = await fetch('/api/settings/operations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: cfg }) }).then((x) => x.json()).catch(() => null)
    setSaving(false)
    if (!r?.success) return setError(r?.error ?? 'Não foi possível salvar.')
    setCfg(r.data); setSaved(true)
  }
  const set = <K extends keyof Config>(k: K, v: Config[K]) => { setCfg({ ...cfg, [k]: v }); setSaved(false) }
  const cert = data.certificates.find((c) => !c.unitId) ?? data.certificates[0]
  const certDays = cert?.validUntil ? Math.ceil((new Date(cert.validUntil).getTime() - Date.now()) / 86_400_000) : null

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">Operações</h1>
        <button className={btn.primary} onClick={save} disabled={saving}>{saving ? 'Salvando…' : saved ? 'Salvo' : 'Salvar'}</button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800"><ShieldCheck className="h-4 w-4 text-gray-400" />Certificado digital<Hint term="CERTIFICADO_DIGITAL" /></p>
            {cert ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <StatusBadge tone={certDays != null && certDays <= 7 ? 'critical' : certDays != null && certDays <= 30 ? 'attention' : 'ok'}>{certDays != null && certDays <= 0 ? 'Vencido' : 'Ativo'}</StatusBadge>
                <span>Válido até {fmtDate(cert.validUntil)}</span>
              </div>
            ) : <p className="mt-1.5 text-sm text-gray-500">Nenhum certificado enviado.</p>}
          </div>
          <button className={btn.secondary} onClick={() => setCertOpen(true)}><Upload className="h-4 w-4" />{cert ? 'Substituir' : 'Enviar'}</button>
        </div>
      </div>

      <Section title="Integrações" hint="PROVEDOR_INTEGRACAO" defaultOpen>
        <div className="grid gap-3 sm:grid-cols-3">
          {(['renave', 'fiscal', 'transfer'] as const).map((k) => (
            <div key={k}>
              <FieldLabel>{k === 'renave' ? 'RENAVE' : k === 'fiscal' ? 'Notas fiscais' : 'Transferência'}</FieldLabel>
              <select className={input} value={cfg.providers[k]} onChange={(e) => set('providers', { ...cfg.providers, [k]: e.target.value })}>
                {data.providers[k].map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Acompanhar" defaultOpen>
        <div className="space-y-2.5">
          {([
            ['renave', 'Entrada e saída no RENAVE', 'RENAVE'],
            ['fiscalSale', 'NF-e de venda', 'NFE_OPERACAO'],
            ['fiscalPurchase', 'NF-e de entrada', 'NFE_OPERACAO'],
            ['transfer', 'Transferência para o comprador', 'TRANSFERENCIA_STATUS'],
            ['inspection', 'Vistoria', 'VISTORIA'],
          ] as const).map(([k, label, hint]) => (
            <label key={k} className="flex items-center justify-between gap-3 text-sm text-gray-700">
              <span className="inline-flex items-center gap-1">{label}<Hint term={hint} /></span>
              <input type="checkbox" className="h-4 w-4" checked={cfg.tracking[k]} onChange={(e) => set('tracking', { ...cfg.tracking, [k]: e.target.checked })} />
            </label>
          ))}
        </div>
      </Section>

      <Section title="Antes de vender" hint="REGUA_VENDA" defaultOpen>
        <div className="space-y-2.5">
          {([
            ['renaveEntry', 'Entrada no RENAVE'],
            ['fiscalEntry', 'NF-e de entrada'],
            ['inspection', 'Vistoria válida'],
            ['documents', 'CRLV anexado'],
          ] as const).map(([k, label]) => (
            <div key={k} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-gray-700">{label}</span>
              <select className={`${input} max-w-[11rem]`} value={cfg.enforcement[k]} onChange={(e) => set('enforcement', { ...cfg.enforcement, [k]: e.target.value as Enf })}>
                {(Object.keys(ENF_LABEL) as Enf[]).map((v) => <option key={v} value={v}>{ENF_LABEL[v]}</option>)}
              </select>
            </div>
          ))}
        </div>
      </Section>

      {data.units.length > 0 && (
        <Section title="Dados fiscais das filiais" count={data.units.length}>
          <div className="space-y-4">
            {data.units.map((u) => {
              const uc = cfg.units[u.id] ?? {}
              const upd = (patch: Record<string, string>) => set('units', { ...cfg.units, [u.id]: { ...uc, ...patch } })
              return (
                <div key={u.id}>
                  <p className="mb-1.5 text-sm font-medium text-gray-800">{u.name} <span className="font-mono text-xs text-gray-400">{u.cnpj}</span></p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div><FieldLabel>IE</FieldLabel><input className={input} value={uc.ie ?? ''} onChange={(e) => upd({ ie: e.target.value })} /></div>
                    <div><FieldLabel>IM</FieldLabel><input className={input} value={uc.im ?? ''} onChange={(e) => upd({ im: e.target.value })} /></div>
                    <div><FieldLabel>Série NF-e</FieldLabel><input className={input} value={uc.fiscalSeries ?? ''} onChange={(e) => upd({ fiscalSeries: e.target.value })} /></div>
                    <div><FieldLabel>UF</FieldLabel><input className={input} maxLength={2} value={uc.uf ?? u.state ?? ''} onChange={(e) => upd({ uf: e.target.value.toUpperCase() })} /></div>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      <Section title={`Disponível no estado${data.uf ? ` (${data.uf})` : ''}`} hint="CAPACIDADES_UF">
        <ul className="space-y-1.5">
          {data.capabilityKeys.map((k) => (
            <li key={k} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{data.capabilityLabels[k]}</span>
              <span className={data.effective[k] ? 'text-emerald-600' : 'text-gray-400'}>{data.effective[k] ? 'Disponível' : 'Indisponível'}</span>
            </li>
          ))}
        </ul>
        {data.global && <GlobalCapabilities keys={data.capabilityKeys} labels={data.capabilityLabels} initial={data.global} onSaved={load} />}
      </Section>

      <CertificateModal open={certOpen} units={data.units} onClose={() => setCertOpen(false)} onDone={() => { setCertOpen(false); load() }} />
    </div>
  )
}

function CertificateModal({ open, units, onClose, onDone }: { open: boolean; units: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [pfx, setPfx] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [unitId, setUnitId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setPfx(null); setName(''); setPassword(''); setUnitId(''); setError(null) } }, [open])
  const onFile = (f: File | null) => {
    if (!f) return
    if (f.size > 64 * 1024) return setError('Arquivo grande demais para um certificado A1.')
    const r = new FileReader()
    r.onload = () => { setPfx(String(r.result)); setName(f.name) }
    r.readAsDataURL(f)
  }
  const submit = async () => {
    setBusy(true); setError(null)
    const r = await postJson('/api/settings/operations', { action: 'certificate.upload', pfx, password, unitId: unitId || null })
    setBusy(false); setPassword('')
    if (!r.ok) return setError(r.error)
    onDone()
  }
  return (
    <Modal open={open} title={<span className="inline-flex items-center gap-1.5">Certificado digital A1<Hint term="CERTIFICADO_DIGITAL" /></span>} onClose={onClose}
      footer={<><button className={btn.secondary} onClick={onClose} disabled={busy}>Cancelar</button><button className={btn.primary} onClick={submit} disabled={busy || !pfx || !password}>{busy ? 'Validando…' : 'Enviar'}</button></>}>
      <input ref={ref} type="file" accept=".pfx,.p12" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <button onClick={() => ref.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-3 py-5 text-sm text-gray-600 hover:bg-gray-50"><Upload className="h-4 w-4" />{name || 'Selecionar arquivo .pfx'}</button>
      <div><FieldLabel required>Senha do certificado</FieldLabel><input type="password" autoComplete="off" className={input} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      {units.length > 1 && (
        <div><FieldLabel>Filial</FieldLabel><select className={input} value={unitId} onChange={(e) => setUnitId(e.target.value)}><option value="">Todas (matriz)</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      )}
      <ErrorLine text={error} />
    </Modal>
  )
}

/** MASTER: liga/desliga capacidades por estado ("*" = todos). */
function GlobalCapabilities({ keys, labels, initial, onSaved }: { keys: string[]; labels: Record<string, string>; initial: Record<string, Record<string, boolean>>; onSaved: () => void }) {
  const [uf, setUf] = useState('*')
  const [g, setG] = useState(initial)
  const [busy, setBusy] = useState(false)
  const row = g[uf] ?? {}
  const save = async () => {
    setBusy(true)
    await fetch('/api/settings/operations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ global: g }) }).catch(() => null)
    setBusy(false); onSaved()
  }
  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Avançado (Master)</span>
        <input className={`${input} max-w-[6rem]`} value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase() || '*')} placeholder="UF" />
      </div>
      <ul className="space-y-1.5">
        {keys.map((k) => (
          <li key={k} className="flex items-center justify-between text-sm">
            <span className="text-gray-600">{labels[k]}</span>
            <select className={`${input} max-w-[9rem]`} value={row[k] === undefined ? '' : row[k] ? '1' : '0'} onChange={(e) => {
              const next = { ...row }
              if (e.target.value === '') delete next[k]; else next[k] = e.target.value === '1'
              setG({ ...g, [uf]: next })
            }}>
              <option value="">Padrão</option><option value="1">Ligado</option><option value="0">Desligado</option>
            </select>
          </li>
        ))}
      </ul>
      <button className={`${btn.secondary} mt-3`} disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar capacidades'}</button>
    </div>
  )
}
