// Caminho base dos links do site: no domínio/subdomínio da loja é "" (o proxy
// reescreve para /s/<key> e marca o header); na rota de teste é "/s/<key>".
import { headers } from 'next/headers'
import { SITE_HOST_HEADER } from './host'

export { SITE_HOST_HEADER }

export async function siteBase(key: string): Promise<string> {
  const h = await headers()
  return h.get(SITE_HOST_HEADER) === '1' ? '' : `/s/${encodeURIComponent(key)}`
}

export function siteHref(base: string, path: string): string {
  if (!path || path === '/') return base || '/'
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
