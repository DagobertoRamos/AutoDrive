// Estoque do site da loja (porta de /veiculos do dagobertoeasycar).
import type { Metadata } from 'next'
import Link from 'next/link'
import { getSiteContext } from '@/lib/site/context'
import { listSiteVehicles, siteFilterOptions, SITE_PAGE_SIZE, type SiteFilters } from '@/lib/site/vehicles'
import { SiteVehicleCard } from '@/components/site/SiteVehicleCard'
import { fuelLabel, transmissionLabel } from '@/lib/site/listing-core'

export const metadata: Metadata = { title: 'Estoque' }

const PRICE_OPTIONS = [30000, 50000, 70000, 100000, 130000, 160000, 200000, 300000]
const SORT_OPTIONS = [
  { value: 'recent', label: 'Mais recentes' }, { value: 'price_asc', label: 'Menor preço' }, { value: 'price_desc', label: 'Maior preço' },
  { value: 'year_desc', label: 'Ano mais novo' }, { value: 'year_asc', label: 'Ano mais antigo' }, { value: 'km_asc', label: 'Menor km' }, { value: 'name', label: 'Marca/Modelo' },
]
const int = (v?: string) => (v && /^\d+$/.test(v) ? parseInt(v, 10) : undefined)

export default async function SiteStock({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ site }, sp] = await Promise.all([params, searchParams])
  const ctx = await getSiteContext(site)
  const listHref = ctx.href('/veiculos')
  const filters: SiteFilters = {
    q: sp.q || '', brand: sp.brand || '', fuel: sp.fuel || '', transmission: sp.transmission || '',
    yearMin: int(sp.yearMin), yearMax: int(sp.yearMax), priceMin: int(sp.priceMin), priceMax: int(sp.priceMax),
    type: sp.type === 'cars' || sp.type === 'motorcycles' ? sp.type : undefined, sort: sp.sort || 'recent', page: int(sp.p) ?? 1,
  }
  const [{ items, total }, opts] = await Promise.all([
    listSiteVehicles(ctx.tenantId, filters).catch(() => ({ items: [], total: 0 })),
    siteFilterOptions(ctx.tenantId).catch(() => ({ brands: [], fuels: [], transmissions: [], years: [] })),
  ])
  const totalPages = Math.ceil(total / SITE_PAGE_SIZE)
  const page = filters.page ?? 1
  const hasFilters = !!(filters.brand || filters.fuel || filters.transmission || filters.yearMin || filters.yearMax || filters.priceMin || filters.priceMax || filters.type)
  const buildHref = (over: Record<string, string>) => {
    const merged: Record<string, string> = { ...sp, ...over }
    Object.keys(merged).forEach((k) => { if (!merged[k] || merged[k] === '0') delete merged[k] })
    const qs = new URLSearchParams(merged).toString()
    return `${listHref}${qs ? `?${qs}` : ''}`
  }
  const hidden = (names: (keyof SiteFilters)[]) => names.map((n) => filters[n] ? <input key={n} type="hidden" name={n === 'page' ? 'p' : n} value={String(filters[n])} /> : null)

  return (
    <>
      <section className="page-hero"><div className="shell"><p className="eyebrow">Estoque {ctx.config.identity.name}</p><h1>Encontre seu próximo veículo</h1><p>Use a busca e os filtros para encontrar a melhor oportunidade.</p></div></section>
      <section className="shell section">
        <div className="filter-bar">
          <nav className="vehicle-type-switch" aria-label="Tipo de veículo">
            <Link href={buildHref({ type: '', p: '1' })} className={!filters.type ? 'active' : ''}>Todos</Link>
            <Link href={buildHref({ type: 'cars', p: '1' })} className={filters.type === 'cars' ? 'active' : ''}>Carros</Link>
            <Link href={buildHref({ type: 'motorcycles', p: '1' })} className={filters.type === 'motorcycles' ? 'active' : ''}>Motos</Link>
          </nav>
          <form className="search-box" action={listHref}>
            <input name="q" defaultValue={filters.q} placeholder="Pesquisar..." aria-label="Buscar veículo" />
            <button type="submit" className="search-btn" aria-label="Buscar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            </button>
            {hidden(['brand', 'fuel', 'transmission', 'type', 'yearMin', 'yearMax', 'priceMin', 'priceMax'])}
            {filters.sort && filters.sort !== 'recent' && <input type="hidden" name="sort" value={filters.sort} />}
          </form>
          <details className="filter-dropdown">
            <summary className={`filter-btn${hasFilters ? ' active' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
              Filtrar{hasFilters ? ' *' : ''}
            </summary>
            <div className="filter-panel">
              <form action={listHref}>
                {hidden(['q', 'type'])}
                {filters.sort && filters.sort !== 'recent' && <input type="hidden" name="sort" value={filters.sort} />}
                <div className="filter-group"><label>Marca</label><select name="brand" defaultValue={filters.brand}><option value="">Todas</option>{opts.brands.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
                <div className="filter-group"><label>Combustível</label><select name="fuel" defaultValue={filters.fuel}><option value="">Todos</option>{opts.fuels.map((f) => <option key={f} value={f}>{fuelLabel(f)}</option>)}</select></div>
                <div className="filter-group"><label>Câmbio</label><select name="transmission" defaultValue={filters.transmission}><option value="">Todos</option>{opts.transmissions.map((t) => <option key={t} value={t}>{transmissionLabel(t)}</option>)}</select></div>
                <div className="filter-row">
                  <div className="filter-group"><label>Preço mínimo</label><select name="priceMin" defaultValue={filters.priceMin?.toString() ?? ''}><option value="">Sem mín.</option>{PRICE_OPTIONS.map((p) => <option key={p} value={p}>R$ {p / 1000} mil</option>)}</select></div>
                  <div className="filter-group"><label>Preço máximo</label><select name="priceMax" defaultValue={filters.priceMax?.toString() ?? ''}><option value="">Sem máx.</option>{PRICE_OPTIONS.map((p) => <option key={p} value={p}>R$ {p / 1000} mil</option>)}</select></div>
                </div>
                <div className="filter-row">
                  <div className="filter-group"><label>Ano mínimo</label><select name="yearMin" defaultValue={filters.yearMin?.toString() ?? ''}><option value="">Sem mín.</option>{opts.years.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
                  <div className="filter-group"><label>Ano máximo</label><select name="yearMax" defaultValue={filters.yearMax?.toString() ?? ''}><option value="">Sem máx.</option>{opts.years.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
                </div>
                <div className="filter-actions"><button type="submit" className="button">Aplicar filtros</button><Link href={listHref} className="button button-outline">Limpar</Link></div>
              </form>
            </div>
          </details>
          <details className="filter-dropdown sort-dropdown">
            <summary className="filter-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4" /></svg>
              Ordenar por
            </summary>
            <div className="filter-panel sort-panel">
              {SORT_OPTIONS.map((o) => <Link key={o.value} href={buildHref({ sort: o.value, p: '1' })} className={`sort-option${filters.sort === o.value ? ' active' : ''}`}>{o.label}</Link>)}
            </div>
          </details>
        </div>

        {total > 0 && <p className="results-count"><strong>{total}</strong> veículos encontrados</p>}
        {items.length ? (
          <>
            <div className="vehicle-grid">{items.map((v, i) => <SiteVehicleCard key={v.id} vehicle={v} base={ctx.base} index={i} />)}</div>
            {totalPages > 1 && (
              <nav className="pagination" aria-label="Páginas">
                {page > 1 && <Link href={buildHref({ p: String(page - 1) })} className="pagination-link">&#8249; Anterior</Link>}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => <Link key={n} href={buildHref({ p: String(n) })} className={`pagination-link${n === page ? ' active' : ''}`}>{n}</Link>)}
                {page < totalPages && <Link href={buildHref({ p: String(page + 1) })} className="pagination-link">Próxima &#8250;</Link>}
              </nav>
            )}
          </>
        ) : (
          <div className="empty-state">
            <h2>Nenhum veículo encontrado</h2>
            <p>{hasFilters || filters.q ? 'Tente outros filtros ou limpe a busca.' : 'O estoque está sendo atualizado.'}</p>
            {(hasFilters || filters.q) && <Link className="button" href={listHref}>Limpar filtros</Link>}
          </div>
        )}
      </section>
    </>
  )
}
