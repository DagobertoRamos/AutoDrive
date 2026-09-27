import { describe, expect, it } from 'vitest'
import { describeValidationError } from './prisma-errors'

describe('describeValidationError', () => {
  it('extrai chamada e campo do erro do Prisma', () => {
    const msg = 'Invalid `prisma.seller.findFirst()` invocation:\n{ where: { tenantId: "x" } }\nUnknown argument `tenantId`. Available options are marked with ?.'
    expect(describeValidationError(msg)).toBe('seller.findFirst · campo tenantId')
    expect(describeValidationError('Argument `plate` is missing.')).toBe('campo plate')
    expect(describeValidationError('algo sem padrão')).toBeNull()
  })
})
