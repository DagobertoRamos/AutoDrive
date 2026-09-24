// Encontre seu carro (serviço opcional): o cliente descreve o carro que procura → CRM.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSiteContext } from '@/lib/site/context'
import { SiteFindCarForm } from '@/components/site/SiteServiceForms'

export const metadata: Metadata = { title: 'Encontre seu carro', description: 'Não achou no estoque? Conte qual carro você procura.' }

export default async function SiteFindCar({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  if (!ctx.on('encontreSeuCarro')) notFound()
  return (
    <>
      <section className="page-hero"><div className="shell"><p className="eyebrow">Busca personalizada</p><h1>Não encontrou o carro que procura?</h1><p>Conte para a {ctx.config.identity.name} qual carro você quer. Nós procuramos e avisamos quando encontrarmos.</p></div></section>
      <section className="shell section content-grid">
        <div className="prose">
          <h2>Mais opções, um só atendimento.</h2>
          <p>Você não precisa procurar loja por loja. A equipe recebe o seu perfil de busca e retorna com opções compatíveis.</p>
          <ul>
            <li>Busca por marca, modelo, ano e orçamento.</li>
            <li>Troca e financiamento no mesmo atendimento.</li>
            <li>Retorno pelo WhatsApp.</li>
          </ul>
          <p>Antes, vale conferir o <Link href={ctx.href('/veiculos')}>estoque atual</Link>.</p>
          <div className="notice"><strong>Busca direcionada</strong><p>Quanto mais claro o orçamento e as preferências, mais rápido encontramos boas oportunidades.</p></div>
        </div>
        <SiteFindCarForm apiUrl={ctx.apiUrl} privacyHref={ctx.href('/privacidade')} />
      </section>
    </>
  )
}
