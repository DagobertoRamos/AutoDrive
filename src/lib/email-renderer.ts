// =============================================================================
// email-renderer.ts — Renderização de templates de e-mail
//
// • renderEmailTemplate — substitui placeholders {{var}} em subject + bodyHtml
// • wrapWithLayout      — envolve o conteúdo num layout HTML responsivo da
//                          marca AutoDrive (inline CSS, max-width 600px)
// =============================================================================

export interface RenderableTemplate {
  subject:   string
  bodyHtml:  string
  bodyText?: string | null
  variables: string[]
}

export interface RenderedEmail {
  subject:  string
  bodyHtml: string
  bodyText: string
}

// ── Substituição de placeholders ─────────────────────────────────────────────

function replacePlaceholders(input: string, vars: Record<string, string>): string {
  if (!input) return ''
  return input.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name] ?? '')
    }
    return match // mantém o placeholder se variável não foi fornecida
  })
}

/**
 * Renderiza subject + bodyHtml + bodyText (se houver) substituindo {{vars}}.
 * Não envolve no layout — use `wrapWithLayout` em seguida quando aplicável.
 */
export function renderEmailTemplate(
  template: RenderableTemplate,
  vars: Record<string, string> = {},
): RenderedEmail {
  const subject  = replacePlaceholders(template.subject,  vars)
  const bodyHtml = replacePlaceholders(template.bodyHtml, vars)
  const bodyText = template.bodyText
    ? replacePlaceholders(template.bodyText, vars)
    : stripHtml(bodyHtml)

  return { subject, bodyHtml, bodyText }
}

function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Layout HTML envolvente (email-safe) ───────────────────────────────────────

const BRAND_GREEN     = '#166534'
const BRAND_GREEN_DK  = '#14532d'
const FOOTER_TEXT     = '#9ca3af'

export interface WrapOptions {
  previewText?: string
  appUrl?:      string
}

export function wrapWithLayout(innerHtml: string, opts: WrapOptions = {}): string {
  const appUrl   = opts.appUrl ?? process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? ''
  const logoUrl  = appUrl ? `${appUrl.replace(/\/$/, '')}/logo.png` : ''
  const preview  = (opts.previewText ?? '').slice(0, 140)
  const year     = new Date().getFullYear()

  // Wordmark fallback caso logo não carregue ou appUrl ausente
  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="AutoDrive" width="140" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:140px" onerror="this.style.display='none';this.nextSibling.style.display='inline-block'" />
       <span style="display:none;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${BRAND_GREEN}">AutoDrive</span>`
    : `<span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${BRAND_GREEN}">AutoDrive</span>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>AutoDrive</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased">
${preview ? `<div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${preview}</div>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f5">
  <tr>
    <td align="center" style="padding:24px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%">
        <!-- Header -->
        <tr>
          <td align="center" style="padding:16px 0 20px">
            ${logoBlock}
          </td>
        </tr>
        <!-- Card -->
        <tr>
          <td style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;padding:32px;box-shadow:0 1px 2px rgba(0,0,0,0.04)">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="border-top:3px solid ${BRAND_GREEN};padding-top:18px">
                  ${innerHtml}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td align="center" style="padding:20px 8px 8px;color:${FOOTER_TEXT};font-size:12px;line-height:1.6">
            <p style="margin:0 0 4px;color:${BRAND_GREEN_DK};font-weight:600">Sua loja no piloto automático</p>
            <p style="margin:0">&copy; ${year} AutoDrive. Todos os direitos reservados.</p>
            <p style="margin:8px 0 0">
              <a href="#" style="color:${FOOTER_TEXT};text-decoration:underline">Cancelar inscrição</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}
