// =============================================================================
// email-defaults.ts — Templates padrão do sistema (seed)
//
// Conjunto inicial de templates de e-mail criados em /api/.../templates/seed
// para que o operador master tenha uma base pronta para personalizar.
// =============================================================================

import type { EmailPurpose } from '@prisma/client'

export interface DefaultEmailTemplate {
  purpose:     EmailPurpose
  key:         string
  name:        string
  description: string
  subject:     string
  bodyHtml:    string
  bodyText:    string
  variables:   string[]
}

export const DEFAULT_EMAIL_TEMPLATES: DefaultEmailTemplate[] = [
  {
    purpose:     'SYSTEM',
    key:         'welcome',
    name:        'Boas-vindas',
    description: 'E-mail enviado a um novo usuário do sistema.',
    subject:     'Bem-vindo ao AutoDrive, {{userName}}!',
    variables:   ['userName', 'loginUrl'],
    bodyHtml: `
      <h2 style="margin:0 0 12px;color:#111827">Olá, {{userName}}!</h2>
      <p style="margin:0 0 12px;color:#374151;line-height:1.6">
        Seja bem-vindo ao <strong>AutoDrive</strong> — a plataforma que coloca sua loja no piloto automático.
      </p>
      <p style="margin:0 0 20px;color:#374151;line-height:1.6">
        Você já pode acessar a plataforma e começar a utilizar todos os recursos disponíveis para sua empresa.
      </p>
      <p style="text-align:center;margin:24px 0">
        <a href="{{loginUrl}}" style="display:inline-block;background:#166534;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          Acessar o AutoDrive
        </a>
      </p>
      <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.5">
        Em caso de dúvidas, entre em contato com o suporte.
      </p>
    `.trim(),
    bodyText:
      'Olá, {{userName}}!\n\nSeja bem-vindo ao AutoDrive — a plataforma que coloca sua loja no piloto automático.\n\nAcesse: {{loginUrl}}',
  },
  {
    purpose:     'NOTICES',
    key:         'notice_generic',
    name:        'Aviso genérico',
    description: 'Template padrão para envios do módulo de avisos/notícias.',
    subject:     '{{title}}',
    variables:   ['title', 'body'],
    bodyHtml: `
      <h2 style="margin:0 0 16px;color:#111827">{{title}}</h2>
      <div style="color:#374151;line-height:1.6;font-size:15px">
        {{body}}
      </div>
    `.trim(),
    bodyText: '{{title}}\n\n{{body}}',
  },
  {
    purpose:     'PASSWORD_RESET',
    key:         'password_reset',
    name:        'Recuperação de senha',
    description: 'Enviado quando o usuário solicita redefinição de senha.',
    subject:     'Recuperação de senha — AutoDrive',
    variables:   ['userName', 'resetUrl', 'expiresIn'],
    bodyHtml: `
      <h2 style="margin:0 0 12px;color:#111827">Recuperação de senha</h2>
      <p style="margin:0 0 12px;color:#374151;line-height:1.6">Olá, {{userName}}.</p>
      <p style="margin:0 0 12px;color:#374151;line-height:1.6">
        Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova senha:
      </p>
      <p style="text-align:center;margin:24px 0">
        <a href="{{resetUrl}}" style="display:inline-block;background:#166534;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          Redefinir minha senha
        </a>
      </p>
      <p style="margin:0 0 12px;color:#6b7280;font-size:13px;line-height:1.5">
        Este link expira em <strong>{{expiresIn}}</strong>.
      </p>
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5">
        Se você não solicitou esta alteração, ignore este e-mail — sua senha continuará a mesma.
      </p>
    `.trim(),
    bodyText:
      'Olá, {{userName}}.\n\nClique no link abaixo para redefinir sua senha (válido por {{expiresIn}}):\n{{resetUrl}}\n\nSe você não solicitou, ignore esta mensagem.',
  },
  {
    purpose:     'TRANSACTIONAL',
    key:         'profile_changed',
    name:        'Alteração de cadastro',
    description: 'Notifica o usuário quando dados sensíveis do cadastro são alterados.',
    subject:     'Seu cadastro foi atualizado — AutoDrive',
    variables:   ['userName', 'changes'],
    bodyHtml: `
      <h2 style="margin:0 0 12px;color:#111827">Cadastro atualizado</h2>
      <p style="margin:0 0 12px;color:#374151;line-height:1.6">Olá, {{userName}}.</p>
      <p style="margin:0 0 12px;color:#374151;line-height:1.6">
        As seguintes informações do seu cadastro foram alteradas:
      </p>
      <div style="background:#f3f4f6;border-radius:8px;padding:12px 16px;margin:12px 0;color:#374151;font-size:14px;line-height:1.6">
        {{changes}}
      </div>
      <p style="margin:16px 0 0;color:#6b7280;font-size:13px;line-height:1.5">
        Se você não reconhece esta alteração, entre em contato com o suporte imediatamente.
      </p>
    `.trim(),
    bodyText:
      'Olá, {{userName}}.\n\nAs seguintes informações do seu cadastro foram alteradas:\n{{changes}}\n\nSe não reconhece esta alteração, contate o suporte.',
  },
]
