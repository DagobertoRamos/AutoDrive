// =============================================================================
// Pacote para anúncio — de A a Z com BANCO REAL (local).
//   PUBLICATIONS_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/publications/package.db.test.ts
// Textos → fotos (tratadas / com identidade) → vídeo gerado e baixado em
// partes → .zip montado como no navegador e aberto pelo Python.
// =============================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildZipBrowser, type BrowserZipEntry } from './zip-browser'

const URL_OK = /@(localhost|127\.0\.0\.1):5433\//.test(process.env.DATABASE_URL ?? '')
const RUN = process.env.PUBLICATIONS_DB_TEST === '1' && URL_OK
if (process.env.PUBLICATIONS_DB_TEST === '1' && !URL_OK) throw new Error('Recusado: DATABASE_URL precisa ser o Postgres LOCAL (localhost:5433).')

/* eslint-disable @typescript-eslint/no-explicit-any */
const T: Record<string, any> = {}
vi.mock('@/lib/publications/api', async (orig) => ({ ...(await orig<any>()), pubAuth: async () => ({ tenantId: T.t.id, user: { id: null, name: 'Teste' }, actor: { id: null, name: 'Teste', role: 'ADMIN' } }) }))

describe.skipIf(!RUN)('Pacote para anúncio — banco local', () => {
  let prisma: any, manifest: any, photo: any, video: any, file: any
  const tag = randomUUID().slice(0, 8)
  const files: BrowserZipEntry[] = []
  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/prisma'))
    manifest = await import('@/app/api/publications/package/[vehicleId]/route')
    photo = await import('@/app/api/publications/package/[vehicleId]/photo/route')
    video = await import('@/app/api/publications/package/[vehicleId]/video/route')
    file = await import('@/app/api/publications/package/file/route')
    const sharp = (await import('sharp')).default
    T.t = await prisma.tenant.create({ data: { publicId: `AD-PKG${tag}`.slice(0, 20), slug: `pkgtest-${tag}`, name: 'Loja Pacote', city: 'Barueri' } })
    await prisma.systemSetting.create({ data: { key: `t:${T.t.id}:publications:v1`, tenantId: T.t.id, value: JSON.stringify({ contacts: { whatsapp: '(11) 93471-8276', instagram: '@lojapacote' }, terms: { cash: true, financing: true, financingMax: 60, acceptsTrade: true } }) } })
    const unit = await prisma.unit.create({ data: { tenantId: T.t.id, name: 'Matriz', cnpj: `95${Date.now()}`.slice(0, 14) } })
    const urls: string[] = []
    for (const [n, color] of ['#223344', '#557799', '#aa8844'].entries()) {
      const jpg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: color } }).jpeg().toBuffer()
      const a = await prisma.siteAsset.create({ data: { tenantId: T.t.id, kind: 'VEHICLE_PHOTO', mimeType: 'image/jpeg', fileSize: jpg.length, width: 1600, height: 1200, sha256: `${tag}${n}`, data: jpg } })
      urls.push(`/api/site/assets/${a.id}`)
    }
    T.v = await prisma.vehicle.create({ data: { tenantId: T.t.id, unitId: unit.id, brand: 'Jeep', model: 'Compass', version: 'Longitude 2.0', year: 2021, modelYear: 2022, km: 45300, fuel: 'FLEX', transmission: 'AUTOMATICO', color: 'Preto', plate: `PKG${tag.slice(0, 4)}`.toUpperCase(), salePrice: 119900, stockStatus: 'DISPONIVEL', active: true, mainPhotoUrl: urls[0], photos: { create: urls.map((url, i) => ({ url, order: i, isMain: i === 0 })) } } })
  }, 60_000)
  afterAll(async () => {
    if (!prisma || !T.t) return
    const where = { tenantId: T.t.id }
    await prisma.siteAsset.deleteMany({ where }); await prisma.vehiclePhoto.deleteMany({ where: { vehicleId: T.v?.id } }); await prisma.vehicle.deleteMany({ where })
    await prisma.unit.deleteMany({ where }); await prisma.systemSetting.deleteMany({ where }); await prisma.tenant.delete({ where: { id: T.t.id } }); await prisma.$disconnect()
  }, 60_000)
  const params = () => ({ params: Promise.resolve({ vehicleId: T.v.id }) })

  it('A) textos prontos para Marketplace, grupos, WhatsApp e Instagram, com preço, dados e contatos', async () => {
    const j = await (await manifest.GET(new Request('http://x'), params())).json()
    T.m = j.data
    expect(j.data.photos).toBe(3)
    expect(j.data.base).toMatch(/^jeep-compass/)
    expect(Object.keys(j.data.texts)).toEqual(expect.arrayContaining(['marketplace.txt', 'grupos-facebook.txt', 'whatsapp.txt', 'legenda-instagram.txt', 'LEIA-ME.txt']))
    const mk = j.data.texts['marketplace.txt']
    expect(mk).toMatch(/TÍTULO \(Marketplace\): Jeep Compass/); expect(mk).toContain('R$ 119.900'); expect(mk).toContain('45.300 km'); expect(mk).toContain('93471-8276'); expect(mk).toMatch(/60x/i)
    for (const [name, text] of Object.entries(j.data.texts)) files.push({ name: `${j.data.base}/${name}`, data: new TextEncoder().encode(String(text)) })
  })
  it('B) fotos: tratadas, com a identidade da loja (WhatsApp) e sem — imagens diferentes e válidas', async () => {
    const get = async (q: string) => Buffer.from(await (await photo.GET(new Request(`http://x?${q}`), params())).arrayBuffer())
    const limpa = await get('i=0&treat=0'); const tratada = await get('i=0&treat=1'); const marca = await get('i=0&treat=1&brand=COMPLETO')
    for (const b of [limpa, tratada, marca]) expect(b.subarray(0, 2).toString('hex')).toBe('ffd8')
    expect(limpa.equals(marca)).toBe(false); expect(tratada.equals(marca)).toBe(false)
    for (let i = 0; i < 3; i++) files.push({ name: `${T.m.base}/fotos/0${i + 1}.jpg`, data: new Uint8Array(await get(`i=${i}&treat=1&brand=COMPLETO`)) })
  }, 120_000)
  it('C) vídeo vertical gerado e baixado em partes (até 3 MB cada)', async () => {
    const r = await (await video.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ template: 'OFERTA', music: null }) }), params())).json()
    expect(r.size).toBeGreaterThan(50_000); expect(r.seconds).toBeGreaterThan(8)
    const out = new Uint8Array(r.size); let pos = 0
    while (pos < r.size) {
      const res = await file.GET(new Request(`http://x?asset=${r.assetId}`, { headers: { Range: `bytes=${pos}-` } }))
      expect(res.status).toBe(206)
      const chunk = new Uint8Array(await res.arrayBuffer()); expect(chunk.length).toBeLessThanOrEqual(3_000_000)
      out.set(chunk, pos); pos += chunk.length
    }
    expect(Buffer.from(out.subarray(4, 8)).toString()).toBe('ftyp')
    files.push({ name: `${T.m.base}/video/${T.m.base}.mp4`, data: out })
  }, 240_000)
  it('D) .zip montado como no navegador abre certinho, com tudo dentro', () => {
    const zip = buildZipBrowser(files)
    const f = path.join(mkdtempSync(path.join(tmpdir(), 'pkg-')), 'pacote.zip'); writeFileSync(f, zip)
    const out = execFileSync('python', ['-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print(len(z.namelist()))', f], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    expect(out.split(/\r?\n/)[0]).toBe('None')
    expect(Number(out.split(/\r?\n/)[1])).toBe(files.length)
  })
})
