// Venda seu carro (serviço opcional): pré-avaliação do carro do cliente → CRM.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSiteContext } from '@/lib/site/context'
import { SiteSellCarForm } from '@/components/site/SiteServiceForms'

export const metadata: Metadata = { title: 'Venda seu carro', description: 'Envie os dados do seu carro para uma pré-avaliação.' }

export default async function SiteSellCar({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  if (!ctx.on('vendaSeuCarro')) notFound()
  return (
    <>
      <section className="page-hero"><div className="shell"><p className="eyebrow">Pré-avaliação</p><h1>Venda ou troque seu carro.</h1><p>Informe os dados do seu veículo e a {ctx.config.identity.name} faz uma pré-avaliação. Você pode vender ou usar como entrada.</p></div></section>
      <section className="shell section content-grid">
        <div className="prose">
          <h2>Como funciona</h2>
          <ol>
            <li>Preencha os dados principais do veículo.</li>
            <li>Depois do envio, mande fotos reais pelo WhatsApp: frente, traseira, laterais, painel ligado, interior, motor e pneus.</li>
            <li>Nossa equipe faz a pré-análise e chama você para combinar os próximos passos.</li>
          </ol>
          <p>A avaliação final depende de vistoria presencial e da análise dos documentos.</p>
          <div className="notice"><strong>Fotos ajudam na avaliação</strong><p>Mostre também riscos, amassados e detalhes importantes. Quanto mais claro, mais precisa a pré-avaliação.</p></div>
        </div>
        <SiteSellCarForm apiUrl={ctx.apiUrl} privacyHref={ctx.href('/privacidade')} whatsappHref={ctx.whatsapp()} />
      </section>
    </>
  )
}
