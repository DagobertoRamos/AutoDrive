// =============================================================================
// AutoDrive — Global Types
// Alinhado 100% ao schema Prisma
// =============================================================================

// ── Enums ─────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'MASTER'
  | 'ADM'
  | 'GERENTE_GERAL'
  | 'GERENTE'
  | 'VENDEDOR_LIDER'
  | 'VENDEDOR'
  | 'USUARIO_LIDER'
  | 'USUARIO'

export type UserStatus = 'ATIVO' | 'INATIVO' | 'PENDENTE' | 'BLOQUEADO'

export type PendencyPriority = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'

export type PendencyStatus =
  | 'ABERTA'
  | 'EM_ANDAMENTO'
  | 'AGUARDANDO_RESPOSTA'
  | 'PAUSADA'
  | 'FINALIZADA'
  | 'REATIVADA'
  | 'CANCELADA'
  | 'VENCIDA'

export type NotificationType =
  | 'RESPOSTA'
  | 'PENDENCIA_CRITICA'
  | 'NOVA_PENDENCIA'
  | 'PENDENCIA_FINALIZADA'
  | 'PENDENCIA_RESOLVIDA'
  | 'PENDENCIA_NAO_RESOLVIDA'
  | 'ESCALONAMENTO'
  | 'NEGOCIACAO_NOVA'
  | 'NEGOCIACAO_LIBERADA'
  | 'NEGOCIACAO_RECUSADA'
  | 'COMISSAO_APROVADA'
  | 'COMISSAO_PAGA'
  | 'IMPORTACAO_CONCLUIDA'
  | 'ERRO_INTEGRACAO'
  | 'ERRO_ENVIO'
  | 'DISPARO_MANUAL'
  | 'SISTEMA'
  | 'INFO'

export type NotificationChannel = 'APP_WEB' | 'APP_MOBILE' | 'WHATSAPP' | 'EMAIL' | 'PUSH'

export type NotificationStatus =
  | 'PENDENTE'
  | 'ENVIANDO'
  | 'ENVIADO'
  | 'ENTREGUE'
  | 'LIDO'
  | 'ERRO'
  | 'CANCELADO'

export type CommissionRuleType =
  | 'VENDA'
  | 'TROCA'
  | 'COMPRA'
  | 'GARANTIA'
  | 'RETORNO'
  | 'SERVICO'
  | 'DOCUMENTO'
  | 'BONUS_META'
  | 'BONUS_DEZENA'
  | 'EXCECAO'

export type CommissionStatus = 'PREVISTO' | 'APROVADO' | 'PAGO' | 'CANCELADO' | 'AJUSTADO'

export type ContractType = 'VENDA' | 'TROCA' | 'COMPRA' | 'CONSIGNACAO'

export type ImportJobStatus =
  | 'AGUARDANDO'
  | 'PROCESSANDO'
  | 'CONCLUIDO'
  | 'CONCLUIDO_COM_ERROS'
  | 'ERRO'

export type SheetTabType =
  | 'VENDAS' | 'TROCAS' | 'CLIENTES' | 'VEICULOS' | 'CONTRATOS'
  | 'COMISSOES' | 'GARANTIAS' | 'RETORNOS' | 'PENDENCIAS' | 'VENDEDORES'
  | 'GERENTES' | 'UNIDADES' | 'CONFIGURACOES' | 'PERSONALIZADO'

// ── User & Auth ───────────────────────────────────────────────────────────────

export interface User {
  id:          string
  name:        string
  email:       string
  phone:       string | null
  role:        UserRole
  status:      UserStatus
  unitId:      string | null
  image:       string | null
  lastLoginAt: Date | null
  createdAt:   Date
  updatedAt:   Date
}

export interface UserSession {
  id:     string
  name:   string
  email:  string
  role:   UserRole
  status: UserStatus
  unitId: string | null
  image?: string | null
}

// ── Unit ──────────────────────────────────────────────────────────────────────

export interface Unit {
  id:          string
  name:        string
  razaoSocial: string | null
  cnpj:        string
  address:     string | null
  city:        string | null
  state:       string | null
  zipCode:     string | null
  phone:       string | null
  email:       string | null
  responsavel: string | null
  active:      boolean
  notes:       string | null
  createdAt:   Date
  updatedAt:   Date
}

// ── Seller ────────────────────────────────────────────────────────────────────

export interface Seller {
  id:             string
  userId:         string
  fullName:       string
  shortName:      string | null
  cpf:            string | null
  rg:             string | null
  birthDate:      Date | null
  whatsapp:       string | null
  email:          string | null
  unitId:         string
  managerId:      string | null
  cargo:          string | null
  active:         boolean
  receivesCharge: boolean
  notes:          string | null
  createdAt:      Date
  updatedAt:      Date
}

export interface SellerWithRelations extends Seller {
  user:    User
  unit:    Unit
  manager?: Manager | null
}

// ── Manager ───────────────────────────────────────────────────────────────────

export interface Manager {
  id:                    string
  userId:                string
  fullName:              string
  cpf:                   string | null
  whatsapp:              string | null
  email:                 string | null
  unitId:                string
  accessProfile:         string | null
  active:                boolean
  receivesNotifications: boolean
  notes:                 string | null
  createdAt:             Date
  updatedAt:             Date
}

export interface ManagerWithRelations extends Manager {
  user: User
  unit: Unit
}

// ── Customer ──────────────────────────────────────────────────────────────────

export interface Customer {
  id:        string
  name:      string
  cpf:       string | null
  phone:     string | null
  email:     string | null
  address:   string | null
  city:      string | null
  state:     string | null
  notes:     string | null
  createdAt: Date
  updatedAt: Date
}

// ── Vehicle ───────────────────────────────────────────────────────────────────

export interface Vehicle {
  id:         string
  plate:      string | null
  brand:      string | null
  model:      string | null
  year:       number | null
  color:      string | null
  chassi:     string | null
  renavam:    string | null
  customerId: string | null
  notes:      string | null
  createdAt:  Date
  updatedAt:  Date
}

// ── Contract ──────────────────────────────────────────────────────────────────

export interface Contract {
  id:              string
  number:          string | null
  type:            ContractType
  customerId:      string | null
  vehicleId:       string | null
  sellerId:        string | null
  managerId:       string | null
  unitId:          string | null
  saleValue:       number | null
  financedValue:   number | null
  bank:            string | null
  returnRate:      number | null
  warrantyValue:   number | null
  warrantyProduct: string | null
  docValue:        number | null
  saleDate:        Date | null
  status:          string | null
  pdfPath:         string | null
  notes:           string | null
  rawData:         Record<string, unknown> | null
  createdAt:       Date
  updatedAt:       Date
}

export interface ContractParseResult {
  id:              string
  contractId:      string | null
  pdfOriginalName: string
  pdfPath:         string | null
  parsedData:      Record<string, unknown>
  extractedFields: Record<string, unknown> | null
  validationErrors:Record<string, unknown> | null
  status:          string
  reviewedById:    string | null
  reviewedAt:      Date | null
  notes:           string | null
  createdAt:       Date
  updatedAt:       Date
}

// ── Service & Warranty ────────────────────────────────────────────────────────

export interface Service {
  id:                string
  name:              string
  category:          string | null
  defaultValue:      number
  defaultCommission: number
  commissionType:    string
  active:            boolean
  notes:             string | null
  createdAt:         Date
  updatedAt:         Date
}

export interface Warranty {
  id:                string
  name:              string
  provider:          string | null
  defaultValue:      number
  minValue:          number
  defaultCommission: number
  commissionType:    string
  active:            boolean
  notes:             string | null
  createdAt:         Date
  updatedAt:         Date
}

// ── Pendency ──────────────────────────────────────────────────────────────────

export interface Pendency {
  id:              string
  responsibleId:   string
  managerId:       string | null
  customerId:      string | null
  vehicleId:       string | null
  contractId:      string | null
  customerName:    string
  plate:           string | null
  vehicle:         string | null
  negotiation:     string | null
  description:     string | null
  lead:            string | null
  priority:        PendencyPriority
  status:          PendencyStatus
  type:            string | null
  unitId:          string
  chargeRecipient: string | null
  dueDate:         Date | null
  resolvedAt:      Date | null
  resolvedByUserId:string | null
  lastSentAt:      Date | null
  nextSendAt:      Date | null
  totalSent:       number
  maxSends:        number | null
  sendsPerDay:     number | null
  automaticSend:   boolean
  frequency:       string | null
  allowedDays:     string[]
  startTime:       string | null
  endTime:         string | null
  templateId:      string | null
  source:          string | null
  referenceMonth:  string | null
  notes:           string | null
  createdAt:       Date
  updatedAt:       Date
}

// Pendency.vehicle (no schema Prisma) é um texto legado (string?). A relação
// real com Vehicle vem por vehicleId. Omitimos a coluna texto para reutilizá-la
// como objeto rico aqui (ex: `pendency.vehicle?.plate`).
export interface PendencyWithRelations extends Omit<Pendency, 'vehicle'> {
  /** Texto legado do veículo (placa/modelo livre) — mantido para compat. */
  vehicleLabel?: string | null
  unit:        { id: string; name: string }
  responsible: { id: string; fullName: string; shortName: string | null; whatsapp: string | null }
  manager:     { id: string; fullName: string; whatsapp: string | null } | null
  customer?:   Customer | null
  vehicle?:    Vehicle | null
  initialDate?: string | Date | null
  resolvedByUser?:  { id: string; name: string } | null
  assignedUser?:    { id: string; name: string; role: string } | null
  validatedByUser?: { id: string; name: string } | null
  escalatedByUser?: { id: string; name: string } | null
  statusHistory?:   PendencyStatusHistory[]
  comments?:        PendencyComment[]
  messageReturns?:  MessageReturn[]
  // Campos Central de Avisos
  severity?:          string | null
  slaMinutes?:        number | null
  slaDeadline?:       string | null
  assignedUserId?:    string | null
  originModule?:      string | null
  originRecordId?:    string | null
  cancelReason?:      string | null
  reopenedAt?:        string | null
  validatedAt?:       string | null
  validatedByUserId?: string | null
  escalatedAt?:       string | null
  escalatedByUserId?: string | null
}

export interface PendencyStatusHistory {
  id:              string
  pendencyId:      string
  previousStatus:  string | null
  newStatus:       string
  changedByUserId: string | null
  reason:          string | null
  createdAt:       Date
  changedByUser?:  { name: string } | null
}

export interface PendencyComment {
  id:        string
  pendencyId:string
  userId:    string
  content:   string
  internal:  boolean
  createdAt: Date
  updatedAt: Date
  user?:     { name: string }
}

// ── Notification ──────────────────────────────────────────────────────────────

export interface Notification {
  id:        string
  userId:    string
  title:     string
  message:   string
  type:      NotificationType
  read:      boolean
  actionUrl: string | null
  metadata:  Record<string, unknown> | null
  createdAt: Date
}

export interface NotificationToast {
  id:         string
  type:       NotificationType
  title:      string
  message:    string
  avatar?:    string | null
  duration?:  number
  href?:      string | null
  actionUrl?: string | null  // URL para a qual o toast direciona quando clicado
  createdAt:  Date
}

export interface NotificationDelivery {
  id:             string
  notificationId: string
  userId:         string
  channel:        NotificationChannel
  status:         NotificationStatus
  sentAt:         Date | null
  deliveredAt:    Date | null
  readAt:         Date | null
  errorMessage:   string | null
  externalId:     string | null
  createdAt:      Date
  updatedAt:      Date
}

export interface NotificationPreference {
  id:              string
  userId:          string
  appWeb:          boolean
  appMobile:       boolean
  whatsapp:        boolean
  email:           boolean
  push:            boolean
  newPendency:     boolean
  pendencyUrgent:  boolean
  commissionPaid:  boolean
  systemAlerts:    boolean
  quietHoursStart: string | null
  quietHoursEnd:   string | null
  updatedAt:       Date
}

// ── Commission ────────────────────────────────────────────────────────────────

export interface CommissionRule {
  id:             string
  name:           string
  description:    string | null
  ruleType:       CommissionRuleType
  role:           UserRole | null
  sellerId:       string | null
  managerId:      string | null
  unitId:         string | null
  serviceId:      string | null
  warrantyId:     string | null
  bank:           string | null
  fromQuantity:   number | null
  toQuantity:     number | null
  fromValue:      number | null
  toValue:        number | null
  fixedValue:     number | null
  percentage:     number | null
  commissionType: string
  active:         boolean
  priority:       number
  validFrom:      Date | null
  validUntil:     Date | null
  notes:          string | null
  createdAt:      Date
  updatedAt:      Date
}

export interface ReturnPercentRule {
  id:                   string
  name:                 string
  percentualInformado:  number
  percentualAplicado:   number
  bank:                 string | null
  tipoRetorno:          string | null
  active:               boolean
  validFrom:            Date | null
  validUntil:           Date | null
  notes:                string | null
  createdAt:            Date
  updatedAt:            Date
}

export interface WarrantyRule {
  id:                 string
  warrantyId:         string
  name:               string
  defaultValue:       number
  minValue:           number
  commissionDefault:  number
  commissionDiscount: number
  commissionType:     string
  sellerId:           string | null
  managerId:          string | null
  unitId:             string | null
  active:             boolean
  notes:              string | null
  createdAt:          Date
  updatedAt:          Date
}

export interface CommissionCalculation {
  id:              string
  contractId:      string | null
  sellerId:        string | null
  managerId:       string | null
  unitId:          string | null
  period:          string
  ruleId:          string | null
  ruleType:        CommissionRuleType
  description:     string
  baseValue:       number
  rateApplied:     number | null
  commissionValue: number
  ruleDetails:     Record<string, unknown> | null
  status:          CommissionStatus
  approvedById:    string | null
  approvedAt:      Date | null
  paidAt:          Date | null
  notes:           string | null
  createdAt:       Date
  updatedAt:       Date
}

export interface CommissionExtract {
  id:             string
  userId:         string
  sellerId:       string | null
  unitId:         string | null
  calculationId:  string | null
  period:         string
  type:           string
  referenceId:    string | null
  description:    string | null
  value:          number
  status:         CommissionStatus
  approvedById:   string | null
  approvedAt:     Date | null
  paidAt:         Date | null
  notes:          string | null
  createdAt:      Date
  updatedAt:      Date
}

// ── Google Sheets ─────────────────────────────────────────────────────────────

export interface GoogleSheetConfig {
  id:            string
  name:          string
  spreadsheetId: string
  description:   string | null
  active:        boolean
  lastSyncAt:    Date | null
  syncStatus:    string | null
  createdAt:     Date
  updatedAt:     Date
}

export interface GoogleSheetTab {
  id:             string
  configId:       string
  internalName:   string
  sheetName:      string
  description:    string | null
  tabType:        SheetTabType
  active:         boolean
  headerRow:      number
  lastSyncAt:     Date | null
  lastSyncStatus: string | null
  lastSyncError:  string | null
  totalRowsLast:  number | null
  createdAt:      Date
  updatedAt:      Date
}

export interface GoogleSheetColumnMap {
  id:           string
  tabId:        string
  columnLetter: string
  columnHeader: string | null
  fieldName:    string
  fieldLabel:   string | null
  required:     boolean
  transform:    string | null
  defaultValue: string | null
  active:       boolean
  createdAt:    Date
  updatedAt:    Date
}

export interface ImportJob {
  id:             string
  configId:       string | null
  tabId:          string | null
  triggeredById:  string | null
  status:         ImportJobStatus
  totalRows:      number
  processedRows:  number
  newRecords:     number
  updatedRecords: number
  errorRows:      number
  errors:         Record<string, unknown> | null
  startedAt:      Date | null
  finishedAt:     Date | null
  createdAt:      Date
}

// ── E-mail ────────────────────────────────────────────────────────────────────

export interface EmailConfig {
  id:           string
  name:         string
  smtpHost:     string
  smtpPort:     number
  smtpSecure:   boolean
  smtpUser:     string
  smtpPass:     string
  fromName:     string
  fromEmail:    string
  replyTo:      string | null
  active:       boolean
  lastTestedAt: Date | null
  lastTestOk:   boolean
  createdAt:    Date
  updatedAt:    Date
}

// ── System ────────────────────────────────────────────────────────────────────

export interface SystemSetting {
  id:              string
  key:             string
  value:           string
  description:     string | null
  group:           string | null
  isPublic:        boolean
  updatedAt:       Date
  updatedByUserId: string | null
}

export interface AuditLog {
  id:          string
  userId:      string | null
  userName:    string | null
  userRole:    string | null
  action:      string
  entity:      string
  entityId:    string | null
  beforeData:  Record<string, unknown> | null
  afterData:   Record<string, unknown> | null
  ipAddress:   string | null
  userAgent:   string | null
  status:      string | null
  errorMessage:string | null
  createdAt:   Date
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────

export interface WhatsappTemplate {
  id:                  string
  name:                string
  description:         string | null
  templateName:        string
  bodyText:            string | null
  variables:           string[]
  hasHeaderImage:      boolean
  headerImageUrl:      string | null
  expectedParamsCount: number
  active:              boolean
  createdAt:           Date
  updatedAt:           Date
}

export interface MessageReturn {
  id:                string
  whatsappFrom:      string
  profileName:       string | null
  messageType:       string | null
  messageBody:       string | null
  whatsappMessageId: string | null
  pendencyId:        string | null
  sellerId:          string | null
  managerId:         string | null
  customerName:      string | null
  plate:             string | null
  rawPayload:        Record<string, unknown> | null
  createdAt:         Date
}

// ── API Response wrappers ─────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success:  boolean
  data?:    T
  message?: string
  error?:   string
  errors?:  Record<string, string[]>
}

export interface PaginatedResponse<T = unknown> {
  success: boolean
  data:    T[]
  meta: {
    total:       number
    page:        number
    perPage:     number
    totalPages:  number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
  message?: string
  error?:   string
}

// ── Filter States ─────────────────────────────────────────────────────────────

export interface PendencyFilters {
  search?:       string
  status?:       PendencyStatus | PendencyStatus[]
  priority?:     PendencyPriority | PendencyPriority[]
  unitId?:       string | string[]
  sellerId?:     string
  responsibleId?:string
  managerId?:    string
  source?:       string
  dueDateFrom?:  string
  dueDateTo?:    string
  createdAtFrom?:string
  createdAtTo?:  string
  page?:         number
  perPage?:      number
  sortBy?:       keyof Pendency
  sortOrder?:    'asc' | 'desc'
}

export interface CommissionFilters {
  sellerId?:     string
  unitId?:       string
  status?:       CommissionStatus | CommissionStatus[]
  period?:       string
  createdAtFrom?:string
  createdAtTo?:  string
  page?:         number
  perPage?:      number
}
