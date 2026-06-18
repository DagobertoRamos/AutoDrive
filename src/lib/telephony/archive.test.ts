// =============================================================================
// Testes da resolução de auth de download (função pura do arquivamento).
// =============================================================================

import { describe, it, expect } from 'vitest'
import { downloadAuthHeaders } from './archive'

describe('downloadAuthHeaders', () => {
  it('Twilio → Basic AccountSid:AuthToken', () => {
    const h = downloadAuthHeaders('TWILIO', { accountSid: 'ACxxx', authToken: 'tok123' })
    expect(h.Authorization).toBe('Basic ' + Buffer.from('ACxxx:tok123').toString('base64'))
  })
  it('Bearer genérico', () => {
    expect(downloadAuthHeaders('GENERIC_WEBHOOK', { downloadBearer: 'abc' }).Authorization).toBe('Bearer abc')
  })
  it('Basic genérico por usuário/senha', () => {
    const h = downloadAuthHeaders('ASTERISK', { downloadUser: 'u', downloadPassword: 'p' })
    expect(h.Authorization).toBe('Basic ' + Buffer.from('u:p').toString('base64'))
  })
  it('sem credenciais → sem header', () => {
    expect(downloadAuthHeaders('MANUAL', {})).toEqual({})
  })
})
