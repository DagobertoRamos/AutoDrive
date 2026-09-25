'use client'

// Faixa do topo quando o site está em pré-visualização (rascunho aberto pelo painel).
export function SitePreviewBar() {
  const exit = async () => {
    await fetch('/api/site-admin/preview', { method: 'DELETE', credentials: 'include' }).catch(() => {})
    window.location.reload()
  }
  return (
    <div className="preview-bar" role="status">
      <span>Pré-visualização: as alterações ainda NÃO foram salvas. Volte ao painel e clique em “Salvar site” para publicar.</span>
      <button type="button" onClick={() => void exit()}>Sair da pré-visualização</button>
    </div>
  )
}
