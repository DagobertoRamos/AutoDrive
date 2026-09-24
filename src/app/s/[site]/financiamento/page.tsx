// Financiamento (serviço padrão): simulação para os carros do estoque → CRM.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSiteContext } from '@/lib/site/context'
import { listSiteVehicles } from '@/lib/site/vehicles'
import { money } from '@/lib/site/listing-core'
import { SiteFinancingForm } from '@/components/site/SiteFinancingForm'

export const metadata: Metadata = { title: 'Financiamento' }

export default async function SiteFinancing({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ veiculo?: string }> }) {
  const [{ site }, sp] = await Promise.all([params, searchParams])
  const ctx = await getSiteContext(site)
  if (!ctx.on('financiamento')) notFound()
  const { items } = await listSiteVehicles(ctx.tenantId, { page: 1, sort: 'name' }).catch(() => ({ items: [] }))
  const choices = items.map((v) => ({ id: v.id, label: `${v.title}${v.modelYear ? ` ${v.modelYear}` : ''} — ${money(v.price)}` }))
  return (
    <>
      <section className="page-hero"><div className="shell"><p className="eyebrow">Crédito facilitado</p><h1>Financiamento</h1><p>Escolha um veículo do nosso estoque e envie sua simulação. A equipe apresenta as melhores condições das financeiras parceiras.</p></div></section>
      <section className="shell section content-grid">
        <div className="prose">
          <h2>Atendimento humano desde o primeiro contato</h2>
          <p>Você envia os dados básicos e nós organizamos a conversa com as financeiras. Nesta primeira etapa não pedimos CPF pelo site.</p>
          <ul><li>Simulação para os veículos do nosso estoque.</li><li>Seu usado pode entrar como parte do pagamento.</li><li>Condições sujeitas à análise de crédito.</li></ul>
          <div className="notice"><strong>Crédito responsável</strong><p>As condições dependem da análise das instituições financeiras. Confirmamos os próximos passos antes de pedir qualquer documento.</p></div>
        </div>
        <SiteFinancingForm apiUrl={ctx.apiUrl} vehicles={choices} preselected={sp.veiculo} privacyHref={ctx.href('/privacidade')} />
      </section>
    </>
  )
}
