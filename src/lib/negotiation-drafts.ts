// Rascunhos do assistente Nova Negociação — validação (PURO, testado).

export const DRAFT_MANAGERS = new Set(['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'])
export const isDraftManager = (role: string | null | undefined) => DRAFT_MANAGERS.has(String(role))

/** Etapas do assistente (mesma ordem da tela). */
export const DRAFT_STEP_LABELS = ['Tipo', 'Cliente', 'Veículos', 'Débitos', 'Pagamento', 'Agendamento', 'Resumo', 'Comentários'] as const
export const draftStepLabel = (step: number) => DRAFT_STEP_LABELS[step] ?? `Etapa ${step + 1}`

const TYPES = new Set(['VENDA', 'COMPRA', 'TROCA', 'CONSIGNACAO'])
export const DRAFT_MAX_BYTES = 256 * 1024

export function cleanDraftInput(body: unknown):
  { ok: true; data: { data: unknown; step: number; type: string | null; title: string | null } } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Rascunho inválido.' }
  const b = body as Record<string, unknown>
  if (!b.data || typeof b.data !== 'object') return { ok: false, error: 'Rascunho sem dados.' }
  const size = JSON.stringify(b.data).length
  if (size > DRAFT_MAX_BYTES) return { ok: false, error: 'Rascunho grande demais.' }
  const step = Number.isInteger(b.step) ? Math.min(Math.max(Number(b.step), 0), DRAFT_STEP_LABELS.length - 1) : 0
  const type = typeof b.type === 'string' && TYPES.has(b.type) ? b.type : null
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 160) || null : null
  return { ok: true, data: { data: b.data, step, type, title } }
}

/** Resumo do rascunho para a lista: "Cliente · Marca Modelo PLACA". */
export function draftTitle(form: { nomeCompleto?: string; razaoSocial?: string; vehicle?: { brand?: string; model?: string; plate?: string } }): string | null {
  const who = String(form.nomeCompleto || form.razaoSocial || '').trim()
  const car = [form.vehicle?.brand, form.vehicle?.model, form.vehicle?.plate].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ')
  return [who, car].filter(Boolean).join(' · ') || null
}
