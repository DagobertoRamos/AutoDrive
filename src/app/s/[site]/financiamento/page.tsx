// Financiamento (serviço padrão): simulação para os carros do estoque → CRM.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSiteContext } from '@/lib/site/context'
import { listSiteVehicles, siteVehicleRef } from '@/lib/site/vehicles'
import { money } from '@/lib/site/listing-core'
import { SiteFinanceSimulator } from '@/components/site/SiteFinanceSimulator'

export const metadata: Metadata = { title: 'Financiamento' }

export default async function SiteFinancing({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ veiculo?: string }> }) {
  const [{ site }, sp] = await Promise.all([params, searchParams])
  const ctx = await getSiteContext(site)
  if (!ctx.on('financiamento')) notFound()
  const { items } = await listSiteVehicles(ctx.tenantId, { page: 1, sort: 'name' }).catch(() => ({ items: [] }))
  const choices = items.map((v) => ({ id: v.id, label: `${v.title}${v.modelYear ? ` ${v.modelYear}` : ''} — ${money(v.price)}`, price: v.price ?? null }))
  // Veículo vindo do anúncio que não está na primeira página do estoque.
  if (sp.veiculo && !choices.some((c) => c.id === sp.veiculo)) {
    const v = await siteVehicleRef(ctx.tenantId, sp.veiculo).catch(() => null)
    if (v) choices.unshift({ id: v.id, label: `${v.title}${v.modelYear ? ` ${v.modelYear}` : ''} — ${money(v.price)}`, price: v.price ?? null })
  }
  return (
    <>
      <section className="page-hero"><div className="shell"><p className="eyebrow">Crédito facilitado</p><h1>Financiamento</h1><p>Simule em poucos segundos. Depois, nossa equipe busca as condições dos bancos parceiros para você.</p></div></section>
      <section className="shell section content-grid">
        <div className="prose">
          <h2>Como funciona</h2>
          <ul><li>Informe o valor, a entrada e o prazo.</li><li>Depois, só nome, CPF, nascimento e celular.</li><li>Acompanhe sua ficha e envie documentos por um link seguro.</li></ul>
          <div className="notice"><strong>Crédito responsável</strong><p>Valores estimados não são aprovação. As condições finais dependem da análise dos bancos.</p></div>
        </div>
        <SiteFinanceSimulator simulateUrl={`/api/site/${encodeURIComponent(site)}/fi/simulate`} vehicles={choices} preselected={sp.veiculo} privacyHref={ctx.href('/privacidade')} whatsappHref={ctx.whatsapp()} />
      </section>
    </>
  )
}
