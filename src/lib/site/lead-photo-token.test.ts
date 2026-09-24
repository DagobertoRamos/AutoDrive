import { describe, it, expect } from 'vitest'
import { createLeadPhotoToken, LEAD_PHOTO_TTL_MS, verifyLeadPhotoToken } from './lead-photo-token'

describe('token de fotos do lead', () => {
  const now = 1_800_000_000_000
  it('vale para o lead e a loja certos, dentro do prazo', () => {
    const t = createLeadPhotoToken('lead123', 'loja1', now, 'k')
    expect(verifyLeadPhotoToken(t, 'loja1', now + 1000, 'k')).toBe('lead123')
  })
  it('recusa outra loja, token vencido, assinatura mexida ou outra chave', () => {
    const t = createLeadPhotoToken('lead123', 'loja1', now, 'k')
    expect(verifyLeadPhotoToken(t, 'loja2', now, 'k')).toBeNull()
    expect(verifyLeadPhotoToken(t, 'loja1', now + LEAD_PHOTO_TTL_MS + 1, 'k')).toBeNull()
    expect(verifyLeadPhotoToken(t.replace('lead123', 'lead999'), 'loja1', now, 'k')).toBeNull()
    expect(verifyLeadPhotoToken(t, 'loja1', now, 'outra')).toBeNull()
    expect(verifyLeadPhotoToken('lixo', 'loja1', now, 'k')).toBeNull()
  })
})
