// =============================================================================
// Augmentação de tipos do NextAuth.
// Importante: isto resolve TypeScript, mas NÃO preenche os campos em runtime.
// Os campos precisam ser populados também nos callbacks jwt/session em src/lib/auth.ts.
// =============================================================================

import NextAuth, { DefaultSession } from 'next-auth'
import { JWT as DefaultJWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      tenantId: string | null
    } & DefaultSession['user']
  }

  interface User {
    id: string
    role?: string | null
    tenantId?: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    role?: string | null
    tenantId?: string | null
  }
}
