// =============================================================================
// Zod validators — Auth — AutoDrive
// =============================================================================

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Helpers reutilizáveis
// ---------------------------------------------------------------------------

const emailField = z
  .string({ required_error: 'E-mail é obrigatório.' })
  .email('Informe um e-mail válido.')
  .max(254, 'E-mail muito longo.')
  .toLowerCase()
  .trim()

const passwordField = z
  .string({ required_error: 'Senha é obrigatória.' })
  .min(8, 'A senha deve ter no mínimo 8 caracteres.')
  .max(128, 'A senha deve ter no máximo 128 caracteres.')

const strongPasswordField = passwordField
  .regex(/[A-Z]/, 'A senha deve conter ao menos uma letra maiúscula.')
  .regex(/[a-z]/, 'A senha deve conter ao menos uma letra minúscula.')
  .regex(/[0-9]/, 'A senha deve conter ao menos um número.')
  .regex(
    /[^A-Za-z0-9]/,
    'A senha deve conter ao menos um caractere especial.',
  )

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string({ required_error: 'Senha é obrigatória.' })
    .min(1, 'Senha é obrigatória.'),
})

export type LoginInput = z.infer<typeof loginSchema>

// ---------------------------------------------------------------------------
// Register (criação de usuário pelo admin / auto-cadastro)
// ---------------------------------------------------------------------------

export const registerSchema = z
  .object({
    name: z
      .string({ required_error: 'Nome é obrigatório.' })
      .min(2, 'Nome deve ter ao menos 2 caracteres.')
      .max(120, 'Nome muito longo.')
      .trim(),
    email: emailField,
    phone: z
      .string()
      .regex(/^\+?[\d\s\-().]{8,20}$/, 'Telefone inválido.')
      .nullable()
      .optional(),
    password: strongPasswordField,
    confirmPassword: z
      .string({ required_error: 'Confirme a senha.' })
      .min(1, 'Confirme a senha.'),
    unitId: z.string().cuid('ID de unidade inválido.').nullable().optional(),
    role: z
      .enum(
        ['MASTER', 'ADM', 'GERENTE', 'VENDEDOR'],
        { errorMap: () => ({ message: 'Perfil inválido.' }) },
      )
      .optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não coincidem.',
  })

export type RegisterInput = z.infer<typeof registerSchema>

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

export const forgotPasswordSchema = z.object({
  email: emailField,
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

// ---------------------------------------------------------------------------
// Reset password (usando token enviado por e-mail)
// ---------------------------------------------------------------------------

export const resetPasswordSchema = z
  .object({
    token: z
      .string({ required_error: 'Token é obrigatório.' })
      .min(1, 'Token inválido.'),
    password: strongPasswordField,
    confirmPassword: z
      .string({ required_error: 'Confirme a nova senha.' })
      .min(1, 'Confirme a nova senha.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não coincidem.',
  })

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

// ---------------------------------------------------------------------------
// Change password (usuário logado alterando a própria senha)
// ---------------------------------------------------------------------------

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'Informe a senha atual.' })
      .min(1, 'Informe a senha atual.'),
    newPassword: strongPasswordField,
    confirmPassword: z
      .string({ required_error: 'Confirme a nova senha.' })
      .min(1, 'Confirme a nova senha.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não coincidem.',
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ['newPassword'],
    message: 'A nova senha deve ser diferente da senha atual.',
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
