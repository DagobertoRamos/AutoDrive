// =============================================================================
// Tratamento de fotos (estúdio) — lado do banco.
// A extensão do Chrome trata as fotos no chat e grava aqui, pelo token de
// integração da loja (o mesmo `x-autoconf-token` das negociações).
//
// Ciclo de um carro (SiteListing.photosStatus):
//   ORIGEM ──start──▶ EM_TRATAMENTO (travado) ──finish──▶ TRATADA (travado)
//                         └──────────restore──────────▶ ORIGEM (fotos de antes)
//
// TRAVA: a importação do site de origem regrava as fotos a cada hora. Com
// photosLocked ela não toca mais na galeria — é o que impede a foto tratada
// de ser trocada de volta pela do parceiro (ver feed-import.ts).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { feedOrigins } from '@/lib/site/feed-import'
import { isPlaceholderPhoto } from '@/lib/site/feed-import-core'
import { storeTenantImage } from '@/lib/site/assets'
import { absoluteUrl, cleanTreatedList, originFolder, splitPhotos, treatedAtOrigin, vehicleFolder, vehicleOrigin } from './photo-studio-core'

export const PHOTO_STATUS = ['ORIGEM', 'EM_TRATAMENTO', 'TRATADA'] as const
export type PhotoStatusName = (typeof PHOTO_STATUS)[number]

/** Estoque que ainda vai (ou já está) no site: não vale tratar carro vendido. */
const TREATABLE_STOCK = ['DISPONIVEL', 'EM_PROMOCAO', 'RESERVADO', 'EM_PRECIFICACAO', 'PENDENTE_PREPARACAO'] as const

export class StudioError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

const vehicleSelect = {
  id: true, tenantId: true, plate: true, brand: true, model: true, version: true, year: true, modelYear: true, km: true,
  color: true, fuel: true, transmission: true, stockType: true, stockStatus: true, cautelarStatus: true, active: true,
  photos: { select: { url: true }, orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }] },
  siteListing: { select: { photosStatus: true, photosLocked: true, originalPhotos: true, title: true, options: true } },
}

/**
 * Fila para a extensão. Sem `situacao`: carros com fotos da ORIGEM e sem
 * trava. Com EM_TRATAMENTO: os que ficaram no meio (sempre travados), para
 * retomar de onde pararam.
 */
export async function studioQueue(tenantId: string, opts: { limit: number; status: PhotoStatusName; origin: string }) {
  const listingWhere =
    opts.status === 'ORIGEM'
      ? { OR: [{ siteListing: { is: null } }, { siteListing: { is: { photosStatus: 'ORIGEM', photosLocked: false } } }] }
      : { siteListing: { is: { photosStatus: opts.status } } }

  const rows = await prisma.vehicle.findMany({
    where: {
      tenantId, active: true,
      stockStatus: { in: [...TREATABLE_STOCK] },
      photos: { some: {} },
      ...listingWhere,
    },
    select: vehicleSelect,
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit * 3, 900), // folga: alguns saem por só terem arte da loja
  })

  const origins = await feedOrigins(tenantId)
  let semFotoPropria = 0
  let artesIgnoradas = 0
  let jaTratadosNaOrigem = 0
  const veiculos = []
  for (const v of rows) {
    // Na retomada a galeria já foi trocada? Não: EM_TRATAMENTO mantém as da
    // origem na galeria e guarda cópia em originalPhotos. Usa a cópia se houver.
    // Auditoria (TRATADA) confere a galeria publicada, não a de antes.
    const saved = opts.status !== 'TRATADA' && Array.isArray(v.siteListing?.originalPhotos) ? (v.siteListing!.originalPhotos as unknown[]).filter((x): x is string => typeof x === 'string') : null
    const gallery = (saved?.length ? saved : v.photos.map((p) => p.url)).filter((u) => !isPlaceholderPhoto(u))
    const { photos, storeArt } = opts.status === 'TRATADA' ? { photos: gallery, storeArt: [] } : splitPhotos(gallery)
    artesIgnoradas += storeArt.length
    if (!photos.length) { semFotoPropria++; continue }
    if (opts.status === 'ORIGEM' && treatedAtOrigin(photos)) { jaTratadosNaOrigem++; continue }
    const o = origins[v.id]
    const origem = vehicleOrigin(o, v.stockType)
    const titulo = v.siteListing?.title || [v.brand, v.model, v.version].filter(Boolean).join(' ') || 'Veículo'
    veiculos.push({
      id: v.id,
      titulo,
      placa: v.plate,
      codigo: o?.internalCode ?? null,
      marca: v.brand, modelo: v.model, versao: v.version,
      anoFabricacao: v.year, anoModelo: v.modelYear, km: v.km,
      cor: v.color, combustivel: v.fuel, cambio: v.transmission,
      laudo: v.cautelarStatus,
      opcionais: Array.isArray(v.siteListing?.options) ? v.siteListing!.options : [],
      origem: origem.kind, // PARCEIRO | PROPRIO | PARTICULAR
      parceiro: origem.store,
      cidadeParceiro: o?.partnerCity ?? null,
      anuncioOriginal: o?.sourceUrl ?? null,
      pastaParceiro: originFolder(origem),
      pastaVeiculo: vehicleFolder({ id: v.id, plate: v.plate, internalCode: o?.internalCode, brand: v.brand, model: v.model, version: v.version, modelYear: v.modelYear }),
      situacao: v.siteListing?.photosStatus ?? 'ORIGEM',
      fotos: photos.map((u) => absoluteUrl(u, originOf())),
      artesDaLoja: storeArt,
    })
    if (veiculos.length >= opts.limit) break
  }
  const filtered = opts.origin ? veiculos.filter((v) => v.origem === opts.origin || v.parceiro === opts.origin) : veiculos
  const emTratamento = await prisma.siteListing.count({ where: { tenantId, photosStatus: 'EM_TRATAMENTO' } })
  const estoqueComFoto = await prisma.vehicle.count({ where: { tenantId, active: true, photos: { some: {} } } })
  return { total: filtered.length, estoqueComFoto, semFotoPropria, artesIgnoradas, jaTratadosNaOrigem, emTratamento, veiculos: filtered }
}

/** Origem pública do SaaS, para devolver URL absoluta de foto guardada aqui. */
function originOf(): string {
  return (process.env.NEXTAUTH_URL || process.env.APP_URL || 'https://www.appautodrive.online').replace(/\/+$/, '')
}

async function vehicleOf(tenantId: string, vehicleId: string) {
  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId }, select: vehicleSelect })
  if (!v) throw new StudioError('Veículo não encontrado nesta loja.', 404)
  return v
}

/**
 * Começa o tratamento: trava e marca EM_TRATAMENTO. A galeria NÃO muda — o
 * site continua mostrando as fotos da origem até as tratadas ficarem prontas.
 * Guarda a lista de antes para poder reverter. Idempotente (retomada).
 */
export async function studioStart(tenantId: string, vehicleId: string) {
  const v = await vehicleOf(tenantId, vehicleId)
  if (v.siteListing?.photosStatus === 'TRATADA') throw new StudioError('Este veículo já tem fotos tratadas. Restaure antes de tratar de novo.', 409)
  const current = v.photos.map((p) => p.url)
  const keep = Array.isArray(v.siteListing?.originalPhotos) && (v.siteListing!.originalPhotos as unknown[]).length ? undefined : current
  await prisma.siteListing.upsert({
    where: { vehicleId },
    create: { tenantId, vehicleId, photosStatus: 'EM_TRATAMENTO', photosLocked: true, photosLockedAt: new Date(), originalPhotos: current },
    update: { photosStatus: 'EM_TRATAMENTO', photosLocked: true, photosLockedAt: new Date(), ...(keep ? { originalPhotos: keep } : {}) },
  })
  return { id: vehicleId, situacao: 'EM_TRATAMENTO' as const }
}

/** Guarda UMA foto tratada (ainda fora da galeria) e devolve o endereço. */
export async function studioUpload(tenantId: string, vehicleId: string, bytes: Uint8Array) {
  await vehicleOf(tenantId, vehicleId)
  const saved = await storeTenantImage(tenantId, 'VEHICLE_PHOTO', bytes)
  return { url: saved.url, absoluta: absoluteUrl(saved.url, originOf()), largura: saved.width, altura: saved.height }
}

/**
 * Publica: troca a galeria inteira pelas tratadas, na ordem, 1ª = principal,
 * situação TRATADA e trava. Tudo numa transação — ou vai tudo, ou nada.
 */
export async function studioFinish(tenantId: string, vehicleId: string, urls: unknown) {
  const v = await vehicleOf(tenantId, vehicleId)
  const list = cleanTreatedList(urls)
  if (!list) throw new StudioError('Envie de 1 a 40 fotos, todas já guardadas pelo envio de foto tratada.')
  const ids = list.map((u) => u.split('/').pop()!)
  const found = await prisma.siteAsset.count({ where: { id: { in: ids }, tenantId, kind: 'VEHICLE_PHOTO' } })
  if (found !== ids.length) throw new StudioError('Alguma foto da lista não foi encontrada nesta loja. Reenvie as fotos.', 422)

  const before = v.photos.map((p) => p.url)
  const original = Array.isArray(v.siteListing?.originalPhotos) && (v.siteListing!.originalPhotos as unknown[]).length ? undefined : before
  await prisma.$transaction([
    prisma.vehiclePhoto.deleteMany({ where: { vehicleId } }),
    prisma.vehiclePhoto.createMany({ data: list.map((url, i) => ({ vehicleId, url, order: i, isMain: i === 0 })) }),
    prisma.vehicle.update({ where: { id: vehicleId }, data: { mainPhotoUrl: list[0] } }),
    prisma.siteListing.upsert({
      where: { vehicleId },
      create: { tenantId, vehicleId, photosStatus: 'TRATADA', photosLocked: true, photosLockedAt: new Date(), originalPhotos: before, publishedAt: new Date() },
      update: { photosStatus: 'TRATADA', photosLocked: true, photosLockedAt: new Date(), ...(original ? { originalPhotos: original } : {}), publishedAt: new Date() },
    }),
  ])
  // As fotos de antes NÃO são apagadas: estão em originalPhotos e são o que
  // a restauração devolve (inclusive as enviadas pelo painel, que moram aqui).
  return { id: vehicleId, situacao: 'TRATADA' as const, fotos: list.length }
}

/** Desfaz: volta as fotos de antes, destrava e marca ORIGEM. */
export async function studioRestore(tenantId: string, vehicleId: string) {
  const v = await vehicleOf(tenantId, vehicleId)
  const original = Array.isArray(v.siteListing?.originalPhotos) ? (v.siteListing!.originalPhotos as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const ops = []
  if (original.length && v.siteListing?.photosStatus === 'TRATADA') {
    ops.push(
      prisma.vehiclePhoto.deleteMany({ where: { vehicleId } }),
      prisma.vehiclePhoto.createMany({ data: original.map((url, i) => ({ vehicleId, url, order: i, isMain: i === 0 })) }),
      prisma.vehicle.update({ where: { id: vehicleId }, data: { mainPhotoUrl: original[0] } }),
    )
  }
  ops.push(prisma.siteListing.upsert({
    where: { vehicleId },
    create: { tenantId, vehicleId, photosStatus: 'ORIGEM', photosLocked: false },
    update: { photosStatus: 'ORIGEM', photosLocked: false, photosLockedAt: null, originalPhotos: [] },
  }))
  await prisma.$transaction(ops)
  if (ops.length > 1) {
    // As tratadas saíram da galeria: não ficam ocupando o banco.
    const treated = v.photos.map((p) => /\/api\/site\/assets\/([a-z0-9]{10,40})$/i.exec(p.url)?.[1]).filter((x): x is string => !!x)
    const keep = new Set(original.map((u) => /\/api\/site\/assets\/([a-z0-9]{10,40})$/i.exec(u)?.[1]).filter(Boolean))
    await prisma.siteAsset.deleteMany({ where: { tenantId, kind: 'VEHICLE_PHOTO', id: { in: treated.filter((id) => !keep.has(id)) } } }).catch(() => undefined)
  }
  return { id: vehicleId, situacao: 'ORIGEM' as const }
}
