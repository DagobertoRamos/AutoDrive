// Política de privacidade do site (texto padrão com o nome da loja; os
// formulários pedem consentimento e apontam para cá).
import type { Metadata } from 'next'
import { getSiteContext } from '@/lib/site/context'

export const metadata: Metadata = { title: 'Política de privacidade' }

export default async function SitePrivacy({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  const { identity, contact } = ctx.config
  const channel = contact.email || contact.phone
  const { metaPixelId, googleTagId } = ctx.config.tracking
  const tools = [metaPixelId && 'Meta Pixel (Facebook/Instagram)', googleTagId && 'tag do Google (Analytics/Ads)'].filter(Boolean).join(' e ')
  return (
    <>
      <section className="page-hero"><div className="shell"><p className="eyebrow">{identity.name}</p><h1>Política de privacidade</h1></div></section>
      <section className="shell section prose">
        <h2>Quais dados coletamos</h2>
        <p>Nome, telefone, e-mail e as informações que você envia nos formulários (veículo de interesse, forma de pagamento, carro na troca, mensagem), além de dados de navegação como a página de origem e a campanha.</p>
        <h2>Para que usamos</h2>
        <p>Exclusivamente para responder à sua solicitação: contato comercial, simulação de financiamento, agendamento de visita e avaliação do seu veículo.</p>
        <h2>Com quem compartilhamos</h2>
        <p>Com a equipe da {identity.name} e, quando você pede uma simulação, com as instituições financeiras necessárias para a análise de crédito. Não vendemos seus dados.</p>
        {tools && (
          <>
            <h2>Cookies de medição</h2>
            <p>Só com a sua autorização no aviso de cookies, usamos {tools} para medir visitas, veículos vistos e contatos, e melhorar nossos anúncios. Esses eventos não levam nome, telefone, e-mail ou CPF. Você pode mudar a escolha a qualquer momento no botão “Cookies”, no canto da tela.</p>
          </>
        )}
        <h2>Seus direitos</h2>
        <p>Você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento{channel ? <> pelo canal {channel}</> : ''}, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
      </section>
    </>
  )
}
