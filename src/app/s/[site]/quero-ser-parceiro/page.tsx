// Quero ser parceiro: lojistas se cadastram para oferecer estoque ou buscar
// carros com a loja → CRM (lead "partner"). O item do menu e o atalho da home
// trazem para cá; aparece enquanto o bloco "Parceiros" da home estiver ligado.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSiteContext } from '@/lib/site/context'
import { SitePartnerForm } from '@/components/site/SiteServiceForms'

export const metadata: Metadata = { title: 'Quero ser parceiro', description: 'Lojista: cadastre sua loja para oferecer veículos ou encontrar carros para o seu estoque.' }

export default async function SitePartner({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  if (!ctx.blockOn('partners')) notFound()
  const block = ctx.config.homeBlocks.find((b) => b.type === 'partners')
  const name = ctx.config.identity.name
  return (
    <>
      <section className="page-hero"><div className="shell"><p className="eyebrow">{block?.eyebrow || 'Para lojistas e profissionais do setor'}</p><h1>Seja parceiro da {name}.</h1><p>{block?.text || 'Se você tem veículos para oferecer ou procura carros para completar seu estoque, cadastre-se como parceiro.'}</p></div></section>
      <section className="shell section content-grid">
        <div className="prose">
          <h2>{block?.title || 'Uma rede feita para o estoque girar.'}</h2>
          <ul>
            {(block?.bullets.length ? block.bullets : ['Ofereça veículos do seu estoque', 'Informe os modelos que procura', 'Negociação acompanhada pela equipe']).map((t) => <li key={t}>{t}</li>)}
          </ul>
          <p>Depois do cadastro, a equipe confere os dados e chama você pelo WhatsApp para combinar como a parceria funciona.</p>
          <div className="notice"><strong>Parceria entre profissionais</strong><p>Cada negociação é acompanhada pela equipe da {name}, com a documentação conferida antes de fechar.</p></div>
          {ctx.on('atacado') && <div className="finance-service-alternative"><h3>Quer comprar no atacado?</h3><p>Lojistas com CNPJ recebem as oportunidades de repasse antes da vitrine.</p><Link href={ctx.href('/atacado')} className="button button-outline">Conhecer o atacado</Link></div>}
        </div>
        <SitePartnerForm apiUrl={ctx.apiUrl} privacyHref={ctx.href('/privacidade')} whatsappHref={ctx.whatsapp()} />
      </section>
    </>
  )
}
