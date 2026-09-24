'use client'

// =============================================================================
// Central de Configurações do CRM (Reforma F1). Abas: Visão geral, Funis e etapas,
// Etiquetas (funcionais). Demais áreas aparecem como "em breve" (roadmap das
// próximas fases). Reaproveita MarketingLead + LeadStatus; nada paralelo.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Settings, Plus, Trash2, Tag as TagIcon, Columns3, RefreshCw, Copy, Thermometer, Shapes, Radio, XCircle, ListChecks, Timer, Shuffle, Zap, ShieldCheck, History, Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import PipelinesTab from './PipelinesTab'
import { CloseReasonsTab, LeadTypesTab, SourcesTab, TemperaturesTab } from './ListsTabs'
import { DistributionTab, RequiredFieldsTab, SlaTab } from './RulesTabs'
import AutomationsTab from './AutomationsTab'
import ChannelsTab from './ChannelsTab'
import { AuditTab, PermissionsTab } from './GovernanceTabs'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

interface Tag { id: string; name: string; color: string | null; description: string | null; active: boolean }

type TabId = 'overview' | 'channels' | 'pipelines' | 'tags' | 'temperatures' | 'leadTypes' | 'sources' | 'closeReasons' | 'requiredFields' | 'sla' | 'distribution' | 'automations' | 'permissions' | 'audit' | 'duplicates'
const TABS: { id: TabId; label: string; icon: typeof Settings }[] = [
  { id: 'overview', label: 'Visão geral', icon: Settings },
  { id: 'channels', label: 'Canais de captação', icon: Megaphone },
  { id: 'pipelines', label: 'Funis e etapas', icon: Columns3 },
  { id: 'tags', label: 'Etiquetas', icon: TagIcon },
  { id: 'temperatures', label: 'Temperaturas', icon: Thermometer },
  { id: 'leadTypes', label: 'Tipos de lead', icon: Shapes },
  { id: 'sources', label: 'Origens', icon: Radio },
  { id: 'closeReasons', label: 'Motivos de encerramento', icon: XCircle },
  { id: 'requiredFields', label: 'Campos obrigatórios', icon: ListChecks },
  { id: 'sla', label: 'SLA e follow-up', icon: Timer },
  { id: 'distribution', label: 'Distribuição', icon: Shuffle },
  { id: 'automations', label: 'Automações', icon: Zap },
  { id: 'permissions', label: 'Permissões', icon: ShieldCheck },
  { id: 'audit', label: 'Auditoria', icon: History },
  { id: 'duplicates', label: 'Duplicidades', icon: Copy },
]

export default function CrmConfiguracoesPage() {
  // Permissão efetiva (padrão do perfil + regra da loja + exceção individual).
  const [canManage, setCanManage] = useState(false)
  useEffect(() => {
    fetch('/api/crm/permissions', { credentials: 'include' }).then((r) => r.json()).then((j) => setCanManage(!!j?.data?.canManage)).catch(() => {})
  }, [])
  const [tab, setTab] = useState<TabId>('overview')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Settings size={20} className="text-brand-600" />Central de Configurações do CRM</h1>
        <p className="mt-0.5 text-sm text-gray-500">Configure o funcionamento real do CRM. Reaproveita os leads (MarketingLead) e as etapas existentes — sem CRM paralelo.</p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn('flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium -mb-px', tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview />}
      {tab === 'channels' && <ChannelsTab canManage={canManage} />}
      {tab === 'pipelines' && <PipelinesTab canManage={canManage} />}
      {tab === 'tags' && <TagsTab canManage={canManage} />}
      {tab === 'temperatures' && <TemperaturesTab canManage={canManage} />}
      {tab === 'leadTypes' && <LeadTypesTab canManage={canManage} />}
      {tab === 'sources' && <SourcesTab canManage={canManage} />}
      {tab === 'closeReasons' && <CloseReasonsTab canManage={canManage} />}
      {tab === 'requiredFields' && <RequiredFieldsTab canManage={canManage} />}
      {tab === 'sla' && <SlaTab canManage={canManage} />}
      {tab === 'distribution' && <DistributionTab canManage={canManage} />}
      {tab === 'automations' && <AutomationsTab canManage={canManage} />}
      {tab === 'permissions' && <PermissionsTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'duplicates' && <DuplicatesTab />}
    </div>
  )
}

interface DupLead { id: string; name?: string | null; phone?: string | null; email?: string | null; status?: string; source?: string | null }
interface DupItem { id: string; matchType: string; reason: string | null; createdAt: string; lead: DupLead; matchedLead: DupLead | null }

function DuplicatesTab() {
  const [items, setItems] = useState<DupItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/crm/duplicates', { credentials: 'include' }).then((x) => x.json()); setItems(r?.data ?? []) }
    catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const dismiss = async (id: string) => {
    setBusy(id)
    try { await fetch(`/api/crm/duplicates/${id}/dismiss`, { method: 'POST', credentials: 'include' }); await load() } finally { setBusy(null) }
  }

  const who = (l: DupLead) => l.name || l.phone || l.email || l.id.slice(-6)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div><h2 className="text-sm font-semibold text-gray-900">Duplicidades para revisar</h2><p className="text-xs text-gray-500">Detecção em modo alerta — o sistema NÃO mescla nem apaga sozinho. Você revisa e decide.</p></div>
        <button onClick={load} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>
      {loading ? <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />)}</div> : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Nenhuma duplicidade pendente. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-lg border border-amber-100 bg-amber-50/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-700">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{it.matchType}</span>{' '}
                  <Link href={`/crm/leads/${it.lead.id}`} className="font-semibold text-sky-700 hover:underline">{who(it.lead)}</Link>
                  {it.matchedLead && <> ↔ <Link href={`/crm/leads/${it.matchedLead.id}`} className="font-semibold text-sky-700 hover:underline">{who(it.matchedLead)}</Link></>}
                </p>
                <button onClick={() => dismiss(it.id)} disabled={busy === it.id} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Dispensar</button>
              </div>
              {it.reason && <p className="mt-1 text-xs text-gray-500">{it.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Overview() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <h2 className="text-sm font-semibold text-gray-900">O que já dá para configurar</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-600 space-y-1">
          <li><b>Funis e etapas</b> — vários funis (ex.: Vendas, Repasse, Consórcio), cada um com etapas livres, cor, ordem, regras de avanço e campos obrigatórios. Cada etapa define o status do lead, que integrações e relatórios continuam usando.</li>
          <li><b>Etiquetas</b> — cadastro de múltiplas etiquetas por lead (cliente com troca, financiamento, PCD, sem retorno, etc.).</li>
          <li><b>Temperaturas</b> — nome, cor e ativação de cada nível (Fervendo/Quente/Morno/Frio), aplicados no card e no detalhe do lead.</li>
          <li><b>Tipos de lead</b> — classificação do interesse (compra, troca, consignação…), escolhida no lead e usada como filtro.</li>
          <li><b>Origens</b> — nome de cada origem (inclusive das integrações) e origens próprias da loja.</li>
          <li><b>Motivos de encerramento</b> — listas de motivos para perdido, desqualificado e reciclado.</li>
          <li><b>Campos obrigatórios</b> — o que é exigido ao cadastrar e ao converter um lead.</li>
          <li><b>SLA e follow-up</b> — prazo do 1º contato, alerta de lead parado, tarefa automática e aviso aos gestores.</li>
          <li><b>Distribuição</b> — leads novos do CRM entram no motor da Mesa SDR (roleta, carga, desempenho).</li>
          <li><b>Automações</b> — quando o lead é criado, entra numa etapa ou fica parado: criar tarefa, avisar, etiquetar, mudar temperatura, atribuir.</li>
          <li><b>Permissões</b> — o que cada perfil pode fazer no CRM desta loja.</li>
          <li><b>Auditoria</b> — quem fez o quê no CRM, inclusive as automações.</li>
        </ul>
      </div>
    </div>
  )
}

function TagsTab({ canManage }: { canManage: boolean }) {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', color: '#6366f1' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/crm/config/tags?includeInactive=1', { credentials: 'include' }).then((x) => x.json()); setTags(r?.data ?? []) }
    catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const r = await fetch('/api/crm/config/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form) })
      if (r.ok) { setForm({ name: '', color: '#6366f1' }); await load() } else { const j = await r.json().catch(() => ({})); alert(j?.error ?? 'Falha ao criar.') }
    } finally { setBusy(false) }
  }
  const toggle = async (t: Tag) => { await fetch(`/api/crm/config/tags/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ active: !t.active }) }); await load() }
  const remove = async (t: Tag) => { if (!confirm(`Excluir/desativar a etiqueta "${t.name}"?`)) return; await fetch(`/api/crm/config/tags/${t.id}`, { method: 'DELETE', credentials: 'include' }); await load() }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="mb-3"><h2 className="text-sm font-semibold text-gray-900">Etiquetas</h2><p className="text-xs text-gray-500">Um lead pode ter várias. Etiquetas usadas não são apagadas — são desativadas.</p></div>
      {canManage && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
          <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="h-9 w-9 rounded border border-gray-200" />
          <input className={cn(inputCls, 'flex-1 min-w-[160px]')} placeholder="Nome da etiqueta (ex.: Financiamento, PCD, Sem retorno)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <button onClick={create} disabled={busy || !form.name.trim()} className="btn-primary text-sm"><Plus size={15} />Adicionar</button>
        </div>
      )}
      {loading ? <div className="flex flex-wrap gap-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-7 w-24 animate-pulse rounded-full bg-gray-100" />)}</div> : tags.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Nenhuma etiqueta cadastrada.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t.id} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', t.active ? 'border-gray-200 bg-white text-gray-700' : 'border-gray-100 bg-gray-50 text-gray-400 line-through')}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color ?? '#9ca3af' }} />
              {t.name}
              {canManage && (
                <>
                  <button onClick={() => toggle(t)} className="ml-1 text-[10px] text-gray-400 hover:text-gray-700" title={t.active ? 'Desativar' : 'Ativar'}>{t.active ? 'off' : 'on'}</button>
                  <button onClick={() => remove(t)} className="text-gray-400 hover:text-red-600" title="Excluir"><Trash2 size={12} /></button>
                </>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
