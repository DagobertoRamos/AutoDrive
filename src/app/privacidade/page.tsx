// =============================================================================
// /privacidade — Política de Privacidade pública (LGPD) do AutoDrive.
// Página estática, acessível sem login. URL usada no Google Play Console.
// =============================================================================

import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Política de Privacidade — AutoDrive',
  description: 'Como o AutoDrive coleta, usa e protege os dados pessoais.',
}

const ATUALIZADO_EM = '25 de junho de 2026'
const CONTATO = 'beto1910@gmail.com'

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 text-lg font-semibold text-gray-900">{titulo}</h2>
      <div className="space-y-2 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </section>
  )
}

export default function PoliticaPrivacidade() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm sm:p-10">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Política de Privacidade — AutoDrive</h1>
        <p className="mb-8 text-sm text-gray-500">Última atualização: {ATUALIZADO_EM}</p>

        <Secao titulo="1. Quem somos">
          <p>
            O <strong>AutoDrive</strong> é um aplicativo de gestão de atendimento para concessionárias e
            lojas de veículos. Ele é usado por colaboradores das lojas (vendedores, gerentes e
            administradores) para organizar a fila de atendimento, registrar clientes presenciais e
            acompanhar indicadores de vendas. Esta política explica como tratamos os dados pessoais, em
            conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
          </p>
        </Secao>

        <Secao titulo="2. Dados que coletamos">
          <p>Coletamos apenas os dados necessários para o funcionamento do serviço:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Dados de cadastro do colaborador:</strong> nome, e-mail e telefone, usados para login e identificação na loja.</li>
            <li><strong>Dados de clientes presenciais:</strong> nome, telefone e e-mail informados pelo colaborador no momento do atendimento.</li>
            <li><strong>Localização aproximada:</strong> usada apenas para confirmar que o vendedor está na loja ao aceitar uma chamada da fila. A localização é verificada no momento da ação e não é rastreada de forma contínua.</li>
            <li><strong>Identificador de notificação (token de push):</strong> para enviar o alerta de "vendedor da vez" ao aparelho.</li>
            <li><strong>Dados de uso:</strong> registros de atendimentos, horários e eventos da fila, para auditoria e métricas da loja.</li>
          </ul>
        </Secao>

        <Secao titulo="3. Como usamos os dados">
          <ul className="list-disc space-y-1 pl-5">
            <li>Gerenciar a fila de atendimento e notificar o vendedor da vez.</li>
            <li>Registrar atendimentos e gerar leads para acompanhamento comercial da loja.</li>
            <li>Validar a presença do vendedor na loja por geolocalização ao aceitar uma chamada.</li>
            <li>Autenticar o acesso e manter a segurança da conta.</li>
            <li>Gerar relatórios e indicadores internos de desempenho.</li>
          </ul>
        </Secao>

        <Secao titulo="4. Compartilhamento">
          <p>
            Não vendemos dados pessoais. Os dados são acessíveis apenas pela própria loja/concessionária
            à qual o colaborador pertence e pelos administradores do sistema. Utilizamos provedores de
            infraestrutura para operar o serviço (hospedagem e envio de notificações), que tratam os
            dados somente para essa finalidade:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Vercel</strong> — hospedagem da aplicação.</li>
            <li><strong>Google Firebase Cloud Messaging</strong> — entrega das notificações push.</li>
          </ul>
          <p>Podemos divulgar dados quando exigido por lei ou por autoridade competente.</p>
        </Secao>

        <Secao titulo="5. Permissões do aplicativo">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Localização:</strong> confirmar a presença do vendedor na loja ao aceitar a chamada.</li>
            <li><strong>Notificações:</strong> avisar quando o colaborador é o próximo a atender.</li>
            <li><strong>Câmera (quando aplicável):</strong> anexar fotos ao atendimento, mediante ação do usuário.</li>
          </ul>
        </Secao>

        <Secao titulo="6. Retenção e segurança">
          <p>
            Os dados são mantidos enquanto a conta estiver ativa e pelo período necessário ao
            cumprimento de obrigações legais. Adotamos medidas técnicas e organizacionais para proteger
            os dados contra acesso não autorizado, perda ou alteração. O acesso é restrito por
            autenticação e por perfil de permissão.
          </p>
        </Secao>

        <Secao titulo="7. Seus direitos (LGPD)">
          <p>
            Você pode solicitar acesso, correção, portabilidade, anonimização ou exclusão dos seus dados
            pessoais, bem como revogar consentimentos. Para exercer esses direitos, entre em contato pelo
            e-mail abaixo.
          </p>
        </Secao>

        <Secao titulo="8. Exclusão de dados">
          <p>
            Para solicitar a exclusão da sua conta e dos dados associados, envie um pedido para{' '}
            <a href={`mailto:${CONTATO}`} className="font-medium text-brand-600 underline">{CONTATO}</a>.
            O pedido é atendido em até 30 dias, ressalvadas as informações que precisem ser mantidas por
            obrigação legal.
          </p>
        </Secao>

        <Secao titulo="9. Alterações desta política">
          <p>
            Esta política pode ser atualizada. A data de "última atualização" no topo indica a versão
            vigente. Mudanças relevantes serão comunicadas pelos canais do aplicativo.
          </p>
        </Secao>

        <Secao titulo="10. Contato">
          <p>
            Dúvidas sobre privacidade e proteção de dados:{' '}
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
