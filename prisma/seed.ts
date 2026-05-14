// =============================================================================
// AutoDrive — Seed do banco de dados
// Popula dados iniciais: tenant, unidade, usuário master, configurações, templates
// =============================================================================

import { PrismaClient, UserRole, UserStatus, TenantStatus, TenantPlan } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Gera um publicId no formato AD-XXXXXXXXXX
function generatePublicId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = 'AD-'
  for (let i = 0; i < 10; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

async function main() {
  console.log('\n🚀 AutoDrive — Iniciando seed...\n')

  // ── 0. Tenant padrão (demo) ────────────────────────────────────────────────
  console.log('🏢 Criando tenant padrão...')
  const tenant = await prisma.tenant.upsert({
    where:  { slug: 'autodrive-demo' },
    update: {},
    create: {
      publicId:   generatePublicId(),
      slug:       'autodrive-demo',
      name:       'AutoDrive Demo',
      razaoSocial:'AutoDrive Veículos LTDA',
      cnpj:       '00.000.000/0001-00',
      email:      'demo@autodrive.com.br',
      phone:      '(11) 99999-0000',
      plan:       TenantPlan.CUSTOM,
      status:     TenantStatus.ATIVO,
      primaryColor: '#166534',
      slogan:     'Sua loja no piloto automático',
      responsavel:'Administrador AutoDrive',
    },
  })
  console.log(`   ✓ Tenant: ${tenant.name} (${tenant.publicId})`)

  // ── 1. Módulos do tenant ───────────────────────────────────────────────────
  console.log('\n🔧 Ativando módulos do tenant demo...')
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

  // ── 2. Unidade padrão ──────────────────────────────────────────────────────
  console.log('\n📍 Criando unidade padrão...')
  const unit = await prisma.unit.upsert({
    where:  { cnpj: '00.000.000/0001-00' },
    update: { tenantId: tenant.id },
    create: {
      tenantId:   tenant.id,
      name:       'AutoDrive Loja Matriz',
      razaoSocial:'AutoDrive Veículos LTDA',
      cnpj:       '00.000.000/0001-00',
      address:    'Av. Principal, 1000',
      city:       'São Paulo',
      state:      'SP',
      phone:      '(11) 99999-0000',
      email:      'matriz@autodrive.com.br',
      responsavel:'Administrador Geral',
      active:     true,
    },
  })
  console.log(`   ✓ ${unit.name} (${unit.id})`)

  // ── 3. Usuário MASTER (plataforma — sem tenant) ────────────────────────────
  console.log('\n👤 Criando usuário master da plataforma...')
  const passwordHash = await bcrypt.hash('Admin@123', 12)

  const masterUser = await prisma.user.upsert({
    where:  { email: 'admin@autodrive.com.br' },
    update: { passwordHash, role: UserRole.MASTER, status: UserStatus.ATIVO },
    create: {
      name:        'Administrador Master',
      email:       'admin@autodrive.com.br',
      phone:       '(11) 99999-9999',
      passwordHash,
      role:        UserRole.MASTER,
      status:      UserStatus.ATIVO,
      // MASTER da plataforma não tem tenantId (acesso global)
    },
  })
  console.log(`   ✓ ${masterUser.email} — role: MASTER (plataforma)`)

  // Usuário ADM do tenant demo
  const admUser = await prisma.user.upsert({
    where:  { email: 'adm@autodrive-demo.com.br' },
    update: { passwordHash, role: UserRole.ADM, status: UserStatus.ATIVO, tenantId: tenant.id, unitId: unit.id },
    create: {
      name:        'Administrador Demo',
      email:       'adm@autodrive-demo.com.br',
      passwordHash,
      role:        UserRole.ADM,
      status:      UserStatus.ATIVO,
      tenantId:    tenant.id,
      unitId:      unit.id,
    },
  })
  console.log(`   ✓ ${admUser.email} — role: ADM (tenant demo)`)

  // Compatibilidade com seed antigo
  await prisma.user.upsert({
    where:  { email: 'admin@easycar.com' },
    update: { passwordHash, role: UserRole.MASTER, status: UserStatus.ATIVO },
    create: {
      name:        'Admin Legado',
      email:       'admin@easycar.com',
      passwordHash,
      role:        UserRole.MASTER,
      status:      UserStatus.ATIVO,
    },
  }).catch(() => {})

  // ── 4. Configurações do sistema ────────────────────────────────────────────
  console.log('\n⚙️  Criando configurações do sistema...')

  const systemSettings = [
    // Identidade da plataforma
    { key: 'app_name',        value: 'AutoDrive',                     description: 'Nome da plataforma',         group: 'identity' },
    { key: 'app_slogan',      value: 'Sua loja no piloto automático', description: 'Slogan da plataforma',       group: 'identity' },
    { key: 'app_version',     value: '2.0.0',                        description: 'Versão atual',               group: 'identity' },
    { key: 'app_url',         value: 'http://localhost:3000',         description: 'URL base da aplicação',      group: 'identity' },
    { key: 'app_company',     value: 'AutoDrive',                     description: 'Empresa operadora',          group: 'identity' },
    { key: 'app_logo_url',    value: '/logos/autodrive-logo.png',     description: 'Caminho do logo',            group: 'identity' },
    { key: 'app_symbol_url',  value: '/logos/autodrive-symbol.png',   description: 'Símbolo sidebar',           group: 'identity' },
    { key: 'app_color_primary', value: '#166534',                     description: 'Cor primária',              group: 'identity' },

    // WhatsApp
    { key: 'whatsapp_send_enabled',          value: 'false',          description: 'Habilita envio WhatsApp',   group: 'whatsapp' },
    { key: 'whatsapp_max_sends_per_day',     value: '3',              description: 'Máx. envios/dia',           group: 'whatsapp' },
    { key: 'whatsapp_send_start_time',       value: '08:00',          description: 'Início do horário',         group: 'whatsapp' },
    { key: 'whatsapp_send_end_time',         value: '20:00',          description: 'Fim do horário',            group: 'whatsapp' },
    { key: 'whatsapp_allowed_days',          value: '1,2,3,4,5,6',   description: 'Dias permitidos',           group: 'whatsapp' },
    { key: 'whatsapp_default_provider_id',   value: '',               description: 'ID do provedor padrão',     group: 'whatsapp' },

    // Google Sheets
    { key: 'sheets_import_enabled',        value: 'false',            description: 'Importação automática',     group: 'sheets' },
    { key: 'sheets_sync_interval_minutes', value: '30',               description: 'Intervalo de sync (min)',   group: 'sheets' },
    { key: 'sheets_last_sync_at',          value: '',                 description: 'Última importação',         group: 'sheets' },

    // E-mail
    { key: 'email_enabled',       value: 'false',                     description: 'Envio de e-mails',          group: 'email' },
    { key: 'email_from_name',     value: 'AutoDrive',                 description: 'Nome do remetente',         group: 'email' },
    { key: 'email_from_address',  value: 'noreply@autodrive.com.br',  description: 'E-mail remetente',          group: 'email' },

    // Notificações
    { key: 'notification_web_enabled',      value: 'true',            description: 'Notificações web',          group: 'notification' },
    { key: 'notification_email_enabled',    value: 'false',           description: 'Notificações e-mail',       group: 'notification' },
    { key: 'notification_whatsapp_enabled', value: 'false',           description: 'Notificações WhatsApp',     group: 'notification' },
    { key: 'notification_escalation_hours', value: '48',              description: 'Horas para escalonamento',  group: 'notification' },

    // Comissões
    { key: 'commission_enabled',           value: 'false',            description: 'Módulo comissões',          group: 'commission' },
    { key: 'commission_payment_day',       value: '10',               description: 'Dia de pagamento',          group: 'commission' },
    { key: 'commission_approval_required', value: 'true',             description: 'Exige aprovação',           group: 'commission' },

    // PDF
    { key: 'pdf_extraction_enabled',       value: 'false',            description: 'Leitura de PDFs',           group: 'documents' },

    // Sistema
    { key: 'session_timeout_minutes',      value: '480',              description: 'Timeout de sessão (min)',   group: 'system' },
    { key: 'max_login_attempts',           value: '5',                description: 'Tentativas máx. login',    group: 'system' },
    { key: 'password_reset_expiry_hours',  value: '24',               description: 'Validade link reset (h)',  group: 'system' },
    { key: 'maintenance_mode',             value: 'false',            description: 'Modo de manutenção',       group: 'system' },
    { key: 'log_retention_days',           value: '90',               description: 'Retenção de logs (dias)',  group: 'system' },
  ]

  let settingsCount = 0
  for (const setting of systemSettings) {
    await prisma.systemSetting.upsert({
      where:  { key: setting.key },
      update: { value: setting.value, description: setting.description, updatedByUserId: masterUser.id },
      create: { ...setting, updatedByUserId: masterUser.id },
    })
    settingsCount++
  }
  console.log(`   ✓ ${settingsCount} configurações criadas/atualizadas`)

  // ── 5. Provedor WhatsApp Meta ──────────────────────────────────────────────
  console.log('\n📱 Criando provedor WhatsApp Meta...')
  const whatsappProvider = await prisma.whatsappProvider.upsert({
    where:  { id: 'default-meta-provider' },
    update: {},
    create: {
      id:                  'default-meta-provider',
      name:                'Meta WhatsApp Business API',
      active:              false,
      apiVersion:          'v20.0',
      phoneNumberId:       '',
      businessAccountId:   '',
      accessToken:         '',
      webhookVerifyToken:  'autodrive_webhook_token_change_me',
      useOfficialTemplates:true,
      language:            'pt_BR',
      fallbackToText:      true,
    },
  })

  await prisma.systemSetting.update({
    where: { key: 'whatsapp_default_provider_id' },
    data:  { value: whatsappProvider.id },
  })
  console.log(`   ✓ ${whatsappProvider.name}`)

  // ── 6. Templates WhatsApp padrão ──────────────────────────────────────────
  console.log('\n📝 Criando templates WhatsApp...')

  const templates = [
    {
      name:               'Pendência de Entrega',
      description:        'Lembrete de entrega de documento ou veículo',
      templateName:       'autodrive_entrega_pendente',
      bodyText:           'Olá {{1}}, temos uma pendência de entrega referente ao veículo {{2}} ({{3}}). Por favor, entre em contato com {{4}} da {{5}}.',
      variables:          ['cliente', 'veiculo', 'placa', 'vendedor', 'loja'],
      expectedParamsCount:5,
      active:             true,
    },
    {
      name:               'Follow-up de Negociação',
      description:        'Acompanhamento automático de negociação em aberto',
      templateName:       'autodrive_followup',
      bodyText:           'Olá {{1}}, tudo bem? Gostaríamos de saber se ainda tem interesse no {{2}}. Entre em contato com {{3}} da {{4}}. Estamos à disposição!',
      variables:          ['cliente', 'veiculo', 'vendedor', 'loja'],
      expectedParamsCount:4,
      active:             true,
    },
    {
      name:               'Escalonamento para Gerente',
      description:        'Notifica gerente de pendência não resolvida',
      templateName:       'autodrive_escalonamento',
      bodyText:           'Atenção {{1}}, a pendência do cliente {{2}} (veículo {{3}} — {{4}}) está há {{5}} dias sem resolução pelo vendedor {{6}}.',
      variables:          ['gerente', 'cliente', 'veiculo', 'placa', 'dias', 'vendedor'],
      expectedParamsCount:6,
      active:             true,
    },
    {
      name:               'Nova Pendência Importada',
      description:        'Informa vendedor sobre nova pendência da planilha',
      templateName:       'autodrive_nova_pendencia',
      bodyText:           'Olá {{1}}, uma nova pendência foi registrada para o cliente {{2}} referente ao {{3}}. Acesse o sistema para mais detalhes.',
      variables:          ['vendedor', 'cliente', 'veiculo'],
      expectedParamsCount:3,
      active:             true,
    },
    {
      name:               'Comissão Aprovada',
      description:        'Notifica vendedor sobre comissão aprovada',
      templateName:       'autodrive_comissao_aprovada',
      bodyText:           'Parabéns {{1}}! Sua comissão referente a {{2}} foi aprovada no valor de R$ {{3}}. O pagamento será realizado em {{4}}.',
      variables:          ['vendedor', 'referencia', 'valor', 'data_pagamento'],
      expectedParamsCount:4,
      active:             true,
    },
  ]

  for (const tpl of templates) {
    const existing = await prisma.whatsappTemplate.findFirst({
      where: { templateName: tpl.templateName },
    })
    if (!existing) {
      await prisma.whatsappTemplate.create({ data: tpl })
    }
  }
  console.log(`   ✓ ${templates.length} templates verificados`)

  // ── 7. Config Google Sheets de exemplo ────────────────────────────────────
  console.log('\n📊 Criando configuração Google Sheets de exemplo...')

  const existingSheetConfig = await prisma.googleSheetConfig.findFirst({
    where: { name: 'Planilha Principal' },
  })

  if (!existingSheetConfig) {
    const sheetConfig = await prisma.googleSheetConfig.create({
      data: {
        tenantId:     tenant.id,
        name:         'Planilha Principal',
        spreadsheetId:'', // preencher via configurações
        description:  'Planilha fonte principal dos dados de vendas e pendências',
        active:       false,
      },
    })

    const exampleTabs = [
      { internalName: 'Vendas',     sheetName: 'VENDAS',     tabType: 'VENDAS'     as const, headerRow: 1 },
      { internalName: 'Pendências', sheetName: 'PENDENCIAS', tabType: 'PENDENCIAS' as const, headerRow: 1 },
      { internalName: 'Clientes',   sheetName: 'CLIENTES',   tabType: 'CLIENTES'   as const, headerRow: 1 },
      { internalName: 'Vendedores', sheetName: 'VENDEDORES', tabType: 'VENDEDORES' as const, headerRow: 1 },
      { internalName: 'Garantias',  sheetName: 'GARANTIAS',  tabType: 'GARANTIAS'  as const, headerRow: 1 },
      { internalName: 'Retornos',   sheetName: 'RETORNOS',   tabType: 'RETORNOS'   as const, headerRow: 1 },
    ]

    for (const tab of exampleTabs) {
      await prisma.googleSheetTab.create({
        data: { configId: sheetConfig.id, ...tab, active: false },
      })
    }
    console.log(`   ✓ Configuração Sheets + ${exampleTabs.length} abas de exemplo`)
  } else {
    console.log(`   ✓ Configuração Sheets já existente — pulando`)
  }

  // ── 8. Preferência de notificação do master ────────────────────────────────
  console.log('\n🔔 Configurando preferências de notificação...')
  await prisma.notificationPreference.upsert({
    where:  { userId: masterUser.id },
    update: {},
    create: {
      userId:        masterUser.id,
      appWeb:        true,
      appMobile:     false,
      whatsapp:      false,
      email:         false,
      push:          false,
      newPendency:   true,
      pendencyUrgent:true,
      commissionPaid:true,
      systemAlerts:  true,
    },
  })
  console.log(`   ✓ Preferências do master configuradas`)

  // ── Resumo ─────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('✅ AutoDrive seed concluído com sucesso!')
  console.log('═'.repeat(60))
  console.log('\n📌 Credenciais de acesso:')
  console.log('   MASTER (plataforma):')
  console.log('   E-mail : admin@autodrive.com.br')
  console.log('   Senha  : Admin@123')
  console.log('\n   ADM (tenant demo):')
  console.log('   E-mail : adm@autodrive-demo.com.br')
  console.log('   Senha  : Admin@123')
  console.log('\n🏢 Tenant demo:')
  console.log(`   ID     : ${tenant.publicId}`)
  console.log(`   Slug   : ${tenant.slug}`)
  console.log('\n🌐 Acesse: http://localhost:3000/login\n')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
