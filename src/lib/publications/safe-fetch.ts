// =============================================================================
// Download de imagem externa com proteção contra acesso a endereços internos
// (SSRF). O IP é conferido NA CONEXÃO (hook `lookup`), o que impede o truque
// de DNS que resolve público na checagem e privado na hora de baixar.
// Só http/https, portas 80/443, até 3 redirecionamentos (cada um revalidado),
// tempo e tamanho limitados, e só conteúdo de imagem.
// =============================================================================

import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

export class UnsafeUrlError extends Error {}

/** true para IPs privados, locais, reservados ou de metadados de nuvem. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)
    if (mapped) return isPrivateIp(mapped[1])
    return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff')
  }
  return true
}

export function assertSafeUrl(raw: string): URL {
  let u: URL
  try { u = new URL(raw) } catch { throw new UnsafeUrlError('Endereço inválido.') }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new UnsafeUrlError('Só http/https.')
  if (u.username || u.password) throw new UnsafeUrlError('Endereço com usuário/senha não é aceito.')
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80
  if (port !== 80 && port !== 443) throw new UnsafeUrlError('Porta não permitida.')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host) && isPrivateIp(host)) throw new UnsafeUrlError('Endereço interno não é permitido.')
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new UnsafeUrlError('Endereço interno não é permitido.')
  return u
}

const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return (callback as (e: Error | null, a: string, f: number) => void)(err, '', 0)
    const list = (addresses as unknown as dns.LookupAddress[]) ?? []
    const bad = list.find((a) => isPrivateIp(a.address))
    if (!list.length || bad) return (callback as (e: Error | null, a: string, f: number) => void)(new UnsafeUrlError('Endereço interno não é permitido.'), '', 0)
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list)
    ;(callback as (e: null, a: string, f: number) => void)(null, list[0].address, list[0].family)
  })
}

export interface SafeImage { bytes: Buffer; contentType: string; finalUrl: string }

export async function fetchImageSafely(raw: string, opts: { timeoutMs?: number; maxBytes?: number; redirects?: number } = {}): Promise<SafeImage> {
  const maxBytes = opts.maxBytes ?? 15 * 1024 * 1024
  let url = assertSafeUrl(raw)
  for (let hop = 0; hop <= (opts.redirects ?? 3); hop++) {
    const res = await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body?: Buffer }>((resolve, reject) => {
      const mod = url.protocol === 'https:' ? https : http
      const req = mod.get(url, { lookup: safeLookup, timeout: opts.timeoutMs ?? 15_000, headers: { 'User-Agent': 'AutoDrive-Publicacoes/1.0', Accept: 'image/*' } }, (r) => {
        const status = r.statusCode ?? 0
        if (status >= 300 && status < 400) { r.resume(); return resolve({ status, headers: r.headers }) }
        const chunks: Buffer[] = []; let size = 0
        r.on('data', (c: Buffer) => { size += c.length; if (size > maxBytes) { req.destroy(new UnsafeUrlError('Imagem grande demais.')) } else chunks.push(c) })
        r.on('end', () => resolve({ status, headers: r.headers, body: Buffer.concat(chunks) }))
        r.on('error', reject)
      })
      req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao baixar a imagem.')))
      req.on('error', reject)
    })
    if (res.status >= 300 && res.status < 400 && res.headers.location) { url = assertSafeUrl(new URL(res.headers.location, url).toString()); continue }
    if (res.status !== 200 || !res.body) throw new Error(`A imagem respondeu HTTP ${res.status}.`)
    const type = String(res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    if (!type.startsWith('image/') || type === 'image/svg+xml') throw new UnsafeUrlError('O endereço não é uma imagem.')
    return { bytes: res.body, contentType: type, finalUrl: url.toString() }
  }
  throw new UnsafeUrlError('Redirecionamentos demais.')
}
