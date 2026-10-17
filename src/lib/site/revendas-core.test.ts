import { describe, expect, it } from 'vitest'
import { decodeHtml, normalizeRevendasFuel, parseBrl, parseRevendasDetail, parseRevendasListing, revendasItem } from './revendas-core'
import { parseFeedSourceConfig } from './feed-import-core'

// Trechos reais (encurtados) de donnamultimarcas.com.br.
const card = (id: string, title: string, version: string, specs: string, price: string) => `
  <div class="item active"><a href="/Anuncio/Details/${id}"><img class="img-responsive img-full" src="https://s3.amazonaws.com/revendas/upload/${id}_1_small.webp"></a></div>
  <div class="col-xs-12 col-sm-6 col-md-7 col-lg-7">
    <a href="/Anuncio/Details/${id}">
      <h3 class="h4-break-word text-muted model-tile">
        ${title}
      </h3>
    </a>
    <h6><strong>${version}</strong></h6>
    <h6>
      ${specs}
    </h6>
    <h6>
Piloto Autom&#225;tico, Air Bag
    </h6>
    <h6>Anúncio: ${id}</h6>
    <div class="valor-detalhes"><div class="col-xs-12"><h4 class="h4-break-word text-primary"><strong>
${price}                            </strong></h4></div></div>
    <a href="/Anuncio/Details/${id}"><button class="btn btn-default"><span class="glyphicon glyphicon-plus"></span>&nbsp;&nbsp;Detalhes</button></a>
  </div>
</div>
<hr />`

const LISTING = card('679512', 'AUDI -\n Q3', '1.4 TFSI AMBIENTE GASOLINA 4P S TRONIC', 'Branco |\n 2016/2016 |\n Gasolina |\n 102.000 Km', 'R$99.900,00')
  + card('694331', 'CHEVROLET -\n CLASSIC', '1.0 MPFI LS 8V FLEX 4P MANUAL', 'Cinza |\n 2011/2011 |\n Gasolina e &#225;lcool |\n 213.029 Km', 'R$25.900,00')

const row = (label: string, value: string) => `<tr><td><label>${label}</label></td><td>\n  ${value}\n</td></tr>`
const DETAIL = `
  <a class="lightbox" href="https://s3.amazonaws.com/revendas/upload/670280_6005285.jpg"><img src="x_small.webp"></a>
  <a class="lightbox" href="https://s3.amazonaws.com/revendas/upload/670280_6005284.jpg"><img src="y_small.webp"></a>
  <a class="lightbox" href="https://s3.amazonaws.com/revendas/upload/670280_6005285.jpg"><img src="x_small.webp"></a>
  <table class="table table-striped" id="detalhes">
  ${row('Marca', 'FIAT')}${row('Modelo', 'CRONOS')}${row('Vers&#227;o', '1.3 FIREFLY FLEX DRIVE GSR')}
  ${row('Ano de fabrica&#231;&#227;o / modelo', '2018 / 2019')}${row('Km rodados', '155.341 Km')}
  ${row('Combust&#237;vel', 'Gasolina e &#225;lcool')}${row('C&#226;mbio', 'Autom&#225;tica')}
  ${row('Placa do ve&#237;culo', 'Q*****3')}${row('Quantidade de portas', '4')}
  ${row('Opcionais', 'Ar Condicionado, Freio ABS, Ar Condicionado')}${row('Tipo do ve&#237;culo', 'Carro')}
  ${row('Cor', 'Preto')}${row('Observa&#231;&#245;es', '. ')}
  </table>`

describe('revendas-core', () => {
  it('entidades, preço e combustível', () => {
    expect(decodeHtml('Autom&#225;tica &amp; &#xE9;')).toBe('Automática & é')
    expect(parseBrl('R$99.900,00')).toBe(99900)
    expect(parseBrl('sem preço')).toBeNull()
    expect(normalizeRevendasFuel('Gasolina e álcool')).toBe('FLEX')
    expect(normalizeRevendasFuel('Gasolina, álcool e elétrico')).toBe('HIBRIDO')
    expect(normalizeRevendasFuel('Diesel')).toBe('DIESEL')
  })

  it('cards da listagem', () => {
    const cards = parseRevendasListing(LISTING)
    expect(cards).toHaveLength(2)
    expect(cards[0]).toEqual({ extId: '679512', brand: 'AUDI', model: 'Q3', version: '1.4 TFSI AMBIENTE GASOLINA 4P S TRONIC', color: 'Branco', year: 2016, modelYear: 2016, fuel: 'GASOLINA', km: 102000, price: 99900 })
    expect(cards[1]).toMatchObject({ extId: '694331', model: 'CLASSIC', fuel: 'FLEX', km: 213029, price: 25900 })
    expect(parseRevendasListing('')).toEqual([])
  })

  it('ficha do anúncio vira item da importação', () => {
    const det = parseRevendasDetail(DETAIL)
    expect(det.photos).toEqual(['https://s3.amazonaws.com/revendas/upload/670280_6005285.jpg', 'https://s3.amazonaws.com/revendas/upload/670280_6005284.jpg'])
    const item = revendasItem({ extId: '670280', brand: 'FIAT', model: 'CRONOS', version: 'x', color: null, year: null, modelYear: null, fuel: null, km: null, price: 67700 }, det)
    expect(item).toMatchObject({
      extId: '670280', brand: 'FIAT', model: 'CRONOS', version: '1.3 FIREFLY FLEX DRIVE GSR', modelYear: 2019, km: 155341, price: 67700,
      fuel: 'FLEX', transmission: 'AUTOMATICO', color: 'Preto', vehicleType: 'CAR', description: '', legacySlug: null,
    })
    expect(item.extras).toMatchObject({ plate: null, year: 2018, doors: 4, options: ['Ar Condicionado', 'Freio ABS'], origin: null, reserved: false })
  })

  it('config da fonte por loja', () => {
    expect(parseFeedSourceConfig('{"kind":"revendas","url":"https://www.donnamultimarcas.com.br"}')).toEqual({ kind: 'revendas', url: 'https://www.donnamultimarcas.com.br', enabled: true })
    expect(parseFeedSourceConfig('{"kind":"revendas","url":"http://x"}')).toBeNull()
    expect(parseFeedSourceConfig('{"kind":"outro","url":"https://x"}')).toBeNull()
    expect(parseFeedSourceConfig('{"kind":"meta-csv","url":"https://x/f.csv","enabled":false}')?.enabled).toBe(false)
    expect(parseFeedSourceConfig('lixo')).toBeNull()
  })
})
