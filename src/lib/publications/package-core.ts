// =============================================================================
// Pacote para anúncio (PURO, testado): os textos prontos para colar no
// Facebook Marketplace, em grupos de compra e venda, OLX e WhatsApp — título
// curto (Marketplace corta em ~100 caracteres), preço, dados principais,
// descrição e condições, e os contatos da loja.
// =============================================================================

export interface PackageInput {
  title: string
  brand?: string | null; model?: string | null; version?: string | null
  year?: number | null; modelYear?: number | null; km?: number | null
  gear?: string | null; fuel?: string | null; color?: string | null; plate?: string | null
  price: number | null; oldPrice: number | null
  description: string; conditions: string; caption: string; options: string[]
  storeName: string; city?: string | null; whatsapp?: string | null; instagram?: string | null; site?: string | null
}

const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v).replace(/ /g, ' ')
const clean = (s?: string | null) => String(s ?? '').replace(/\s+/g, ' ').trim()

export function packageFileBase(i: Pick<PackageInput, 'title' | 'plate'>): string {
  const slug = clean(i.title).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60)
  return [slug || 'veiculo', clean(i.plate).replace(/[^a-z0-9]/gi, '').toUpperCase()].filter(Boolean).join('-')
}

export function packageTexts(i: PackageInput): Record<string, string> {
  const yr = i.year && i.modelYear && i.year !== i.modelYear ? `${i.year}/${i.modelYear}` : String(i.modelYear ?? i.year ?? '')
  const marketTitle = `${clean(i.title)}${yr && !clean(i.title).includes(yr) ? ` ${yr}` : ''}`.slice(0, 99)
  const facts = [
    yr && `📅 Ano: ${yr}`,
    i.km != null && `🛣️ ${i.km === 0 ? '0 km' : `${i.km.toLocaleString('pt-BR')} km`}`,
    i.gear && `⚙️ Câmbio: ${i.gear}`,
    i.fuel && `⛽ ${i.fuel}`,
    i.color && `🎨 Cor: ${clean(i.color)}`,
  ].filter(Boolean).join('\n')
  const price = i.price != null ? (i.oldPrice && i.oldPrice > i.price ? `💰 De ${money(i.oldPrice)} por ${money(i.price)}` : `💰 ${money(i.price)}`) : '💰 Consulte'
  const contacts = [
    clean(i.whatsapp) && `📲 WhatsApp: ${clean(i.whatsapp)}`,
    clean(i.instagram) && `📸 ${clean(i.instagram).startsWith('@') ? clean(i.instagram) : `@${clean(i.instagram)}`}`,
    clean(i.site) && `🌐 ${clean(i.site)}`,
  ].filter(Boolean).join('\n')
  const store = `${clean(i.storeName)}${clean(i.city) ? ` — ${clean(i.city)}` : ''}`
  const opts = i.options.length ? `✅ Opcionais: ${i.options.slice(0, 20).join(', ')}` : ''

  const marketplace = [
    `TÍTULO (Marketplace): ${marketTitle}`,
    `PREÇO: ${i.price != null ? money(i.price) : 'Consulte'}`,
    '',
    'DESCRIÇÃO:',
    [`🚗 ${marketTitle}`, price, facts, opts, clean(i.description) ? i.description.trim() : '', clean(i.conditions) ? i.conditions.trim() : '', `🏪 ${store}`, contacts].filter(Boolean).join('\n\n'),
  ].join('\n')
  const grupos = [`🔥 ${marketTitle}`, price, facts, opts, clean(i.conditions) ? i.conditions.trim().split('\n\n').slice(0, 3).join('\n\n') : '', `🏪 ${store}`, contacts, '👉 Chama no WhatsApp que eu te mando mais fotos e vídeo!'].filter(Boolean).join('\n\n')
  const whatsapp = [`*${marketTitle}*`, price.replace('💰 ', '💰 *') + (price.includes('*') ? '*' : ''), facts, opts, `🏪 ${store}`, clean(i.whatsapp) ? '' : contacts].filter(Boolean).join('\n')
  return {
    'LEIA-ME.txt': [
      `Pacote para anúncio — ${marketTitle}`,
      '',
      '• fotos/ — fotos prontas para anunciar (use na ordem: a 01 é a capa).',
      '• video/ — vídeo vertical para Reels, Stories, Marketplace e WhatsApp.',
      '• marketplace.txt — título, preço e descrição para o Facebook Marketplace e OLX.',
      '• grupos-facebook.txt — texto curto para grupos de compra e venda.',
      '• whatsapp.txt — mensagem para enviar a clientes e listas.',
      '• legenda-instagram.txt — legenda com hashtags para Instagram/Facebook.',
      '',
      'Dica: em grupos, poste no máximo 1 vez por dia no mesmo grupo e responda rápido aos comentários — evita bloqueio por spam.',
    ].join('\n'),
    'marketplace.txt': marketplace,
    'grupos-facebook.txt': grupos,
    'whatsapp.txt': whatsapp,
    'legenda-instagram.txt': clean(i.caption) ? i.caption.trim() : grupos,
  }
}
