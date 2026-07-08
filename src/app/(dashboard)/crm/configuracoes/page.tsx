import { CRM_STAGE_OPTIONS } from '@/lib/crm/shared'

const ORIGINS = ['MANUAL', 'FILA_ATENDIMENTO', 'SDR', 'WHATSAPP', 'EMAIL', 'WEBSITE', 'WEBMOTORS', 'IMPORTACAO_AUTOCONF', 'VENDA_IMPORTADA']

export default function CrmConfiguracoesPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Configurações do CRM</h1>
        <p className="mt-0.5 text-sm text-gray-500">Base inicial reaproveitada do módulo SDR, fila e negociações. Sem schema novo nesta fase.</p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <h2 className="text-sm font-semibold text-gray-900">Etapas reaproveitadas</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {CRM_STAGE_OPTIONS.map((item) => (
            <div key={item.value} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">{item.label}</p>
              <p className="text-xs text-gray-500">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <h2 className="text-sm font-semibold text-gray-900">Origens já suportadas na base</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {ORIGINS.map((item) => (
            <span key={item} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">{item}</span>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <h2 className="text-sm font-semibold text-gray-900">Reaproveitamento desta fase</h2>
        <div className="mt-3 space-y-2 text-sm text-gray-600">
          <p>`MarketingLead` é a entidade central de lead e continua sendo usada como base do CRM.</p>
          <p>`SellerQueueAttendance` abastece CRM &gt; Atendimentos e a finalização da fila já chama `ensureAttendanceLead` para gerar/vincular lead e negociação.</p>
          <p>Mesa SDR, clientes, negociações e importações AutoConf seguem conectados para as próximas fases.</p>
        </div>
      </section>
    </div>
  )
}
