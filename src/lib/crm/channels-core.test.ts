import { describe, expect, it } from 'vitest'
import { CHANNEL_CATALOG, CHANNEL_SOURCES, inboundLeadNotes, normalizePhone, parseInboundLead, sanitizeChannels, secretMatches } from './channels-core'

describe('parseInboundLead — formatos das plataformas', () => {
  it('Google Ads (user_column_data + google_key + is_test)', () => {
    const r = parseInboundLead({
      lead_id: 'TeSter-123', api_version: '1.0', form_id: 40000000, campaign_id: 12345, google_key: 'segredo', is_test: true,
      user_column_data: [
        { column_name: 'Full Name', string_value: 'FirstName LastName', column_id: 'FULL_NAME' },
        { column_name: 'User Phone', string_value: '+16505550123', column_id: 'PHONE_NUMBER' },
        { column_name: 'User Email', string_value: 'test@example.com', column_id: 'EMAIL' },
        { column_name: 'Modelo', string_value: 'Onix LT', column_id: 'VEHICLE_MODEL' },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.secret).toBe('segredo')
    expect(r.lead).toMatchObject({ name: 'FirstName LastName', email: 'test@example.com', vehicle: 'Onix LT', externalId: 'TeSter-123', isTest: true, campaign: '12345' })
    expect(r.lead.phone).toBeTruthy()
  })

  it('Meta Lead Ads (field_data) com pergunta personalizada', () => {
    const r = parseInboundLead({
      id: '4444', created_time: '2026-09-24T10:00:00+0000', ad_name: 'Feirão Onix', form_name: 'Form Onix',
      field_data: [
        { name: 'full_name', values: ['Maria Souza'] },
        { name: 'phone_number', values: ['+5511988887777'] },
        { name: 'email', values: ['maria@x.com'] },
        { name: 'qual_carro_voce_procura?', values: ['SUV até 90 mil'] },
      ],
    })
    expect(r.ok && r.lead).toMatchObject({ name: 'Maria Souza', phone: '(11) 98888-7777', email: 'maria@x.com', externalId: '4444', adName: 'Feirão Onix', formName: 'Form Onix' })
    if (r.ok) expect(r.lead.answers).toEqual([['qual_carro_voce_procura?', 'SUV até 90 mil']])
  })

  it('TikTok / conectores (lista pergunta-resposta)', () => {
    const r = parseInboundLead({ lead_id: 'tt-1', answers: [{ question: 'Name', answer: 'Ana' }, { question: 'Phone number', answer: '11 97777-6666' }, { question: 'Entrada?', answer: 'Sim' }] })
    expect(r.ok && r.lead).toMatchObject({ name: 'Ana', phone: '(11) 97777-6666', externalId: 'tt-1' })
    if (r.ok) expect(r.lead.answers).toEqual([['Entrada?', 'Sim']])
  })

  it('RD Station ({ leads: [...] })', () => {
    const r = parseInboundLead({ leads: [{ name: 'Beto', email: 'beto@x.com', mobile_phone: '(11) 96666-5555', id: 'rd-9' }] })
    expect(r.ok && r.lead).toMatchObject({ name: 'Beto', email: 'beto@x.com', phone: '(11) 96666-5555', externalId: 'rd-9' })
  })

  it('JSON genérico em português', () => {
    const r = parseInboundLead({ nome: 'João', telefone: '11999998888', mensagem: 'Quero o Onix', veiculo: 'Onix 2022', campanha: 'Feirão' })
    expect(r.ok && r.lead).toMatchObject({ name: 'João', phone: '(11) 99999-8888', message: 'Quero o Onix', vehicle: 'Onix 2022', campaign: 'Feirão', isTest: false })
  })

  it('sem telefone e sem e-mail → recusa; corpo vazio → recusa', () => {
    expect(parseInboundLead({ nome: 'Sem contato' }).ok).toBe(false)
    expect(parseInboundLead(null).ok).toBe(false)
    expect(parseInboundLead({ nome: 'X', email: 'invalido' }).ok).toBe(false)
  })

  it('segredo pelo cabeçalho Authorization (OLX)', () => {
    const r = parseInboundLead({ name: 'Carlos', phone: '11955554444' }, { authorization: 'Bearer abc123' })
    expect(r.ok && r.secret).toBe('abc123')
  })
})

describe('utilitários', () => {
  it('telefone', () => {
    expect(normalizePhone('+55 (11) 98888-7777')).toBe('(11) 98888-7777')
    expect(normalizePhone('1133334444')).toBe('(11) 3333-4444')
  })
  it('observação do lead junta veículo, mensagem, respostas e origem', () => {
    const r = parseInboundLead({ nome: 'A', telefone: '11999998888', veiculo: 'Onix', mensagem: 'oi', campanha: 'C1', answers: [{ question: 'Troca?', answer: 'Sim' }] })
    if (!r.ok) throw new Error('parse')
    const n = inboundLeadNotes(r.lead, 'Facebook')
    expect(n).toContain('canal "Facebook"')
    expect(n).toContain('Veículo de interesse: Onix')
    expect(n).toContain('Troca?: Sim')
    expect(n).toContain('campanha C1')
  })
  it('segredo só é exigido se o canal tiver um', () => {
    expect(secretMatches({ secret: '' }, 'qualquer')).toBe(true)
    expect(secretMatches({ secret: 'k' }, 'k')).toBe(true)
    expect(secretMatches({ secret: 'k' }, 'x')).toBe(false)
  })
  it('catálogo: todo canal grava uma origem conhecida', () => {
    const codes = new Set(CHANNEL_SOURCES.map((s) => s.code))
    for (const c of CHANNEL_CATALOG) expect(codes.has(c.sourceCode)).toBe(true)
  })
})

describe('sanitizeChannels', () => {
  let n = 0
  const key = () => `k${++n}`.padEnd(24, 'x')
  it('canal novo ganha chave; chave e criação de canal existente não mudam', () => {
    const [a] = sanitizeChannels([{ type: 'FACEBOOK', name: 'FB loja' }], [], key, new Date('2026-01-01'))
    expect(a).toMatchObject({ type: 'FACEBOOK', name: 'FB loja', sourceCode: 'FACEBOOK', active: true })
    const [b] = sanitizeChannels([{ id: a.id, type: 'TIKTOK', name: 'Novo nome', key: 'hack', active: false }], [a], key)
    expect(b).toMatchObject({ id: a.id, type: 'FACEBOOK', key: a.key, createdAt: a.createdAt, name: 'Novo nome', active: false })
  })
  it('tipo desconhecido é ignorado', () => {
    expect(sanitizeChannels([{ type: 'NAO_EXISTE' }], [], key)).toEqual([])
  })
})
