// Atacado (serviço opcional): lojistas se cadastram para comprar da loja no
// atacado/repasse → CRM.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSiteContext } from '@/lib/site/context'
import { SiteWholesaleForm } from '@/components/site/SiteServiceForms'

export const metadata: Metadata = { title: 'Atacado para lojistas', description: 'Lojista: cadastre sua empresa para comprar veículos no atacado.' }

export default async function SiteWholesale({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  if (!ctx.on('atacado')) notFound()
  return (
    <>
      <section className="page-hero"><div className="shell"><p className="eyebrow">Para lojistas</p><h1>Compre no atacado com a {ctx.config.identity.name}.</h1><p>Cadastre sua empresa para receber as oportunidades de repasse e atacado antes de irem para a vitrine.</p></div></section>
      <section className="shell section content-grid wholesale-page">
        <div className="prose">
          <h2>Como funciona</h2>
          <ul>
            <li>Cadastro exclusivo para empresas (CNPJ).</li>
            <li>Você diz que tipo de carro interessa.</li>
            <li>A equipe envia as oportunidades de repasse pelo WhatsApp.</li>
          </ul>
          <div className="notice"><strong>Venda entre empresas</strong><p>As condições de atacado valem só para lojistas com CNPJ ativo. Veículos no estado, com a documentação conferida na negociação.</p></div>
        </div>
        <SiteWholesaleForm apiUrl={ctx.apiUrl} privacyHref={ctx.href('/privacidade')} />
      </section>
    </>
  )
}
