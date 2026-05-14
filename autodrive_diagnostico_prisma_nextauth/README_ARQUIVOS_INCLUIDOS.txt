ARQUIVOS INCLUÍDOS NO PACOTE

1) src/lib/debug/route-debugger.ts
   Wrapper temporário para diagnosticar sessão, payload e erro Prisma.

2) src/app/api/debug/session/route.ts
   Rota temporária para verificar se NextAuth está entregando id, role e tenantId.

3) src/lib/auth-guards.ts
   Guard permanente para impedir gravação sem tenantId em usuários comuns.

4) src/lib/parsers/currency.ts
   Parser permanente para valores monetários em formato brasileiro ou americano.

5) src/lib/builders/seller.builder.ts
   Builder para criar vendedor no Prisma com validação de campos obrigatórios.

6) src/types/next-auth.d.ts
   Augmentação de tipos do NextAuth para id, role e tenantId.

7) examples/auth-callbacks.example.ts
   Exemplo de callbacks para aplicar em src/lib/auth.ts.

8) examples/sellers-route.example.ts
   Exemplo de rota sellers usando withRouteDebug e buildSellerData.

9) docs/PASSO_A_PASSO_DIAGNOSTICO.md
   Passo a passo completo para aplicar a correção.
