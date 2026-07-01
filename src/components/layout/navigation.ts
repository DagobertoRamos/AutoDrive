// =============================================================================
// Navigation config — AutoDrive
// Estrutura tipada do menu lateral. A renderização real fica no Sidebar.tsx.
// =============================================================================

import type { LucideIcon } from 'lucide-react'
import type { Module } from '@/lib/permissions'
import {
  Home,
  Car,
  ClipboardCheck,
  Handshake,
  DollarSign,
  ClipboardList,
  MessageSquare,
  Database,
  BarChart3,
  FileText,
  Settings,
  HelpCircle,
  Instagram,
  Facebook,
  Globe,
  Youtube,
  Linkedin,
  MessageCircle,
  Music2,
  // Cadastros e sub-itens
  Users,
  UserCog,
  Building2,
  Briefcase,
  Wrench,
  ShieldCheck,
  UserCircle,
  // Comissões
  Calculator,
  ListChecks,
  ArrowLeftRight,
  Shield,
  // Pendências
  Inbox,
  UserSquare,
  // Comunicação
  Send,
  LayoutTemplate,
  Megaphone,
  ScrollText,
  // Documentos
  FileSignature,
  Bot,
  Stamp,
  FileCheck2,
  Wallet,
  Landmark,
  Tags,
  Banknote,
  LayoutDashboard,
  CheckCircle2,
  XCircle,
  Palette,
  Target,
  Trophy,
  // Marketing / Mesa SDR + Telefonia
  Headset,
  Phone,
  PhoneCall,
  Disc,
  GitBranch,
  Hash,
  // Comercial / Fila de Atendimento (Vendedor da Vez)
  UserCheck,
  ListOrdered,
  DoorOpen,
  Bell,
} from 'lucide-react'

export interface NavItem {
  label:      string
  href?:      string
  icon?:      LucideIcon
  module?:    Module
  badge?:     string
  disabled?:  boolean
  external?:  boolean
  children?:  NavItem[]
  /** Quando true, renderiza como divisor visual (label opcional). */
  separator?: boolean
  /** Identificador opcional de URL externa configurada (social). */
  socialKey?: string
}

export const NAV_GROUPS: NavItem[] = [
  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  { label: 'Dashboard', href: '/dashboard', icon: Home, module: 'dashboard' },

  // ── ESTOQUE ───────────────────────────────────────────────────────────────
  {
    label: 'Estoque',
    icon:  Car,
    module: 'stock',
    children: [
      { label: 'Ver Estoque',           href: '/estoque',                    icon: Car,             module: 'stock.view' },
      { label: 'Fazer Avaliação',       href: '/estoque/avaliacao',          icon: ClipboardCheck,  module: 'stock.evaluate' },
      { label: 'Avaliações pendentes',  href: '/estoque/avaliacoes',         icon: ClipboardCheck,  module: 'stock.evaluate' },
    ],
  },

  // ── NEGOCIAÇÕES ───────────────────────────────────────────────────────────
  {
    label: 'Negociações',
    icon:  Handshake,
    module: 'negotiations',
    children: [
      { label: 'Todas',              href: '/negociacoes',            icon: ListChecks, module: 'negotiations' },
      { label: 'Nova Negociação',    href: '/negociacoes/nova',       icon: Handshake,  module: 'negotiations' },
      { label: 'Pendente Aprovação', href: '/negociacoes/aprovacoes', icon: ShieldCheck,module: 'negotiations.approve' },
    ],
  },

  // ── COMERCIAL (Fila de Atendimento — "Vendedor da Vez") ────────────────────
  // Organiza a fila de atendimento presencial da loja sem recepção. Fase 1:
  // estrutura/placeholders ("em breve"). Presença, antifraude, chamada do
  // vendedor da vez e relatórios entram nas próximas fases.
  {
    label: 'Fila de Atendimento',
    icon:  UserCheck,
    module: 'sellerQueue.view',
    children: [
      { label: 'Visão Geral',         href: '/vendedor-da-vez',               icon: ListOrdered,     module: 'sellerQueue.view' },
      { label: 'Painel da Unidade',   href: '/vendedor-da-vez/painel',         icon: LayoutDashboard, module: 'sellerQueue.lead' },
      { label: 'Relatórios',          href: '/vendedor-da-vez/relatorios',     icon: BarChart3,       module: 'sellerQueue.reports' },
      { label: 'Configurações',       href: '/vendedor-da-vez/configuracoes',  icon: Settings,        module: 'sellerQueue.view' },
    ],
  },

  // ── COMISSÕES ─────────────────────────────────────────────────────────────
  {
    label: 'Comissões',
    icon:  DollarSign,
    module: 'commissions',
    children: [
      { label: 'Meu Extrato',  href: '/comissoes/extrato',     icon: FileText,        module: 'commissions' },
      { label: 'Lançamentos',  href: '/comissoes/lancamentos', icon: ListChecks,      module: 'commissions' },
      { label: 'Cálculo',     href: '/comissoes/calculo',  icon: Calculator,      module: 'commissions.calculate' },
      { label: 'Regras',      href: '/comissoes/regras',   icon: ListChecks,      module: 'commissions.rules' },
      { label: 'Retornos',    href: '/comissoes/retornos', icon: ArrowLeftRight,  module: 'commissions.rules' },
      { label: 'Garantias',   href: '/comissoes/garantias',icon: Shield,          module: 'commissions.rules' },
    ],
  },

  // ── FINANCEIRO ──────────────────────────────────────────────────────────────
  {
    label: 'Financeiro',
    icon:  Wallet,
    module: 'finance',
    children: [
      { label: 'Lançamentos', href: '/financeiro/lancamentos', icon: Wallet,    module: 'finance' },
      { label: 'Contas',      href: '/financeiro/contas',      icon: Landmark,  module: 'finance' },
      { label: 'Categorias',  href: '/financeiro/categorias',  icon: Tags,      module: 'finance' },
    ],
  },

  // ── F&I (Financiamento, Bancos, Retornos, Seguros e Produtos Financeiros) ──────
  // Rotas mantidas em /financiamento/* (compatibilidade). Bancos permanece aqui na
  // Fase 1; será realocado p/ Configurações > F&I na Fase 2.
  {
    label: 'F&I',
    icon:  Banknote,
    module: 'financing',
    children: [
      { label: 'Dashboard F&I', href: '/financiamento/dashboard',   icon: LayoutDashboard, module: 'financing' },
      { label: 'Proponentes',   href: '/financiamento/proponentes', icon: UserSquare,      module: 'financing' },
      { label: 'Simulações',    href: '/financiamento/simulacoes',  icon: Calculator,      module: 'financing' },
      { label: 'Fichas',        href: '/financiamento/fichas',      icon: FileText,        module: 'financing' },
      { label: 'Aprovadas',     href: '/financiamento/aprovadas',   icon: CheckCircle2,    module: 'financing' },
      { label: 'Recusadas',     href: '/financiamento/recusadas',   icon: XCircle,         module: 'financing' },
      { label: 'Contratos',     href: '/financiamento/contratos',   icon: FileSignature,   module: 'financing' },
      { label: 'Documentos',    href: '/financiamento/documentos',  icon: FileCheck2,      module: 'financing' },
      { label: 'Bancos',        href: '/financiamento/bancos',      icon: Landmark,        module: 'financing' },
      { label: 'Relatórios',    href: '/financiamento/relatorios',  icon: BarChart3,       module: 'financing' },
    ],
  },

  // ── METAS ───────────────────────────────────────────────────────────────────
  {
    label: 'Metas',
    icon:  Target,
    module: 'goals.manage',
    children: [
      { label: 'Gerenciar Metas', href: '/metas', icon: Target, module: 'goals.manage' },
    ],
  },

  // ── RANKING ─────────────────────────────────────────────────────────────────
  {
    label: 'Ranking',
    icon:  Trophy,
    module: 'ranking',
    children: [
      { label: 'Ranking Geral',    href: '/ranking/geral',        icon: Trophy,   module: 'ranking' },
      { label: 'Ranking da Unidade', href: '/ranking/unidade',    icon: Trophy,   module: 'ranking' },
      { label: 'Desempenho',      href: '/desempenho',           icon: Trophy,   module: 'ranking' },
      { label: 'Configurar Pesos', href: '/ranking/configuracao', icon: Settings, module: 'ranking.configure' },
    ],
  },

  // ── PENDÊNCIAS ────────────────────────────────────────────────────────────
  {
    label: 'Central de Pendências',
    icon:  ClipboardList,
    module: 'pendencies.central',
    children: [
      { label: 'Painel', href: '/pendencias/central',        icon: Inbox,         module: 'pendencies.central' },
      { label: 'Minhas Pendências',     href: '/pendencias/minhas',         icon: ClipboardList, module: 'pendencies' },
      { label: 'Gerência',              href: '/pendencias/gerencia',       icon: UserCog,       module: 'pendencies.manage' },
      { label: 'Vendedor',              href: '/pendencias/vendedor',       icon: UserSquare,    module: 'pendencies' },
      { label: 'Configurações',         href: '/pendencias/configuracoes', icon: Settings,      module: 'stock.pendencies.configure' },
    ],
  },

  // ── COMUNICAÇÕES ──────────────────────────────────────────────────────────
  {
    label: 'Comunicações',
    icon:  MessageSquare,
    module: 'communication',
    children: [
      { label: 'Central de Comunicação', href: '/comunicacao/central',   icon: Inbox,           module: 'communication' },
      { label: 'Disparo',                href: '/comunicacao/disparo',   icon: Send,            module: 'communication.dispatch' },
      { label: 'Templates',              href: '/comunicacao/templates', icon: LayoutTemplate,  module: 'communication.templates' },
      { label: 'Avisos',                 href: '/comunicacao/avisos',    icon: Megaphone,       module: 'communication' },
      { label: 'Logs',                   href: '/comunicacao/logs',      icon: ScrollText,      module: 'communication' },
    ],
  },

  // ── MARKETING (Mesa SDR / Pré-Vendas + Telefonia) ──────────────────────────
  // Mesa SDR e Telefonia operacionais (UI Fase 5). Distribuição automática
  // (roleta/tanque/peso/regras) e integração real de telefonia (adapters reais
  // Asterisk/3CX/Twilio) seguem em evolução — sem chamada externa sem doc oficial.
  {
    label: 'Marketing',
    icon:  Megaphone,
    module: 'marketing',
    children: [
      // Mesa de Pré-Vendas / SDR
      { label: 'Caixa de Leads',  href: '/marketing/sdr/inbox',     icon: Inbox,      module: 'marketing.sdr' },
      { label: 'Times SDR',       href: '/marketing/sdr/times',     icon: Users,      module: 'marketing.sdr.manage' },
      { label: 'Membros',         href: '/marketing/sdr/membros',   icon: Headset,    module: 'marketing.sdr.manage' },
      { label: 'Distribuição',    href: '/marketing/sdr/politicas', icon: GitBranch,  module: 'marketing.leads.distribute' },
      // Telefonia
      { label: 'Chamadas',        href: '/marketing/telephony/chamadas',  icon: PhoneCall, module: 'marketing.telephony' },
      { label: 'Conexões',        href: '/marketing/telephony/conexoes',  icon: Phone,     module: 'marketing.telephony.manage' },
      { label: 'Números',         href: '/marketing/telephony/numeros',   icon: Hash,      module: 'marketing.telephony.manage' },
      { label: 'Gravações',       href: '/marketing/telephony/gravacoes', icon: Disc,      module: 'marketing.telephony.recordings' },
    ],
  },

  // ── CADASTROS ─────────────────────────────────────────────────────────────
  {
    label: 'Cadastros',
    icon:  Database,
    module: 'registrations',
    children: [
      { label: 'Clientes',   href: '/cadastros/clientes',   icon: Users,        module: 'registrations.customers' },
      { label: 'Veículos',   href: '/cadastros/veiculos',   icon: Car,          module: 'registrations.vehicles' },
      { label: 'Unidades',   href: '/cadastros/unidades',   icon: Building2,    module: 'registrations.units' },
      { label: 'Colaboradores', href: '/cadastros/vendedores', icon: UserCircle, module: 'registrations.sellers' },
      { label: 'Gerentes',   href: '/cadastros/gerentes',   icon: UserCog,      module: 'registrations.managers' },
      { label: 'Cargos',     href: '/cadastros/cargos',     icon: Briefcase,    module: 'registrations.positions' },
      { label: 'Serviços',   href: '/cadastros/servicos',   icon: Wrench,       module: 'registrations.services' },
      { label: 'Garantias',  href: '/cadastros/garantias',  icon: ShieldCheck,  module: 'registrations.warranties' },
    ],
  },

  // ── RELATÓRIOS ────────────────────────────────────────────────────────────
  {
    label: 'Relatórios',
    icon:  BarChart3,
    module: 'logs',
    children: [
      {
        label: 'Negociações', icon: Handshake, module: 'logs',
        children: [
          { label: 'Vendas',      href: '/relatorios/negociacoes/vendas',      module: 'logs' },
          { label: 'Trocas',      href: '/relatorios/negociacoes/trocas',      module: 'logs' },
          { label: 'Compras',     href: '/relatorios/negociacoes/compras',     module: 'logs' },
          { label: 'Consignação', href: '/relatorios/negociacoes/consignacao', module: 'logs' },
        ],
      },
      {
        label: 'Financeiro', icon: Wallet, module: 'logs',
        children: [
          { label: 'Visão Geral',            href: '/relatorios/financeiro/visao-geral',        module: 'logs' },
          { label: 'DRE',                    href: '/relatorios/financeiro/dre',                module: 'logs' },
          { label: 'Contas',                 href: '/relatorios/financeiro/contas',             module: 'logs' },
          { label: 'Contas a Pagar',         href: '/relatorios/financeiro/contas-a-pagar',     module: 'logs' },
          { label: 'Contas a Receber',       href: '/relatorios/financeiro/contas-a-receber',   module: 'logs' },
          { label: 'Fluxo de Caixa',         href: '/relatorios/financeiro/fluxo-de-caixa',     module: 'logs' },
          { label: 'Receitas',               href: '/relatorios/financeiro/receitas',           module: 'logs' },
          { label: 'Despesas',               href: '/relatorios/financeiro/despesas',           module: 'logs' },
          { label: 'Resultado por Unidade',  href: '/relatorios/financeiro/resultado-unidade',  module: 'logs' },
          { label: 'Resultado por Vendedor', href: '/relatorios/financeiro/resultado-vendedor', module: 'logs' },
          { label: 'Resultado por Período',  href: '/relatorios/financeiro/resultado-periodo',  module: 'logs' },
        ],
      },
      {
        label: 'Estoque', icon: Car, module: 'logs',
        children: [
          { label: 'Estoque Atual',       href: '/relatorios/estoque/atual',       module: 'logs' },
          { label: 'Giro de Estoque',     href: '/relatorios/estoque/giro',        module: 'logs' },
          { label: 'Veículos Parados',    href: '/relatorios/estoque/parados',     module: 'logs' },
          { label: 'Margem por Veículo',  href: '/relatorios/estoque/margem',      module: 'logs' },
          { label: 'Custo de Preparação', href: '/relatorios/estoque/preparacao',  module: 'logs' },
          { label: 'Avaliações',          href: '/relatorios/estoque/avaliacoes',  module: 'logs' },
        ],
      },
      {
        label: 'Comissões', icon: DollarSign, module: 'logs',
        children: [
          { label: 'Extrato Geral', href: '/relatorios/comissoes/extrato',   module: 'logs' },
          { label: 'Por Vendedor',  href: '/relatorios/comissoes/vendedor',  module: 'logs' },
          { label: 'Garantias',     href: '/relatorios/comissoes/garantias', module: 'logs' },
          { label: 'Retornos',      href: '/relatorios/comissoes/retornos',  module: 'logs' },
        ],
      },
      {
        label: 'Pendências', icon: ClipboardList, module: 'logs',
        children: [
          { label: 'Em Aberto',       href: '/relatorios/pendencias/abertas',       module: 'logs' },
          { label: 'Resolvidas',      href: '/relatorios/pendencias/resolvidas',    module: 'logs' },
          { label: 'SLA',             href: '/relatorios/pendencias/sla',           module: 'logs' },
          { label: 'Por Responsável', href: '/relatorios/pendencias/responsavel',   module: 'logs' },
          { label: 'Por Unidade',     href: '/relatorios/pendencias/unidade',       module: 'logs' },
        ],
      },
      {
        label: 'Comunicação', icon: MessageSquare, module: 'logs',
        children: [
          { label: 'WhatsApp',         href: '/relatorios/comunicacao/whatsapp', module: 'logs' },
          { label: 'E-mail',           href: '/relatorios/comunicacao/email',    module: 'logs' },
          { label: 'Avisos Internos',  href: '/relatorios/comunicacao/avisos',   module: 'logs' },
          { label: 'Logs',             href: '/relatorios/comunicacao/logs',     module: 'logs' },
        ],
      },
      {
        label: 'Auditoria', icon: ShieldCheck, module: 'logs',
        children: [
          { label: 'Acessos',          href: '/relatorios/auditoria/acessos',     module: 'logs' },
          { label: 'Alterações',       href: '/relatorios/auditoria/alteracoes',  module: 'logs' },
          { label: 'Exclusões',        href: '/relatorios/auditoria/exclusoes',   module: 'logs' },
          { label: 'Eventos Críticos', href: '/relatorios/auditoria/eventos',     module: 'logs' },
        ],
      },
    ],
  },

  // ── DOCUMENTOS ────────────────────────────────────────────────────────────
  {
    label: 'Documentos',
    icon:  FileText,
    module: 'documents',
    children: [
      { label: 'Analisar com IA', href: '/documentos/analisar', icon: Bot, module: 'ai' },
      { label: 'Contratos',   href: '/documentos/contratos',   icon: FileSignature, module: 'documents.pdf' },
      { label: 'Procurações', href: '/documentos/procuracoes', icon: Stamp,         module: 'documents.pdf' },
      { label: 'Termos',      href: '/documentos/termos',      icon: FileCheck2,    module: 'documents.pdf' },
      { label: 'Declarações', href: '/documentos/declaracoes', icon: ScrollText,    module: 'documents.pdf' },
    ],
  },

  // ── SEPARADOR ─────────────────────────────────────────────────────────────
  { label: '', separator: true },

  // ── REDES SOCIAIS (apenas renderiza itens com URL configurada) ────────────
  {
    label: 'Nossas Redes Sociais',
    icon:  Globe,
    children: [
      { label: 'Instagram', icon: Instagram,     external: true, socialKey: 'instagram' },
      { label: 'Facebook',  icon: Facebook,      external: true, socialKey: 'facebook' },
      { label: 'WhatsApp',  icon: MessageCircle, external: true, socialKey: 'whatsapp' },
      { label: 'Site',      icon: Globe,         external: true, socialKey: 'site' },
      { label: 'YouTube',   icon: Youtube,       external: true, socialKey: 'youtube' },
      { label: 'TikTok',    icon: Music2,        external: true, socialKey: 'tiktok' },
      { label: 'LinkedIn',  icon: Linkedin,      external: true, socialKey: 'linkedin' },
    ],
  },

  // ── CONFIGURAÇÕES (tenant/loja — ADM do tenant) ───────────────────────────
  // Apenas Loja, Identidade e Perfil. E-mail/WhatsApp/Sheets são domínio MASTER
  // (ver painel Master › Comunicação / Importador Sheets). Config de comissão
  // foi realocada para o grupo Comissões.
  // Fase 3 RESOLVIDA: /configuracoes/sistema é GLOBAL (MASTER-only) — só aparece
  // no menu Master "Sistema (global)"; API GET/PUT e a própria página são
  // MASTER-only. A loja do ADM fica em /configuracoes/loja.
  {
    label: 'Configurações',
    icon:  Settings,
    module: 'settings',
    children: [
      { label: 'Loja',       href: '/configuracoes/loja',       icon: Building2,  module: 'settings' },
      { label: 'Identidade', href: '/configuracoes/identidade', icon: Palette,    module: 'settings.identity' },
      { label: 'F&I',        href: '/configuracoes/fi',         icon: Banknote,   module: 'financing.config' },
      { label: 'Perfil',     href: '/perfil',                   icon: UserCircle, module: 'profile' },
    ],
  },

  // ── AJUDA ─────────────────────────────────────────────────────────────────
  { label: 'Ajuda', href: '/ajuda', icon: HelpCircle },

  // ── MASTER (apenas role MASTER) ───────────────────────────────────────────
  {
    label: 'Master',
    icon:  ShieldCheck,
    module: 'master',
    children: [
      { label: 'Visão Geral',       href: '/master',                    module: 'master' },
      { label: 'Sistema (global)',  href: '/configuracoes/sistema',     module: 'master' },
      { label: 'Tenants',           href: '/master/tenants',            module: 'master.tenants' },
      { label: 'Usuários',          href: '/master/users',              module: 'master' },
      { label: 'Planos',            href: '/master/plans',              module: 'master.plans' },
      { label: 'Módulos',           href: '/master/modules',            module: 'master.modules' },
      { label: 'Regras de Avisos',  href: '/master/notification-rules', module: 'master' },
      { label: 'Comunicação',       href: '/master/communication',      module: 'master' },
      { label: 'Importador Sheets', href: '/master/sheets',             module: 'master' },
      { label: 'Integrações',       href: '/master/integrations',       module: 'master' },
      { label: 'F&I',               href: '/master/financing',          module: 'master.financing' },
      { label: 'Inteligência Artificial', href: '/master/ai',           module: 'master.ai' },
      { label: 'Telefonia (global)', href: '/master/marketing/telephony', module: 'master.marketing.telephony', badge: 'em breve' },
      { label: 'Feature Flags',     href: '/master/feature-flags',      module: 'master' },
      { label: 'Manutenção',        href: '/master/maintenance',        module: 'master' },
      { label: 'Identidade',        href: '/master/identity',           module: 'master' },
      { label: 'Segurança',         href: '/master/security',           module: 'master' },
      { label: 'Documentos',        href: '/master/documentos',         module: 'master' },
      { label: 'Auditoria',         href: '/master/audit',              module: 'master.audit' },
    ],
  },
]

/**
 * Chaves de SystemSetting (grupo "identity") onde armazenamos URLs sociais.
 * Mapeamento socialKey -> chave de campo persistido em `settings/identity`.
 */
export const SOCIAL_KEY_TO_FIELD: Record<string, string> = {
  instagram: 'socialInstagram',
  facebook:  'socialFacebook',
  whatsapp:  'socialWhatsapp',
  site:      'socialSite',
  youtube:   'socialYoutube',
  tiktok:    'socialTiktok',
  linkedin:  'socialLinkedin',
}
