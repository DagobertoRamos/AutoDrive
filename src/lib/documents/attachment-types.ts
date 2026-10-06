// Tipos de documento anexável e de registro dono (DocumentAttachment).
// Sem dependências de servidor: usado pela API e pelo DocumentsPanel.

export const DOC_ENTITY_TYPES = ['DEAL_SERVICE', 'WARRANTY_SALE', 'VEHICLE_SERVICE', 'DEAL_PAYMENT', 'SUPPLIER', 'PAYROLL', 'DEAL', 'VEHICLE'] as const
export type DocEntityType = (typeof DOC_ENTITY_TYPES)[number]

export const DOC_TYPES = ['NOTA_FISCAL', 'BOLETO', 'COMPROVANTE', 'CONTRATO', 'RECIBO', 'OUTRO'] as const
export type DocType = (typeof DOC_TYPES)[number]

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  NOTA_FISCAL: 'Nota fiscal',
  BOLETO: 'Boleto',
  COMPROVANTE: 'Comprovante',
  CONTRATO: 'Contrato',
  RECIBO: 'Recibo',
  OUTRO: 'Outro',
}

export const isDocEntityType = (v: unknown): v is DocEntityType => typeof v === 'string' && (DOC_ENTITY_TYPES as readonly string[]).includes(v)
export const isDocType = (v: unknown): v is DocType => typeof v === 'string' && (DOC_TYPES as readonly string[]).includes(v)
export const normalizeDocType = (v: unknown): DocType => (isDocType(v) ? v : 'OUTRO')
export const docTypeLabel = (v: string | null | undefined) => (isDocType(v) ? DOC_TYPE_LABEL[v] : DOC_TYPE_LABEL.OUTRO)

/** Folha: entityId = `${userId}:${YYYY-MM}`. */
export function parsePayrollEntityId(id: string): { userId: string; month: string } | null {
  const m = /^([^:\s]{1,64}):(\d{4})-(0[1-9]|1[0-2])$/.exec(id || '')
  return m ? { userId: m[1], month: `${m[2]}-${m[3]}` } : null
}
export const payrollEntityId = (userId: string, month: string) => `${userId}:${month}`

export const DOCS_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,text/xml,application/xml,.xml'
export const MAX_DOCS_PER_ENTITY = 50

/** Formato devolvido pela API (também usado pelo DocumentsPanel). */
export type DocumentRow = { id: string; entityType: string; entityId: string; docType: string; name: string; mimeType: string | null; size: number | null; createdAt: Date; createdById: string | null }

export function documentView(a: DocumentRow, uploaderName: string | null) {
  return {
    id: a.id, entityType: a.entityType, entityId: a.entityId, docType: a.docType, name: a.name,
    mimeType: a.mimeType, size: a.size, createdAt: a.createdAt, createdById: a.createdById,
    uploaderName, openUrl: `/api/documents/attachments/${a.id}/file`,
  }
}

export type DocumentItem = ReturnType<typeof documentView>
