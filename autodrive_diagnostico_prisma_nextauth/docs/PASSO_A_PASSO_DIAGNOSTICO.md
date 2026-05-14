# AutoDrive — Passo a passo para diagnosticar erro de sessão, payload e Prisma

Este pacote foi montado para resolver o problema descrito no diagnóstico do Claude:
1. `tenantId` não chegando na sessão do NextAuth.
2. Payload chegando incompleto ou com campos fora da whitelist.
3. Prisma quebrando por campo obrigatório ausente, `null`, FK inválida ou valor monetário em formato errado.

---

## 1. Antes de mexer

Pare o servidor:

```bash
CTRL + C
```

Crie uma cópia de segurança dos arquivos que serão alterados:

```bash
copy src\lib\auth.ts src\lib\auth.backup.ts
```

Se estiver usando Git:

```bash
git status
git add .
git commit -m "backup antes do diagnostico de rotas"
```

---

## 2. Copie os arquivos para o projeto

Copie estes arquivos para dentro do seu projeto Next.js:

```txt
src/lib/debug/route-debugger.ts
src/app/api/debug/session/route.ts
src/lib/auth-guards.ts
src/lib/parsers/currency.ts
src/lib/builders/seller.builder.ts
src/types/next-auth.d.ts
```

Também deixei dois exemplos:

```txt
examples/auth-callbacks.example.ts
examples/sellers-route.example.ts
```

---

## 3. Corrija os callbacks do NextAuth

Abra:

```txt
src/lib/auth.ts
```

Procure por:

```ts
callbacks: {
```

Dentro de `callbacks`, garanta que existam `jwt` e `session` preenchendo `role` e `tenantId`.

Modelo:

```ts
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
```

Atenção:
- O arquivo `src/types/next-auth.d.ts` só corrige o TypeScript.
- Quem coloca o valor de verdade na sessão são os callbacks acima.

---

## 4. Teste se a sessão está chegando

Rode o projeto:

```bash
npm run dev
```

Entre logado no sistema e acesse:

```txt
http://localhost:3000/api/debug/session
```

Resultado esperado:

```json
{
  "authenticated": true,
  "role": "ADMIN",
  "tenantId": "id-da-loja"
}
```

Se aparecer:

```txt
tenantId: "NOT PRESENT"
```

o problema ainda está no `src/lib/auth.ts`.

---

## 5. Aplique o debug em uma rota problemática

Exemplo: `src/app/api/sellers/route.ts`.

Adicione:

```ts
import { withRouteDebug, logPayloadDiff } from '@/lib/debug/route-debugger'
```

Troque:

```ts
export async function POST(req: NextRequest) {
```

por:

```ts
export const POST = withRouteDebug('sellers/POST', async (req: NextRequest) => {
```

No final da função, troque a chave final:

```ts
}
```

por:

```ts
})
```

Logo depois do:

```ts
const body = await req.json()
```

coloque:

```ts
const {
  fullName,
  whatsapp,
  unitId,
  shortName,
  cpf,
  email,
  cargo,
  active,
  receivesCharge,
} = body

logPayloadDiff(body, {
  fullName,
  whatsapp,
  unitId,
  shortName,
  cpf,
  email,
  cargo,
  active,
  receivesCharge,
})
```

---

## 6. Leia o terminal

Faça o cadastro/ação pela tela do sistema.

No terminal do Next.js, procure:

```txt
tenantId : ⚠️ undefined
```

Se aparecer, o erro é NextAuth.

Procure também:

```txt
UNDEFINED
NULL
DESCARTADOS
```

Se aparecer campo obrigatório como `undefined`, o erro é whitelist incompleta.

Se aparecer erro Prisma:

```txt
P2011
P2012
P2006
P2002
P2003
```

Use esta tabela:

| Código | Significado | Correção |
|---|---|---|
| P2011 | Campo NOT NULL recebeu null | Verificar tenantId ou campo obrigatório |
| P2012 | Campo obrigatório ausente | Adicionar campo na whitelist/builder |
| P2006 | Tipo inválido | Corrigir parser de número/moeda |
| P2002 | Duplicidade | CPF/CNPJ/e-mail já cadastrado |
| P2003 | FK inválida | unitId/tenantId não existe no banco |

---

## 7. Use o builder do vendedor

Na rota de vendedores, em vez de montar o `data` manualmente, use:

```ts
import { buildSellerData } from '@/lib/builders/seller.builder'

const seller = await prisma.seller.create({
  data: buildSellerData(body, session),
})
```

Se o Prisma reclamar da relação `tenant` ou `unit`, use a versão alternativa:

```ts
import { buildSellerUncheckedData } from '@/lib/builders/seller.builder'

const seller = await prisma.seller.create({
  data: buildSellerUncheckedData(body, session),
})
```

---

## 8. Use o parser de moeda em rotas financeiras/serviços

Importe:

```ts
import { parseCurrency, requireCurrency } from '@/lib/parsers/currency'
```

Exemplo:

```ts
const service = await prisma.service.create({
  data: {
    name: String(body.name),
    defaultValue: parseCurrency(body.defaultValue) ?? 0,
    defaultCommission: parseCurrency(body.defaultCommission) ?? 0,
  },
})
```

Para campo obrigatório:

```ts
value: requireCurrency(body.value, 'value')
```

---

## 9. Depois que descobrir a causa

Remova antes de produção:

```txt
src/app/api/debug/session/route.ts
```

E tire o wrapper:

```ts
withRouteDebug(...)
```

das rotas.

O arquivo `src/lib/debug/route-debugger.ts` pode ficar no projeto, mas não deve ser usado em produção com dados sensíveis.

---

## 10. Ordem correta de execução

1. Copiar os arquivos.
2. Corrigir `src/lib/auth.ts`.
3. Rodar `npm run dev`.
4. Acessar `/api/debug/session`.
5. Aplicar `withRouteDebug` em uma rota problemática.
6. Testar pela tela.
7. Ler o terminal.
8. Corrigir a causa encontrada.
9. Remover rota temporária de debug antes do deploy.
