// =============================================================================
// seller-queue/attendance-types-config.ts — TIPOS de atendimento (natureza da
// visita) por unidade. Fica no JSON `SellerQueueUnitConfig.config.attendanceTypes`.
//
// Cada tipo: código, rótulo, ativo e "consome a vez" (se o atendimento manda o
// vendedor ao fim da fila ao finalizar, ou se ele mantém a posição — ex.: um
// agendamento do próprio vendedor geralmente NÃO consome a vez).
// =============================================================================

export interface AttendanceTypeItem {
  code: string
  label: string
  active: boolean
  consumesTurn: boolean
  requiresDescription?: boolean // "Outro" exige descrição
}
export interface AttendanceTypesConfig {
  types: AttendanceTypeItem[]
}

// Padrão (spec): cliente de porta consome a vez; agendamento/retorno/pós-venda e
// serviços operacionais (retirada/entrega/documentação/test-drive/avaliação) NÃO
// consomem por padrão — a loja ajusta. "Outro" exige descrição.
export const DEFAULT_ATTENDANCE_TYPES: AttendanceTypeItem[] = [
  { code: 'CLIENTE_PORTA', label: 'Cliente de porta', active: true, consumesTurn: true },
  { code: 'AGENDAMENTO', label: 'Agendamento', active: true, consumesTurn: false },
  { code: 'RETORNO', label: 'Retorno', active: true, consumesTurn: false },
  { code: 'POS_VENDA', label: 'Pós-venda', active: true, consumesTurn: false },
  { code: 'RETIRADA_CARRO', label: 'Retirada de carro', active: true, consumesTurn: false },
  { code: 'ENTREGA_VEICULO', label: 'Entrega de veículo', active: true, consumesTurn: false },
  { code: 'DOCUMENTACAO', label: 'Documentação', active: true, consumesTurn: false },
  { code: 'TEST_DRIVE', label: 'Test-drive', active: true, consumesTurn: true },
  { code: 'AVALIACAO', label: 'Avaliação', active: true, consumesTurn: true },
  { code: 'OUTRO', label: 'Outro', active: true, consumesTurn: true, requiresDescription: true },
]

export const DEFAULT_ATTENDANCE_TYPES_CONFIG: AttendanceTypesConfig = { types: DEFAULT_ATTENDANCE_TYPES }

function normCode(v: unknown): string {
  return String(v ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
}

function coerceItem(raw: unknown): AttendanceTypeItem | null {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const code = normCode(o.code)
  if (!code) return null
  return {
    code,
    label: String(o.label ?? code).trim().slice(0, 60) || code,
    active: o.active !== false,
    consumesTurn: o.consumesTurn === true,
    requiresDescription: o.requiresDescription === true,
  }
}

export function coerceAttendanceTypesConfig(raw: unknown): AttendanceTypesConfig {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  if (!Array.isArray(o.types)) return { types: DEFAULT_ATTENDANCE_TYPES.map((t) => ({ ...t })) }
  const seen = new Set<string>()
  const types: AttendanceTypeItem[] = []
  for (const raw2 of o.types) {
    const it = coerceItem(raw2)
    if (!it || seen.has(it.code)) continue
    seen.add(it.code)
    types.push(it)
  }
  return { types: types.length ? types : DEFAULT_ATTENDANCE_TYPES.map((t) => ({ ...t })) }
}

/** Lê o bloco de dentro do config JSON da unidade. */
export function readAttendanceTypesConfig(unitConfigJson: unknown): AttendanceTypesConfig {
  const root = (unitConfigJson && typeof unitConfigJson === 'object') ? unitConfigJson as Record<string, unknown> : {}
  if (root.attendanceTypes == null) return { types: DEFAULT_ATTENDANCE_TYPES.map((t) => ({ ...t })) }
  return coerceAttendanceTypesConfig(root.attendanceTypes)
}

/** Tipo ativo? (validação no backend antes de gravar o visitType) */
export function findActiveType(config: AttendanceTypesConfig, code: unknown): AttendanceTypeItem | null {
  const c = normCode(code)
  return config.types.find((t) => t.code === c && t.active) ?? null
}

/** Esse tipo consome a vez da fila? Desconhecido/ausente → consome (conservador). */
export function typeConsumesTurn(config: AttendanceTypesConfig, code: unknown): boolean {
  const c = normCode(code)
  const t = config.types.find((x) => x.code === c)
  return t ? t.consumesTurn : true
}
