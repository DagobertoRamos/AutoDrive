#!/usr/bin/env node
// =============================================================================
// scripts/autoconf-token.js — lê, cria ou troca o token de integração que a
// extensão do Chrome usa no header `x-autoconf-token`.
//
// O token NÃO fica em variável de ambiente: ele mora no banco, em
// SystemSetting, na chave `t:<tenantId>:autoconf_token` (veja
// src/lib/integrations/autoconf.ts). Por isso não adianta procurar no .env.
//
// Uso, dentro da pasta do AutoDrive:
//   node scripts/autoconf-token.js              → mostra o(s) token(s) atuais
//   node scripts/autoconf-token.js --novo       → gera um novo (invalida o antigo)
//   node scripts/autoconf-token.js --novo --tenant=easycar-sp
//
// Depois de gerar, cole o token no popup da extensão e clique em Salvar.
// =============================================================================
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// --- .env sem depender do pacote dotenv -------------------------------------
for (const arq of ['.env.local', '.env']) {
  const p = path.resolve(process.cwd(), arq)
  if (!fs.existsSync(p)) continue
  for (const linha of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
  }
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não encontrada. Rode este comando de dentro da pasta do AutoDrive.')
  process.exit(1)
}

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const args = process.argv.slice(2)
const querNovo = args.includes('--novo')
const alvo = (args.find((a) => a.startsWith('--tenant=')) || '').split('=')[1] || null

const novoToken = () => 'acd_' + crypto.randomBytes(24).toString('hex')
const chave = (tenantId) => `t:${tenantId}:autoconf_token`

;(async () => {
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true, name: true } })
  if (!tenants.length) { console.error('Nenhuma loja (tenant) cadastrada no banco.'); process.exit(1) }

  const atuais = await prisma.systemSetting.findMany({
    where: { key: { endsWith: ':autoconf_token' } },
    select: { key: true, value: true },
  })
  const porTenant = new Map(atuais.map((r) => [(r.key.match(/^t:(.+):autoconf_token$/) || [])[1], r.value]))

  // --- só listar -------------------------------------------------------------
  if (!querNovo) {
    console.log('\nTokens do AutoConf cadastrados:\n')
    for (const t of tenants) {
      const tok = porTenant.get(t.id)
      console.log(`  ${t.name} (${t.slug})`)
      console.log(`    ${tok ? tok : '— nenhum token cadastrado —'}\n`)
    }
    console.log('Cole o token no popup da extensão e clique em Salvar.')
    console.log('Para gerar um novo (o antigo para de funcionar): node scripts/autoconf-token.js --novo\n')
    await prisma.$disconnect()
    return
  }

  // --- gerar novo ------------------------------------------------------------
  let tenant = tenants[0]
  if (alvo) {
    tenant = tenants.find((t) => t.slug === alvo || t.id === alvo)
    if (!tenant) { console.error(`Loja "${alvo}" não encontrada.`); process.exit(1) }
  } else if (tenants.length > 1) {
    console.error('Há mais de uma loja. Escolha com --tenant=<slug>:')
    tenants.forEach((t) => console.error(`  ${t.slug}  (${t.name})`))
    process.exit(1)
  }

  const token = novoToken()
  const k = chave(tenant.id)
  const existe = await prisma.systemSetting.findFirst({ where: { key: k }, select: { id: true } })
  if (existe) await prisma.systemSetting.update({ where: { id: existe.id }, data: { value: token } })
  else await prisma.systemSetting.create({ data: { key: k, value: token, group: 'integrations', tenantId: tenant.id, description: 'Token da extensão AutoConf → AutoDrive' } })

  console.log(`\nToken novo para ${tenant.name} (${tenant.slug}):\n`)
  console.log(`  ${token}\n`)
  console.log('Cole no popup da extensão → Token do AutoDrive → Salvar → Testar token.')
  if (existe) console.log('Atenção: o token anterior desta loja acabou de deixar de funcionar.\n')
  await prisma.$disconnect()
})().catch(async (e) => {
  console.error('\nDeu erro:', e.message || e)
  await prisma.$disconnect()
  process.exit(1)
})
