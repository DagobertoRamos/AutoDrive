// Política de cookies do site da loja (texto padrão; cita as ferramentas de
// medição que a loja ligou em Site → Configurações).
import type { Metadata } from 'next'
import { getSiteContext } from '@/lib/site/context'

export const metadata: Metadata = { title: 'Política de cookies' }

export default async function SiteCookies({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  const { identity } = ctx.config
  const { metaPixelId, googleTagId } = ctx.config.tracking
  const tools = [metaPixelId && 'Meta Pixel (Facebook/Instagram)', googleTagId && 'tag do Google (Analytics/Ads)'].filter(Boolean) as string[]
  return (
    <>
      <section className="page-hero"><div className="shell"><p className="eyebrow">{identity.name}</p><h1>Política de cookies</h1></div></section>
      <section className="shell section prose">
        <h2>O que são cookies</h2>
        <p>Cookies e armazenamento local são pequenos dados guardados no seu navegador para o site funcionar e para entendermos como ele é usado.</p>
        <h2>Cookies necessários</h2>
        <p>Guardam a sua escolha no aviso de cookies e um identificador anônimo de visita, usado só para contar acessos no nosso próprio painel. Não identificam você e não são compartilhados.</p>
        <h2>Cookies de medição</h2>
        {tools.length
          ? <p>Somente se você aceitar no aviso de cookies, usamos {tools.join(' e ')} para medir visitas, veículos vistos e contatos, e melhorar nossos anúncios. Esses eventos não levam nome, telefone, e-mail ou CPF.</p>
          : <p>No momento este site não usa cookies de medição de terceiros.</p>}
        <h2>Como mudar a sua escolha</h2>
        <p>Você pode mudar a escolha a qualquer momento no botão “Cookies”, no canto da tela, ou apagar os cookies nas configurações do seu navegador. Recusar os cookies de medição não impede o uso do site.</p>
        <p>Veja também a <a href={ctx.href('/privacidade')}>Política de privacidade</a> e os <a href={ctx.href('/termos')}>Termos de uso</a> da {identity.name}.</p>
      </section>
    </>
  )
}
