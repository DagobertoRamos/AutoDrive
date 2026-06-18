// =============================================================================
// Seed de EXEMPLO — Produtos Agregados do F&I (tenant-scoped). Idempotente.
// Rodar:  node prisma/seed-fi-produtos.mjs [tenantId]
// =============================================================================

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const TENANT_ID = process.argv[2] || 'cmpfxjs8q000151n87dlnf6rz'

const PRODUCTS = [
  { name: 'Garantia Estendida 12 meses', kind: 'GARANTIA', defaultValue: 1500 },
  { name: 'Garantia Premium 24 meses', kind: 'GARANTIA', defaultValue: 2500 },
  { name: 'Seguro Auto (12 meses)', kind: 'SEGURO', defaultValue: 1800 },
  { name: 'Seguro Prestamista', kind: 'SEGURO', defaultValue: 600 },
  { name: 'Proteção Financeira', kind: 'PROTECAO', defaultValue: 900 },
  { name: 'Rastreador Veicular', kind: 'RASTREADOR', defaultValue: 1200 },
]

async function main() {
  const t = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } })
  if (!t) throw new Error(`Tenant ${TENANT_ID} não encontrado.`)
  let created = 0
  for (const p of PRODUCTS) {
    const exists = await prisma.financeProduct.findFirst({ where: { tenantId: TENANT_ID, name: p.name }, select: { id: true } })
    if (!exists) { await prisma.financeProduct.create({ data: { tenantId: TENANT_ID, ...p, active: true } }); created++ }
  }
  const total = await prisma.financeProduct.count({ where: { tenantId: TENANT_ID } })
  console.log(`Loja: ${t.name} — +${created} produtos. Total agora: ${total}.`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
