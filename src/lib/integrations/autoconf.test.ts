import { describe, expect, it } from 'vitest'
import { mapStatus } from '@/lib/integrations/autoconf'

describe('mapStatus AutoConf', () => {
  it('mapeia textos de contrato para AGUARDANDO_CONTRATO', () => {
    expect(mapStatus('pendente contrato')).toBe('AGUARDANDO_CONTRATO')
    expect(mapStatus('contrato pendente')).toBe('AGUARDANDO_CONTRATO')
    expect(mapStatus('Aguardando Contrato')).toBe('AGUARDANDO_CONTRATO')
  })

  it('mantem cancelada como status inelegivel', () => {
    expect(mapStatus('cancelada')).toBe('CANCELADA')
  })
})
