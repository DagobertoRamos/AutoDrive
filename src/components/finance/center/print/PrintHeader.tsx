'use client'

// =============================================================================
// Cabeçalho das impressões do financeiro (extrato, fluxo de caixa, DRE): logo e
// dados da loja (razão social / nome fantasia, CNPJ, endereço, telefone) +
// título e período. Só aparece na impressão (hidden print:flex).
// Dados: GET /api/finance/center/store-identity (cache por aba).
// Obs.: não usar <header> — o CSS global de impressão esconde esse elemento.
// =============================================================================

import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface StoreIdentity {
  razaoSocial: string; nomeFantasia: string | null; cnpj: string | null
  address: string | null; phone: string | null; email: string | null; logoUrl: string | null
}

let cache: Promise<StoreIdentity | null> | null = null
function fetchIdentity(): Promise<StoreIdentity | null> {
  if (!cache) {
    cache = fetch('/api/finance/center/store-identity', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => (j?.success ? (j.data as StoreIdentity) : null))
      .catch(() => null)
      .then((d) => { if (!d) cache = null; return d })
  }
  return cache
}

export function useStoreIdentity(): StoreIdentity | null {
  const [id, setId] = useState<StoreIdentity | null>(null)
  useEffect(() => {
    let alive = true
    void fetchIdentity().then((d) => { if (alive) setId(d) })
    return () => { alive = false }
  }, [])
  return id
}

export default function PrintHeader({ title, subtitle, children, className }: {
  title: ReactNode
  subtitle?: ReactNode
  /** Conteúdo extra à direita (ex.: saldos). */
  children?: ReactNode
  className?: string
}) {
  const store = useStoreIdentity()
  return (
    <div className={cn('fin-print-header hidden items-start gap-3 border-b border-gray-400 pb-2 print:flex', className)}>
      {store?.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={store.logoUrl} alt="" className="h-12 w-auto max-w-[38mm] shrink-0 object-contain" />
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[11px] font-bold text-gray-900">
          {store?.razaoSocial ?? ''}{store?.nomeFantasia ? <span className="font-medium text-gray-600"> · {store.nomeFantasia}</span> : null}
        </p>
        <p className="text-[8.5px] text-gray-600">
          {[store?.cnpj && `CNPJ ${store.cnpj}`, store?.phone && `Tel. ${store.phone}`, store?.email].filter(Boolean).join(' · ')}
        </p>
        {store?.address && <p className="text-[8.5px] text-gray-600">{store.address}</p>}
      </div>
      <div className="shrink-0 text-right leading-tight">
        <p className="text-[12px] font-bold text-gray-900">{title}</p>
        {subtitle && <p className="text-[9px] text-gray-600">{subtitle}</p>}
        {children}
      </div>
    </div>
  )
}
