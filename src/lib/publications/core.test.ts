// Testes dos núcleos puros da Central de Publicações (sem banco, sem rede).
import { describe, expect, it } from 'vitest'
import { CHANNELS, channelSpec, findChannelByName, isPublishable, normalizeChannelName } from './channels'
import { opFor, priorityOf, statusFromRemote, summarize } from './states'
import { backoffMs, nextRunAfterError, parseRetryAfter } from './errors'
import { DEFAULT_TIMEZONE, localToUtc, utcToLocalInput, validateSchedule } from './schedule-core'
import { DEFAULT_SALE_RULES, saleAction } from './sale-rules-core'
import { autoDescription, buildPayload, channelText, payloadHash, shortRef, splitBrPhone, stripContacts, type BuildInput } from './content-core'
import { validatePayload } from './validate-core'
import { decideFeed } from './feed-guard-core'
import { mediaUrlFor, signMedia, verifyMedia } from './media-token'
import { assertSafeUrl, isPrivateIp, UnsafeUrlError } from './safe-fetch'
import { exactMatch, mapBySynonyms, rankCandidates, sourceKey } from './mapping-core'
import { buildZip } from './zip'
import { crc32 } from 'node:zlib'

const base = (over: Partial<BuildInput> = {}): BuildInput => ({
  reference: 'ad123', storeName: 'AutoDrive Veiculos',
  vehicle: { id: 'v1', brand: 'FIAT', model: 'Argo', version: 'Drive 1.0', year: 2021, modelYear: 2022, km: 35000, color: 'Prata', fuel: 'FLEX', transmission: 'MANUAL', doors: 4, plate: 'ABC1D23', salePrice: 72900, isPromo: false },
  siteListing: { title: null, description: null, options: ['Ar-condicionado', 'Direção elétrica'] },
  gallery: ['/api/site/assets/aaaaaaaaaaaa', '/api/site/assets/bbbbbbbbbbbb'],
  contacts: { whatsapp: '(11) 93471-8276', instagram: '@dagobertoautodriveveiculos', site: 'www.appautodrive.com.br' },
  location: { zip: '06454000', city: 'Barueri', state: 'SP' },
  ...over,
})

describe('catálogo de canais', () => {
  it('ids e apelidos não se repetem (mesmo portal não entra duas vezes)', () => {
    const ids = CHANNELS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    const owner = new Map<string, string>(); const conflicts: string[] = []
    for (const c of CHANNELS) for (const a of new Set([c.name, ...c.aliases].map(normalizeChannelName))) {
      if (owner.has(a) && owner.get(a) !== c.id) conflicts.push(`${a}: ${owner.get(a)} × ${c.id}`)
      owner.set(a, c.id)
    }
    expect(conflicts).toEqual([])
  })
  it('acha o canal por domínio/variação de nome', () => {
    expect(findChannelByName('https://www.webmotors.com.br/')?.id).toBe('WEBMOTORS')
    expect(findChannelByName('MercadoLivre')?.id).toBe('MERCADO_LIVRE')
    expect(findChannelByName('Chaves na Mão')?.id).toBe('CHAVES_NA_MAO')
    expect(findChannelByName('portal inexistente')).toBeUndefined()
  })
  it('catálogo não é conector: em avaliação não publica', () => {
    expect(isPublishable(channelSpec('CARFLIX')!)).toBe(false)
    expect(isPublishable(channelSpec('NAPISTA')!)).toBe(false)
    expect(isPublishable(channelSpec('WEBMOTORS')!)).toBe(true)
    expect(channelSpec('META_CATALOGO')!.capabilities.publish).toBe('NAO')
  })
  it('todo canal documenta fonte e data de verificação', () => {
    for (const c of CHANNELS) { expect(c.source.url).toBeTruthy(); expect(c.source.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/) }
  })
  it('capacidades reais: Instagram não edita nem remove por API; Webmotors/OLX não pausam', () => {
    expect(channelSpec('INSTAGRAM')!.capabilities.update).toBe('NAO')
    expect(channelSpec('INSTAGRAM')!.capabilities.remove).toBe('MANUAL')
    expect(channelSpec('WEBMOTORS')!.capabilities.pause).toBe('NAO')
    expect(channelSpec('OLX')!.capabilities.pause).toBe('NAO')
    expect(channelSpec('MERCADO_LIVRE')!.capabilities.pause).toBe('SIM')
  })
})

describe('situações', () => {
  it('resumo de sucesso parcial', () => {
    expect(summarize(['PUBLICADO', 'PUBLICADO', 'PUBLICADO', 'NA_FILA'])).toBe('3 publicados, 1 pendente')
    expect(summarize(['PUBLICADO', 'FALHA'])).toBe('1 publicado, 1 com problema')
    expect(summarize([])).toBe('')
  })
  it('"Publicado" só com confirmação coerente com a intenção', () => {
    expect(statusFromRemote('PUBLICADO', 'PUBLICADO')).toBe('PUBLICADO')
    expect(statusFromRemote('PUBLICADO', 'REMOVIDO')).toBe('REMOCAO_PENDENTE')
    expect(statusFromRemote('NAO_ENCONTRADO', 'REMOVIDO')).toBe('REMOVIDO')
    expect(statusFromRemote('NAO_ENCONTRADO', 'PUBLICADO')).toBe('FALHA')
    expect(statusFromRemote('EM_ANALISE', 'PUBLICADO')).toBe('EM_ANALISE')
  })
  it('próxima operação e prioridade da venda', () => {
    expect(opFor(null, 'PUBLICADO', false)).toBe('PUBLICAR')
    expect(opFor('PAUSADO', 'PUBLICADO', true)).toBe('RETOMAR')
    expect(opFor('PUBLICADO', 'REMOVIDO', true)).toBe('REMOVER')
    expect(opFor('PUBLICADO', 'PUBLICADO', true)).toBeNull()
    expect(priorityOf('REMOVER', true)).toBeLessThan(priorityOf('PUBLICAR'))
  })
})

describe('retentativas', () => {
  it('espera progressiva com teto', () => {
    const r = () => 0.5
    expect(backoffMs(1, r)).toBe(30_000)
    expect(backoffMs(2, r)).toBe(60_000)
    expect(backoffMs(20, r)).toBe(3_600_000)
  })
  it('só repete o que é transitório e respeita o limite', () => {
    const now = new Date('2026-09-25T12:00:00Z')
    expect(nextRunAfterError('VALIDATION', 1, 6, now)).toBeNull()
    expect(nextRunAfterError('QUOTA', 1, 6, now)).toBeNull()
    expect(nextRunAfterError('UNAVAILABLE', 6, 6, now)).toBeNull()
    expect(nextRunAfterError('RATE_LIMIT', 1, 6, now, 90_000)!.getTime()).toBe(now.getTime() + 90_000)
  })
  it('lê Retry-After em segundos e data', () => {
    expect(parseRetryAfter('10')).toBe(10_000)
    const now = new Date('2026-09-25T12:00:00Z')
    expect(parseRetryAfter('Fri, 25 Sep 2026 12:00:30 GMT', now)).toBe(30_000)
  })
})

describe('agendamento com fuso', () => {
  it('São Paulo (UTC-3) → UTC e volta', () => {
    expect(DEFAULT_TIMEZONE).toBe('America/Sao_Paulo')
    const u = localToUtc('2026-10-01T09:30', 'America/Sao_Paulo')!
    expect(u.toISOString()).toBe('2026-10-01T12:30:00.000Z')
    expect(utcToLocalInput(u, 'America/Sao_Paulo')).toBe('2026-10-01T09:30')
    expect(localToUtc('2026-10-01T09:30', 'America/Manaus')!.toISOString()).toBe('2026-10-01T13:30:00.000Z')
  })
  it('recusa passado e texto inválido', () => {
    const now = new Date('2026-09-25T12:00:00Z')
    expect(validateSchedule(localToUtc('2026-09-25T08:00'), now)).toMatch(/futuro/)
    expect(validateSchedule(localToUtc('xx'), now)).toMatch(/válidas/)
    expect(validateSchedule(localToUtc('2026-09-26T08:00'), now)).toBeNull()
  })
})

describe('venda × anúncios', () => {
  it('negociação aberta pausa; finalizada retira e arquiva como vendido', () => {
    expect(saleAction('EM_NEGOCIACAO', true)).toEqual({ kind: 'PAUSE', reason: 'VENDA_EM_ANDAMENTO' })
    expect(saleAction('RESERVADO', true).kind).toBe('PAUSE')
    expect(saleAction('VENDIDO', true)).toEqual({ kind: 'REMOVE', reason: 'VENDIDO', archive: 'VENDIDO' })
    expect(saleAction('DISPONIVEL', false)).toMatchObject({ kind: 'REMOVE', archive: 'RETIRADO' })
  })
  it('pausa só na aprovação quando a loja escolhe', () => {
    expect(saleAction('EM_NEGOCIACAO', true, { ...DEFAULT_SALE_RULES, pauseOn: 'APROVACAO' }).kind).toBe('NONE')
  })
  it('venda cancelada reativa o que a venda pausou', () => {
    expect(saleAction('DISPONIVEL', true, DEFAULT_SALE_RULES, true)).toEqual({ kind: 'RESUME', reason: 'VENDA_CANCELADA' })
    expect(saleAction('DISPONIVEL', true, { ...DEFAULT_SALE_RULES, resumeOnCancel: false }, true).kind).toBe('NONE')
    expect(saleAction('DISPONIVEL', true, DEFAULT_SALE_RULES, false).kind).toBe('NONE')
  })
})

describe('conteúdo', () => {
  it('descrição automática só com dados existentes (sem inventar)', () => {
    const d = autoDescription(base().vehicle, ['Ar-condicionado'], '')
    expect(d).toContain('Opcionais: Ar-condicionado')
    expect(d).not.toMatch(/garantia|financ/i)
    expect(autoDescription(base().vehicle, [], '')).not.toContain('Opcionais')
  })
  it('prioridade: ajuste do canal > preparado > estoque', () => {
    const p = buildPayload(base({ draft: { title: 'Draft', price: 70000, photos: ['/api/site/assets/bbbbbbbbbbbb'] }, overrides: { price: 69900 } }))
    expect(p.title).toBe('Draft')
    expect(p.price).toBe(69900)
    expect(p.photos[0]).toBe('/api/site/assets/bbbbbbbbbbbb')
  })
  it('promoção vigente do estoque vira preço com "de/por"', () => {
    const p = buildPayload(base({ vehicle: { ...base().vehicle, promoPrice: 69000, isPromo: true } }))
    expect(p.price).toBe(69000); expect(p.oldPrice).toBe(72900)
  })
  it('contatos da AutoDrive entram onde o canal permite e saem onde é proibido', () => {
    const p = buildPayload(base())
    const site = channelText(p, channelSpec('SITE')!)
    expect(site.description).toContain('WhatsApp: (11) 93471-8276')
    expect(site.description).toContain('www.appautodrive.com.br')
    const ml = channelText(p, channelSpec('MERCADO_LIVRE')!)
    expect(ml.description).not.toMatch(/93471|appautodrive|@dagoberto/)
    const ig = channelText(p, channelSpec('INSTAGRAM')!)
    expect(ig.description).toContain('@dagobertoautodriveveiculos')
  })
  it('remove telefone/e-mail/site de texto livre', () => {
    expect(stripContacts('Ligue (11) 93471-8276 ou a@b.com.br www.x.com.br')).toBe('Ligue ou')
  })
  it('corta no limite do canal e avisa', () => {
    const p = buildPayload(base({ draft: { title: 'X'.repeat(200) } }))
    const t = channelText(p, channelSpec('MERCADO_LIVRE')!)
    expect(t.title.length).toBe(60); expect(t.truncated).toContain('título')
  })
  it('hash muda com preço/fotos e é estável', () => {
    const a = buildPayload(base()); const b = buildPayload(base())
    expect(payloadHash(a)).toBe(payloadHash(b))
    expect(payloadHash(buildPayload(base({ overrides: { price: 1 } })))).not.toBe(payloadHash(a))
  })
  it('referência curta aceita pela OLX', () => {
    const r = shortRef('t:v:c:principal')
    expect(r).toMatch(/^[A-Za-z0-9_{}-]{1,19}$/); expect(r.length).toBe(19)
    expect(shortRef('t:v:c:principal')).toBe(r)
  })
  it('WhatsApp em partes (seller_contact)', () => {
    expect(splitBrPhone('(11) 93471-8276')).toEqual({ country: '55', area: '11', number: '934718276', full: '11934718276' })
    expect(splitBrPhone('+55 11 93471-8276')?.full).toBe('11934718276')
    expect(splitBrPhone('123')).toBeNull()
  })
})

describe('pendências por canal', () => {
  it('campos ausentes bloqueiam com "como resolver"', () => {
    const p = buildPayload(base({ vehicle: { ...base().vehicle, color: null, plate: null, doors: null } }))
    const wm = validatePayload(p, channelSpec('WEBMOTORS')!)
    expect(wm.filter((i) => i.severity === 'error').map((i) => i.field)).toEqual(expect.arrayContaining(['color', 'plate', 'doors']))
    expect(wm.every((i) => i.hint.length > 5)).toBe(true)
  })
  it('sem preço bloqueia portal; sem foto bloqueia todos', () => {
    const p = buildPayload(base({ vehicle: { ...base().vehicle, salePrice: null }, gallery: [] }))
    const olx = validatePayload(p, channelSpec('OLX')!).filter((i) => i.severity === 'error').map((i) => i.field)
    expect(olx).toEqual(expect.arrayContaining(['price', 'photos']))
  })
  it('Mercado Livre exige WhatsApp (desde 01/10/2026)', () => {
    const p = buildPayload(base({ contacts: {} }))
    expect(validatePayload(p, channelSpec('MERCADO_LIVRE')!).some((i) => i.field === 'whatsapp' && i.severity === 'error')).toBe(true)
  })
})

describe('feed nunca sai vazio por erro', () => {
  const now = new Date('2026-09-25T12:00:00Z')
  const lastGood = { exported: 120, at: new Date('2026-09-25T11:00:00Z') }
  it('falha interna → último bom ou 503', () => {
    expect(decideFeed({ generated: { ok: false, error: 'db' }, lastGood, visibleStock: 100, now }).serve).toBe('LAST_GOOD')
    expect(decideFeed({ generated: { ok: false, error: 'db' }, lastGood: null, visibleStock: 100, now }).serve).toBe('UNAVAILABLE')
  })
  it('vazio com estoque visível é suspeito', () => {
    expect(decideFeed({ generated: { ok: true, exported: 0 }, lastGood, visibleStock: 118, now }).serve).toBe('LAST_GOOD')
    expect(decideFeed({ generated: { ok: true, exported: 0 }, lastGood: null, visibleStock: null, now }).serve).toBe('UNAVAILABLE')
  })
  it('queda brusca retém; variação normal passa; estoque realmente vazio passa', () => {
    expect(decideFeed({ generated: { ok: true, exported: 20 }, lastGood, visibleStock: 20, now }).serve).toBe('LAST_GOOD')
    expect(decideFeed({ generated: { ok: true, exported: 110 }, lastGood, visibleStock: 110, now }).serve).toBe('CURRENT')
    expect(decideFeed({ generated: { ok: true, exported: 0 }, lastGood: { exported: 3, at: lastGood.at }, visibleStock: 0, now }).serve).toBe('CURRENT')
  })
  it('último feed bom velho (> 24 h) não é usado', () => {
    expect(decideFeed({ generated: { ok: false, error: 'x' }, lastGood: { exported: 120, at: new Date('2026-09-23T00:00:00Z') }, visibleStock: 1, now }).serve).toBe('UNAVAILABLE')
  })
})

describe('link assinado de imagem', () => {
  it('assina, valida, recusa adulteração e expiração', () => {
    const t = signMedia({ t: 'ten', a: 'asset1234567', w: 1200, e: 2_000_000_000 }, 'k')
    expect(verifyMedia(t, new Date(), 'k')).toMatchObject({ t: 'ten', a: 'asset1234567' })
    expect(verifyMedia(t, new Date(), 'outra')).toBeNull()
    const [body, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ t: 'OUTRA', a: 'asset1234567', w: 1200, e: 2_000_000_000 })).toString('base64url')
    expect(verifyMedia(`${forged}.${sig}`, new Date(), 'k')).toBeNull()
    expect(verifyMedia(`${body}.${sig}`, new Date(2_000_000_001 * 1000), 'k')).toBeNull()
  })
  it('URL pública fica sob /api/integrations (fora do login) e termina em .jpg', () => {
    expect(mediaUrlFor('https://app.x', 't', '/api/site/assets/abcdefghijkl')).toMatch(/^https:\/\/app\.x\/api\/integrations\/publications\/media\/.+\.jpg$/)
  })
})

describe('proteção SSRF', () => {
  it('bloqueia IPs internos e de metadados', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1', '0.0.0.0']) expect(isPrivateIp(ip)).toBe(true)
    for (const ip of ['8.8.8.8', '216.198.79.1', '2606:4700::1111']) expect(isPrivateIp(ip)).toBe(false)
  })
  it('recusa esquemas, portas, credenciais e hosts internos', () => {
    for (const u of ['file:///etc/passwd', 'http://localhost/x', 'http://127.0.0.1/x', 'https://user:pw@site.com/x', 'http://site.com:8080/x', 'http://169.254.169.254/latest', 'http://svc.internal/x']) expect(() => assertSafeUrl(u)).toThrow(UnsafeUrlError)
    expect(assertSafeUrl('https://cdn.site.com.br/f.jpg').hostname).toBe('cdn.site.com.br')
  })
})

describe('de-para', () => {
  const c = [{ id: '1', label: 'ARGO' }, { id: '2', label: 'Argo Drive 1.0' }, { id: '3', label: 'Argo Trekking 1.3' }]
  it('casa sozinho só quando exato e único', () => {
    expect(exactMatch('argo', c)?.id).toBe('1')
    expect(exactMatch('Argo Drive', c)).toBeNull()
    expect(exactMatch('X', [{ id: 'a', label: 'X' }, { id: 'b', label: 'x' }])).toBeNull()
  })
  it('sugestões ordenadas por semelhança (não decidem)', () => {
    expect(rankCandidates('Argo Drive 1.0 Flex', c)[0].id).toBe('2')
  })
  it('sinônimos ambíguos não decidem (Branco: metálico × pérola)', () => {
    const table = { METALLIC_WHITE: ['branco metalico'], PEARL_WHITE: ['branco perola'] }
    const cand = [{ id: 'METALLIC_WHITE', label: 'x' }, { id: 'PEARL_WHITE', label: 'y' }]
    expect(mapBySynonyms('Branco', table, cand)).toBeNull()
    expect(mapBySynonyms('Branco Pérola', table, cand)?.id).toBe('PEARL_WHITE')
  })
  it('chave estável', () => { expect(sourceKey('Fiat', 'Argo', 'Drive 1.0')).toBe('FIAT|ARGO|DRIVE 1.0') })
})

describe('ZIP da exportação manual', () => {
  it('estrutura válida com CRC e contagem', () => {
    const z = buildZip([{ name: '01-capa.jpg', data: Buffer.from('abc') }, { name: 'texto.txt', data: Buffer.from('olá') }])
    expect(z.readUInt32LE(0)).toBe(0x04034b50)
    expect(z.readUInt32LE(14)).toBe(crc32(Buffer.from('abc')) >>> 0)
    const eocd = z.length - 22
    expect(z.readUInt32LE(eocd)).toBe(0x06054b50)
    expect(z.readUInt16LE(eocd + 10)).toBe(2)
  })
})
