// =============================================================================
// AutoDrive — Seed do banco de dados
//
// Comportamento:
//   • SEMPRE: cria/atualiza o usuário MASTER lendo MASTER_EMAIL e
//     MASTER_PASSWORD do ambiente. Hash via bcryptjs (salt 12) — mesmo
//     padrão usado em src/lib/auth.ts e nas rotas de auth.
//
//   • OPCIONAL (apenas se SEED_DEMO=true): popula tenant demo, ADM demo,
//     unidade matriz, módulos, configurações globais, provider WhatsApp,
//     templates e config Google Sheets de exemplo.
//     ⚠️ NÃO rodar em produção sem ter certeza — gera dados fictícios.
//
// Idempotência:
//   Todas as operações usam `upsert` (ou findFirst + create) — pode ser
//   executado várias vezes sem duplicar dados.
//
// Segurança:
//   • A senha do MASTER NUNCA é logada (mostra apenas o e-mail).
//   • Em produção, SEMPRE setar MASTER_EMAIL e MASTER_PASSWORD via env.
//   • O fallback de senha padrão só é usado em dev local, e o seed emite
//     warning bem visível.
// =============================================================================

import { PrismaClient, UserRole, UserStatus, TenantStatus, TenantPlan } from '@prisma/client'
// O `tsconfig` deste projeto tem `esModuleInterop: true` (necessário pro
// runtime do app), mas o seed roda via ts-node com módulo CommonJS — onde
// o default-import do bcryptjs falha. Usamos namespace import por garantia.
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ── Lê configuração da env ──────────────────────────────────────────────────

const MASTER_EMAIL    = process.env.MASTER_EMAIL?.trim().toLowerCase()    || 'admin@autodrive.com.br'
const MASTER_PASSWORD = process.env.MASTER_PASSWORD                        || ''
const MASTER_NAME     = process.env.MASTER_NAME?.trim()                    || 'Administrador Master'
const MASTER_PHONE    = process.env.MASTER_PHONE?.trim()                   || null
const SEED_DEMO       = (process.env.SEED_DEMO ?? '').toLowerCase() === 'true'

// Senha padrão APENAS para desenvolvimento local. Em produção MASTER_PASSWORD
// deve sempre vir do ambiente.
const DEFAULT_DEV_PASSWORD = 'Admin@123'

function resolveMasterPassword(): { plain: string; usingDefault: boolean } {
  if (MASTER_PASSWORD && MASTER_PASSWORD.length >= 8) {
    return { plain: MASTER_PASSWORD, usingDefault: false }
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'MASTER_PASSWORD não foi definida no ambiente de produção. ' +
      'Defina MASTER_PASSWORD (mínimo 8 caracteres) antes de rodar `prisma db seed`.',
    )
  }
  return { plain: DEFAULT_DEV_PASSWORD, usingDefault: true }
}

function generatePublicId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = 'AD-'
  for (let i = 0; i < 10; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

// ── Função obrigatória: upsert do usuário MASTER ────────────────────────────

async function upsertMaster(): Promise<{ id: string; email: string }> {
  const { plain, usingDefault } = resolveMasterPassword()
  const passwordHash = await bcrypt.hash(plain, 12)

  // MASTER da plataforma NÃO tem tenantId (acesso global).
  const master = await prisma.user.upsert({
    where:  { email: MASTER_EMAIL },
    update: {
      name:               MASTER_NAME,
      passwordHash,
      role:               UserRole.MASTER,
      status:             UserStatus.ATIVO,
      mustChangePassword: false,
      phone:              MASTER_PHONE,
    },
    create: {
      name:               MASTER_NAME,
      email:              MASTER_EMAIL,
      phone:              MASTER_PHONE,
      passwordHash,
      role:               UserRole.MASTER,
      status:             UserStatus.ATIVO,
      mustChangePassword: false,
      // tenantId nulo — MASTER opera fora de qualquer tenant
    },
    select: { id: true, email: true },
  })

  console.log(`   ✓ MASTER ${master.email} (id: ${master.id})`)
  if (usingDefault) {
    console.warn(
      '\n   ⚠️  USANDO SENHA PADRÃO DE DESENVOLVIMENTO. ' +
      'Configure MASTER_PASSWORD na env para produção.\n',
    )
  }
  return master
}

// ── Seed opcional de DEMO (tenant + ADM + módulos + templates) ──────────────
//
// Só roda quando SEED_DEMO=true. Em produção (Neon/Vercel) NÃO setar essa
// variável: o banco fica limpo, apenas com o MASTER.

async function seedDemoData(masterUserId: string) {
  console.log('\n🏢 [DEMO] Criando tenant demo...')
  const tenant = await prisma.tenant.upsert({
    where:  { slug: 'autodrive-demo' },
    update: {},
    create: {
      publicId:     generatePublicId(),
      slug:         'autodrive-demo',
      name:         'AutoDrive Demo',
      razaoSocial:  'AutoDrive Veículos LTDA',
      cnpj:         '00.000.000/0001-00',
      email:        'demo@autodrive.com.br',
      phone:        '(11) 99999-0000',
      plan:         TenantPlan.CUSTOM,
      status:       TenantStatus.ATIVO,
      primaryColor: '#166534',
      slogan:       'Sua loja no piloto automático',
      responsavel:  'Administrador AutoDrive',
    },
  })
  console.log(`   ✓ Tenant: ${tenant.name} (${tenant.publicId})`)

  // Módulos do tenant demo
  const modulesToActivate = [
    'dashboard', 'pendencies', 'negotiations', 'commissions', 'communication',
    'documents', 'registrations', 'settings', 'logs',
  ]
  for (const module of modulesToActivate) {
    await prisma.tenantModule.upsert({
      where:  { tenantId_module: { tenantId: tenant.id, module } },
      update: { active: true },
      create: { tenantId: tenant.id, module, active: true },
    })
  }
  console.log(`   ✓ ${modulesToActivate.length} módulos ativados`)

  // Unidade demo
  const unit = await prisma.unit.upsert({
    where:  { cnpj: '00.000.000/0001-00' },
    update: { tenantId: tenant.id },
    create: {
      tenantId:    tenant.id,
      name:        'AutoDrive Loja Matriz',
      razaoSocial: 'AutoDrive Veículos LTDA',
      cnpj:        '00.000.000/0001-00',
      address:     'Av. Principal, 1000',
      city:        'São Paulo',
      state:       'SP',
      phone:       '(11) 99999-0000',
      email:       'matriz@autodrive.com.br',
      responsavel: 'Administrador Geral',
      active:      true,
    },
  })
  console.log(`   ✓ Unidade demo: ${unit.name}`)

  // ADM do tenant demo — senha igual à do MASTER (apenas para conveniência em dev)
  const { plain } = resolveMasterPassword()
  const admHash = await bcrypt.hash(plain, 12)
  const admUser = await prisma.user.upsert({
    where:  { email: 'adm@autodrive-demo.com.br' },
    update: {
      passwordHash: admHash,
      role:         UserRole.ADM,
      status:       UserStatus.ATIVO,
      tenantId:     tenant.id,
      unitId:       unit.id,
    },
    create: {
      name:         'Administrador Demo',
      email:        'adm@autodrive-demo.com.br',
      passwordHash: admHash,
      role:         UserRole.ADM,
      status:       UserStatus.ATIVO,
      tenantId:     tenant.id,
      unitId:       unit.id,
    },
  })
  console.log(`   ✓ ADM demo: ${admUser.email}`)

  // ── Configurações do sistema ──────────────────────────────────────────────
  const systemSettings = [
    { key: 'app_name',        value: 'AutoDrive',                     description: 'Nome da plataforma',         group: 'identity' },
    { key: 'app_slogan',      value: 'Sua loja no piloto automático', description: 'Slogan da plataforma',       group: 'identity' },
    { key: 'app_version',     value: '2.0.0',                        description: 'Versão atual',               group: 'identity' },
    { key: 'app_url',         value: 'http://localhost:3000',         description: 'URL base da aplicação',      group: 'identity' },
    { key: 'app_color_primary', value: '#166534',                     description: 'Cor primária',              group: 'identity' },
    { key: 'whatsapp_send_enabled',     value: 'false',  description: 'Habilita envio WhatsApp', group: 'whatsapp' },
    { key: 'session_timeout_minutes',   value: '480',    description: 'Timeout de sessão (min)', group: 'system'   },
    { key: 'max_login_attempts',        value: '5',      description: 'Tentativas máx. login',  group: 'system'   },
    { key: 'maintenance_mode',          value: 'false',  description: 'Modo de manutenção',      group: 'system'   },
  ]
  for (const setting of systemSettings) {
    await prisma.systemSetting.upsert({
      where:  { key: setting.key },
      update: { value: setting.value, description: setting.description, updatedByUserId: masterUserId },
      create: { ...setting, updatedByUserId: masterUserId },
    })
  }
  console.log(`   ✓ ${systemSettings.length} configurações iniciais`)

  // Preferência de notificação do master
  await prisma.notificationPreference.upsert({
    where:  { userId: masterUserId },
    update: {},
    create: {
      userId:         masterUserId,
      appWeb:         true,
      appMobile:      false,
      whatsapp:       false,
      email:          false,
      push:           false,
      newPendency:    true,
      pendencyUrgent: true,
      commissionPaid: true,
      systemAlerts:   true,
    },
  })
  console.log(`   ✓ Preferências do MASTER ajustadas`)
}

// ── Entrypoint ──────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 AutoDrive — Iniciando seed...')
  console.log(`   Ambiente: ${process.env.NODE_ENV ?? 'development'}`)
  console.log(`   Dados demo: ${SEED_DEMO ? 'sim (SEED_DEMO=true)' : 'não'}\n`)

  console.log('👤 Garantindo usuário MASTER...')
  const master = await upsertMaster()

  if (SEED_DEMO) {
    await seedDemoData(master.id)
  }

  console.log('\n' + '═'.repeat(60))
  console.log('✅ AutoDrive seed concluído com sucesso!')
  console.log('═'.repeat(60))
  console.log(`\n📌 Login MASTER: ${master.email}`)
  console.log('   (a senha NÃO é exibida — use a definida em MASTER_PASSWORD)\n')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
