'use client'

// =============================================================================
// /operacoes — painel: só o que pede ação em RENAVE, notas, transferências e
// consultas. Cada número leva à lista filtrada. Zerado = "Em dia".
// =============================================================================

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronRight, FileText, Search, Shield, Truck } from 'lucide-react'
import { ErrorLine, Hint } from '@/components/operations/ui'
import type { OpsTerm } from '@/lib/glossary-ops'

interface Dash {
  renave: { entryPending: number; exitPending: number; issues: number; divergent: number; ok: number; total: number }
  fiscal: { pending: number; rejected: number }
  transfer: { open: number; stalled: number; stores: number }
  queries: { blocking: number }
  connections: Record<string, { providerId: string; name: string | null; manual: boolean }>
  tracking: { renaveTracked: boolean; fiscalTracked: boolean }
  permissions: Record<string, boolean>
}

type Item = { label: string; value: number; href: string; tone: 'critical' | 'attention' | 'progress' }

const TONE = { critical: 'text-red-700', attention: 'text-amber-700', progress: 'text-blue-700' }

function Card({ title, hint, icon, href, items, provider }: { title: string; hint: OpsTerm; icon: React.ReactNode; href: string; items: Item[]; provider: string }) {
  const open = items.filter((i) => i.value > 0)
  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <Link href={href} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800 hover:text-brand-700">{icon}{title}</Link>
        <Hint term={hint} />
      </div>
      <div className="mt-4 flex-1 space-y-2">
        {open.length === 0 ? (
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />Em dia</p>
        ) : open.map((i) => (
          <Link key={i.label} href={i.href} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 -mx-2 hover:bg-gray-50">
            <span className="text-sm text-gray-600">{i.label}</span>
            <span className={`inline-flex items-center gap-1 text-base font-semibold tabular-nums ${TONE[i.tone]}`}>{i.value}<ChevronRight className="h-4 w-4 text-gray-300" /></span>
          </Link>
        ))}
      </div>
      <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-400">{provider}</p>
    </div>
  )
}

export default function OperacoesPage() {
  const [d, setD] = useState<Dash | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/operations/list?view=dashboard', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      if (!j?.success) return setError(j?.error ?? 'Não foi possível carregar.')
      setD(j.data)
    }).catch(() => setError('Não foi possível carregar.'))
  }, [])

  if (error) return <ErrorLine text={error} />
  if (!d) return <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-white" />)}</div>
  const prov = (k: string) => (d.connections[k]?.manual ? 'Registro manual' : d.connections[k]?.name ?? 'Registro manual')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">Operações</h1>
        {d.permissions['ops.settings'] && <Link href="/configuracoes/operacoes" className="text-sm font-medium text-brand-700 hover:underline">Conexões e regras</Link>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="RENAVE" hint="RENAVE" icon={<Shield className="h-4 w-4 text-gray-400" />} href="/operacoes/renave" provider={prov('RENAVE')} items={[
          { label: 'Entradas pendentes', value: d.renave.entryPending, href: '/operacoes/renave?aba=pending', tone: 'attention' },
          { label: 'Saídas pendentes', value: d.renave.exitPending, href: '/operacoes/renave?aba=pending', tone: 'attention' },
          { label: 'Recusados / verificando', value: d.renave.issues, href: '/operacoes/renave?aba=issues', tone: 'critical' },
          { label: 'Divergências', value: d.renave.divergent, href: '/operacoes/renave?aba=divergent', tone: 'critical' },
        ]} />
        <Card title="Notas fiscais" hint="NFE_OPERACAO" icon={<FileText className="h-4 w-4 text-gray-400" />} href="/operacoes/notas" provider={prov('FISCAL')} items={[
          { label: 'A emitir', value: d.fiscal.pending, href: '/operacoes/notas?aba=pending', tone: 'attention' },
          { label: 'Rejeitadas', value: d.fiscal.rejected, href: '/operacoes/notas?aba=rejected', tone: 'critical' },
        ]} />
        <Card title="Transferências" hint="TRANSFERENCIA_STATUS" icon={<Truck className="h-4 w-4 text-gray-400" />} href="/operacoes/transferencias" provider={prov('TRANSFER')} items={[
          { label: 'Paradas há mais de 5 dias', value: d.transfer.stalled, href: '/operacoes/transferencias?aba=open', tone: 'critical' },
          { label: 'Em andamento', value: d.transfer.open - d.transfer.stalled, href: '/operacoes/transferencias?aba=open', tone: 'progress' },
          { label: 'Entre lojas aguardando aceite', value: d.transfer.stores, href: '/operacoes/transferencias?aba=stores', tone: 'attention' },
        ]} />
        <Card title="Débitos e restrições" hint="CONSULTA_VEICULAR" icon={<Search className="h-4 w-4 text-gray-400" />} href="/operacoes/consultas" provider={prov('VEHICLE_DATA')} items={[
          { label: 'Veículos com restrição (30 dias)', value: d.queries.blocking, href: '/operacoes/consultas?aba=restrictions', tone: 'critical' },
        ]} />
      </div>
    </div>
  )
}
