// ZIP "armazenado" (sem compressão — JPEG e MP4 já são comprimidos) montado no
// NAVEGADOR: o pacote para anúncio passa do limite de resposta do servidor,
// então cada arquivo vem separado e o .zip é fechado aqui. PURO (testado).

export interface BrowserZipEntry { name: string; data: Uint8Array }

let TABLE: Uint32Array | null = null
function crcTable(): Uint32Array {
  if (TABLE) return TABLE
  TABLE = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0 }
  return TABLE
}
export function crc32(data: Uint8Array): number {
  const t = crcTable(); let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function buildZipBrowser(entries: BrowserZipEntry[], now = new Date()): Uint8Array {
  const enc = new TextEncoder()
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff
  const parts: Uint8Array[] = []; const central: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.name.replace(/[\\:*?"<>|]/g, '_'))
    const crc = crc32(e.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true)
    local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true)
    local.setUint32(18, e.data.length, true); local.setUint32(22, e.data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true)
    parts.push(new Uint8Array(local.buffer), name, e.data)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true)
    c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true)
    c.setUint32(20, e.data.length, true); c.setUint32(24, e.data.length, true); c.setUint16(28, name.length, true)
    c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), name)
    offset += 30 + name.length + e.data.length
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true)
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0))
  let p = 0
  for (const b of all) { out.set(b, p); p += b.length }
  return out
}
