'use client'

// =============================================================================
// ContractsTab — Aba "Contratos & Termos" na detalhe da negociação.
//
// O gerente/financeiro lista templates disponíveis (cadastrados pelo MASTER ou
// pelo próprio tenant), gera o documento (merge automático com dados do deal)
// e visualiza/baixa. Depois pode anexar a versão assinada como anexo da
// categoria CONTRATO_ASSINADO/PROCURACAO_ASSINADA.
// =============================================================================

import { useEffect, useState } from 'react'
import { FileText, Plus, Loader2, Eye, CheckCircle2, Trash2, Download, X, Pencil } from 'lucide-react'
import AttachmentUploader, { type Attachment } from './AttachmentUploader'

interface Template {
  id:          string
  name:        string
  type:        string
  description: string | null
  tenantId:    string | null
}

interface DealDocument {
  id:        string
  name:      string
  type:      string
  bodyHtml:  string | null
  pdfUrl:    string | null
  signedFileUrl: string | null
  signedAt:  string | null
  status:    string
  createdAt: string
}

const TYPE_LABEL: Record<string, string> = {
  CONTRATO_COMPRA:        'Contrato de Compra',
  CONTRATO_VENDA:         'Contrato de Venda',
  CONTRATO_TROCA:         'Contrato de Troca',
  CONTRATO_CONSIGNACAO:   'Contrato de Consignação',
  PROCURACAO:             'Procuração',
  RECIBO:                 'Recibo',
  TERMO_ENTREGA:          'Termo de Entrega',
  TERMO_RESPONSABILIDADE: 'Termo de Responsabilidade',
  OUTRO:                  'Outro',
}

interface Props {
  dealId:      string
  dealType:    string
  attachments: Attachment[]
  onReloadAttachments: () => void
  onToast:     (msg: string, ok?: boolean) => void
}

export default function ContractsTab({ dealId, dealType, attachments, onReloadAttachments, onToast }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [docs, setDocs]           = useState<DealDocument[]>([])
  const [loading, setLoading]     = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [preview, setPreview]     = useState<DealDocument | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [tplRes, docRes] = await Promise.all([
        fetch('/api/admin/document-templates').then((r) => r.json()),
        fetch(`/api/negotiations/${dealId}/documents`).then((r) => r.json()),
      ])
      setTemplates(tplRes.data ?? [])
      setDocs(docRes.data ?? [])
    } catch {
      onToast('Erro ao carregar templates/documentos', false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [dealId])  // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(tpl: Template) {
    setGenerating(tpl.id)
    try {
      const res = await fetch(`/api/negotiations/${dealId}/documents`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ templateId: tpl.id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Falha ao gerar documento')
      onToast(`${tpl.name} gerado`, true)
      load()
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Erro', false)
    } finally {
      setGenerating(null)
    }
  }

  async function deleteDoc(doc: DealDocument) {
    if (!confirm(`Remover "${doc.name}"?`)) return
    setDeletingId(doc.id)
    try {
      const res = await fetch(`/api/negotiations/${dealId}/documents/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error ?? 'Falha ao remover')
      }
      onToast('Documento removido', true)
      load()
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Erro', false)
    } finally {
      setDeletingId(null)
    }
  }

  // Filtra templates pertinentes ao tipo do deal (mas sempre permite genéricos)
  const relevantTemplates = templates.filter((t) => {
    if (t.type === 'OUTRO' || t.type === 'PROCURACAO' || t.type === 'TERMO_ENTREGA' || t.type === 'TERMO_RESPONSABILIDADE' || t.type === 'RECIBO') return true
    if (dealType === 'COMPRA' && t.type === 'CONTRATO_COMPRA') return true
    if (dealType === 'VENDA'  && t.type === 'CONTRATO_VENDA')  return true
    if (dealType === 'TROCA'  && (t.type === 'CONTRATO_TROCA' || t.type === 'CONTRATO_VENDA' || t.type === 'CONTRATO_COMPRA')) return true
    if (dealType === 'CONSIGNACAO' && t.type === 'CONTRATO_CONSIGNACAO') return true
    return false
  })

  // Anexos: assinados (CONTRATO_ASSINADO, PROCURACAO_ASSINADA)
  const signedContracts  = attachments.filter((a) => a.category === 'CONTRATO_ASSINADO')
  const signedProcuracao = attachments.filter((a) => a.category === 'PROCURACAO_ASSINADA')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-brand-600" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Templates disponíveis */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-brand-600" />
            <h3 className="font-semibold text-gray-800">Modelos disponíveis</h3>
          </div>
          <span className="text-xs text-gray-500">{relevantTemplates.length} modelo(s)</span>
        </div>
        <div className="p-4">
          {relevantTemplates.length === 0 ? (
            <p className="text-sm italic text-gray-400">
              Nenhum modelo cadastrado. O administrador deve cadastrar os modelos em <span className="font-medium">Admin → Documentos</span>.
            </p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {relevantTemplates.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-800">{t.name}</p>
                    <p className="text-xs text-gray-500">
                      {TYPE_LABEL[t.type] ?? t.type}
                      {t.tenantId === null && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] text-indigo-700">Padrão MASTER</span>}
                    </p>
                    {t.description && <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{t.description}</p>}
                  </div>
                  <button
                    onClick={() => generate(t)}
                    disabled={generating === t.id}
                    className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {generating === t.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Gerar documento
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Documentos gerados */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Pencil size={15} className="text-brand-600" />
            <h3 className="font-semibold text-gray-800">Documentos gerados</h3>
          </div>
          <span className="text-xs text-gray-500">{docs.length}</span>
        </div>
        <div className="p-4">
          {docs.length === 0 ? (
            <p className="text-sm italic text-gray-400">Nenhum documento gerado ainda.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-800">{d.name}</p>
                    <p className="text-xs text-gray-500">
                      {TYPE_LABEL[d.type] ?? d.type} · Gerado em {new Date(d.createdAt).toLocaleString('pt-BR')}
                      {d.signedAt && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700">Assinado</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPreview(d)}
                      className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Eye size={11} /> Visualizar
                    </button>
                    <button
                      onClick={() => deleteDoc(d)}
                      disabled={deletingId === d.id}
                      className="flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === d.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Contratos assinados (upload) */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
          <CheckCircle2 size={15} className="text-green-600" />
          <h3 className="font-semibold text-gray-800">Contrato assinado</h3>
        </div>
        <div className="p-4">
          <AttachmentUploader
            dealId={dealId}
            category="CONTRATO_ASSINADO"
            attachments={signedContracts}
            onChange={onReloadAttachments}
            onToast={onToast}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
          <CheckCircle2 size={15} className="text-green-600" />
          <h3 className="font-semibold text-gray-800">Procuração assinada</h3>
        </div>
        <div className="p-4">
          <AttachmentUploader
            dealId={dealId}
            category="PROCURACAO_ASSINADA"
            attachments={signedProcuracao}
            onChange={onReloadAttachments}
            onToast={onToast}
          />
        </div>
      </div>

      {/* Modal de preview */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h3 className="font-semibold text-gray-900">{preview.name}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Download size={11} /> Imprimir / PDF
                </button>
                <button onClick={() => setPreview(null)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div
                className="prose prose-sm max-w-none"
                // O conteúdo vem do nosso template HTML cadastrado pelo MASTER; é controlado.
                dangerouslySetInnerHTML={{ __html: preview.bodyHtml ?? '<p>(sem conteúdo)</p>' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
