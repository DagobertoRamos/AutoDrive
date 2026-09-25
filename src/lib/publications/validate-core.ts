// =============================================================================
// Pendências antes de publicar. PURO (testado).
// Cada pendência diz O QUE falta e ONDE resolver. "error" bloqueia o envio
// para aquele canal; "warning" só avisa (ex.: texto cortado no limite).
// =============================================================================

import type { ChannelSpec } from './channels'
import { channelText, splitBrPhone, type ListingPayload } from './content-core'

export interface Issue {
  field: string
  severity: 'error' | 'warning'
  message: string
  hint: string
}

const PLATE = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/

export function normalizePlate(p?: string | null): string {
  return String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Validação comum + regras documentadas de cada canal. */
export function validatePayload(p: ListingPayload, spec: ChannelSpec): Issue[] {
  const issues: Issue[] = []
  const add = (field: string, severity: Issue['severity'], message: string, hint: string) => issues.push({ field, severity, message, hint })
  const v = p.vehicle
  const portal = spec.group === 'PORTAL'
  const ESTOQUE = 'Complete no Estoque › ficha do veículo.'

  // Fotos
  if (p.photos.length < spec.media.min) add('photos', 'error', `${spec.name} exige pelo menos ${spec.media.min} foto(s).`, 'Envie ou aprove as fotos no painel de fotos do veículo.')
  if (p.photos.length > spec.media.max) add('photos', 'warning', `${spec.name} aceita até ${spec.media.max} fotos; as ${p.photos.length - spec.media.max} últimas não serão enviadas.`, 'Reordene as fotos para as melhores ficarem entre as primeiras.')

  // Preço
  if (p.price == null && (portal || spec.id === 'SITE')) add('price', 'error', 'Preço de venda não definido.', 'Defina o preço em Estoque › Precificação ou no ajuste deste anúncio.')

  // Texto
  const t = channelText(p, spec)
  if (t.truncated.length) add('text', 'warning', `O ${t.truncated.join(' e a ')} passa do limite do canal e será cortado.`, 'Ajuste o texto específico deste canal na revisão.')

  if (portal) {
    if (!v.brand || !v.model) add('model', 'error', 'Marca e modelo são obrigatórios.', ESTOQUE)
    if (!v.year && !v.modelYear) add('year', 'error', 'Ano do veículo não informado.', ESTOQUE)
    if (v.km == null && !p.isNew) add('km', 'error', 'Quilometragem não informada.', ESTOQUE)
  }

  switch (spec.id) {
    case 'WEBMOTORS':
      if (!v.version) add('version', 'error', 'Versão obrigatória para a Webmotors.', ESTOQUE)
      if (!v.color) add('color', 'error', 'Cor obrigatória (43|73).', ESTOQUE)
      if (!v.fuel) add('fuel', 'error', 'Combustível obrigatório (43|77).', ESTOQUE)
      if (!v.transmission) add('transmission', 'error', 'Câmbio obrigatório (43|75).', ESTOQUE)
      if (!v.doors) add('doors', 'error', 'Número de portas obrigatório (43|76).', ESTOQUE)
      if (!p.isNew && !PLATE.test(normalizePlate(v.plate))) add('plate', 'error', 'Placa obrigatória e válida para usados (43|74).', ESTOQUE)
      break
    case 'OLX':
      if (!p.isNew && !PLATE.test(normalizePlate(v.plate))) add('plate', 'error', 'Placa (vehicle_tag) obrigatória para usados.', ESTOQUE)
      if (!splitBrPhone(p.contacts.whatsapp ?? p.contacts.phone)) add('phone', 'error', 'Telefone de contato com DDD é obrigatório.', 'Informe o WhatsApp da loja em Canais conectados › Contatos.')
      if (!String(p.location.zip ?? '').replace(/\D/g, '').match(/^\d{8}$/)) add('zipcode', 'error', 'CEP da loja é obrigatório.', 'Preencha o CEP no cadastro da empresa.')
      if (p.price != null && !Number.isInteger(p.price)) add('price', 'warning', 'A OLX não aceita centavos; o preço será arredondado.', 'Nada a fazer.')
      break
    case 'MERCADO_LIVRE':
      if (!v.version) add('version', 'error', 'Versão (TRIM) é obrigatória no Mercado Livre.', ESTOQUE)
      if (!p.isNew && !PLATE.test(normalizePlate(v.plate))) add('plate', 'error', 'Placa (LICENSE_PLATE) necessária para verificar o veículo.', ESTOQUE)
      if (!splitBrPhone(p.contacts.whatsapp)) add('whatsapp', 'error', 'WhatsApp da loja é obrigatório (seller_contact.phone2 desde 01/10/2026).', 'Informe o WhatsApp em Canais conectados › Contatos.')
      if (!v.chassi) add('chassi', 'warning', 'Sem chassi: o Mercado Livre usa os 6 últimos dígitos (VIN_LAST_DIGITS) para verificar o veículo.', ESTOQUE)
      break
    case 'CHAVES_NA_MAO':
      if (!v.color) add('color', 'error', 'Cor obrigatória.', ESTOQUE)
      if (!v.fuel) add('fuel', 'error', 'Combustível obrigatório.', ESTOQUE)
      if (!v.transmission) add('transmission', 'error', 'Câmbio obrigatório.', ESTOQUE)
      if (!v.doors || v.doors < 2 || v.doors > 5) add('doors', 'error', 'Portas obrigatórias (2 a 5).', ESTOQUE)
      if ((v.km ?? 0) > 0 && !PLATE.test(normalizePlate(v.plate))) add('plate', 'error', 'Placa obrigatória para veículo com quilometragem.', ESTOQUE)
      if (!v.version) add('version', 'error', 'Versão necessária para achar o trimId.', ESTOQUE)
      break
    case 'INSTAGRAM':
      if (p.caption.length > 2200) add('caption', 'warning', 'Legenda acima de 2.200 caracteres será cortada.', 'Encurte a legenda deste canal.')
      break
  }
  return issues
}

export const hasBlocking = (issues: Issue[]) => issues.some((i) => i.severity === 'error')
