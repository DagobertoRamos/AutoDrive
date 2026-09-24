// Financia Fácil (serviço opcional): financiamento de carro comprado de
// particular (amigo, conhecido) → CRM. Porta da página do dagobertoeasycar.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSiteContext } from '@/lib/site/context'
import { SitePrivateFinancingForm } from '@/components/site/SiteServiceForms'

export const metadata: Metadata = { title: 'Financia Fácil', description: 'Financie o carro que você está comprando de um particular. Crédito sujeito à análise.' }

export default async function SitePrivateFinancing({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  if (!ctx.on('financiaFacil')) notFound()
  const name = ctx.config.identity.name
  return (
    <>
      <section className="page-hero"><div className="shell"><p className="eyebrow">Negociações particulares</p><h1>Financia Fácil</h1><p>Encontrou o carro de um amigo ou conhecido? A {name} conecta sua negociação particular às opções de financiamento.</p></div></section>
      <section className="shell section content-grid">
        <div className="prose">
          <h2>O carro é de um particular. O atendimento é da {name}.</h2>
          <p>Não precisa ser um veículo do nosso estoque. Informe o carro que você está negociando e a equipe orienta a simulação e os próximos passos com as financeiras.</p>
          <ul>
            <li>Compra de amigos, conhecidos ou outros particulares.</li>
            <li>Orientação sobre documentos e etapas.</li>
            <li>Sem CPF ou documentos nesta primeira etapa.</li>
          </ul>
          <div className="notice"><strong>Crédito responsável</strong><p>Crédito sujeito à análise e aprovação da instituição financeira, incluindo a elegibilidade do veículo. O envio não garante aprovação.</p></div>
          {ctx.on('financiamento') && <div className="finance-service-alternative"><h3>Gostou de um carro do nosso estoque?</h3><p>A simulação dos nossos veículos tem um atendimento próprio.</p><Link href={ctx.href('/financiamento')} className="button button-outline">Ir para Financiamento</Link></div>}
        </div>
        <SitePrivateFinancingForm apiUrl={ctx.apiUrl} privacyHref={ctx.href('/privacidade')} />
      </section>
    </>
  )
}
