'use client'

// =============================================================================
// SheetCredentialsSettings
// Gerencia as credenciais do Google Sheets no banco de dados (Painel Master).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  KeyRound, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff,
  RefreshCw, ChevronDown, ChevronUp, ShieldCheck, FileKey2, Wand2,
} from 'lucide-react'

// Espelha exatamente src/lib/crypto.ts — isMasked() usa essa string no backend
const BACKEND_MASKED = '••••••••' as const

interface CredentialStatus {
  credentialConfigured: boolean
  clientEmail:          string
  masterSheetId:        string
  serviceAccountJson:   string   // sempre BACKEND_MASKED ou ''
}

// ── Sanitização de JSON colado ────────────────────────────────────────────────
// Aceita JSON identado exatamente como vem do Google Cloud Console.
// Remove BOM, aspas "inteligentes" e outros caracteres invisíveis que o SO
// pode inserir ao copiar/colar. Re-serializa para uma string limpa e compacta.

function sanitizeJson(raw: string): { json: string; error?: string } {
  // 1. Remove BOM e caracteres invisíveis/zero-width
  let s = raw
    .replace(/^﻿/, '')                    // BOM UTF-8
    .replace(/[​-‍﻿ ]/g, '') // zero-width, NBSP
    .trim()

  if (!s) return { json: '', error: 'Campo vazio.' }

  // 2. Substitui aspas "inteligentes" do macOS / Word por aspas retas
  s = s
    .replace(/[‘’]/g, "'")   // ' '  → '
    .replace(/[“”]/g, '"')   // " "  → "

  // 3. Tenta parse direto (funciona para JSON identado e minificado)
  try {
    const parsed = JSON.parse(s)
    // Re-serializa: normaliza escapes, remove espaços extras, garante string limpa
    return { json: JSON.stringify(parsed) }
  } catch { /* tenta correções abaixo */ }

  // 4. Às vezes o SO converte \n dentro de strings em quebras de linha reais
  //    ao colar (problema de clipboard no Windows). Tenta escapar quebras
  //    de linha reais que estejam DENTRO de strings JSON.
  try {
    const fixed = s.replace(
      /"((?:[^"\\]|\\.)*)"/g,
      (_, content: string) => `"${content.replace(/\n/g, '\\n').replace(/\r/g, '')}"`
    )
    const parsed = JSON.parse(fixed)
    return { json: JSON.stringify(parsed) }
  } catch { /* tenta próxima correção */ }

  // 5. Última tentativa: remove todos os \r (CRLF → LF) e tenta de novo
  try {
    const parsed = JSON.parse(s.replace(/\r\n/g, '\n').replace(/\r/g, '\n'))
    return { json: JSON.stringify(parsed) }
  } catch { /* esgotado */ }

  return {
    json: s,
    error:
      'JSON inválido. Verifique se copiou o arquivo completo (.json) do Google Cloud Console. ' +
      'O formato identado padrão é aceito — não é necessário minificar.',
  }
}

// ── Validação de campos mínimos ───────────────────────────────────────────────

function validateCredentialFields(json: string): string | null {
  try {
    const obj = JSON.parse(json) as Record<string, unknown>
    if (obj.type !== 'service_account') {
      return 'O campo "type" deve ser "service_account". Verifique se usou a credencial correta (Service Account, não OAuth2).'
    }
    if (!obj.client_email) return 'Campo "client_email" ausente no JSON.'
    if (!obj.private_key)  return 'Campo "private_key" ausente no JSON.'
    return null
  } catch {
    return 'JSON inválido após sanitização.'
  }
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400'
const labelCls = 'text-xs font-medium text-gray-600 block mb-1'

// ── Componente ────────────────────────────────────────────────────────────────

export default function SheetCredentialsSettings() {
  const [status,    setStatus]    = useState<CredentialStatus | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [expanded,  setExpanded]  = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [showJson,  setShowJson]  = useState(false)
  const [jsonError, setJsonError] = useState<string | null>(null)   // erro de validação inline
  const [feedback,  setFeedback]  = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const [form, setForm] = useState({
    masterSheetId:      '',
    serviceAccountJson: '',
  })

  // ── Carrega configurações atuais ─────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setFeedback(null)
    try {
      const res  = await fetch('/api/master/sheets/settings')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { success: boolean; data?: CredentialStatus; error?: string }
      if (data.success && data.data) {
        setStatus(data.data)
        setForm(f => ({ ...f, masterSheetId: data.data!.masterSheetId ?? '' }))
      } else {
        setFeedback({ type: 'error', msg: data.error ?? 'Erro ao carregar configurações.' })
      }
    } catch (err) {
      setFeedback({ type: 'error', msg: `Erro ao carregar: ${String(err)}` })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Formata o JSON no textarea ───────────────────────────────────────────────
  function handleFormatJson() {
    const { json, error } = sanitizeJson(form.serviceAccountJson)
    if (error) {
      setJsonError(error)
      return
    }
    try {
      // Re-serializa identado para o usuário ver que está correto
      const pretty = JSON.stringify(JSON.parse(json), null, 2)
      setForm(f => ({ ...f, serviceAccountJson: pretty }))
      setJsonError(null)
    } catch {
      setJsonError('Não foi possível formatar — verifique se o JSON está completo.')
    }
  }

  // ── Validação em tempo real ao sair do textarea (onBlur) ─────────────────────
  function handleJsonBlur() {
    const raw = form.serviceAccountJson.trim()
    if (!raw) { setJsonError(null); return }
    if (raw === BACKEND_MASKED) { setJsonError(null); return }

    const { json, error: sanitizeError } = sanitizeJson(raw)
    if (sanitizeError) { setJsonError(sanitizeError); return }

    const fieldError = validateCredentialFields(json)
    setJsonError(fieldError)
  }

  // ── Salva configurações ──────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)

    const rawJson     = form.serviceAccountJson.trim()
    const jsonVisible = !configured || replacing

    // Guarda de segurança: nunca enviar o valor mascarado
    if (rawJson === BACKEND_MASKED) {
      setFeedback({ type: 'error', msg: 'Valor inválido. Apague o campo e cole o JSON novamente.' })
      return
    }

    // Se o textarea está visível e sem conteúdo, e não há credencial ainda
    if (jsonVisible && !rawJson && !configured) {
      setFeedback({ type: 'error', msg: 'Cole o JSON da Service Account antes de salvar.' })
      return
    }

    // Sanitiza e valida o JSON antes de enviar
    let cleanJson: string | undefined
    if (jsonVisible && rawJson) {
      const { json, error: sanitizeError } = sanitizeJson(rawJson)
      if (sanitizeError) {
        setFeedback({ type: 'error', msg: sanitizeError })
        setJsonError(sanitizeError)
        return
      }
      const fieldError = validateCredentialFields(json)
      if (fieldError) {
        setFeedback({ type: 'error', msg: fieldError })
        setJsonError(fieldError)
        return
      }
      cleanJson = json
      setJsonError(null)
    }

    setSaving(true)
    try {
      const body: Record<string, string> = {
        masterSheetId: form.masterSheetId.trim(),
      }
      if (cleanJson) {
        body.serviceAccountJson = cleanJson
      }

      const res  = await fetch('/api/master/sheets/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json() as { success: boolean; message?: string; error?: string }

      if (data.success) {
        setFeedback({ type: 'success', msg: data.message ?? 'Configurações salvas com sucesso.' })
        setReplacing(false)
        setForm(f => ({ ...f, serviceAccountJson: '' }))
        setJsonError(null)
        await load()
      } else {
        setFeedback({ type: 'error', msg: data.error ?? 'Falha ao salvar.' })
      }
    } catch {
      setFeedback({ type: 'error', msg: 'Erro de conexão ao salvar. Tente novamente.' })
    } finally {
      setSaving(false)
    }
  }

  // ── Remove credencial ────────────────────────────────────────────────────────
  async function handleClearCredential() {
    if (!confirm('Remover a credencial do banco? O sistema usará a variável de ambiente como fallback.')) return
    setSaving(true)
    setFeedback(null)
    try {
      const res  = await fetch('/api/master/sheets/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ serviceAccountJson: '' }),
      })
      const data = await res.json() as { success: boolean; message?: string; error?: string }
      if (data.success) {
        setFeedback({ type: 'success', msg: 'Credencial removida com sucesso.' })
        setReplacing(false)
        await load()
      } else {
        setFeedback({ type: 'error', msg: data.error ?? 'Falha ao remover.' })
      }
    } catch {
      setFeedback({ type: 'error', msg: 'Erro de conexão.' })
    } finally {
      setSaving(false)
    }
  }

  function cancelReplacing() {
    setReplacing(false)
    setForm(f => ({ ...f, serviceAccountJson: '' }))
    setJsonError(null)
    setFeedback(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const configured  = status?.credentialConfigured ?? false
  const jsonVisible = !configured || replacing

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">

      {/* Cabeçalho clicável */}
      <button
        type="button"
        onClick={() => setExpanded(p => !p)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 rounded-xl transition-colors"
      >
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${configured ? 'bg-emerald-100' : 'bg-amber-100'}`}>
          {configured
            ? <ShieldCheck size={15} className="text-emerald-600" />
            : <FileKey2   size={15} className="text-amber-600" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Credenciais Google Sheets</p>
          {loading ? (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Carregando…
            </p>
          ) : configured ? (
            <p className="text-xs text-emerald-600 truncate">
              <CheckCircle2 size={10} className="inline mr-1" />
              Configurado · {status?.clientEmail || 'Service Account ativa'}
            </p>
          ) : (
            <p className="text-xs text-amber-600">
              <AlertCircle size={10} className="inline mr-1" />
              Credencial não configurada no banco — usando variável de ambiente como fallback
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!loading && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${configured ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              {configured ? 'Ativo' : 'Pendente'}
            </span>
          )}
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>

      {/* Painel expansível */}
      {expanded && (
        <form onSubmit={handleSave} className="border-t border-gray-100 px-4 pb-5 pt-4 space-y-4">

          {/* Feedback global */}
          {feedback && (
            <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
              <span className="mt-0.5 shrink-0">
                {feedback.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              </span>
              <span>{feedback.msg}</span>
            </div>
          )}

          {/* ID da planilha */}
          <div>
            <label className={labelCls}>ID da planilha principal</label>
            <input
              type="text"
              value={form.masterSheetId}
              onChange={e => setForm(f => ({ ...f, masterSheetId: e.target.value }))}
              placeholder="Ex: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              className={inputCls}
              disabled={saving}
            />
            <p className="mt-1 text-[11px] text-gray-400">
              ID na URL da planilha: docs.google.com/spreadsheets/d/<strong>ID</strong>/edit
            </p>
          </div>

          {/* Service Account JSON */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`${labelCls} mb-0`}>
                Service Account JSON
                {configured && !replacing && (
                  <span className="ml-2 text-[10px] font-normal text-emerald-600">(configurada)</span>
                )}
              </label>
              {configured && !replacing ? (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setReplacing(true)}
                    className="text-[11px] text-brand-600 hover:underline font-medium">
                    Substituir
                  </button>
                  <button type="button" onClick={handleClearCredential} disabled={saving}
                    className="text-[11px] text-red-500 hover:underline disabled:opacity-50">
                    Remover
                  </button>
                </div>
              ) : replacing ? (
                <button type="button" onClick={cancelReplacing}
                  className="text-[11px] text-gray-500 hover:underline">
                  Cancelar substituição
                </button>
              ) : null}
            </div>

            {!jsonVisible ? (
              /* Mascarado — não expõe o valor real */
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                <KeyRound size={13} className="shrink-0 text-gray-400" />
                <span className="font-mono text-xs text-gray-500 tracking-widest">{BACKEND_MASKED}</span>
                {status?.clientEmail && (
                  <span className="ml-auto text-[11px] text-emerald-600 truncate max-w-[60%]">
                    {status.clientEmail}
                  </span>
                )}
              </div>
            ) : (
              /* Textarea de entrada */
              <div className="space-y-1.5">
                <div className="relative">
                  <textarea
                    rows={8}
                    value={form.serviceAccountJson}
                    onChange={e => {
                      setForm(f => ({ ...f, serviceAccountJson: e.target.value }))
                      setJsonError(null)   // limpa erro ao digitar
                    }}
                    onBlur={handleJsonBlur}
                    placeholder={
                      '{\n' +
                      '  "type": "service_account",\n' +
                      '  "project_id": "meu-projeto",\n' +
                      '  "client_email": "conta@projeto.iam.gserviceaccount.com",\n' +
                      '  "private_key": "-----BEGIN PRIVATE KEY-----\\nMII...\\n-----END PRIVATE KEY-----\\n",\n' +
                      '  ...\n' +
                      '}'
                    }
                    className={`${inputCls} font-mono text-xs resize-y pr-9 ${jsonError ? 'border-red-300 focus:border-red-400 focus:ring-red-200' : ''}`}
                    disabled={saving}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowJson(p => !p)}
                    tabIndex={-1}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                    title={showJson ? 'Ocultar' : 'Mostrar'}
                  >
                    {showJson ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {/* Erro de validação inline */}
                {jsonError && (
                  <p className="flex items-start gap-1 text-[11px] text-red-600">
                    <AlertCircle size={11} className="mt-0.5 shrink-0" />
                    {jsonError}
                  </p>
                )}

                {/* Botão de formatação / limpeza */}
                {form.serviceAccountJson.trim() && !jsonError && (
                  <button
                    type="button"
                    onClick={handleFormatJson}
                    className="flex items-center gap-1 text-[11px] text-brand-600 hover:underline"
                  >
                    <Wand2 size={10} /> Verificar e formatar JSON
                  </button>
                )}
              </div>
            )}

            <p className="mt-1.5 text-[11px] text-gray-400">
              Cole o arquivo <code className="rounded bg-gray-100 px-0.5">.json</code> baixado do Google Cloud Console
              (IAM → Contas de serviço → Chaves). O formato identado padrão é aceito.
              Criptografado com AES-256 antes de armazenar.
            </p>
          </div>

          {/* Ações */}
          <div className="flex items-center justify-between pt-1 border-t border-gray-50">
            <button
              type="button"
              onClick={load}
              disabled={loading || saving}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Recarregar
            </button>

            <button
              type="submit"
              disabled={saving || loading || !!jsonError}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {saving
                ? <><Loader2 size={13} className="animate-spin" /> Salvando…</>
                : 'Salvar configurações'
              }
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
