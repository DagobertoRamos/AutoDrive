// =============================================================================
// Testes da rota GET /api/mobile/bootstrap — auth, payload, auditoria e
// ausência de segredos. Sessão/auditoria/tenant-modules MOCKADOS (sem banco).
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

const { authGuardsMock, tenantModulesMock } = vi.hoisted(() => ({
  authGuardsMock: {
    getSessionUser: vi.fn(),
    unauthorizedResponse: vi.fn(
      () => new Response(JSON.stringify({ success: false, error: 'Não autenticado' }), { status: 401, headers: { 'content-type': 'application/json' } }),
    ),
    createSafeAuditLog: vi.fn(async () => {}),
  },
  tenantModulesMock: { getDisabledModules: vi.fn(async () => [] as string[]) },
}))

vi.mock('@/lib/auth-guards', () => authGuardsMock)
vi.mock('@/lib/tenant-modules', () => tenantModulesMock)

import { GET } from '@/app/api/mobile/bootstrap/route'

const MASTER = { id: 'u1', name: 'Master', email: 'm@x.com', role: 'MASTER', status: 'ATIVO', unitId: null, tenantId: null }

function reqWith(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/mobile/bootstrap', { headers })
}

beforeEach(() => {
  authGuardsMock.getSessionUser.mockReset()
  authGuardsMock.createSafeAuditLog.mockClear()
  tenantModulesMock.getDisabledModules.mockClear()
})

describe('GET /api/mobile/bootstrap', () => {
  it('bloqueia sem autenticação (401)', async () => {
    authGuardsMock.getSessionUser.mockResolvedValue(null)
    const res = await GET(reqWith())
    expect(res.status).toBe(401)
    expect(authGuardsMock.createSafeAuditLog).not.toHaveBeenCalled()
  })

  it('retorna payload autenticado com user, módulos, entrypoints e segurança', async () => {
    authGuardsMock.getSessionUser.mockResolvedValue(MASTER)
    const res = await GET(reqWith())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    // identidade
    expect(body.data.user).toMatchObject({ id: 'u1', role: 'MASTER', email: 'm@x.com' })
    // módulos
    expect(Array.isArray(body.data.modules)).toBe(true)
    expect(body.data.modules.length).toBeGreaterThan(0)
    expect(body.data.modules).toContain('negotiations')
    // entrypoints
    expect(body.data.entrypoints.some((e: { key: string }) => e.key === 'inicio')).toBe(true)
    // flags de segurança
    expect(body.data.security).toMatchObject({ neverStoreSecrets: true, apiOnly: true, externalCallsBlocked: true })
  })

  it('reflete o cliente mobile e audita MOBILE_BOOTSTRAP quando vem do app nativo', async () => {
    authGuardsMock.getSessionUser.mockResolvedValue(MASTER)
    const res = await GET(reqWith({
      'x-autodrive-platform': 'android',
      'x-autodrive-device-id': 'dev-01',
      'x-autodrive-app-version': '1.0.0',
    }))
    const body = await res.json()
    expect(body.data.client).toEqual({ deviceId: 'dev-01', platform: 'android', appVersion: '1.0.0' })
    expect(authGuardsMock.createSafeAuditLog).toHaveBeenCalledTimes(1)
    expect(authGuardsMock.createSafeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'MOBILE_BOOTSTRAP', userId: 'u1' }))
  })

  it('NÃO audita quando não há headers mobile (web/unknown)', async () => {
    authGuardsMock.getSessionUser.mockResolvedValue(MASTER)
    await GET(reqWith({ 'x-autodrive-platform': 'web' }))
    expect(authGuardsMock.createSafeAuditLog).not.toHaveBeenCalled()
  })

  it('não expõe segredos no payload', async () => {
    authGuardsMock.getSessionUser.mockResolvedValue(MASTER)
    const res = await GET(reqWith())
    const raw = JSON.stringify(await res.json()).toLowerCase()
    for (const secret of ['database_url', 'nextauth_secret', 'accesstoken', 'apikey', 'api_key', 'password', 'authtoken', 'bearer']) {
      expect(raw).not.toContain(secret)
    }
  })
})
