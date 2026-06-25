// =============================================================================
// /excluir-conta — Página pública de solicitação de exclusão de conta e dados.
// Exigida pelo Google Play (Data safety → URL de exclusão de contas).
// Deve: citar o app, detalhar os passos e dizer quais dados são excluídos/mantidos.
// =============================================================================

import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Excluir conta e dados — AutoDrive',
  description: 'Como solicitar a exclusão da sua conta e dos seus dados no AutoDrive.',
}

const CONTATO = 'beto1910@gmail.com'

export default function ExcluirConta() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm sm:p-10">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Excluir conta e dados — AutoDrive</h1>
        <p className="mb-8 text-sm text-gray-500">Solicitação de exclusão de conta e de dados pessoais do aplicativo AutoDrive.</p>

        <section className="mb-7 space-y-2 text-[15px] leading-relaxed text-gray-700">
          <p>
            O <strong>AutoDrive</strong> é um aplicativo de gestão de atendimento para concessionárias e
            lojas de veículos. Você pode solicitar a exclusão da sua conta e dos dados pessoais
            associados a ela a qualquer momento, seguindo os passos abaixo.
          </p>
        </section>

        <section className="mb-7">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Como solicitar a exclusão</h2>
          <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-gray-700">
            <li>
              Envie um e-mail para{' '}
              <a href={`mailto:${CONTATO}?subject=Exclusão%20de%20conta%20-%20AutoDrive`} className="font-medium text-brand-600 underline">{CONTATO}</a>{' '}
              com o assunto <strong>“Exclusão de conta - AutoDrive”</strong>.
            </li>
            <li>
              No corpo do e-mail, informe o <strong>e-mail de cadastro</strong> usado no aplicativo e o
              <strong> nome completo</strong>, para confirmarmos a sua identidade.
            </li>
            <li>
              Você receberá a confirmação do recebimento e a exclusão será concluída em até
              <strong> 30 dias</strong>.
            </li>
          </ol>
        </section>

        <section className="mb-7">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Dados que são excluídos</h2>
          <ul className="list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-gray-700">
            <li>Dados de cadastro: nome, e-mail e telefone.</li>
            <li>Identificadores de notificação (token de push) do aparelho.</li>
            <li>Dados de localização associados às ações na fila de atendimento.</li>
            <li>Preferências e configurações pessoais da conta.</li>
          </ul>
        </section>

        <section className="mb-7">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Dados que podem ser mantidos</h2>
          <p className="text-[15px] leading-relaxed text-gray-700">
            Registros de atendimentos e transações comerciais podem ser mantidos de forma
            <strong> anonimizada ou agregada</strong> quando houver obrigação legal, fiscal ou contábil
            (em geral pelo prazo exigido pela legislação aplicável, normalmente até 5 anos). Esses
            registros deixam de ser vinculados à sua identidade após a exclusão da conta.
          </p>
        </section>

        <section className="mb-7">
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Contato</h2>
          <p className="text-[15px] leading-relaxed text-gray-700">
            Dúvidas sobre exclusão e proteção de dados:{' '}
            <a href={`mailto:${CONTATO}`} className="font-medium text-brand-600 underline">{CONTATO}</a>.
            Consulte também a nossa{' '}
            <Link href="/privacidade" className="font-medium text-brand-600 underline">Política de Privacidade</Link>.
          </p>
        </section>

        <div className="mt-8 border-t border-gray-100 pt-6 text-sm">
          <Link href="/login" className="text-brand-600 hover:underline">← Voltar ao AutoDrive</Link>
        </div>
      </div>
    </main>
  )
}
