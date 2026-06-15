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
  Stamp,
  FileCheck2,
  Upload,
  FileType,
  Wallet,
  Palette,
  Target,
  Trophy,
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
      { label: 'Configurações', href: '/configuracoes/comissoes', icon: Settings, module: 'settings.commission' },
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
    label: 'Pendências',
    icon:  ClipboardList,
    module: 'pendencies',
    children: [
      { label: 'Central de Pendências', href: '/pendencias/central',        icon: Inbox,         module: 'pendencies.central' },
      { label: 'Minhas Pendências',     href: '/pendencias/minhas',         icon: ClipboardList, module: 'pendencies' },
      { label: 'Gerência',              href: '/pendencias/gerencia',       icon: UserCog,       module: 'pendencies.manage' },
      { label: 'Vendedor',              href: '/pendencias/vendedor',       icon: UserSquare,    module: 'pendencies' },
      { label: 'Configurações',         href: '/pendencias/configuracoes', badge: 'em breve',  icon: Settings,      module: 'stock.pendencies.configure' },
    ],
  },

  // ── COMUNICAÇÕES ──────────────────────────────────────────────────────────
  {
    label: 'Comunicações',
    icon:  MessageSquare,
    module: 'communication',
    children: [
      { label: 'Central de Comunicação', href: '/comunicacao/central', badge: 'em breve',   icon: Inbox,           module: 'communication' },
      { label: 'Disparo',                href: '/comunicacao/disparo',   icon: Send,            module: 'communication.dispatch' },
      { label: 'Templates',              href: '/comunicacao/templates', icon: LayoutTemplate,  module: 'communication.templates' },
      { label: 'Avisos',                 href: '/comunicacao/avisos', badge: 'em breve',    icon: Megaphone,       module: 'communication' },
      { label: 'Logs',                   href: '/comunicacao/logs', badge: 'em breve',      icon: ScrollText,      module: 'communication' },
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
      { label: 'Vendedores', href: '/cadastros/vendedores', icon: UserCircle,   module: 'registrations.sellers' },
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
          { label: 'Vendas',      href: '/relatorios/negociacoes/vendas', badge: 'em breve',      module: 'logs' },
          { label: 'Trocas',      href: '/relatorios/negociacoes/trocas', badge: 'em breve',      module: 'logs' },
          { label: 'Compras',     href: '/relatorios/negociacoes/compras', badge: 'em breve',     module: 'logs' },
          { label: 'Consignação', href: '/relatorios/negociacoes/consignacao', badge: 'em breve', module: 'logs' },
        ],
      },
      {
        label: 'Financeiro', icon: Wallet, module: 'logs',
        children: [
          { label: 'Visão Geral',            href: '/relatorios/financeiro/visao-geral', badge: 'em breve',           module: 'logs' },
          { label: 'DRE',                    href: '/relatorios/financeiro/dre', badge: 'em breve',                   module: 'logs' },
          { label: 'Contas',                 href: '/relatorios/financeiro/contas', badge: 'em breve',                module: 'logs' },
          { label: 'Contas a Pagar',         href: '/relatorios/financeiro/contas-a-pagar', badge: 'em breve',        module: 'logs' },
          { label: 'Contas a Receber',       href: '/relatorios/financeiro/contas-a-receber', badge: 'em breve',      module: 'logs' },
          { label: 'Fluxo de Caixa',         href: '/relatorios/financeiro/fluxo-de-caixa', badge: 'em breve',        module: 'logs' },
          { label: 'Receitas',               href: '/relatorios/financeiro/receitas', badge: 'em breve',              module: 'logs' },
          { label: 'Despesas',               href: '/relatorios/financeiro/despesas', badge: 'em breve',              module: 'logs' },
          { label: 'Resultado por Unidade',  href: '/relatorios/financeiro/resultado-unidade', badge: 'em breve',     module: 'logs' },
          { label: 'Resultado por Vendedor', href: '/relatorios/financeiro/resultado-vendedor', badge: 'em breve',    module: 'logs' },
          { label: 'Resultado por Período',  href: '/relatorios/financeiro/resultado-periodo', badge: 'em breve',     module: 'logs' },
        ],
      },
      {
        label: 'Estoque', icon: Car, module: 'logs',
        children: [
          { label: 'Estoque Atual',       href: '/relatorios/estoque/atual', badge: 'em breve',       module: 'logs' },
          { label: 'Giro de Estoque',     href: '/relatorios/estoque/giro', badge: 'em breve',        module: 'logs' },
          { label: 'Veículos Parados',    href: '/relatorios/estoque/parados', badge: 'em breve',     module: 'logs' },
          { label: 'Margem por Veículo',  href: '/relatorios/estoque/margem', badge: 'em breve',      module: 'logs' },
          { label: 'Custo de Preparação', href: '/relatorios/estoque/preparacao', badge: 'em breve',  module: 'logs' },
          { label: 'Avaliações',          href: '/relatorios/estoque/avaliacoes', badge: 'em breve',  module: 'logs' },
        ],
      },
      {
        label: 'Comissões', icon: DollarSign, module: 'logs',
        children: [
          { label: 'Extrato Geral', href: '/relatorios/comissoes/extrato', badge: 'em breve',   module: 'logs' },
          { label: 'Por Vendedor',  href: '/relatorios/comissoes/vendedor', badge: 'em breve',  module: 'logs' },
          { label: 'Garantias',     href: '/relatorios/comissoes/garantias', badge: 'em breve', module: 'logs' },
          { label: 'Retornos',      href: '/relatorios/comissoes/retornos', badge: 'em breve',  module: 'logs' },
        ],
      },
      {
        label: 'Pendências', icon: ClipboardList, module: 'logs',
        children: [
          { label: 'Em Aberto',       href: '/relatorios/pendencias/abertas', badge: 'em breve',       module: 'logs' },
          { label: 'Resolvidas',      href: '/relatorios/pendencias/resolvidas', badge: 'em breve',    module: 'logs' },
          { label: 'SLA',             href: '/relatorios/pendencias/sla', badge: 'em breve',           module: 'logs' },
          { label: 'Por Responsável', href: '/relatorios/pendencias/responsavel', badge: 'em breve',   module: 'logs' },
          { label: 'Por Unidade',     href: '/relatorios/pendencias/unidade', badge: 'em breve',       module: 'logs' },
        ],
      },
      {
        label: 'Comunicação', icon: MessageSquare, module: 'logs',
        children: [
          { label: 'WhatsApp',         href: '/relatorios/comunicacao/whatsapp', badge: 'em breve', module: 'logs' },
          { label: 'E-mail',           href: '/relatorios/comunicacao/email', badge: 'em breve',    module: 'logs' },
          { label: 'Avisos Internos',  href: '/relatorios/comunicacao/avisos', badge: 'em breve',   module: 'logs' },
          { label: 'Logs',             href: '/relatorios/comunicacao/logs', badge: 'em breve',     module: 'logs' },
        ],
      },
      {
        label: 'Auditoria', icon: ShieldCheck, module: 'logs',
        children: [
          { label: 'Acessos',          href: '/relatorios/auditoria/acessos', badge: 'em breve',     module: 'logs' },
          { label: 'Alterações',       href: '/relatorios/auditoria/alteracoes', badge: 'em breve',  module: 'logs' },
          { label: 'Exclusões',        href: '/relatorios/auditoria/exclusoes', badge: 'em breve',   module: 'logs' },
          { label: 'Eventos Críticos', href: '/relatorios/auditoria/eventos', badge: 'em breve',     module: 'logs' },
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
      { label: 'Contratos',   href: '/documentos/contratos',   icon: FileSignature, module: 'documents.pdf' },
      { label: 'Procurações', href: '/documentos/procuracoes', badge: 'em breve', icon: Stamp,         module: 'documents.pdf' },
      { label: 'Termos',      href: '/documentos/termos', badge: 'em breve',      icon: FileCheck2,    module: 'documents.pdf' },
      { label: 'Declarações', href: '/documentos/declaracoes', badge: 'em breve', icon: ScrollText,    module: 'documents.pdf' },
      { label: 'Importação',  href: '/documentos/importacao',  icon: Upload,        module: 'documents.import' },
      { label: 'PDF',         href: '/documentos/pdf',         icon: FileType,      module: 'documents.pdf' },
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
  // NOTA (Fase 3): /configuracoes/sistema ainda mistura dados da loja com
  // toggles GLOBAIS (modo manutenção, ambiente TESTE) — esses controles devem
  // migrar para MASTER-only (master/maintenance). ADM não deve tocar no global.
  {
    label: 'Configurações',
    icon:  Settings,
    module: 'settings',
    children: [
      { label: 'Loja',       href: '/configuracoes/sistema',    icon: Building2,  module: 'settings' },
      { label: 'Identidade', href: '/configuracoes/identidade', icon: Palette,    module: 'settings.identity' },
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
      { label: 'Tenants',           href: '/master/tenants',            module: 'master.tenants' },
      { label: 'Usuários',          href: '/master/users',              module: 'master' },
      { label: 'Planos',            href: '/master/plans',              module: 'master.plans' },
      { label: 'Módulos',           href: '/master/modules',            module: 'master.modules' },
      { label: 'Regras de Avisos',  href: '/master/notification-rules', module: 'master' },
      { label: 'Comunicação',       href: '/master/communication',      module: 'master' },
      { label: 'Importador Sheets', href: '/master/sheets',             module: 'master' },
      { label: 'Integrações',       href: '/master/integrations',       module: 'master' },
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
