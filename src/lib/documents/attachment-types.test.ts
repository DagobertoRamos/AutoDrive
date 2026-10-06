import { describe, expect, it } from 'vitest'
import { normalizeDocType, parsePayrollEntityId, payrollEntityId, isDocEntityType } from './attachment-types'
import { effectiveMime, validatePrivateFile } from '@/lib/storage/private-files'

describe('documentos anexados', () => {
  it('folha: id = usuário + mês', () => {
    expect(parsePayrollEntityId(payrollEntityId('u1', '2026-10'))).toEqual({ userId: 'u1', month: '2026-10' })
    expect(parsePayrollEntityId('u1:2026-13')).toBeNull()
    expect(parsePayrollEntityId('u1')).toBeNull()
  })
  it('tipos', () => {
    expect(normalizeDocType('BOLETO')).toBe('BOLETO')
    expect(normalizeDocType('x')).toBe('OUTRO')
    expect(isDocEntityType('SUPPLIER')).toBe(true)
    expect(isDocEntityType('USER')).toBe(false)
  })
  it('XML da NF-e sem MIME vale pela extensão', () => {
    expect(effectiveMime('', 'nota.XML')).toBe('application/xml')
    expect(validatePrivateFile(effectiveMime('', 'nota.xml'), 10)).toBeNull()
    expect(validatePrivateFile('text/html', 10)).not.toBeNull()
    expect(validatePrivateFile('application/pdf', 5 * 1024 * 1024)).toBe('Arquivo acima de 4 MB.')
  })
})
