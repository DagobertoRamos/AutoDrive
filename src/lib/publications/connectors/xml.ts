// Utilitários mínimos de XML/SOAP para webservices ASMX (Webmotors).
// Respostas pequenas e com esquema conhecido: extração por tag é suficiente
// e evita dependência nova. Entrada sempre escapada.

export const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export const unesc = (v: string) => v
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** Elementos na ordem dada (o XmlSerializer do .NET respeita a sequência do WSDL). */
export function elements(fields: Array<[string, unknown]>): string {
  return fields.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('')
}

export function soapEnvelope(op: string, ns: string, inner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${op} xmlns="${ns}">${inner}</${op}></soap:Body></soap:Envelope>`
}

/** Conteúdo da 1ª tag (sem prefixo de namespace). */
export function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(xml)
  return m ? unesc(m[1].trim()) : null
}

/** Blocos de todas as ocorrências da tag. */
export function tags(xml: string, name: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(m[1])
  return out
}

export function soapFault(xml: string): string | null {
  return tag(xml, 'faultstring')
}
