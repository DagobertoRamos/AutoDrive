import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveNotificationType } from './notification-type'

describe('resolveNotificationType', () => {
  afterEach(() => vi.restoreAllMocks())

  it('mantém tipos válidos sem avisar', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveNotificationType('ESCALONAMENTO')).toBe('ESCALONAMENTO')
    expect(resolveNotificationType('INFO')).toBe('INFO')
    expect(warn).not.toHaveBeenCalled()
  })

  it('tipo fora do enum cai em SISTEMA com aviso no console', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveNotificationType('WARNING')).toBe('SISTEMA')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('WARNING'))
  })
})
