// =============================================================================
// Seed de EXEMPLO do painel Master > F&I (provedores, bancos homologados, flags).
// Idempotente: não duplica (procura por nome/chave antes de criar). GLOBAL
// (sem tenant). NÃO cria credenciais (são da loja). Rodar:
//   node prisma/seed-fi-master.mjs
// =============================================================================

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const PROVIDERS = [
  { name: 'Credere', kind: 'INTEGRADOR', active: true, apiVersion: '2.0',
    baseUrlHomolog: 'https://sandbox.api.credere.com.br', baseUrlProd: 'https://api.credere.com.br',
    supportsSimulate: true, supportsSubmit: true, supportsWebhook: true, supportsStatus: true,
    notes: 'Integrador de crédito (exemplo). Integração real requer credenciais oficiais.',
    banks: ['Santander', 'BV Financeira', 'Banco Pan', 'Omni', 'Itaú', 'Bradesco Financiamentos'] },
  { name: 'Santander Financiamentos', kind: 'BANCO_DIRETO', active: true, apiVersion: '1.0',
    baseUrlHomolog: 'https://homolog.santander.com.br/fin', baseUrlProd: 'https://api.santander.com.br/fin',
    supportsSimulate: true, supportsSubmit: true, supportsWebhook: false, supportsStatus: true,
    notes: 'Banco direto (exemplo).', banks: ['Santander'] },
  { name: 'BV Financeira', kind: 'BANCO_DIRETO', active: true, apiVersion: '1.0',
    baseUrlHomolog: '', baseUrlProd: '',
    supportsSimulate: true, supportsSubmit: true, supportsWebhook: true, supportsStatus: true,
    notes: 'Banco direto (exemplo).', banks: ['BV Financeira'] },
  { name: 'Registro Manual', kind: 'MANUAL', active: true, apiVersion: '',
    baseUrlHomolog: '', baseUrlProd: '',
    supportsSimulate: false, supportsSubmit: false, supportsWebhook: false, supportsStatus: false,
    notes: 'Fluxo manual supervisionado — sempre disponível, sem integração externa.', banks: [] },
]

const FLAGS = [
  { key: 'fi_simulacao_comparativa', name: 'Simulação comparativa', enabled: true, rolloutPct: 100, notes: 'Habilita o comparativo de parcelas por banco.' },
  { key: 'fi_envio_multibanco', name: 'Envio multi-banco', enabled: true, rolloutPct: 100, notes: 'Permite enviar a ficha a vários bancos.' },
  { key: 'fi_credere_api', name: 'Integração Credere (API)', enabled: false, rolloutPct: 0, notes: 'Liga a integração real da Credere (requer credenciais oficiais).' },
]

async function main() {
  let createdP = 0, createdB = 0, createdF = 0
  for (const p of PROVIDERS) {
    const { banks, ...data } = p
    let provider = await prisma.financeProvider.findFirst({ where: { name: data.name }, select: { id: true } })
    if (!provider) { provider = await prisma.financeProvider.create({ data, select: { id: true } }); createdP++ }
    for (const bankName of banks) {
      const exists = await prisma.financeProviderBank.findFirst({ where: { providerId: provider.id, name: bankName }, select: { id: true } })
      if (!exists) { await prisma.financeProviderBank.create({ data: { providerId: provider.id, name: bankName, active: true } }); createdB++ }
    }
  }
  for (const f of FLAGS) {
    const exists = await prisma.featureFlag.findUnique({ where: { key: f.key }, select: { id: true } })
    if (!exists) { await prisma.featureFlag.create({ data: f }); createdF++ }
  }
  const totals = {
    provedores: await prisma.financeProvider.count(),
    bancosHomologados: await prisma.financeProviderBank.count(),
    flags: await prisma.featureFlag.count({ where: { key: { startsWith: 'fi_' } } }),
  }
  console.log(`Seed F&I Master: +${createdP} provedores, +${createdB} bancos, +${createdF} flags.`)
  console.log('Totais agora:', totals)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
