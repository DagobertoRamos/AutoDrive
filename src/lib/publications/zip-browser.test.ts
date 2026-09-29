import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { crc32 as nodeCrc } from 'node:zlib'
import { buildZipBrowser, crc32 } from './zip-browser'

describe('ZIP do pacote para anúncio (navegador)', () => {
  it('CRC igual ao do Node e .zip íntegro, com nomes em português', () => {
    const data = new TextEncoder().encode('Descrição do anúncio — Jeep Compass 2022')
    expect(crc32(data)).toBe(nodeCrc(Buffer.from(data)) >>> 0)
    const big = new Uint8Array(300_000).map((_, i) => (i * 31) % 256)
    const zip = buildZipBrowser([{ name: 'anuncio/descrição.txt', data }, { name: 'anuncio/fotos/01.jpg', data: big }])
    const f = path.join(mkdtempSync(path.join(tmpdir(), 'zip-')), 'p.zip'); writeFileSync(f, zip)
    const out = execFileSync('python', ['-c', `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print('|'.join(n for n in z.namelist()));print(z.read('anuncio/descrição.txt').decode())`, f], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    expect(out).toContain('None')
    expect(out).toContain('anuncio/descrição.txt|anuncio/fotos/01.jpg')
    expect(out).toContain('Jeep Compass 2022')
  })
})
