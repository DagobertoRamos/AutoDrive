// =============================================================================
// Exemplo de correção em src/lib/auth.ts.
// NÃO substitua o arquivo inteiro cegamente.
// Copie apenas a parte dos callbacks para dentro do seu authOptions.
// =============================================================================

callbacks: {
  async jwt({ token, user }) {
    if (user) {
      token.role = user.role ?? null
      token.tenantId = user.tenantId ?? null
    }

    return token
  },

  async session({ session, token }) {
    if (session.user) {
      session.user.id = token.sub!
      session.user.role = String(token.role ?? '')
      session.user.tenantId = (token.tenantId as string | null | undefined) ?? null
    }

    return session
  },
}
