'use client'

// =============================================================================
// Central de Configurações do CRM — REGRAS DE ATENDIMENTO (Fase B): Campos
// obrigatórios, SLA e follow-up, Distribuição. Mesmo mecanismo das listas
// (PUT /api/crm/settings por seção).
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LEAD_FIELDS, type DistributionCfg, type RequiredFieldsCfg, type SlaCfg } from '@/lib/crm/settings-core'
import { Card, SaveBar, checkCls, inputCls, useSection } from './ListsTabs'
import { HelpHint } from '@/components/ui/help-hint'
import { opsHint } from '@/lib/glossary-ops'

// ── Campos obrigatórios ───────────────────────────────────────────────────────
export function RequiredFieldsTab({ canManage }: { canManage: boolean }) {
  const s = useSection('requiredFields')
  const toggle = (moment: keyof RequiredFieldsCfg, key: string, on: boolean) =>
    s.update({ ...s.items, [moment]: on ? [...s.items[moment], key] : s.items[moment].filter((k) => k !== key) })
  const moments: { key: keyof RequiredFieldsCfg; label: string; hint?: string }[] = [
    { key: 'onCreate', label: 'Ao cadastrar um lead', hint: 'Só no cadastro manual. Integrações não são barradas.' },
    { key: 'onConvert', label: 'Ao converter (venda/sucesso)' },
  ]
  return (
    <Card title="Campos obrigatórios">
      <div className="grid gap-4 md:grid-cols-2">
        {moments.map((m) => (
          <div key={m.key} className="rounded-lg border border-gray-100 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">{m.label}</h3>
            {m.hint ? <p className="mb-2 text-[11px] text-gray-400">{m.hint}</p> : <div className="mb-2" />}
            <div className="space-y-1.5">
              {LEAD_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" disabled={!canManage} checked={s.items[m.key].includes(f.key)} onChange={(e) => toggle(m.key, f.key, e.target.checked)} className={checkCls} />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <SaveBar canManage={canManage} {...s} />
    </Card>
  )
}

// ── SLA e follow-up ───────────────────────────────────────────────────────────
function NumberField({ label, suffix, value, onChange, disabled, min, help }: { label: string; suffix: string; value: number; onChange: (n: number) => void; disabled: boolean; min: number; help?: { text: string; title?: string } }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">{label}{help && <HelpHint {...help} />}</span>
      <span className="flex items-center gap-2">
        <input type="number" min={min} disabled={disabled} value={value} onChange={(e) => onChange(Number(e.target.value))} className={cn(inputCls, 'w-28')} />
        <span className="text-xs text-gray-500">{suffix}</span>
      </span>
    </label>
  )
}

export function SlaTab({ canManage }: { canManage: boolean }) {
  const s = useSection('sla')
  const set = (patch: Partial<SlaCfg>) => s.update({ ...s.items, ...patch })
  const off = !canManage || !s.items.enabled
  return (
    <Card title="SLA e follow-up" help={{ term: 'SLA' }}>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
        <input type="checkbox" disabled={!canManage} checked={s.items.enabled} onChange={(e) => set({ enabled: e.target.checked })} className={checkCls} />
        Ativar SLA do CRM
      </label>
      <div className={cn('mt-4 grid gap-4 sm:grid-cols-2', !s.items.enabled && 'opacity-50')}>
        <NumberField label="Prazo para o 1º contato" suffix="minutos após a criação" min={5} help={opsHint('TEMPO_PRIMEIRA_RESPOSTA')} value={s.items.firstContactMinutes} onChange={(n) => set({ firstContactMinutes: n })} disabled={off} />
        <NumberField label="Alerta de lead parado" suffix="horas sem contato" min={1} help={{ title: 'Lead parado', text: 'Lead sem nenhum contato registrado há mais horas que este limite. Entra no alerta, pode gerar tarefa de follow-up e aviso aos gestores.' }} value={s.items.noContactHours} onChange={(n) => set({ noContactHours: n })} disabled={off} />
      </div>
      <div className={cn('mt-4 space-y-2', !s.items.enabled && 'opacity-50')}>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" disabled={off} checked={s.items.createFollowUpTask} onChange={(e) => set({ createFollowUpTask: e.target.checked })} className={checkCls} />
          Criar tarefa de follow-up para o responsável quando o lead ficar parado (se ele não tiver tarefa pendente)
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" disabled={off} checked={s.items.escalateToManagers} onChange={(e) => set({ escalateToManagers: e.target.checked })} className={checkCls} />
          Avisar os gestores com um resumo quando houver leads fora do SLA <HelpHint {...opsHint('ESCALONAMENTO')} />
        </label>
      </div>
      <SaveBar canManage={canManage} {...s} />
    </Card>
  )
}

// ── Distribuição ──────────────────────────────────────────────────────────────
interface PolicyRow { id: string; name: string; mode: string; active: boolean; priority: number; slaSeconds: number | null }
interface DistributionInfo { policies: PolicyRow[]; activeMembers: number; unassignedLeads: number }
const MODE_LABEL: Record<string, string> = {
  ROUND_ROBIN: 'Roleta', LOAD_BALANCED: 'Menor carga', PERFORMANCE_WEIGHTED: 'Por desempenho', PRIORITY_RULES: 'Regras de prioridade',
  SHARK_TANK: 'Tanque (quem pegar primeiro)', MANUAL: 'Manual',
}
const AUTO = new Set(['ROUND_ROBIN', 'LOAD_BALANCED', 'PERFORMANCE_WEIGHTED', 'PRIORITY_RULES'])

export function DistributionTab({ canManage }: { canManage: boolean }) {
  const s = useSection('distribution')
  const set = (patch: Partial<DistributionCfg>) => s.update({ ...s.items, ...patch })
  const [info, setInfo] = useState<DistributionInfo | null>(null)
  useEffect(() => {
    fetch('/api/crm/distribution', { credentials: 'include' }).then((r) => r.json()).then((j) => setInfo(j?.data ?? null)).catch(() => {})
  }, [])
  const activeAuto = info?.policies.find((p) => p.active && AUTO.has(p.mode))

  return (
    <div className="space-y-4">
      <Card title="Distribuição de leads" help={opsHint('DISTRIBUICAO_AUTO')}>
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={!canManage} checked={s.items.autoAssignNew} onChange={(e) => set({ autoAssignNew: e.target.checked })} className={cn(checkCls, 'mt-0.5')} />
            <span>Distribuir automaticamente os leads cadastrados no CRM sem responsável</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" disabled={!canManage} checked={s.items.runSdrInTick} onChange={(e) => set({ runSdrInTick: e.target.checked })} className={cn(checkCls, 'mt-0.5')} />
            <span>Redistribuir sozinho: rodar o SLA e a distribuição da Mesa SDR a cada minuto <HelpHint {...opsHint('SDR')} /></span>
          </label>
        </div>
        {(s.items.autoAssignNew || s.items.runSdrInTick) && info && !activeAuto && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Nenhuma política automática ativa. Ative uma em Mesa SDR → Políticas.</p>
        )}
        <SaveBar canManage={canManage} {...s} />
      </Card>

      <Card title="Políticas da Mesa SDR" help={{ title: 'Políticas de distribuição', text: 'Regra que escolhe quem recebe o lead: Roleta (um de cada vez), Menor carga (quem tem menos leads abertos), Por desempenho (quem converte mais recebe mais), Tanque (quem pegar primeiro) ou Manual.' }}>
        {!info ? <div className="h-16 animate-pulse rounded-lg bg-gray-100" /> : (
          <>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">{info.activeMembers} membro(s) ativo(s) na mesa</span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">{info.unassignedLeads} lead(s) novo(s) sem responsável</span>
            </div>
            {info.policies.length === 0 ? <p className="py-4 text-center text-sm text-gray-400">Nenhuma política cadastrada.</p> : (
              <ul className="divide-y divide-gray-100">
                {info.policies.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className={cn('h-2 w-2 rounded-full', p.active ? 'bg-green-500' : 'bg-gray-300')} />
                    <span className="font-medium text-gray-800">{p.name}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{MODE_LABEL[p.mode] ?? p.mode}</span>
                    {p.slaSeconds && <span className="text-[11px] text-gray-400">SLA {Math.round(p.slaSeconds / 60)} min</span>}
                    {!p.active && <span className="text-[11px] text-gray-400">inativa</span>}
                  </li>
                ))}
              </ul>
            )}
            <Link href="/marketing/sdr/politicas" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
              Gerenciar políticas na Mesa SDR <ExternalLink size={12} />
            </Link>
          </>
        )}
      </Card>
    </div>
  )
}
