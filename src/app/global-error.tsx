'use client'

// =============================================================================
// global-error.tsx — rede de proteção raiz. Se a aplicação quebrar ao carregar
// (erro de runtime/hidratação — ex.: navegador antigo sem suporte a algum
// recurso), mostra uma tela amigável em vez de página em branco, com opção de
// recarregar e a dica de atualizar o navegador.
// =============================================================================

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#0A1F12', color: '#fff' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Não foi possível carregar</h1>
            <p style={{ fontSize: 14, opacity: 0.8, lineHeight: 1.5, margin: '0 0 20px' }}>
              Houve um erro ao abrir o AutoDrive neste dispositivo. Tente recarregar.
              Se persistir, atualize o sistema/navegador para a versão mais recente
              (em iPhones antigos: Ajustes → Geral → Atualização de Software).
            </p>
            <button
              onClick={() => reset()}
              style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              Recarregar
            </button>
            {error?.digest && <p style={{ fontSize: 11, opacity: 0.4, marginTop: 16 }}>Ref: {error.digest}</p>}
          </div>
        </div>
      </body>
    </html>
  )
}
