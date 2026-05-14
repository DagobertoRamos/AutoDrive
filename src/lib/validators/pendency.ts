// =============================================================================
// Zod validators — Pendências — AutoDrive
// =============================================================================

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared field definitions
// ---------------------------------------------------------------------------

const priorityEnum = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'], {
  errorMap: () => ({ message: 'Prioridade inválida.' }),
})

const statusEnum = z.enum(
  ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_RESPOSTA', 'PAUSADA', 'FINALIZADA', 'REATIVADA', 'CANCELADA', 'VENCIDA'],
  { errorMap: () => ({ message: 'Status inválido.' }) },
)

const phoneField = z
  .string()
  .regex(/^\+?[\d\s\-().]{8,20}$/, 'Telefone inválido.')
  .nullable()
  .optional()

// ---------------------------------------------------------------------------
// Create Pendency
// ---------------------------------------------------------------------------

export const createPendencySchema = z.object({
  title: z
    .string({ required_error: 'Título é obrigatório.' })
    .min(3, 'Título deve ter ao menos 3 caracteres.')
    .max(200, 'Título muito longo.'),
  description: z
    .string()
    .max(5000, 'Descrição muito longa.')
    .nullable()
    .optional(),
  priority: priorityEnum.default('MEDIA'),
  unitId: z
    .string({ required_error: 'Unidade é obrigatória.' })
    .cuid('ID de unidade inválido.'),
  sellerId: z.string().cuid('ID de vendedor inválido.').nullable().optional(),
  managerId: z.string().cuid('ID de gerente inválido.').nullable().optional(),
  serviceId: z.string().cuid('ID de serviço inválido.').nullable().optional(),
  assignedToId: z
    .string()
    .cuid('ID de responsável inválido.')
    .nullable()
    .optional(),
  dueDate: z.coerce
    .date()
    .min(new Date(), 'A data de vencimento não pode ser no passado.')
    .nullable()
    .optional(),
  reminderAt: z.coerce.date().nullable().optional(),
  clientName: z
    .string()
    .max(120, 'Nome do cliente muito longo.')
    .nullable()
    .optional(),
  clientPhone: phoneField,
  clientEmail: z
    .string()
    .email('E-mail do cliente inválido.')
    .nullable()
    .optional(),
  vehiclePlate: z
    .string()
    .regex(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$|^[A-Z]{3}[0-9]{4}$/, 'Placa inválida.')
    .nullable()
    .optional(),
  vehicleModel: z
    .string()
    .max(100, 'Modelo do veículo muito longo.')
    .nullable()
    .optional(),
  saleValue: z
    .number()
    .positive('Valor de venda deve ser positivo.')
    .nullable()
    .optional(),
  tags: z.array(z.string().max(50)).max(10, 'Máximo de 10 tags.').optional(),
  attachments: z
    .array(z.string().url('URL de anexo inválida.'))
    .max(20, 'Máximo de 20 anexos.')
    .optional(),
})

export type CreatePendencyInput = z.infer<typeof createPendencySchema>

// ---------------------------------------------------------------------------
// Update Pendency (campos parciais)
// ---------------------------------------------------------------------------

export const updatePendencySchema = createPendencySchema
  .partial()
  .extend({
    status: statusEnum.optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'Informe ao menos um campo para atualizar.' },
  )

export type UpdatePendencyInput = z.infer<typeof updatePendencySchema>

// ---------------------------------------------------------------------------
// Resolve Pendency
// ---------------------------------------------------------------------------

export const resolvePendencySchema = z.object({
  resolutionNote: z
    .string({ required_error: 'Informe uma nota de resolução.' })
    .min(5, 'A nota de resolução deve ter ao menos 5 caracteres.')
    .max(2000, 'Nota de resolução muito longa.'),
})

export type ResolvePendencyInput = z.infer<typeof resolvePendencySchema>

// ---------------------------------------------------------------------------
// Reject / Not Resolved
// ---------------------------------------------------------------------------

export const rejectPendencySchema = z.object({
  resolutionNote: z
    .string({ required_error: 'Informe o motivo da não resolução.' })
    .min(5, 'O motivo deve ter ao menos 5 caracteres.')
    .max(2000, 'Motivo muito longo.'),
})

export type RejectPendencyInput = z.infer<typeof rejectPendencySchema>

// ---------------------------------------------------------------------------
// Escalate Pendency
// ---------------------------------------------------------------------------

export const escalatePendencySchema = z.object({
  escalatedToId: z
    .string({ required_error: 'Informe o responsável para escalonamento.' })
    .cuid('ID do usuário inválido.'),
  note: z
    .string()
    .max(1000, 'Nota de escalonamento muito longa.')
    .nullable()
    .optional(),
})

export type EscalatePendencyInput = z.infer<typeof escalatePendencySchema>

// ---------------------------------------------------------------------------
// Pause / Cancel Pendency
// ---------------------------------------------------------------------------

export const changePendencyStatusSchema = z.object({
  status: z.enum(['PAUSADA', 'CANCELADA', 'REATIVADA', 'EM_ANDAMENTO'], {
    errorMap: () => ({ message: 'Status inválido para esta operação.' }),
  }),
  note: z
    .string()
    .max(1000, 'Nota muito longa.')
    .nullable()
    .optional(),
})

export type ChangePendencyStatusInput = z.infer<typeof changePendencyStatusSchema>

// ---------------------------------------------------------------------------
// Filter Pendencies (query string / server action)
// ---------------------------------------------------------------------------

export const pendencyFiltersSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.union([statusEnum, z.array(statusEnum)]).optional(),
  priority: z.union([priorityEnum, z.array(priorityEnum)]).optional(),
  unitId: z.union([z.string().cuid(), z.array(z.string().cuid())]).optional(),
  sellerId: z.string().cuid().optional(),
  managerId: z.string().cuid().optional(),
  serviceId: z.string().cuid().optional(),
  assignedToId: z.string().cuid().optional(),
  createdById: z.string().cuid().optional(),
  isEscalated: z
    .string()
    .transform((v) => v === 'true')
    .or(z.boolean())
    .optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
  createdAtFrom: z.coerce.date().optional(),
  createdAtTo: z.coerce.date().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum([
      'createdAt',
      'updatedAt',
      'dueDate',
      'priority',
      'status',
      'title',
    ])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type PendencyFiltersInput = z.infer<typeof pendencyFiltersSchema>

// ---------------------------------------------------------------------------
// Add Comment / Reply to Pendency
// ---------------------------------------------------------------------------

export const addCommentSchema = z.object({
  message: z
    .string({ required_error: 'Mensagem é obrigatória.' })
    .min(1, 'Mensagem é obrigatória.')
    .max(2000, 'Mensagem muito longa.'),
})

export type AddCommentInput = z.infer<typeof addCommentSchema>
