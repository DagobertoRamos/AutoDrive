// =============================================================================
// Tradução de erros de provedores para linguagem de loja (puro).
// O usuário vê a frase; código oficial e detalhe técnico ficam no "?" ou em
// "Ver detalhes técnicos" (só para quem tem ops.logs.view).
// =============================================================================

export interface FriendlyError { message: string; fix: string | null; code: string | null }

// Rejeições SEFAZ mais comuns em nota de veículo.
const SEFAZ: Record<string, { message: string; fix: string | null }> = {
  '110': { message: 'Uso denegado pela SEFAZ.', fix: 'Fale com o contador: há irregularidade cadastral.' },
  '204': { message: 'Esta nota já foi enviada antes.', fix: null },
  '539': { message: 'Já existe nota com este número e outra chave.', fix: 'Confira a numeração da série com o contador.' },
  '225': { message: 'A nota tem um erro de formato.', fix: 'Confira os dados do cadastro e tente de novo.' },
  '280': { message: 'Certificado digital inválido.', fix: 'Atualize o certificado em Configurações › Operações.' },
  '281': { message: 'Certificado digital vencido.', fix: 'Envie o certificado novo em Configurações › Operações.' },
  '301': { message: 'Uso denegado: irregularidade fiscal do emitente.', fix: 'Fale com o contador.' },
  '302': { message: 'Uso denegado: irregularidade fiscal do destinatário.', fix: 'Confira o cadastro do cliente.' },
}

const PATTERNS: { re: RegExp; message: string; fix: string | null }[] = [
  { re: /cpf.*(n[aã]o confere|inv[aá]lido|diverg)/i, message: 'CPF do comprador não confere.', fix: 'Corrigir cadastro do cliente.' },
  { re: /cnpj.*(n[aã]o confere|inv[aá]lido|diverg)/i, message: 'CNPJ não confere.', fix: 'Corrigir cadastro.' },
  { re: /chassi/i, message: 'Chassi não confere com o registro do veículo.', fix: 'Conferir chassi na ficha do veículo.' },
  { re: /renavam/i, message: 'RENAVAM não confere com o registro do veículo.', fix: 'Conferir RENAVAM na ficha do veículo.' },
  { re: /(n[aã]o est[aá] em estoque|sem entrada|n[aã]o consta.*estoque)/i, message: 'O veículo não consta no estoque do RENAVE.', fix: 'Registrar a entrada antes da saída.' },
  { re: /(j[aá] (existe|registrad|cadastrad)|duplic)/i, message: 'Este registro já existe no provedor.', fix: null },
  { re: /(restri|bloqueio|furto|roubo)/i, message: 'O veículo tem restrição no órgão de trânsito.', fix: 'Ver restrições do veículo.' },
  { re: /(certificad)/i, message: 'Problema com o certificado digital.', fix: 'Conferir o certificado em Configurações › Operações.' },
  { re: /(timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|fetch failed|503|502|504)/i, message: 'Não foi possível confirmar a operação agora. Estamos verificando se a solicitação foi processada.', fix: null },
  { re: /(unauthori[sz]ed|401|403|credencia)/i, message: 'O provedor recusou o acesso da loja.', fix: 'Conferir as credenciais em Configurações › Operações.' },
]

export function translateProviderError(domain: string, code: string | null | undefined, raw: string | null | undefined): FriendlyError {
  const c = code ? String(code).trim() : null
  if (domain === 'FISCAL' && c && SEFAZ[c]) return { ...SEFAZ[c], code: c }
  const text = String(raw ?? '')
  for (const p of PATTERNS) if (p.re.test(text) || (c && p.re.test(c))) return { message: p.message, fix: p.fix, code: c }
  const what = domain === 'RENAVE' ? 'no RENAVE' : domain === 'FISCAL' ? 'na emissão da nota' : domain === 'TRANSFER' ? 'na transferência' : 'na integração'
  return { message: `Não foi possível concluir a operação ${what}.`, fix: null, code: c }
}
