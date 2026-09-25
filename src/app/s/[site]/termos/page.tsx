// Termos de uso do site da loja (texto padrão com o nome da loja).
import type { Metadata } from 'next'
import { getSiteContext } from '@/lib/site/context'

export const metadata: Metadata = { title: 'Termos de uso' }

export default async function SiteTerms({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  const { identity, contact } = ctx.config
  const channel = contact.email || contact.phone
  return (
    <>
      <section className="page-hero"><div className="shell"><p className="eyebrow">{identity.name}</p><h1>Termos de uso</h1></div></section>
      <section className="shell section prose">
        <h2>Sobre este site</h2>
        <p>Este site apresenta os veículos e os serviços da {identity.name}. Ao usá-lo, você concorda com estes termos.</p>
        <h2>Informações dos veículos</h2>
        <p>Fazemos o possível para manter preços, fotos, quilometragem, opcionais e disponibilidade atualizados, mas eles podem mudar sem aviso e estão sujeitos a confirmação pela equipe. Imagens podem ser ilustrativas. O anúncio não é uma oferta vinculante: as condições valem após a confirmação da negociação.</p>
        <h2>Financiamento e avaliação</h2>
        <p>Simulações de financiamento e pré-avaliações de veículos são estimativas. Todo crédito está sujeito à análise e aprovação das instituições financeiras, e o valor do seu carro depende de vistoria.</p>
        <h2>Uso adequado</h2>
        <p>Não é permitido usar o site para enviar informações falsas, de terceiros sem autorização, ou para tentar prejudicar o seu funcionamento. Os textos, marcas e imagens pertencem à {identity.name} ou aos seus parceiros.</p>
        <h2>Privacidade</h2>
        <p>Os dados enviados nos formulários são tratados conforme a nossa <a href={ctx.href('/privacidade')}>Política de privacidade</a> e a <a href={ctx.href('/cookies')}>Política de cookies</a>.</p>
        <h2>Contato</h2>
        <p>Dúvidas sobre estes termos{channel ? <> podem ser enviadas pelo canal {channel}</> : ' podem ser enviadas pelos canais de atendimento da loja'}.</p>
      </section>
    </>
  )
}
