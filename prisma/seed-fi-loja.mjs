// =============================================================================
// Seed de EXEMPLO do lado da LOJA (F&I) — tenant-scoped. Idempotente.
// Cria: bancos da loja, prioridades, retornos, documentos obrigatórios,
// permissões, proponentes, 1 simulação comparativa e 3 fichas (com documentos
// e submissão). NÃO cria credenciais (sensíveis — cadastrar em Config > F&I).
// Rodar:  node prisma/seed-fi-loja.mjs [tenantId]
// =============================================================================

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const TENANT_ID = process.argv[2] || 'cmpfxjs8q000151n87dlnf6rz'

// Tabela Price (parcela) — inline para o seed.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
function pmt(P, ratePct, n) {
  const r = (ratePct || 0) / 100
  if (P <= 0 || n <= 0) return 0
  return r === 0 ? round2(P / n) : round2((P * r) / (1 - Math.pow(1 + r, -n)))
}

const BANK_NAMES = ['Santander', 'BV Financeira', 'Banco Pan', 'Itaú']

async function ensureBank(name) {
  let b = await prisma.financeBank.findFirst({ where: { tenantId: TENANT_ID, name }, select: { id: true } })
  if (!b) b = await prisma.financeBank.create({ data: { tenantId: TENANT_ID, name, active: true }, select: { id: true } })
  return b.id
}

async function ensureProponent(p) {
  let row = await prisma.financeProponent.findFirst({ where: { tenantId: TENANT_ID, cpf: p.cpf }, select: { id: true } })
  if (!row) row = await prisma.financeProponent.create({ data: { tenantId: TENANT_ID, ...p }, select: { id: true } })
  return row.id
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { id: true, name: true } })
  if (!tenant) throw new Error(`Tenant ${TENANT_ID} não encontrado.`)
  console.log(`Loja: ${tenant.name} (${TENANT_ID})`)

  // ── Bancos da loja ──
  const bankIds = {}
  for (const name of BANK_NAMES) bankIds[name] = await ensureBank(name)

  // ── Prioridades de envio (upsert por banco) ──
  let order = 1
  for (const name of BANK_NAMES) {
    await prisma.financeBankPriority.upsert({
      where: { tenantId_bankId: { tenantId: TENANT_ID, bankId: bankIds[name] } },
      update: { priority: order, active: true },
      create: { tenantId: TENANT_ID, bankId: bankIds[name], priority: order, active: true },
    })
    order++
  }

  // ── Retornos por banco (cria só se ainda não houver nenhum) ──
  if ((await prisma.financeReturnRule.count({ where: { tenantId: TENANT_ID } })) === 0) {
    await prisma.financeReturnRule.createMany({ data: [
      { tenantId: TENANT_ID, bankId: null, percent: 2.0, fixedValue: 0, active: true },
      { tenantId: TENANT_ID, bankId: bankIds['Santander'], percent: 2.5, minInstallments: 1, maxInstallments: 48, active: true },
      { tenantId: TENANT_ID, bankId: bankIds['BV Financeira'], percent: 2.2, fixedValue: 150, minInstallments: 1, maxInstallments: 60, active: true },
    ] })
  }

  // ── Documentos obrigatórios + Permissões (upsert por chave) ──
  const requiredDocs = { TODOS: ['RG', 'CPF', 'Comprovante de residência'], CLT: ['Holerite', 'Carteira de Trabalho'], AUTONOMO: ['Declaração de renda'], EMPRESARIO: ['Contrato social', 'Faturamento'], APOSENTADO_PENSIONISTA: ['Extrato do benefício (INSS)'] }
  await prisma.financeTenantSetting.upsert({ where: { tenantId_key: { tenantId: TENANT_ID, key: 'required_documents' } }, update: { value: requiredDocs }, create: { tenantId: TENANT_ID, key: 'required_documents', value: requiredDocs } })
  const permissions = { enviarFicha: [], aprovar: ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO'], alterarRetorno: ['ADM', 'FINANCEIRO'] }
  await prisma.financeTenantSetting.upsert({ where: { tenantId_key: { tenantId: TENANT_ID, key: 'permissions' } }, update: { value: permissions }, create: { tenantId: TENANT_ID, key: 'permissions', value: permissions } })

  // ── Proponentes ──
  const joao = await ensureProponent({ nomeCompleto: 'João da Silva', cpf: '11122233344', rg: '12.345.678-9', dataNascimento: new Date('1988-04-12'), nomeMae: 'Maria da Silva', nomePai: 'José da Silva', email: 'joao.silva@example.com', celular: '11988887777', cep: '01001000', logradouro: 'Praça da Sé', bairro: 'Sé', cidade: 'São Paulo', estado: 'SP', numero: '100', occupation: 'CLT', cargo: 'Analista', renda: 5200, empresaNome: 'ACME Ltda' })
  const ana = await ensureProponent({ nomeCompleto: 'Ana Pereira', cpf: '22233344455', rg: '23.456.789-0', dataNascimento: new Date('1992-09-03'), nomeMae: 'Clara Pereira', nomePai: 'Paulo Pereira', email: 'ana.pereira@example.com', celular: '11977776666', cep: '20040002', logradouro: 'Av. Rio Branco', bairro: 'Centro', cidade: 'Rio de Janeiro', estado: 'RJ', numero: '250', occupation: 'AUTONOMO', cargo: 'Designer', renda: 6800 })
  const carlos = await ensureProponent({ nomeCompleto: 'Carlos Souza', cpf: '33344455566', rg: '34.567.890-1', dataNascimento: new Date('1959-01-20'), nomeMae: 'Rita Souza', nomePai: 'Antônio Souza', email: 'carlos.souza@example.com', celular: '11966665555', cep: '30110002', logradouro: 'Av. Afonso Pena', bairro: 'Centro', cidade: 'Belo Horizonte', estado: 'MG', numero: '1500', occupation: 'APOSENTADO_PENSIONISTA', numeroBeneficio: '123.456.789-0', renda: 3100 })

  // Marcador de idempotência das fichas/simulações.
  const already = await prisma.financeProposal.findFirst({ where: { tenantId: TENANT_ID, notes: { contains: '[seed]' } }, select: { id: true } })
  if (already) {
    console.log('Fichas/simulações de exemplo já existem — pulando essa parte.')
  } else {
    // ── Simulação comparativa (João) ──
    const financed = 40000
    const sim = await prisma.financeSimulation.create({ data: {
      tenantId: TENANT_ID, proponentId: joao, vehicle: 'VW Polo 2021', vehicleValue: 55000, downPayment: 15000, financedAmount: financed, installments: 48, notes: '[seed] simulação exemplo',
      options: { create: [
        { bankId: bankIds['Santander'], installments: 48, rate: 1.99, installmentValue: pmt(financed, 1.99, 48), estimatedReturn: round2(financed * 0.025) },
        { bankId: bankIds['BV Financeira'], installments: 48, rate: 2.15, installmentValue: pmt(financed, 2.15, 48), estimatedReturn: round2(financed * 0.022 + 150) },
        { bankId: bankIds['Banco Pan'], installments: 48, rate: 2.40, installmentValue: pmt(financed, 2.40, 48), estimatedReturn: round2(financed * 0.02) },
      ] },
    }, select: { id: true } })

    // ── Ficha 1 (João) — APROVADA, docs aprovados ──
    const f1 = await prisma.financeProposal.create({ data: {
      tenantId: TENANT_ID, proponentId: joao, bankId: bankIds['Santander'], vehicle: 'VW Polo 2021', amountRequested: 40000, downPayment: 15000, installments: 48, status: 'APROVADA', approvedValue: 40000, monthlyPayment: pmt(40000, 1.99, 48), notes: '[seed] ficha aprovada',
    }, select: { id: true } })
    await prisma.financeProposalDocument.createMany({ data: [
      { tenantId: TENANT_ID, proposalId: f1.id, proponentId: joao, type: 'RG', required: true, status: 'APROVADO' },
      { tenantId: TENANT_ID, proposalId: f1.id, proponentId: joao, type: 'CPF', required: true, status: 'APROVADO' },
      { tenantId: TENANT_ID, proposalId: f1.id, proponentId: joao, type: 'Comprovante de residência', required: true, status: 'APROVADO' },
      { tenantId: TENANT_ID, proposalId: f1.id, proponentId: joao, type: 'Holerite', required: true, status: 'APROVADO' },
    ] })
    const sub1 = await prisma.financeProposalSubmission.create({ data: { tenantId: TENANT_ID, proposalId: f1.id, bankId: bankIds['Santander'], environment: 'HOMOLOGACAO', status: 'APROVADA', externalId: 'SANT-2026-0001' }, select: { id: true } })
    await prisma.financeProposalEvent.createMany({ data: [
      { tenantId: TENANT_ID, proposalId: f1.id, submissionId: sub1.id, type: 'STATUS_CHANGE', status: 'ENVIADA', message: 'Ficha enviada (registro manual).', source: 'MANUAL' },
      { tenantId: TENANT_ID, proposalId: f1.id, submissionId: sub1.id, type: 'STATUS_CHANGE', status: 'APROVADA', message: 'Aprovada pelo banco.', source: 'MANUAL' },
    ] })

    // ── Ficha 2 (Ana) — ENVIADA, doc pendente ──
    const f2 = await prisma.financeProposal.create({ data: {
      tenantId: TENANT_ID, proponentId: ana, bankId: bankIds['BV Financeira'], vehicle: 'Hyundai HB20 2022', amountRequested: 52000, downPayment: 12000, installments: 60, status: 'ENVIADA', notes: '[seed] ficha enviada',
    }, select: { id: true } })
    await prisma.financeProposalDocument.createMany({ data: [
      { tenantId: TENANT_ID, proposalId: f2.id, proponentId: ana, type: 'RG', required: true, status: 'APROVADO' },
      { tenantId: TENANT_ID, proposalId: f2.id, proponentId: ana, type: 'CPF', required: true, status: 'PENDENTE' },
      { tenantId: TENANT_ID, proposalId: f2.id, proponentId: ana, type: 'Declaração de renda', required: true, status: 'PENDENTE' },
    ] })
    const sub2 = await prisma.financeProposalSubmission.create({ data: { tenantId: TENANT_ID, proposalId: f2.id, bankId: bankIds['BV Financeira'], environment: 'HOMOLOGACAO', status: 'EM_ANALISE', externalId: 'BV-2026-0042' }, select: { id: true } })
    await prisma.financeProposalEvent.create({ data: { tenantId: TENANT_ID, proposalId: f2.id, submissionId: sub2.id, type: 'STATUS_CHANGE', status: 'ENVIADA', message: 'Ficha enviada (registro manual).', source: 'MANUAL' } })

    // ── Ficha 3 (Carlos) — SIMULAÇÃO ──
    await prisma.financeProposal.create({ data: {
      tenantId: TENANT_ID, proponentId: carlos, bankId: bankIds['Itaú'], vehicle: 'Fiat Argo 2020', amountRequested: 30000, downPayment: 8000, installments: 36, status: 'SIMULACAO', notes: '[seed] ficha simulação',
    } })

    console.log(`Simulação ${sim.id} + 3 fichas criadas.`)
  }

  const totals = {
    bancosLoja: await prisma.financeBank.count({ where: { tenantId: TENANT_ID } }),
    prioridades: await prisma.financeBankPriority.count({ where: { tenantId: TENANT_ID } }),
    retornos: await prisma.financeReturnRule.count({ where: { tenantId: TENANT_ID } }),
    proponentes: await prisma.financeProponent.count({ where: { tenantId: TENANT_ID } }),
    simulacoes: await prisma.financeSimulation.count({ where: { tenantId: TENANT_ID } }),
    fichas: await prisma.financeProposal.count({ where: { tenantId: TENANT_ID } }),
  }
  console.log('Totais da loja agora:', totals)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
