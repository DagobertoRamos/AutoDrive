// =============================================================================
// Conector: Webmotors — Manutenção de anúncios de CARROS (webservice SOAP).
// Fonte: https://integracao.webmotors.com.br/manualintegracao/ + WSDL
// (lidos em 25/09/2026). Isto é a integração de MANUTENÇÃO de anúncios; a
// "API Site/Consultar Estoque" (Sensedia) só lê o Cockpit e não publica.
//
//   login:    wsLoginSistemaRevendedor.autenticar(cnpj, email, senha) → Hash (~1000 min)
//   publicar: IncluirCarro(pAnuncio) → CodigoAnuncio; fotos: IncluirFotoUrl (uma a uma, na ordem)
//   alterar:  AlterarCarro; fotos: ObterFotosCarro + ExcluirFoto + IncluirFotoUrl
//   retirar:  ExcluirCarro(pCodigoAnuncio, pMotivoExclusao)   (sem "pausar")
//   conferir: ObterEstoqueAtual → anúncio presente = publicado
// CodigoRetorno 500 = sucesso; 401/402/31 = sessão; 43|32 e 43|33 = cota.
// =============================================================================

import { channelSpec } from '../channels'
import { ConnectorError } from '../errors'
import { normalizePlate } from '../validate-core'
import { sourceKey, type Candidate } from '../mapping-core'
import type { ListingPayload } from '../content-core'
import { channelText } from '../content-core'
import type { Connector, ConnectorContext } from './types'
import { elements, soapEnvelope, soapFault, tag, tags } from './xml'

const spec = channelSpec('WEBMOTORS')!
const NS_STOCK = 'www.webmotors.com.br/wsEstoqueRevendedorWebMotors'
const NS_LOGIN = 'www.webmotors.com.br/wsLoginSistemaRevendedor'
const HOSTS = {
  PRODUCAO: { stock: 'https://integracao.webmotors.com.br/wsEstoqueRevendedorWebMotors.asmx', login: 'https://integracao.webmotors.com.br/wsLoginSistemaRevendedor.asmx' },
  HOMOLOGACAO: { stock: 'https://hportal.webmotors.com.br/IntegracaoRevendedor/wsEstoqueRevendedorWebMotors.asmx', login: 'https://hportal.webmotors.com.br/IntegracaoRevendedor/wsLoginSistemaRevendedor.asmx' },
}
const SESSION_MS = 900 * 60_000 // renova antes dos ~1000 min da sessão

export function wmCode(raw: string | null): string { return String(raw ?? '').replace(/[()\s]/g, '') }

/** CodigoRetorno → erro tipado (500 = sucesso). */
export function wmError(code: string, what: string): ConnectorError | null {
  const c = wmCode(code)
  if (!c || c === '500') return null
  if (c === '401' || c === '402' || c === '31') return new ConnectorError('AUTH', `${what}: sessão da Webmotors inválida ou expirada (${c}).`, undefined, { code: c })
  if (c === '403') return new ConnectorError('AUTH', `${what}: usuário de integração sem permissão (403).`, 'Peça à Webmotors a liberação do usuário de integração para manutenção de anúncios.', { code: c })
  if (c === '43|32' || c === '43|33') return new ConnectorError('QUOTA', `${what}: anúncios do pacote/modalidade esgotados (${c}).`, undefined, { code: c })
  if (c === '400' || c === '32') return new ConnectorError('UNAVAILABLE', `${what}: falha inesperada na Webmotors (${c}).`, undefined, { code: c })
  if (c === '74|13') return new ConnectorError('VALIDATION', `${what}: a Webmotors recusou informações do anúncio (74|13).`, 'Fale com o Atendimento Webmotors: há informação não permitida no anúncio.', { code: c })
  return new ConnectorError('VALIDATION', `${what}: recusado pela Webmotors (${c}).`, 'Confira marca, modelo, versão, ano, cor, câmbio, combustível, portas e placa.', { code: c })
}

function fieldsOf(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /<(?:\w+:)?(\w+)>([^<]*)<\/(?:\w+:)?\1>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) out[m[1]] = m[2]
  return out
}

/** Lista de códigos do bloco (id = campo indicado; rótulo = campo Nome… ou Descricao…). */
export function candidatesFrom(xml: string, blockTag: string, idKey: string): Candidate[] {
  return tags(xml, blockTag).map((b) => {
    const f = fieldsOf(b)
    const labelKey = Object.keys(f).find((k) => k.startsWith('Nome') || k.startsWith('Descricao'))
    return { id: f[idKey] ?? '', label: labelKey ? f[labelKey] : '' }
  }).filter((c) => c.id && c.label)
}

async function call(ctx: ConnectorContext, op: string, inner: string, opts: { login?: boolean; creates?: boolean } = {}): Promise<string> {
  const hosts = HOSTS[ctx.connection.environment] ?? HOSTS.PRODUCAO
  const ns = opts.login ? NS_LOGIN : NS_STOCK
  const res = await ctx.http.request({
    method: 'POST', url: opts.login ? hosts.login : hosts.stock, creates: opts.creates,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${ns}/${op}"` },
    body: soapEnvelope(op, ns, inner), timeoutMs: 45_000,
  })
  const fault = soapFault(res.text)
  if (res.status >= 500 && !fault) throw new ConnectorError('UNAVAILABLE', `Webmotors indisponível (${res.status}).`)
  if (fault) throw new ConnectorError(/hash|autentica/i.test(fault) ? 'AUTH' : 'VALIDATION', `Webmotors: ${fault.slice(0, 300)}`)
  if (res.status === 429) throw new ConnectorError('RATE_LIMIT', 'Webmotors: limite de requisições.', undefined, { retryAfterMs: 60_000 })
  return res.text
}

async function sessionHash(ctx: ConnectorContext, force = false): Promise<string> {
  const at = Number(ctx.secrets.hashAt ?? 0)
  if (!force && ctx.secrets.hash && ctx.now().getTime() - at < SESSION_MS) return ctx.secrets.hash
  if (!ctx.secrets.cnpj || !ctx.secrets.email || !ctx.secrets.senha) throw new ConnectorError('CONFIG', 'Credenciais da Webmotors incompletas.', 'Informe CNPJ, e-mail e senha do usuário de integração em Canais conectados.')
  const xml = await call(ctx, 'autenticar', elements([['cnpj', ctx.secrets.cnpj.replace(/\D/g, '')], ['email', ctx.secrets.email], ['senha', ctx.secrets.senha]]), { login: true })
  const hash = tag(xml, 'HashAutenticacao')
  const err = wmError(tag(xml, 'CodigoRetorno') ?? '', 'Login Webmotors')
  if (err || !hash) throw err ?? new ConnectorError('AUTH', 'A Webmotors não devolveu o código de acesso.', 'Confira as credenciais do usuário de integração.')
  const next = { ...ctx.secrets, hash, hashAt: String(ctx.now().getTime()) }
  Object.assign(ctx.secrets, next)
  await ctx.saveSecrets(next, null)
  return hash
}

/** Executa com a sessão; se a Webmotors disser que expirou, renova UMA vez. */
async function withSession<T>(ctx: ConnectorContext, fn: (hash: string) => Promise<T>): Promise<T> {
  try { return await fn(await sessionHash(ctx)) } catch (e) {
    if (e instanceof ConnectorError && e.kind === 'AUTH' && (e.code === '401' || e.code === '402' || e.code === '31')) return fn(await sessionHash(ctx, true))
    throw e
  }
}

const cfgStr = (ctx: ConnectorContext, k: string) => { const v = ctx.connection.config[k]; return v == null ? '' : String(v) }

async function resolveCodes(p: ListingPayload, ctx: ConnectorContext, hash: string) {
  const v = p.vehicle
  const need = (x: { id: string; label: string } | null, what: string, value: string) => {
    if (!x) throw new ConnectorError('VALIDATION', `${what} "${value}" sem correspondência segura na Webmotors.`, 'Revise o de-para em Publicações › Pendências de mapeamento.', { code: 'MAPPING' })
    return x
  }
  const brand = need(await ctx.mapping.resolve('BRAND', sourceKey(v.brand), String(v.brand), async () => candidatesFrom(await call(ctx, 'ObterMarca', elements([['pHashAutenticacao', hash]])), 'MarcaWM', 'CodigoMarca')), 'Marca', String(v.brand))
  const model = need(await ctx.mapping.resolve('MODEL', sourceKey(v.brand, v.model), String(v.model), async () => candidatesFrom(await call(ctx, 'ObterModelo', elements([['pHashAutenticacao', hash], ['pCodigoMarca', brand.id]])), 'ModeloWM', 'CodigoModelo')), 'Modelo', String(v.model))
  const version = need(await ctx.mapping.resolve('VERSION', sourceKey(v.brand, v.model, v.version), String(v.version), async () => candidatesFrom(await call(ctx, 'ObterVersao', elements([['pHashAutenticacao', hash], ['pCodigoModelo', model.id], ['pDataInicioAtualizacao', '1900-01-01T00:00:00'], ['pDataFimAtualizacao', ctx.now().toISOString().slice(0, 19)]])), 'Versao', 'CodigoVersao')), 'Versão', String(v.version))
  const color = need(await ctx.mapping.resolve('COLOR', sourceKey(v.color), String(v.color), async () => candidatesFrom(await call(ctx, 'ObterCores', elements([['pHashAutenticacao', hash]])), 'CorWM', 'CodigoCor')), 'Cor', String(v.color))
  const fuel = need(await ctx.mapping.resolve('FUEL', sourceKey(v.fuel), String(v.fuel), async () => candidatesFrom(await call(ctx, 'ObterCombustivel', elements([['pHashAutenticacao', hash]])), 'CombustivelWM', 'CodigoCombustivel')), 'Combustível', String(v.fuel))
  const gear = need(await ctx.mapping.resolve('TRANSMISSION', sourceKey(v.transmission), String(v.transmission), async () => candidatesFrom(await call(ctx, 'ObterCambio', elements([['pHashAutenticacao', hash]])), 'TipoCambioWM', 'CodigoCambio')), 'Câmbio', String(v.transmission))
  return { brand, model, version, color, fuel, gear }
}

/** Monta o AnuncioWM na ordem do WSDL. */
export function anuncioXml(p: ListingPayload, codes: { brand: Candidate; model: Candidate; version: Candidate; color: Candidate; fuel: Candidate; gear: Candidate }, cfg: { modalidade: string; flags: Record<string, string>; codigoAnuncio?: string | null }, observacao: string): string {
  const v = p.vehicle
  const yn = (k: string) => (cfg.flags[k] === 'S' ? 'S' : 'N')
  const price = p.price != null ? p.price.toFixed(2) : undefined
  return elements([
    ['CodigoAnuncio', cfg.codigoAnuncio ?? '0'],
    ['CodigoModalidade', cfg.modalidade],
    ['TipoAnuncio', p.isNew ? 'N' : 'U'],
    ['CodigoMarca', codes.brand.id], ['CodigoModelo', codes.model.id], ['CodigoVersao', codes.version.id],
    ['AnoDoModelo', v.modelYear ?? v.year], ['AnoFabricacao', v.year ?? v.modelYear],
    ['Km', p.isNew ? undefined : v.km ?? 0],
    ['Placa', p.isNew ? undefined : normalizePlate(v.plate)],
    ['CodigoCambio', codes.gear.id], ['DescricaoCambio', codes.gear.label],
    ['NrPortas', v.doors],
    ['CodigoCor', codes.color.id], ['DescricaoCor', codes.color.label],
    ['CodigoCombustivel', codes.fuel.id], ['DescricaoCombustivel', codes.fuel.label],
    ['Blindado', yn('Blindado')], ['AdaptadoDeficientesFisicos', yn('AdaptadoDeficientesFisicos')], ['UnicoDono', yn('UnicoDono')],
    ['Alienado', yn('Alienado')], ['IpvaPago', yn('IpvaPago')], ['NaoAceitaTroca', yn('NaoAceitaTroca')],
    ['RevisadoOficinaAgendaDoCarro', yn('RevisadoOficinaAgendaDoCarro')], ['RevisoesEmConcessionaria', yn('RevisoesEmConcessionaria')],
    ['GarantiaDeFabrica', yn('GarantiaDeFabrica')], ['Licenciado', yn('Licenciado')], ['Leilao', yn('Leilao')],
    ['PrecoReal', price], ['PrecoVenda', price],
    ['Observacao', observacao.slice(0, 500)],
  ])
}

function config(ctx: ConnectorContext) {
  const modalidade = cfgStr(ctx, 'modalidade')
  if (!modalidade) throw new ConnectorError('CONFIG', 'Modalidade de anúncio da Webmotors não configurada.', 'Escolha a modalidade do seu pacote em Canais conectados › Webmotors.')
  const flags = (ctx.connection.config.flags ?? {}) as Record<string, string>
  return { modalidade, flags }
}

async function sendPhotos(ctx: ConnectorContext, hash: string, codigo: string, photos: string[]) {
  const max = Math.min(photos.length, spec.media.max)
  for (let i = 0; i < max; i++) {
    const xml = await call(ctx, 'IncluirFotoUrl', elements([['pHashAutenticacao', hash], ['oUrlImagem', ctx.mediaUrl(photos[i])], ['pCodigoAnuncio', codigo]]))
    const err = wmError(tag(xml, 'CodigoRetorno') ?? '', `Foto ${i + 1}`)
    if (err) throw err
  }
}

async function stock(ctx: ConnectorContext, hash: string): Promise<Array<Record<string, string>>> {
  const xml = await call(ctx, 'ObterEstoqueAtual', elements([['pHashAutenticacao', hash]]))
  return tags(xml, 'Anuncio').map(fieldsOf)
}

async function modalidades(ctx: ConnectorContext, hash: string) {
  const xml = await call(ctx, 'ObterModalidade', elements([['pHashAutenticacao', hash]]))
  return tags(xml, 'ModalidadeWM').map(fieldsOf).map((m) => ({
    codigo: m.CodigoModalidade, descricao: m.Descricao, tipo: m.TipoAnuncio,
    total: Number(m.QuantidadeAnunciosTotal ?? 0), usados: Number(m.QuantidadeAnuncios ?? 0), permiteFoto: m.PermiteFoto === 'S',
  }))
}

export const webmotorsConnector: Connector = {
  spec,
  async limits(ctx) {
    return withSession(ctx, async (hash) => ({ modalidades: await modalidades(ctx, hash) }))
  },
  async testConnection(ctx) {
    return withSession(ctx, async (hash) => {
      const [list, mods] = await Promise.all([stock(ctx, hash), modalidades(ctx, hash)])
      return { ok: true, message: `Login aceito. ${list.length} anúncio(s) no estoque Webmotors; ${mods.length} modalidade(s) no pacote.`, account: ctx.secrets.cnpj, quota: { modalidades: mods } }
    })
  },
  async publish(p, ctx) {
    const cfg = config(ctx)
    return withSession(ctx, async (hash) => {
      const codes = await resolveCodes(p, ctx, hash)
      const obs = channelText(p, spec).description
      const xml = await call(ctx, 'IncluirCarro', elements([['pHashAutenticacao', hash]]) + `<pAnuncio>${anuncioXml(p, codes, cfg, obs)}</pAnuncio>`, { creates: true })
      const err = wmError(tag(xml, 'CodigoRetorno') ?? '', 'Incluir anúncio')
      if (err) throw err
      const codigo = tag(xml, 'CodigoAnuncio')
      if (!codigo || codigo === '0') throw new ConnectorError('UNAVAILABLE', 'A Webmotors não devolveu o código do anúncio.')
      await sendPhotos(ctx, hash, codigo, p.photos)
      return { state: 'EM_ANALISE', remoteId: codigo, message: 'Enviado; aguardando confirmação no estoque Webmotors.', data: { fotos: Math.min(p.photos.length, spec.media.max) } }
    })
  },
  async get(ref, ctx) {
    if (!ref.remoteId) return { state: 'NAO_ENCONTRADO' }
    return withSession(ctx, async (hash) => {
      const found = (await stock(ctx, hash)).find((a) => a.CodigoAnuncio === ref.remoteId)
      return found ? { state: 'PUBLICADO', remoteId: ref.remoteId, remoteStatus: 'NO_ESTOQUE', data: { ultimaAlteracao: found.DataUltimaAlteracao ?? null } } : { state: 'NAO_ENCONTRADO', remoteId: ref.remoteId }
    })
  },
  async findByReference(_ref, p, ctx) {
    if (!p?.vehicle.plate) return null
    return withSession(ctx, async (hash) => {
      const plate = normalizePlate(p.vehicle.plate)
      const found = (await stock(ctx, hash)).find((a) => normalizePlate(a.Placa) === plate)
      return found ? { state: 'PUBLICADO', remoteId: found.CodigoAnuncio, remoteStatus: 'NO_ESTOQUE' } : null
    })
  },
  async update(ref, p, ctx) {
    const cfg = config(ctx)
    return withSession(ctx, async (hash) => {
      const codes = await resolveCodes(p, ctx, hash)
      const xml = await call(ctx, 'AlterarCarro', elements([['pHashAutenticacao', hash]]) + `<pAnuncio>${anuncioXml(p, codes, { ...cfg, codigoAnuncio: ref.remoteId }, channelText(p, spec).description)}</pAnuncio>`)
      const err = wmError(tag(xml, 'CodigoRetorno') ?? '', 'Alterar anúncio')
      if (err) throw err
      // Fotos: remove as atuais e reenvia na ordem aprovada (capa = 1ª).
      const fotos = await call(ctx, 'ObterFotosCarro', elements([['pHashAutenticacao', hash], ['pCodigoAnuncio', ref.remoteId]]))
      for (const f of tags(fotos, 'DetalheFotoWM').map(fieldsOf)) {
        if (!f.CodigoFotoAnuncio) continue
        const x = await call(ctx, 'ExcluirFoto', elements([['pHashAutenticacao', hash], ['pCodigoFoto', f.CodigoFotoAnuncio], ['pCodigoAnuncio', ref.remoteId]]))
        const e2 = wmError(tag(x, 'CodigoRetorno') ?? '', 'Excluir foto antiga'); if (e2) throw e2
      }
      await sendPhotos(ctx, hash, String(ref.remoteId), p.photos)
      return { state: 'EM_ANALISE', remoteId: ref.remoteId, message: 'Alteração enviada; conferindo.' }
    })
  },
  async remove(ref, reason, ctx) {
    if (!ref.remoteId) return { state: 'NAO_ENCONTRADO' }
    const motivo = cfgStr(ctx, reason === 'VENDIDO' ? 'motivoVendido' : 'motivoRetirado')
    if (!motivo) throw new ConnectorError('CONFIG', 'Código do motivo de exclusão da Webmotors não configurado.', 'Informe os códigos de motivo (vendido/retirado) recebidos na homologação em Canais conectados › Webmotors. Até lá, retire o anúncio pelo Cockpit.')
    return withSession(ctx, async (hash) => {
      const xml = await call(ctx, 'ExcluirCarro', elements([['pHashAutenticacao', hash], ['pCodigoAnuncio', ref.remoteId], ['pMotivoExclusao', motivo]]))
      const err = wmError(tag(xml, 'CodigoRetorno') ?? '', 'Excluir anúncio')
      if (err) throw err
      return { state: 'REMOVIDO', remoteId: ref.remoteId, message: 'Exclusão aceita; conferindo no estoque.' }
    })
  },
}
