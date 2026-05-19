// =============================================================================
// Catálogo de seções e itens predefinidos da Avaliação de Veículos.
// Inspiração: fluxo Autoconf — adaptado para SaaS multi-tenant.
//
// Estrutura:
//   SECTIONS = ordem das abas/steps
//   ITEMS    = checklist por seção, com chave canônica para versionamento
//   SERVICE_TYPES, STATUS, CATEGORIES = enums de UI
// =============================================================================

export type SectionKey =
  | 'DADOS'
  | 'DOCUMENTOS'
  | 'INTERIOR'
  | 'FRENTE'
  | 'DIREITA'
  | 'TRASEIRA'
  | 'ESQUERDA'
  | 'TEST_DRIVE'
  | 'SERVICOS'
  | 'RESUMO'

export interface SectionDef {
  key:   SectionKey
  label: string
  desc:  string
  icon:  string  // ícone do lucide-react (nome)
  order: number
}

export const SECTIONS: SectionDef[] = [
  { key: 'DADOS',      label: 'Dados',      desc: 'Identificação e FIPE',    icon: 'Car',       order: 1 },
  { key: 'DOCUMENTOS', label: 'Documentos', desc: 'CRLV, ATPV-e, laudos',   icon: 'FileText',  order: 2 },
  { key: 'INTERIOR',   label: 'Interior',   desc: 'Bancos, painel, forros', icon: 'Sofa',      order: 3 },
  { key: 'FRENTE',     label: 'Frente',     desc: 'Capô, faróis, parachoque', icon: 'ArrowUp', order: 4 },
  { key: 'DIREITA',    label: 'Direita',    desc: 'Lateral direita',         icon: 'ArrowRight',order: 5 },
  { key: 'TRASEIRA',   label: 'Traseira',   desc: 'Tampa, vigia, estepe',    icon: 'ArrowDown', order: 6 },
  { key: 'ESQUERDA',   label: 'Esquerda',   desc: 'Lateral esquerda',        icon: 'ArrowLeft', order: 7 },
  { key: 'TEST_DRIVE', label: 'Test-drive', desc: 'Direção, mecânica',       icon: 'Gauge',     order: 8 },
  { key: 'SERVICOS',   label: 'Serviços',   desc: 'Gerais e previsões',      icon: 'Wrench',    order: 9 },
  { key: 'RESUMO',     label: 'Resumo',     desc: 'Fechamento e gastos',     icon: 'CheckCircle2', order: 10 },
]

// ── Itens canônicos de checklist ─────────────────────────────────────────────

export interface CatalogItem {
  key:   string   // chave canônica única (ex: 'interior.banco_motorista')
  name:  string   // label exibido
  hint?: string   // dica curta opcional
}

export const ITEMS: Record<SectionKey, CatalogItem[]> = {
  DADOS: [],        // a seção Dados é o formulário do veículo
  DOCUMENTOS: [],   // a seção Documentos é lista de anexos categorizados
  RESUMO: [],       // resumo é gerado dinamicamente

  INTERIOR: [
    { key: 'interior.banco_motorista',          name: 'Banco motorista' },
    { key: 'interior.banco_passageiro',         name: 'Banco passageiro dianteiro' },
    { key: 'interior.banco_traseiro',           name: 'Banco traseiro' },
    { key: 'interior.forracao_portas',          name: 'Forração de portas' },
    { key: 'interior.carpete_piso',             name: 'Carpete / piso' },
    { key: 'interior.revestimento_painel',      name: 'Revestimento do painel' },
    { key: 'interior.forracao_teto',            name: 'Forração do teto' },
    { key: 'interior.volante',                  name: 'Volante' },
    { key: 'interior.manopla_cambio',           name: 'Manopla do câmbio' },
    { key: 'interior.console',                  name: 'Console' },
    { key: 'interior.motor_ruidos',             name: 'Motor interno / ruídos observados' },
    { key: 'interior.ar_condicionado',          name: 'Ar condicionado' },
    { key: 'interior.marcadores_painel',        name: 'Marcadores do painel' },
    { key: 'interior.chave',                    name: 'Chave principal' },
    { key: 'interior.chave_reserva',            name: 'Chave reserva' },
    { key: 'interior.recuperacao_interior',     name: 'Recuperação geral interior' },
    { key: 'interior.bateria',                  name: 'Bateria' },
  ],

  FRENTE: [
    { key: 'frente.farol_direito',          name: 'Farol direito' },
    { key: 'frente.farol_esquerdo',         name: 'Farol esquerdo' },
    { key: 'frente.parabrisa',              name: 'Para-brisa' },
    { key: 'frente.parachoque_dianteiro',   name: 'Parachoque dianteiro' },
    { key: 'frente.capo',                   name: 'Capô do motor' },
    { key: 'frente.mini_frente',            name: 'Mini frente' },
    { key: 'frente.teto',                   name: 'Teto' },
    { key: 'frente.longarina_esquerda',     name: 'Longarina esquerda' },
    { key: 'frente.longarina_direita',      name: 'Longarina direita' },
    { key: 'frente.bateria',                name: 'Bateria (vista frontal)' },
    { key: 'frente.recuperacao_frente',     name: 'Recuperação geral frente' },
  ],

  DIREITA: [
    { key: 'direita.caixa_ar',              name: 'Caixa de ar direita' },
    { key: 'direita.paralama_dianteiro',    name: 'Paralama dianteiro direito' },
    { key: 'direita.lanterna_lateral',      name: 'Lanterna lateral direita' },
    { key: 'direita.pneu_dianteiro',        name: 'Pneu dianteiro direito' },
    { key: 'direita.roda_dianteira',        name: 'Roda dianteira direita' },
    { key: 'direita.retrovisor',            name: 'Retrovisor direito' },
    { key: 'direita.porta_dianteira',       name: 'Porta dianteira direita' },
    { key: 'direita.macaneta_dianteira',    name: 'Maçaneta dianteira direita' },
    { key: 'direita.porta_traseira',        name: 'Porta traseira direita' },
    { key: 'direita.macaneta_traseira',     name: 'Maçaneta traseira direita' },
    { key: 'direita.pneu_traseiro',         name: 'Pneu traseiro direito' },
    { key: 'direita.roda_traseira',         name: 'Roda traseira direita' },
    { key: 'direita.lateral_traseira',      name: 'Lateral traseira direita' },
    { key: 'direita.tampa_combustivel',     name: 'Tampa do combustível direita' },
    { key: 'direita.recuperacao_direita',   name: 'Recuperação geral direita' },
  ],

  TRASEIRA: [
    { key: 'traseira.lanterna_direita',     name: 'Lanterna traseira direita' },
    { key: 'traseira.lanterna_esquerda',    name: 'Lanterna traseira esquerda' },
    { key: 'traseira.terceira_luz',         name: 'Terceira luz de freio' },
    { key: 'traseira.vidro_vigia',          name: 'Vidro traseiro / vigia' },
    { key: 'traseira.estepe',               name: 'Estepe' },
    { key: 'traseira.tampao_porta_malas',   name: 'Tampão porta-malas' },
    { key: 'traseira.tampa_traseira',       name: 'Tampa traseira' },
    { key: 'traseira.chapa_final',          name: 'Chapa final traseira' },
    { key: 'traseira.parachoque_traseiro',  name: 'Parachoque traseiro' },
    { key: 'traseira.recuperacao_traseira', name: 'Recuperação geral traseira' },
    { key: 'traseira.lente_para_esquerda',  name: 'Lente do parachoque esquerdo' },
    { key: 'traseira.lente_para_direita',   name: 'Lente do parachoque direito' },
  ],

  ESQUERDA: [
    { key: 'esquerda.paralama_dianteiro',   name: 'Paralama dianteiro esquerdo' },
    { key: 'esquerda.caixa_ar',             name: 'Caixa de ar esquerda' },
    { key: 'esquerda.lanterna_lateral',     name: 'Lanterna lateral esquerda' },
    { key: 'esquerda.pneu_dianteiro',       name: 'Pneu dianteiro esquerdo' },
    { key: 'esquerda.roda_dianteira',       name: 'Roda dianteira esquerda' },
    { key: 'esquerda.retrovisor',           name: 'Retrovisor esquerdo' },
    { key: 'esquerda.porta_dianteira',      name: 'Porta dianteira esquerda' },
    { key: 'esquerda.macaneta_dianteira',   name: 'Maçaneta dianteira esquerda' },
    { key: 'esquerda.porta_traseira',       name: 'Porta traseira esquerda' },
    { key: 'esquerda.macaneta_traseira',    name: 'Maçaneta traseira esquerda' },
    { key: 'esquerda.pneu_traseiro',        name: 'Pneu traseiro esquerdo' },
    { key: 'esquerda.roda_traseira',        name: 'Roda traseira esquerda' },
    { key: 'esquerda.lateral_traseira',     name: 'Lateral traseira esquerda' },
    { key: 'esquerda.tampa_combustivel',    name: 'Tampa do combustível esquerda' },
    { key: 'esquerda.recuperacao_esquerda', name: 'Recuperação geral esquerda' },
  ],

  TEST_DRIVE: [
    { key: 'testdrive.motor',           name: 'Motor' },
    { key: 'testdrive.cambio',          name: 'Caixa de câmbio' },
    { key: 'testdrive.direcao',         name: 'Caixa de direção' },
    { key: 'testdrive.freios',          name: 'Freios' },
    { key: 'testdrive.suspensao',       name: 'Suspensão' },
    { key: 'testdrive.ar_condicionado', name: 'Ar condicionado' },
    { key: 'testdrive.ruidos',          name: 'Ruídos' },
    { key: 'testdrive.luzes_painel',    name: 'Luzes do painel' },
    { key: 'testdrive.alinhamento',     name: 'Alinhamento' },
    { key: 'testdrive.desempenho',      name: 'Desempenho geral' },
  ],

  SERVICOS: [],   // serviços gerais ficam em EvaluationService com itemId=null
}

// ── Enums de UI ──────────────────────────────────────────────────────────────

export const ITEM_STATUS = [
  { value: 'CONFORME',    label: 'Conforme',           color: 'bg-emerald-100 text-emerald-800' },
  { value: 'ATENCAO',     label: 'Atenção',            color: 'bg-amber-100 text-amber-800'      },
  { value: 'REPARO',      label: 'Reparo necessário',  color: 'bg-orange-100 text-orange-800'    },
  { value: 'OBRIGATORIO', label: 'Serviço obrigatório',color: 'bg-red-100 text-red-800'          },
  { value: 'REAVALIAR',   label: 'Reavaliar depois',   color: 'bg-blue-100 text-blue-800'        },
  { value: 'NA',          label: 'Não se aplica',      color: 'bg-gray-100 text-gray-600'        },
  { value: 'PENDING',     label: 'Pendente',           color: 'bg-gray-100 text-gray-500'        },
] as const

export const SERVICE_TYPES = [
  'FUNILARIA', 'PINTURA', 'POLIMENTO', 'HIGIENIZACAO',
  'TROCA_BANCO', 'TROCA_TECIDO', 'REPARO_TECIDO',
  'REVISAO', 'TROCA_OLEO', 'ALINHAMENTO', 'BALANCEAMENTO',
  'TROCA_PNEU', 'REPARO_ELETRICO', 'AR_CONDICIONADO',
  'TROCA_PECA', 'CAUTELAR', 'PERICIA', 'OUTRO',
] as const

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  FUNILARIA:       'Funilaria',
  PINTURA:         'Pintura',
  POLIMENTO:       'Polimento',
  HIGIENIZACAO:    'Higienização',
  TROCA_BANCO:     'Troca de banco',
  TROCA_TECIDO:    'Troca de couro/tecido',
  REPARO_TECIDO:   'Reparo de tecido/couro',
  REVISAO:         'Revisão mecânica',
  TROCA_OLEO:      'Troca de óleo',
  ALINHAMENTO:     'Alinhamento',
  BALANCEAMENTO:   'Balanceamento',
  TROCA_PNEU:      'Troca de pneus',
  REPARO_ELETRICO: 'Reparo elétrico',
  AR_CONDICIONADO: 'Ar condicionado',
  TROCA_PECA:      'Troca de peça',
  CAUTELAR:        'Cautelar',
  PERICIA:         'Perícia',
  OUTRO:           'Outro serviço',
}

export const PRIORITIES = [
  { value: 'BAIXA',   label: 'Baixa',   color: 'bg-gray-100 text-gray-700' },
  { value: 'MEDIA',   label: 'Média',   color: 'bg-blue-100 text-blue-800' },
  { value: 'ALTA',    label: 'Alta',    color: 'bg-amber-100 text-amber-800' },
  { value: 'URGENTE', label: 'Urgente', color: 'bg-red-100 text-red-800' },
] as const

export const ATTACHMENT_CATEGORIES = [
  { value: 'CRLV',           label: 'CRLV' },
  { value: 'ATPV_E',         label: 'ATPV-e' },
  { value: 'DUT_CRV',        label: 'DUT / CRV' },
  { value: 'LAUDO_CAUTELAR', label: 'Laudo Cautelar' },
  { value: 'COMPROVANTE',    label: 'Comprovante' },
  { value: 'CNH',            label: 'CNH / Documento do proprietário' },
  { value: 'FOTO',           label: 'Foto' },
  { value: 'OUTRO',          label: 'Outro' },
] as const

// Status da avaliação como um todo (alinha com VehicleEvaluation.status existente)
export const EVALUATION_STATUS = [
  'DRAFT', 'IN_PROGRESS', 'PENDING_REVIEW',
  'FINALIZED', 'APPROVED', 'REJECTED', 'REOPENED', 'CANCELED',
] as const

// Mapa Section → catalog key prefix (útil para validar coerência)
export function getCatalogItems(section: SectionKey): CatalogItem[] {
  return ITEMS[section] ?? []
}

export function allInspectionItemKeys(): string[] {
  const inspection: SectionKey[] = ['INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE']
  return inspection.flatMap((s) => ITEMS[s].map((i) => i.key))
}
