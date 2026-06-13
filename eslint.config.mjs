// =============================================================================
// ESLint 9 (flat config) — AutoDrive
// Next.js 16 removeu `next lint`; o lint roda via ESLint CLI com flat config.
// eslint-config-next 16 já exporta arrays de flat config (core-web-vitals +
// typescript), então basta espalhá-los.
// =============================================================================

import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'prisma/migrations/**',
      'sheets-service/**', // microserviço Python
      'scripts/**',        // utilitários de manutenção/dev
      'next-env.d.ts',
      '*.config.js',
      'robo_pendencias_easycar.gs',
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Permite parâmetros/variáveis intencionalmente não usados com prefixo "_".
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Padrão fetch-on-mount (useEffect → load → setState) é usado em todo o
      // app; regra advisory mantida como aviso, não erro.
      'react-hooks/set-state-in-effect': 'warn',
      // Dívida de estilo pervasiva no código legado (nunca foi lintado).
      // Mantida VISÍVEL como aviso; código novo deve evitar. Limpeza do legado
      // pode ser feita em um passe dedicado (ratchet para 'error' depois).
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
]
