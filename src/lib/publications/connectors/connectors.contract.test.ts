// =============================================================================
// TESTES DE CONTRATO — SIMULAÇÃO. As respostas dos portais aqui são
// SIMULADAS a partir da documentação oficial (ver channels.ts › source).
// Provam que o AutoDrive monta as chamadas no formato documentado e trata as
// respostas/erros documentados. NÃO comprovam integração externa real.
// =============================================================================

import { describe, expect, it, vi } from 'vitest'

// Cofre de apps SIMULADO: testes de contrato nunca consultam banco.
vi.mock('../platform-apps', () => ({ getPlatformApp: async () => ({ clientId: 'app', clientSecret: 'sec', source: 'env' }) }))
import { buildPayload } from '../content-core'
import { ConnectorError } from '../errors'
import { exactMatch } from '../mapping-core'
import { createHttpClient, type FetchLike } from './http'
import type { ConnectorContext, Secrets } from './types'
import { anuncioXml, webmotorsConnector, wmError } from './webmotors'
import { olxAd, olxAdState, olxConnector, olxImportError, olxRegdate } from './olx'
import { mercadoLivreConnector, mlItemBody, mlMismatch, mlState } from './mercadolivre'
import { chavesNaMaoConnector, cnmBody } from './chavesnamao'
import { instagramConnector, metaPageConnector } from './meta'

type Call = { url: string; method: string; body: string; headers: Record<string, string> }
type Route = (c: Call) => { status: number; body: unknown; headers?: Record<string, string> } | null

/** Servidor SIMULADO: registra as chamadas e responde pela primeira rota que casar. */
function simulated(routes: Route[]) {
  const calls: Call[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    const body = init.body instanceof URLSearchParams ? init.body.toString() : String(init.body ?? '')
    const c: Call = { url, method: String(init.method ?? 'GET'), body, headers: (init.headers ?? {}) as Record<string, string> }
    calls.push(c)
    for (const r of routes) {
      const hit = r(c)
      if (hit) return new Response(typeof hit.body === 'string' ? hit.body : JSON.stringify(hit.body), { status: hit.status, headers: hit.headers })
    }
    return new Response('{"message":"rota não simulada"}', { status: 599 })
  }
  return { calls, http: createHttpClient(fetchImpl) }
}

function ctxWith(http: ReturnType<typeof simulated>['http'], secrets: Secrets, config: Record<string, unknown> = {}, externalAccountId = 'acc'): ConnectorContext & { saved: Secrets[] } {
  const saved: Secrets[] = []
  return {
    connection: { id: 'conn', tenantId: 't1', externalAccountId, environment: 'PRODUCAO', config },
    secrets, http, saved,
    mapping: { async resolve(_k, _s, label, lookup, pick) { const c = await lookup(); return pick ? pick(c) : exactMatch(label, c) } },
    mediaUrl: (u) => `https://app.test/m/${encodeURIComponent(u)}.jpg`,
    async saveSecrets(s) { saved.push({ ...s }) },
    now: () => new Date('2026-09-25T12:00:00Z'),
  }
}

const payload = (over: Record<string, unknown> = {}) => buildPayload({
  reference: 'adrefexemplo00001', storeName: 'AutoDrive Veiculos',
  vehicle: { id: 'v1', brand: 'Fiat', model: 'Argo', version: 'Drive 1.0', year: 2021, modelYear: 2022, km: 35000, color: 'Prata', fuel: 'FLEX', transmission: 'MANUAL', doors: 4, plate: 'ABC1D23', chassi: '9BD358A4NMYJ12345', salePrice: 72900, isPromo: false, ...over },
  gallery: ['/api/site/assets/aaaaaaaaaaaa', '/api/site/assets/bbbbbbbbbbbb'],
  contacts: { whatsapp: '(11) 93471-8276', instagram: '@dagobertoautodriveveiculos', site: 'www.appautodrive.com.br', email: 'contato@loja.com.br' },
  location: { zip: '06454-000', city: 'Barueri', state: 'SP' },
})

describe('Webmotors (SOAP) — SIMULAÇÃO', () => {
  const soap = (inner: string) => `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${inner}</soap:Body></soap:Envelope>`
  const routes = (opts: { incluir?: string } = {}): Route[] => [
    (c) => c.url.includes('wsLoginSistemaRevendedor') ? { status: 200, body: soap('<autenticarResponse><autenticarResult><HashAutenticacao>H123</HashAutenticacao><CodigoRetorno>500</CodigoRetorno></autenticarResult></autenticarResponse>') } : null,
    (c) => c.headers.SOAPAction?.includes('ObterMarca') ? { status: 200, body: soap('<ObterMarcaResponse><ObterMarcaResult><MarcaWM><CodigoMarca>12</CodigoMarca><NomeMarca>FIAT</NomeMarca></MarcaWM></ObterMarcaResult></ObterMarcaResponse>') } : null,
    (c) => c.headers.SOAPAction?.includes('ObterModelo') ? { status: 200, body: soap('<ModeloWM><CodigoMarca>12</CodigoMarca><CodigoModelo>345</CodigoModelo><NomeModelo>ARGO</NomeModelo></ModeloWM>') } : null,
    (c) => c.headers.SOAPAction?.includes('ObterVersao') ? { status: 200, body: soap('<Versao><CodigoModelo>345</CodigoModelo><CodigoVersao>9001</CodigoVersao><NomeVersao>DRIVE 1.0</NomeVersao></Versao><Versao><CodigoModelo>345</CodigoModelo><CodigoVersao>9002</CodigoVersao><NomeVersao>TREKKING 1.3</NomeVersao></Versao>') } : null,
    (c) => c.headers.SOAPAction?.includes('ObterCores') ? { status: 200, body: soap('<CorWM><CodigoCor>7</CodigoCor><Descricao>Prata</Descricao></CorWM>') } : null,
    (c) => c.headers.SOAPAction?.includes('ObterCombustivel') ? { status: 200, body: soap('<CombustivelWM><Descricao>Flex</Descricao><CodigoCombustivel>F</CodigoCombustivel></CombustivelWM>') } : null,
    (c) => c.headers.SOAPAction?.includes('ObterCambio') ? { status: 200, body: soap('<TipoCambioWM><CodigoCambio>M</CodigoCambio><Descricao>Manual</Descricao></TipoCambioWM>') } : null,
    (c) => c.headers.SOAPAction?.includes('IncluirCarro') ? { status: 200, body: soap(`<IncluirCarroResponse><IncluirCarroResult><CodigoAnuncio>777</CodigoAnuncio><CodigoRetorno>${opts.incluir ?? '500'}</CodigoRetorno></IncluirCarroResult></IncluirCarroResponse>`) } : null,
    (c) => c.headers.SOAPAction?.includes('IncluirFotoUrl') ? { status: 200, body: soap('<FotoAnuncioWM><CodigoAnuncio>777</CodigoAnuncio><CodigoFoto>1</CodigoFoto><CodigoRetorno>500</CodigoRetorno></FotoAnuncioWM>') } : null,
    (c) => c.headers.SOAPAction?.includes('ObterEstoqueAtual') ? { status: 200, body: soap('<ArrayOfAnuncio><Anuncio><CodigoAnuncio>777</CodigoAnuncio><Placa>ABC1D23</Placa></Anuncio></ArrayOfAnuncio>') } : null,
  ]
  it('login → códigos → IncluirCarro → fotos por URL na ordem; sessão salva cifrada pelo serviço', async () => {
    const s = simulated(routes())
    const ctx = ctxWith(s.http, { cnpj: '12.345.678/0001-90', email: 'integ@loja.com.br', senha: 'x' }, { modalidade: '5' })
    const r = await webmotorsConnector.publish!(payload(), ctx)
    expect(r).toMatchObject({ state: 'EM_ANALISE', remoteId: '777' })
    const login = s.calls[0]
    expect(login.url).toBe('https://integracao.webmotors.com.br/wsLoginSistemaRevendedor.asmx')
    expect(login.body).toContain('<cnpj>12345678000190</cnpj>')
    const incluir = s.calls.find((c) => c.headers.SOAPAction?.includes('IncluirCarro'))!
    expect(incluir.headers.SOAPAction).toBe('"www.webmotors.com.br/wsEstoqueRevendedorWebMotors/IncluirCarro"')
    expect(incluir.body).toMatch(/<pHashAutenticacao>H123<\/pHashAutenticacao><pAnuncio>.*<CodigoVersao>9001<\/CodigoVersao>/)
    expect(incluir.body).toContain('<Placa>ABC1D23</Placa>')
    const fotos = s.calls.filter((c) => c.headers.SOAPAction?.includes('IncluirFotoUrl'))
    expect(fotos).toHaveLength(2)
    expect(fotos[0].body).toContain(encodeURIComponent('/api/site/assets/aaaaaaaaaaaa'))
    expect(ctx.saved[0].hash).toBe('H123')
  })
  it('conferência pelo estoque atual e reconsulta por placa (timeout)', async () => {
    const s = simulated(routes())
    const ctx = ctxWith(s.http, { cnpj: '1', email: 'e', senha: 's', hash: 'H', hashAt: String(Date.parse('2026-09-25T11:00:00Z')) })
    expect((await webmotorsConnector.get!({ vehicleId: 'v1', remoteId: '777', externalRef: 'x' }, ctx)).state).toBe('PUBLICADO')
    expect((await webmotorsConnector.get!({ vehicleId: 'v1', remoteId: '999', externalRef: 'x' }, ctx)).state).toBe('NAO_ENCONTRADO')
    expect((await webmotorsConnector.findByReference!({ vehicleId: 'v1', remoteId: null, externalRef: 'x' }, payload(), ctx))?.remoteId).toBe('777')
  })
  it('cota esgotada e erros de validação documentados', () => {
    expect(wmError('(43|32)', 'x')?.kind).toBe('QUOTA')
    expect(wmError('43|33', 'x')?.kind).toBe('QUOTA')
    expect(wmError('402', 'x')?.kind).toBe('AUTH')
    expect(wmError('(43|41)', 'x')?.kind).toBe('VALIDATION')
    expect(wmError('500', 'x')).toBeNull()
  })
  it('sem motivo de exclusão configurado não inventa código (pendência de configuração)', async () => {
    const s = simulated(routes())
    await expect(webmotorsConnector.remove!({ vehicleId: 'v1', remoteId: '777', externalRef: 'x' }, 'VENDIDO', ctxWith(s.http, { cnpj: '1', email: 'e', senha: 's' }))).rejects.toMatchObject({ kind: 'CONFIG' })
  })
  it('flags S/N só "S" quando a loja marcou (não inventa IPVA pago etc.)', () => {
    const x = anuncioXml(payload(), { brand: { id: '1', label: '' }, model: { id: '2', label: '' }, version: { id: '3', label: '' }, color: { id: '4', label: 'Prata' }, fuel: { id: 'F', label: 'Flex' }, gear: { id: 'M', label: 'Manual' } }, { modalidade: '5', flags: {} }, 'obs')
    expect(x).toContain('<IpvaPago>N</IpvaPago>')
    expect(x).toContain('<TipoAnuncio>U</TipoAnuncio>')
  })
})

describe('OLX (Autos) — SIMULAÇÃO', () => {
  const carInfo: Route = (c) => {
    if (c.url.endsWith('/car_info')) return { status: 200, body: { status: 'ok', data: { FIAT: 21 } } }
    if (c.url.endsWith('/car_info/21')) return { status: 200, body: { status: 'ok', data: { ARGO: 99 } } }
    if (c.url.endsWith('/car_info/21/99')) return { status: 200, body: { status: 'ok', data: { 'DRIVE 1.0': 5 } } }
    return null
  }
  it('monta o anúncio da categoria 2020 com códigos da OLX, primeira foto = capa', async () => {
    const s = simulated([carInfo, (c) => c.url.endsWith('/autoupload/import') && c.method === 'PUT' ? { status: 200, body: { token: 'TK1', statusCode: 0, statusMessage: 'The ads were imported and will be processed' } } : null])
    const r = await olxConnector.publish!(payload(), ctxWith(s.http, { access_token: 'AT' }))
    expect(r).toMatchObject({ state: 'EM_ANALISE', pendingToken: 'TK1' })
    const imp = JSON.parse(s.calls.find((c) => c.url.endsWith('/import'))!.body)
    expect(imp.access_token).toBe('AT')
    const ad = imp.ad_list[0]
    expect(ad).toMatchObject({ id: 'adrefexemplo00001', operation: 'insert', category: 2020, type: 's', price: 72900, zipcode: '06454000', phone: 11934718276 })
    expect(ad.params).toMatchObject({ vehicle_brand: '21', vehicle_model: '99', vehicle_version: '5', regdate: '2021', mileage: 35000, gearbox: '1', fuel: '3', doors: '2', vehicle_tag: 'ABC1D23', carcolor: '3' })
    expect(ad.images[0]).toContain('aaaaaaaaaaaa')
    expect(ad.body).not.toMatch(/93471|appautodrive/)
  })
  it('status do import: aceito = publicado com URL; recusado = rejeitado; na fila = em análise', () => {
    expect(olxAdState({ status: 'accepted', operation: 'insert', url: 'https://www.olx.com.br/vi/1.htm', list_id: '1' })).toMatchObject({ state: 'PUBLICADO', remoteUrl: 'https://www.olx.com.br/vi/1.htm' })
    expect(olxAdState({ status: 'refused', operation: 'insert', message: [{ error: 'REFUSED_SUSPECT_PRICE' }] })).toMatchObject({ state: 'REJEITADO' })
    expect(olxAdState({ status: 'queued', operation: 'insert' }).state).toBe('EM_ANALISE')
    expect(olxAdState({ status: 'accepted', operation: 'delete' }).state).toBe('REMOVIDO')
  })
  it('códigos síncronos: cota (-7/-8), excesso (-2), plano (-6), fora do ar (-5)', () => {
    expect(olxImportError({ statusCode: -7 })?.kind).toBe('QUOTA')
    expect(olxImportError({ statusCode: -2 })?.kind).toBe('RATE_LIMIT')
    expect(olxImportError({ statusCode: -6 })?.kind).toBe('CONFIG')
    expect(olxImportError({ statusCode: -5 })?.kind).toBe('UNAVAILABLE')
    expect(olxImportError({ statusCode: -4, errors: [] })?.kind).toBe('VALIDATION')
  })
  it('ano antigo em faixa; retirada = operation delete com o mesmo id', async () => {
    expect(olxRegdate(1977)).toBe('1975'); expect(olxRegdate(1949)).toBe('1950')
    const s = simulated([(c) => c.url.endsWith('/import') ? { status: 200, body: { token: 'TK2', statusCode: 0 } } : null])
    await olxConnector.remove!({ vehicleId: 'v1', remoteId: '1', externalRef: 'adrefexemplo00001' }, 'VENDIDO', ctxWith(s.http, { access_token: 'AT' }))
    expect(JSON.parse(s.calls[0].body).ad_list).toEqual([{ id: 'adrefexemplo00001', operation: 'delete' }])
    expect(olxAd(payload({ color: 'Bege' }), 'r', { brand: { id: '1', label: '' }, model: { id: '2', label: '' }, version: { id: '3', label: '' } }, (u) => u).params).toMatchObject({ carcolor: '10' })
  })
})

describe('Mercado Livre (classificados de veículos) — SIMULAÇÃO', () => {
  it('corpo segue o guia de automóveis (classified, marketplace, seller_contact com WhatsApp)', () => {
    const b = mlItemBody(payload(), { listingTypeId: 'silver', cityId: 'BR-SP-56', mediaUrl: (u) => `https://m/${u}` })
    expect(b).toMatchObject({ category_id: 'MLB1744', buying_mode: 'classified', channels: ['marketplace'], listing_type_id: 'silver', currency_id: 'BRL', available_quantity: 1, condition: 'used' })
    expect(b.seller_contact).toMatchObject({ country_code2: '55', phone2: '11934718276' })
    expect(b.attributes).toEqual(expect.arrayContaining([{ id: 'BRAND', value_name: 'Fiat' }, { id: 'TRIM', value_name: 'Drive 1.0' }, { id: 'KILOMETERS', value_name: '35000 km' }, { id: 'LICENSE_PLATE', value_name: 'ABC1D23' }, { id: 'VIN_LAST_DIGITS', value_name: 'J12345' }]))
    expect(b.pictures).toHaveLength(2)
  })
  it('renova o token vencido antes de publicar e grava a nova autorização', async () => {
    const s = simulated([
      (c) => c.url.endsWith('/oauth/token') ? { status: 200, body: { access_token: 'NEW', refresh_token: 'R2', expires_in: 21600 } } : null,
      (c) => c.url.endsWith('/items') && c.method === 'POST' ? { status: 201, body: { id: 'MLB1', status: 'active', permalink: 'https://carro.mercadolivre.com.br/MLB-1', attributes: [{ id: 'BRAND', value_name: 'Fiat' }, { id: 'MODEL', value_name: 'Argo' }] } } : null,
      (c) => c.url.endsWith('/items/MLB1/description') ? { status: 201, body: {} } : null,
    ])
    const ctx = ctxWith(s.http, { access_token: 'OLD', refresh_token: 'R1', expires_at: String(Date.parse('2026-09-25T11:00:00Z')) }, { listingTypeId: 'silver', cityId: 'BR-SP-56' })
    const r = await mercadoLivreConnector.publish!(payload(), ctx)
    expect(r).toMatchObject({ state: 'PUBLICADO', remoteId: 'MLB1' })
    expect(s.calls[0].body).toContain('grant_type=refresh_token')
    expect(s.calls[1].headers.Authorization).toBe('Bearer NEW')
    expect(ctx.saved.at(-1)).toMatchObject({ access_token: 'NEW', refresh_token: 'R2' })
  })
  it('autorização revogada vira AUTH (conta "Reconectar")', async () => {
    const s = simulated([(c) => c.url.endsWith('/oauth/token') ? { status: 400, body: { error: 'invalid_grant' } } : null])
    await expect(mercadoLivreConnector.get!({ vehicleId: 'v', remoteId: 'MLB1', externalRef: 'x' }, ctxWith(s.http, { refresh_token: 'R' }))).rejects.toMatchObject({ kind: 'AUTH' })
  })
  it('status do item → situação; divergência de marca/modelo é sinalizada (não aceita calado)', () => {
    expect(mlState('active')).toBe('PUBLICADO'); expect(mlState('paused')).toBe('PAUSADO'); expect(mlState('closed')).toBe('REMOVIDO'); expect(mlState('under_review')).toBe('EM_ANALISE')
    expect(mlMismatch(payload(), { id: 'x', attributes: [{ id: 'BRAND', value_name: 'Fiat' }, { id: 'MODEL', value_name: 'Cronos' }] })[0]).toMatch(/Modelo/)
  })
  it('retirar = closed + deleted, repetindo o 409 (optimistic locking) documentado', async () => {
    let n = 0
    const s = simulated([(c) => c.url.endsWith('/items/MLB1') && c.body.includes('closed') ? { status: 200, body: { id: 'MLB1', status: 'closed' } } : null,
      (c) => c.url.endsWith('/items/MLB1') && c.body.includes('deleted') ? (++n === 1 ? { status: 409, body: { message: 'item optimistic locking error: conflict' } } : { status: 200, body: { id: 'MLB1', status: 'closed', sub_status: ['deleted'] } }) : null])
    const r = await mercadoLivreConnector.remove!({ vehicleId: 'v', remoteId: 'MLB1', externalRef: 'x' }, 'VENDIDO', ctxWith(s.http, { access_token: 'T', refresh_token: 'R', expires_at: String(Date.parse('2026-09-26T00:00:00Z')) }))
    expect(r.state).toBe('REMOVIDO'); expect(n).toBe(2)
  }, 15_000)
})

describe('Chaves na Mão (REST) — SIMULAÇÃO', () => {
  const jwt: Route = (c) => c.url.endsWith('/clients/jwt') ? (c.headers.token === 'TOK' ? { status: 200, body: { token: 'JWT', expiration: '1d' } } : { status: 401, body: {} }) : null
  const lookups: Route = (c) => c.url.endsWith('/vehicles/brands') ? { status: 200, body: [{ id: 1, name: 'FIAT' }] } : c.url.endsWith('/brands/1/models') ? { status: 200, body: [{ id: 2, name: 'ARGO' }] } : c.url.endsWith('/models/2/trims') ? { status: 200, body: [{ id: 476, name: 'Drive 1.0' }] } : null
  it('JWT pelo token; corpo conforme manual (entrada/parcelas 0 = sem condição inventada)', async () => {
    let created = false
    const s = simulated([jwt, lookups,
      (c) => c.url.endsWith('/vehicles') && c.method === 'POST' ? ((created = true), { status: 200, body: {} }) : null,
      (c) => c.url.includes('/vehicles/adref') && c.method === 'GET' ? { status: 200, body: { reference: 'adrefexemplo00001', publication: created ? { highlighted: false } : null } } : null])
    const r = await chavesNaMaoConnector.publish!(payload(), ctxWith(s.http, { token: 'TOK' }))
    expect(r.state).toBe('PUBLICADO')
    const post = s.calls.find((c) => c.url.endsWith('/vehicles') && c.method === 'POST')!
    expect(post.headers.Authorization).toBe('Bearer JWT')
    expect(JSON.parse(post.body)).toMatchObject({ reference: 'adrefexemplo00001', type: 'C', color: 'SILVER', gearbox: 'MANUAL', fuel: 'FLEX', trimId: 476, deposit: 0, amountOfInstallments: 0, licensePlate: 'ABC1D23', mileage: 35000 })
  })
  it('"Branco" é ambíguo (metálico × pérola): não publica sem revisão', async () => {
    const s = simulated([jwt, lookups])
    await expect(chavesNaMaoConnector.publish!(payload({ color: 'Branco' }), ctxWith(s.http, { token: 'TOK' }))).rejects.toMatchObject({ kind: 'VALIDATION', code: 'MAPPING' })
  })
  it('429 com retry-after vira espera (limite por janela de 10 s)', async () => {
    const s = simulated([jwt, (c) => c.url.endsWith('/clients/plan') ? { status: 429, body: {}, headers: { 'retry-after': '10' } } : null])
    const e = await chavesNaMaoConnector.limits!(ctxWith(s.http, { token: 'TOK' })).catch((x) => x)
    expect(e).toBeInstanceOf(ConnectorError); expect(e.kind).toBe('RATE_LIMIT'); expect(e.retryAfterMs).toBe(10_000)
  })
  it('sem espaço no plano: entra desativado e a publicação vira cota esgotada', async () => {
    const s = simulated([jwt, lookups,
      (c) => c.url.endsWith('/vehicles') && c.method === 'POST' ? { status: 200, body: {} } : null,
      (c) => c.url.includes('/vehicles/adref') ? { status: 200, body: { reference: 'adrefexemplo00001', publication: null } } : null,
      (c) => c.url.includes('/publications/') && c.method === 'POST' ? { status: 422, body: { statusCode: 422, message: 'Plano sem espaço para novos anúncios' } } : null])
    await expect(chavesNaMaoConnector.publish!(payload(), ctxWith(s.http, { token: 'TOK' }))).rejects.toMatchObject({ kind: 'QUOTA' })
  })
  it('pausar = DELETE /publications; retirar = DELETE /vehicles', async () => {
    const s = simulated([jwt, (c) => c.method === 'DELETE' ? { status: 200, body: {} } : null, (c) => c.url.includes('/vehicles/') && c.method === 'GET' ? { status: 422, body: { message: "Não existe um anúncio com a referencia: 'x'" } } : null])
    const ctx = ctxWith(s.http, { token: 'TOK' })
    await chavesNaMaoConnector.pause!({ vehicleId: 'v', remoteId: 'r', externalRef: 'ref1' }, ctx)
    expect(s.calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/publications/ref1'))).toBe(true)
    const r = await chavesNaMaoConnector.remove!({ vehicleId: 'v', remoteId: 'r', externalRef: 'ref1' }, 'VENDIDO', ctx)
    expect(s.calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/vehicles/ref1'))).toBe(true)
    expect(r.state).toBe('NAO_ENCONTRADO')
  })
  it('corpo não aceita combustível sem equivalente', () => {
    expect(() => cnmBody(payload({ fuel: 'HIDROGENIO' }), { trimId: 1, color: 'SILVER' }, (u) => u)).toThrow(/Combustível/)
  })
})

describe('Meta — Página e Instagram — SIMULAÇÃO', () => {
  it('Página: fotos sem publicar + post com attached_media; conferência pelo permalink', async () => {
    const s = simulated([
      (c) => c.url.includes('/PAGE/photos') ? { status: 200, body: { id: `ph${c.body.length}` } } : null,
      (c) => c.url.includes('/PAGE/feed') ? { status: 200, body: { id: 'PAGE_POST' } } : null,
      (c) => c.url.includes('/PAGE_POST?') ? { status: 200, body: { id: 'PAGE_POST', permalink_url: 'https://www.facebook.com/p/1', is_published: true } } : null,
    ])
    const ctx = ctxWith(s.http, { page_access_token: 'PT' }, {}, 'PAGE')
    const r = await metaPageConnector.publish!(payload(), ctx)
    expect(r.remoteId).toBe('PAGE_POST')
    expect(s.calls.filter((c) => c.url.includes('/photos')).every((c) => c.body.includes('published=false'))).toBe(true)
    const feed = new URLSearchParams(s.calls.find((c) => c.url.includes('/feed'))!.body)
    expect(feed.get('attached_media[0]')).toMatch(/media_fbid/)
    expect(feed.get('message')).toContain('(11) 93471-8276')
    expect((await metaPageConnector.get!({ vehicleId: 'v', remoteId: 'PAGE_POST', externalRef: 'x' }, ctx)).remoteUrl).toBe('https://www.facebook.com/p/1')
  })
  it('token expirado (190) = reconectar; limite (4/17/32) = esperar', async () => {
    const s = simulated([(c) => c.url.includes('/X?') ? { status: 400, body: { error: { code: 190, type: 'OAuthException', message: 'Error validating access token' } } } : null])
    await expect(metaPageConnector.get!({ vehicleId: 'v', remoteId: 'X', externalRef: 'x' }, ctxWith(s.http, { page_access_token: 'PT' }))).rejects.toMatchObject({ kind: 'AUTH' })
    const s2 = simulated([() => ({ status: 400, body: { error: { code: 32, message: 'Page request limit reached' } } })])
    await expect(metaPageConnector.get!({ vehicleId: 'v', remoteId: 'X', externalRef: 'x' }, ctxWith(s2.http, { page_access_token: 'PT' }))).rejects.toMatchObject({ kind: 'RATE_LIMIT' })
  })
  it('Instagram: carrossel (itens → CAROUSEL → FINISHED → media_publish) e confirmação pelo permalink', async () => {
    const s = simulated([
      (c) => c.url.includes('/content_publishing_limit') ? { status: 200, body: { data: [{ quota_usage: 3, config: { quota_total: 100 } }] } } : null,
      (c) => c.url.includes('/IG/media_publish') ? { status: 200, body: { id: 'MEDIA1' } } : null,
      (c) => c.url.includes('/IG/media') && c.method === 'POST' ? { status: 200, body: { id: c.body.includes('CAROUSEL') ? 'CAR' : `IT${c.body.length}` } } : null,
      (c) => c.url.includes('status_code') ? { status: 200, body: { status_code: 'FINISHED' } } : null,
      (c) => c.url.includes('/MEDIA1?') ? { status: 200, body: { id: 'MEDIA1', permalink: 'https://www.instagram.com/p/abc/' } } : null,
    ])
    const r = await instagramConnector.publish!(payload(), ctxWith(s.http, { page_access_token: 'PT' }, {}, 'IG'))
    expect(r).toMatchObject({ state: 'PUBLICADO', remoteUrl: 'https://www.instagram.com/p/abc/' })
    const items = s.calls.filter((c) => c.url.includes('/IG/media') && c.method === 'POST' && c.body.includes('is_carousel_item=true'))
    expect(items).toHaveLength(2)
    expect(s.calls.find((c) => c.body.includes('media_type=CAROUSEL'))!.body).toContain('caption=')
  })
  it('Instagram: limite de 24 h atingido = cota, sem criar nada', async () => {
    const s = simulated([(c) => c.url.includes('/content_publishing_limit') ? { status: 200, body: { data: [{ quota_usage: 100, config: { quota_total: 100 } }] } } : null])
    await expect(instagramConnector.publish!(payload(), ctxWith(s.http, { page_access_token: 'PT' }, {}, 'IG'))).rejects.toMatchObject({ kind: 'QUOTA' })
    expect(s.calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })
  it('Instagram não oferece editar/remover por API (vira ação manual no worker)', () => {
    expect(instagramConnector.update).toBeUndefined(); expect(instagramConnector.remove).toBeUndefined()
  })
})

describe('cliente HTTP', () => {
  it('timeout DEPOIS de enviar criação = resultado desconhecido (TIMEOUT); leitura = indisponível', async () => {
    const hang: FetchLike = (_u, init) => new Promise((_r, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    const http = createHttpClient(hang)
    await expect(http.request({ url: 'https://x/items', method: 'POST', creates: true, timeoutMs: 20 })).rejects.toMatchObject({ kind: 'TIMEOUT' })
    await expect(http.request({ url: 'https://x/items/1', timeoutMs: 20 })).rejects.toMatchObject({ kind: 'UNAVAILABLE' })
  })
})
