// =============================================================================
// /termos — Termos de Uso públicos do AutoDrive (plataforma SaaS).
// Página estática, acessível sem login. URL usada no cadastro de apps das
// redes sociais (TikTok, Meta) e nas lojas de aplicativos.
// =============================================================================

import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Termos de Uso — AutoDrive',
  description: 'Regras de uso da plataforma AutoDrive para lojas de veículos.',
}

const ATUALIZADO_EM = '2 de outubro de 2026'
const CONTATO = 'beto1910@gmail.com'

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 text-lg font-semibold text-gray-900">{titulo}</h2>
      <div className="space-y-2 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </section>
  )
}

export default function TermosDeUso() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm sm:p-10">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Termos de Uso — AutoDrive</h1>
        <p className="mb-8 text-sm text-gray-500">Última atualização: {ATUALIZADO_EM}</p>

        <Secao titulo="1. O serviço">
          <p>
            O <strong>AutoDrive</strong> é uma plataforma de gestão para lojas de veículos: estoque,
            atendimento, CRM, negociações, financeiro, site da loja e publicação dos veículos em portais e
            redes sociais. O acesso é feito por colaboradores autorizados pela loja contratante.
          </p>
        </Secao>

        <Secao titulo="2. Conta e responsabilidade">
          <p>
            Cada usuário é responsável pelo sigilo do próprio login e pelas ações feitas com ele. A loja
            é responsável pelos usuários que cadastra e pelas permissões que concede.
          </p>
        </Secao>

        <Secao titulo="3. Conteúdo e publicações">
          <p>
            A loja é dona e responsável pelo conteúdo que cadastra (fotos, vídeos, textos, preços e dados
            dos veículos) e pelo que decide publicar. Ao conectar contas de portais ou redes sociais
            (como Facebook, Instagram e TikTok), a loja autoriza o AutoDrive a publicar, em nome dela e
            apenas nessas contas, o conteúdo que ela preparou ou aprovou — inclusive por agendamento ou
            piloto automático que ela mesma ativou.
          </p>
          <p>
            A loja deve respeitar os termos e as diretrizes de cada portal e rede social, os direitos de
            imagem e autorais (inclusive de músicas) e a legislação de publicidade e de defesa do
            consumidor. A conexão com qualquer rede pode ser desfeita a qualquer momento em Marketing ›
            Canais conectados.
          </p>
        </Secao>

        <Secao titulo="4. Uso proibido">
          <p>
            É proibido usar a plataforma para enviar spam, publicar conteúdo enganoso, ilegal ou que viole
            direitos de terceiros, tentar acessar dados de outras lojas ou burlar limites técnicos dos
            serviços integrados.
          </p>
        </Secao>

        <Secao titulo="5. Disponibilidade">
          <p>
            Trabalhamos para manter o serviço disponível, mas integrações com terceiros (portais, redes
            sociais, bancos) dependem das regras e da disponibilidade desses serviços, que podem mudar sem
            aviso.
          </p>
        </Secao>

        <Secao titulo="6. Privacidade">
          <p>
            O tratamento de dados pessoais segue a nossa{' '}
            <Link href="/privacidade" className="font-medium text-brand-600 underline">Política de Privacidade</Link>.
          </p>
        </Secao>

        <Secao titulo="7. Encerramento">
          <p>
            A loja pode encerrar o uso a qualquer momento. Contas desativadas perdem o acesso; os dados
            são guardados pelo prazo legal e depois apagados.
          </p>
        </Secao>

        <Secao titulo="8. Contato">
          <p>
            Dúvidas sobre estes termos:{' '}
            <a href={`mailto:${CONTATO}`} className="font-medium text-brand-600 underline">{CONTATO}</a>.
          </p>
        </Secao>

        <div className="mt-8 border-t border-gray-100 pt-6 text-sm">
          <Link href="/login" className="text-brand-600 hover:underline">← Voltar ao AutoDrive</Link>
        </div>
      </div>
    </main>
  )
}
