// =============================================================================
// documents/templates.ts — modelos de documentos (procurações, termos,
// declarações) para geração/impressão no AutoDrive. Puro (sem deps).
// render() devolve HTML pronto para impressão; valores são ESCAPADOS (anti-XSS).
// Não substitui orientação jurídica — modelos genéricos para conveniência.
// =============================================================================

export type DocCategory = 'procuracao' | 'termo' | 'declaracao'
export type FieldType = 'text' | 'textarea' | 'date' | 'number'

export interface TplField {
  key: string
  label: string
  type?: FieldType
  required?: boolean
  placeholder?: string
  full?: boolean // ocupa a linha inteira no formulário
}

export interface DocTemplate {
  id: string
  category: DocCategory
  title: string
  description: string
  fields: TplField[]
  render: (v: Record<string, string>) => string
}

function esc(s: string | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
const g = (v: Record<string, string>, k: string, fallback = '____________________') => {
  const t = (v[k] ?? '').trim()
  return t ? esc(t) : `<span style="color:#9ca3af">${fallback}</span>`
}

const HEADER = (v: Record<string, string>) =>
  `<div style="text-align:center;margin-bottom:24px">
     <div style="font-size:18px;font-weight:700">${g(v, 'empresa', 'NOME DA LOJA')}</div>
     <div style="font-size:12px;color:#555">${g(v, 'empresaDoc', 'CNPJ')}${v.empresaEndereco ? ' — ' + esc(v.empresaEndereco) : ''}</div>
   </div>`

const SIGN = (label: string) =>
  `<div style="margin-top:56px;text-align:center">
     <div style="border-top:1px solid #111;width:320px;margin:0 auto;padding-top:4px;font-size:13px">${label}</div>
   </div>`

const PLACE_DATE = (v: Record<string, string>) =>
  `<p style="margin-top:40px;text-align:right">${g(v, 'cidade', 'Cidade')}, ${g(v, 'data', 'data')}.</p>`

const VEICULO = (v: Record<string, string>) =>
  `o veículo <b>${g(v, 'veiculo', 'marca/modelo')}</b>, ano ${g(v, 'ano', '____')}, placa <b>${g(v, 'placa', '_______')}</b>, chassi ${g(v, 'chassi', '_________________')}, RENAVAM ${g(v, 'renavam', '___________')}`

const docWrap = (title: string, inner: string) =>
  `<div style="font-family:Georgia,'Times New Roman',serif;color:#111;line-height:1.7;font-size:14px;max-width:720px;margin:0 auto;padding:8px">
     <h1 style="text-align:center;font-size:20px;font-weight:700;letter-spacing:.5px;margin-bottom:24px">${title}</h1>
     ${inner}
   </div>`

const COMMON_VEICULO: TplField[] = [
  { key: 'veiculo', label: 'Veículo (marca/modelo)', full: true },
  { key: 'ano', label: 'Ano' },
  { key: 'placa', label: 'Placa' },
  { key: 'renavam', label: 'RENAVAM' },
  { key: 'chassi', label: 'Chassi', full: true },
]
const COMMON_EMPRESA: TplField[] = [
  { key: 'empresa', label: 'Empresa (loja)', full: true },
  { key: 'empresaDoc', label: 'CNPJ da loja' },
  { key: 'empresaEndereco', label: 'Endereço da loja', full: true },
]
const COMMON_LOCAL: TplField[] = [
  { key: 'cidade', label: 'Cidade' },
  { key: 'data', label: 'Data', placeholder: 'dd/mm/aaaa' },
]

export const DOC_TEMPLATES: DocTemplate[] = [
  // ── Procurações ──────────────────────────────────────────────────────────
  {
    id: 'proc_transferencia',
    category: 'procuracao',
    title: 'Procuração — Transferência de Veículo',
    description: 'Outorga poderes para transferência/regularização de um veículo.',
    fields: [
      { key: 'outorganteNome', label: 'Outorgante (nome)', required: true, full: true },
      { key: 'outorganteCpf', label: 'CPF/CNPJ do outorgante' },
      { key: 'outorganteRg', label: 'RG do outorgante' },
      { key: 'outorganteEndereco', label: 'Endereço do outorgante', full: true },
      { key: 'outorgadoNome', label: 'Outorgado (nome)', required: true, full: true },
      { key: 'outorgadoCpf', label: 'CPF/CNPJ do outorgado' },
      ...COMMON_VEICULO,
      ...COMMON_LOCAL,
    ],
    render: (v) => docWrap('PROCURAÇÃO', `
      <p>Pelo presente instrumento particular de procuração, <b>${g(v, 'outorganteNome', 'OUTORGANTE')}</b>, inscrito(a) no CPF/CNPJ sob nº ${g(v, 'outorganteCpf', '___________')}, RG nº ${g(v, 'outorganteRg', '__________')}, residente em ${g(v, 'outorganteEndereco', '________________')}, nomeia e constitui seu bastante procurador <b>${g(v, 'outorgadoNome', 'OUTORGADO')}</b>, inscrito(a) no CPF/CNPJ sob nº ${g(v, 'outorgadoCpf', '___________')}, a quem confere poderes para representá-lo(a) perante o DETRAN e demais órgãos competentes, podendo requerer a transferência, regularização e demais atos relativos a ${VEICULO(v)}, assinar documentos, pagar taxas e praticar tudo o que for necessário ao fiel cumprimento deste mandato.</p>
      ${PLACE_DATE(v)}
      ${SIGN('Outorgante')}
    `),
  },
  // ── Termos ───────────────────────────────────────────────────────────────
  {
    id: 'termo_garantia',
    category: 'termo',
    title: 'Termo de Garantia',
    description: 'Garantia do veículo vendido (prazo, cobertura).',
    fields: [
      { key: 'clienteNome', label: 'Cliente (nome)', required: true, full: true },
      { key: 'clienteCpf', label: 'CPF/CNPJ do cliente' },
      ...COMMON_VEICULO,
      { key: 'prazo', label: 'Prazo da garantia', placeholder: 'ex.: 3 meses / 3.000 km' },
      { key: 'cobertura', label: 'Itens cobertos', type: 'textarea', full: true, placeholder: 'motor e câmbio...' },
      ...COMMON_EMPRESA,
      ...COMMON_LOCAL,
    ],
    render: (v) => docWrap('TERMO DE GARANTIA', `
      ${HEADER(v)}
      <p>A empresa acima identificada concede ao(à) cliente <b>${g(v, 'clienteNome', 'CLIENTE')}</b>, CPF/CNPJ nº ${g(v, 'clienteCpf', '___________')}, garantia sobre ${VEICULO(v)}.</p>
      <p><b>Prazo:</b> ${g(v, 'prazo', '____________')}.</p>
      <p><b>Cobertura:</b> ${g(v, 'cobertura', 'conforme condições da loja')}.</p>
      <p>A garantia não cobre desgaste natural, mau uso, falta de manutenção ou itens não listados. Eventuais reparos cobertos devem ser realizados/autorizados pela loja.</p>
      ${PLACE_DATE(v)}
      <div style="display:flex;gap:40px;justify-content:center">${SIGN('Loja')}${SIGN('Cliente')}</div>
    `),
  },
  {
    id: 'termo_entrega',
    category: 'termo',
    title: 'Termo de Entrega e Vistoria',
    description: 'Confirma a entrega do veículo e o estado na entrega.',
    fields: [
      { key: 'clienteNome', label: 'Cliente (nome)', required: true, full: true },
      { key: 'clienteCpf', label: 'CPF/CNPJ do cliente' },
      ...COMMON_VEICULO,
      { key: 'km', label: 'Quilometragem' },
      { key: 'observacoes', label: 'Observações da vistoria', type: 'textarea', full: true },
      ...COMMON_EMPRESA,
      ...COMMON_LOCAL,
    ],
    render: (v) => docWrap('TERMO DE ENTREGA E VISTORIA', `
      ${HEADER(v)}
      <p>Declaramos a entrega ao(à) cliente <b>${g(v, 'clienteNome', 'CLIENTE')}</b>, CPF/CNPJ nº ${g(v, 'clienteCpf', '___________')}, de ${VEICULO(v)}, com quilometragem de ${g(v, 'km', '______')} km.</p>
      <p>O cliente declara ter recebido e vistoriado o veículo, de acordo com as observações abaixo, nada tendo a reclamar quanto ao estado aparente no ato da entrega.</p>
      <p><b>Observações:</b> ${g(v, 'observacoes', 'nenhuma')}.</p>
      ${PLACE_DATE(v)}
      <div style="display:flex;gap:40px;justify-content:center">${SIGN('Loja')}${SIGN('Cliente')}</div>
    `),
  },
  // ── Declarações ──────────────────────────────────────────────────────────
  {
    id: 'decl_quitacao',
    category: 'declaracao',
    title: 'Declaração de Quitação',
    description: 'Declara que o pagamento foi integralmente quitado.',
    fields: [
      { key: 'clienteNome', label: 'Cliente (nome)', required: true, full: true },
      { key: 'clienteCpf', label: 'CPF/CNPJ do cliente' },
      ...COMMON_VEICULO,
      { key: 'valor', label: 'Valor (R$)' },
      { key: 'formaPagamento', label: 'Forma de pagamento' },
      ...COMMON_EMPRESA,
      ...COMMON_LOCAL,
    ],
    render: (v) => docWrap('DECLARAÇÃO DE QUITAÇÃO', `
      ${HEADER(v)}
      <p>Declaramos, para os devidos fins, que <b>${g(v, 'clienteNome', 'CLIENTE')}</b>, CPF/CNPJ nº ${g(v, 'clienteCpf', '___________')}, quitou integralmente o valor de <b>R$ ${g(v, 'valor', '________')}</b> referente a ${VEICULO(v)}, pago via ${g(v, 'formaPagamento', '____________')}, nada mais havendo a cobrar quanto a esta negociação.</p>
      ${PLACE_DATE(v)}
      ${SIGN('Loja')}
    `),
  },
  {
    id: 'decl_recebimento',
    category: 'declaracao',
    title: 'Declaração de Recebimento de Documentos',
    description: 'Declara o recebimento de documentos do veículo.',
    fields: [
      { key: 'clienteNome', label: 'Quem recebe (nome)', required: true, full: true },
      { key: 'clienteCpf', label: 'CPF/CNPJ' },
      ...COMMON_VEICULO,
      { key: 'documentos', label: 'Documentos recebidos', type: 'textarea', full: true, placeholder: 'CRLV, CRV, chave reserva...' },
      ...COMMON_LOCAL,
    ],
    render: (v) => docWrap('DECLARAÇÃO DE RECEBIMENTO DE DOCUMENTOS', `
      <p>Eu, <b>${g(v, 'clienteNome', 'NOME')}</b>, CPF/CNPJ nº ${g(v, 'clienteCpf', '___________')}, declaro ter recebido os documentos a seguir referentes a ${VEICULO(v)}:</p>
      <p><b>Documentos:</b> ${g(v, 'documentos', '____________')}.</p>
      ${PLACE_DATE(v)}
      ${SIGN('Assinatura')}
    `),
  },
]

export function templatesByCategory(category: DocCategory): DocTemplate[] {
  return DOC_TEMPLATES.filter((t) => t.category === category)
}
