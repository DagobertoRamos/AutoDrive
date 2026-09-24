// GET /feeds/meta-veiculos.csv — mesmo feed de /api/site/[site]/catalogo-meta, no
// endereço que o site antigo usava (o Gerenciador de Commerce já aponta para ele).
import { GET as catalog } from '@/app/api/site/[site]/catalogo-meta/route'

export const dynamic = 'force-dynamic'
export const GET = catalog
