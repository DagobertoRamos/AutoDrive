'use client'

// =============================================================================
// ImpersonationBanner — Barra de alerta quando MASTER está em sessão de impersonation
//
// Mostra: quem está sendo impersonado, em qual tenant, e botões para:
//   • Ir ao Painel Master (sem encerrar a sessão)
//   • Encerrar impersonation (encerra no servidor e redireciona ao painel master)
// Persiste via sessionStorage (limpa ao fechar o browser/tab).
// =============================================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert, Loader2, LogOut, Crown } from 'lucide-react'
import { useImpersonationStore } from '@/store/impersonationStore'

export function ImpersonationBanner() {
  const { active, endImpersonation } = useImpersonationStore()
  const router  = useRouter()
  const [ending, setEnding] = useState(false)

  if (!active) return null

  async function handleEnd() {
    if (!active) return
    setEnding(true)
    try {
      await fetch(`/api/master/tenants/${active.tenant.id}/impersonate`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ impersonationSessionId: active.impersonationSessionId }),
      })
    } catch {
      // mesmo com erro de rede, limpamos o estado local
    } finally {
      endImpersonation()
      setEnding(false)
      router.push('/master/tenants/' + active.tenant.id)
    }
  }

  function handleGoToMaster() {
    // Navega ao painel master sem encerrar a sessão de impersonation
    router.push('/master/tenants/' + active!.tenant.id)
  }

  const elapsed = Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 60000)

  return (
    <div className="z-[100] flex items-center gap-3 bg-amber-500 px-4 py-2 text-sm text-white shadow-md">
      <ShieldAlert size={16} className="shrink-0 animate-pulse" />

      <div className="flex flex-1 items-center gap-2 flex-wrap min-w-0">
        <span className="font-semibold">MODO IMPERSONATION</span>
        <span className="opacity-80">·</span>
        <span>
          Visualizando como{' '}
          <strong>{active.targetUser.name}</strong>
          {' '}
          <span className="opacity-75 text-xs">({active.targetUser.role})</span>
        </span>
        <span className="opacity-80">·</span>
        <span>
          Tenant: <strong>{active.tenant.name}</strong>
        </span>
        {elapsed > 0 && (
          <>
            <span className="opacity-80">·</span>
            <span className="text-xs opacity-75">{elapsed}min</span>
          </>
        )}
      </div>

      {/* Botão: voltar ao painel master sem encerrar */}
      <button
        onClick={handleGoToMaster}
        disabled={ending}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 disabled:opacity-60 transition-colors"
        title="Ir ao painel Master deste tenant sem encerrar a impersonation"
      >
        <Crown size={12} />
        Painel Master
      </button>

      {/* Separador */}
      <span className="opacity-40 select-none">|</span>

      {/* Botão: encerrar impersonation completamente */}
      <button
        onClick={handleEnd}
        disabled={ending}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-white/10 border border-white/30 px-3 py-1 text-xs font-semibold hover:bg-red-600/60 disabled:opacity-60 transition-colors"
        title="Encerrar sessão de impersonation e voltar ao painel Master"
      >
        {ending
          ? <Loader2 size={12} className="animate-spin" />
          : <LogOut size={12} />
        }
        {ending ? 'Encerrando...' : 'Sair do modo impersonation'}
      </button>
    </div>
  )
}
