'use client'

// =============================================================================
// /master/documentos — CRUD de templates de contrato/procuração/recibo.
// MASTER cria globais (tenantId=null). Lojistas (ADM/GERENTE_GERAL) podem
// criar do próprio tenant via a mesma API, mas não veem essa rota.
// =============================================================================

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Loader2, Save, Trash2, Copy, X, AlertCircle } from 'lucide-react'

interface Template {
  id:          string
  tenantId:    string | null
  type:        string
  name:        string
  description: string | null
  bodyHtml:    string
  active:      boolean
  isDefault:   boolean
  createdAt:   string
  updatedAt:   string
}

const TYPES: Array<{ value: string; label: string }> = [
  { value: 'CONTRATO_COMPRA',        label: 'Contrato de Compra' },
  { value: 'CONTRATO_VENDA',         label: 'Contrato de Venda' },
  { value: 'CONTRATO_TROCA',         label: 'Contrato de Troca' },
  { value: 'CONTRATO_CONSIGNACAO',   label: 'Contrato de Consignação' },
  { value: 'PROCURACAO',             label: 'Procuração' },
  { value: 'RECIBO',                 label: 'Recibo' },
  { value: 'TERMO_ENTREGA',          label: 'Termo de Entrega' },
  { value: 'TERMO_RESPONSABILIDADE', label: 'Termo de Responsabilidade' },
  { value: 'OUTRO',                  label: 'Outro' },
]

const VARIABLES: Array<{ key: string; label: string }> = [
  { key: '{{cliente.nome}}',          label: 'Nome do cliente' },
  { key: '{{cliente.cpf}}',           label: 'CPF do cliente' },
  { key: '{{cliente.cnpj}}',          label: 'CNPJ' },
  { key: '{{cliente.email}}',         label: 'E-mail' },
  { key: '{{cliente.telefone}}',      label: 'Telefone' },
  { key: '{{veiculo.placa}}',         label: 'Placa' },
  { key: '{{veiculo.marca}}',         label: 'Marca' },
  { key: '{{veiculo.modelo}}',        label: 'Modelo' },
  { key: '{{veiculo.ano}}',           label: 'Ano' },
  { key: '{{veiculo.cor}}',           label: 'Cor' },
  { key: '{{veiculo.km}}',            label: 'KM' },
  { key: '{{veiculo.valor|brl}}',     label: 'Valor do veículo (BRL)' },
  { key: '{{deal.number}}',           label: 'Nº da negociação' },
  { key: '{{deal.saleDate|date}}',    label: 'Data da venda' },
  { key: '{{deal.purchaseAmount|brl}}', label: 'Valor de compra (BRL)' },
  { key: '{{deal.saleAmount|brl}}',   label: 'Valor de venda (BRL)' },
  { key: '{{quitacao.banco}}',        label: 'Banco da quitação' },
  { key: '{{quitacao.valor|brl}}',    label: 'Valor da quitação (BRL)' },
]

const EMPTY: Template = {
  id: '', tenantId: null, type: 'CONTRATO_COMPRA', name: '', description: '',
  bodyHtml: '', active: true, isDefault: false, createdAt: '', updatedAt: '',
}

export default function MasterDocumentosPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as { role?: string })?.role

  const [list, setList]       = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Template | null>(null)
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (status === 'authenticated' && role !== 'MASTER') router.replace('/inicio')
  }, [status, role, router])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  function showToast(msg: string, ok = true) { setToast({ msg, ok }) }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/document-templates')
      const data = await res.json()
      setList(data.data ?? [])
    } catch {
      showToast('Erro ao carregar templates', false)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      const isNew = !editing.id
      const url = isNew ? '/api/admin/document-templates' : `/api/admin/document-templates/${editing.id}`
      const res = await fetch(url, {
        method:  isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type:        editing.type,
          name:        editing.name,
          description: editing.description,
          bodyHtml:    editing.bodyHtml,
          active:      editing.active,
          isDefault:   editing.isDefault,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Falha ao salvar')
      showToast(isNew ? 'Template criado' : 'Template atualizado', true)
      setEditing(null)
      load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro', false)
    } finally {
      setSaving(false)
    }
  }

  async function remove(tpl: Template) {
    if (!confirm(`Remover "${tpl.name}"?`)) return
    try {
      const res = await fetch(`/api/admin/document-templates/${tpl.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error ?? 'Falha ao remover')
      }
      showToast('Template removido', true)
      load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro', false)
    }
  }

  function insertVar(v: string) {
    if (!editing) return
    setEditing({ ...editing, bodyHtml: (editing.bodyHtml ?? '') + ' ' + v })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
          toast.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100">
            <FileText size={20} className="text-brand-700" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900">Documentos e Templates</h1>
            <p className="text-xs text-gray-500">Modelos de contratos, procurações e termos disponíveis no sistema</p>
          </div>
        </div>
        <button
          onClick={() => setEditing({ ...EMPTY })}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus size={14} /> Novo template
        </button>
      </div>

      {/* Lista */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-brand-600" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
            <FileText size={28} />
            <p className="text-sm">Nenhum template cadastrado</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                {['Nome', 'Tipo', 'Escopo', 'Status', 'Atualizado em', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {list.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {t.name}
                    {t.description && <p className="text-xs text-gray-400 line-clamp-1">{t.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{TYPES.find((x) => x.value === t.type)?.label ?? t.type}</td>
                  <td className="px-4 py-3 text-xs">
                    {t.tenantId === null
                      ? <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">Global</span>
                      : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">Tenant</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {t.active
                      ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">Ativo</span>
                      : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">Inativo</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(t.updatedAt).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setEditing(t)} className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
                        Editar
                      </button>
                      <button
                        onClick={() => setEditing({ ...t, id: '', name: `${t.name} (cópia)`, isDefault: false })}
                        className="rounded-md border border-gray-300 p-1 text-xs text-gray-500 hover:bg-gray-50"
                        title="Duplicar"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        onClick={() => remove(t)}
                        className="rounded-md border border-red-200 p-1 text-xs text-red-700 hover:bg-red-50"
                        title="Remover"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Editor modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h3 className="font-semibold text-gray-900">
                {editing.id ? 'Editar template' : 'Novo template'}
              </h3>
              <button onClick={() => setEditing(null)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Form principal */}
              <div className="flex-1 space-y-3 overflow-auto p-5">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-gray-700">Nome *</span>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-gray-700">Tipo *</span>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      value={editing.type}
                      onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                    >
                      {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </label>
                </div>

                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">Descrição</span>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    value={editing.description ?? ''}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 flex items-center justify-between font-medium text-gray-700">
                    <span>Conteúdo (HTML) *</span>
                    <span className="text-xs font-normal text-gray-400">Aceita HTML. Use variáveis ao lado.</span>
                  </span>
                  <textarea
                    className="h-[40vh] w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    value={editing.bodyHtml}
                    onChange={(e) => setEditing({ ...editing, bodyHtml: e.target.value })}
                    placeholder={'<h1>Contrato de Compra e Venda</h1>\n<p>Pelo presente instrumento, {{cliente.nome}} (CPF {{cliente.cpf}})...</p>'}
                  />
                </label>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                    Ativo
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editing.isDefault} onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })} />
                    Padrão do sistema
                  </label>
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  Templates criados aqui ficam <strong>globais</strong> (disponíveis para todos os tenants).
                </div>
              </div>

              {/* Painel de variáveis */}
              <aside className="w-72 shrink-0 overflow-auto border-l border-gray-200 bg-gray-50 p-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Variáveis disponíveis</h4>
                <p className="mb-3 text-xs text-gray-500">Clique para inserir no documento.</p>
                <ul className="space-y-1">
                  {VARIABLES.map((v) => (
                    <li key={v.key}>
                      <button
                        onClick={() => insertVar(v.key)}
                        className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-left text-xs hover:border-brand-300 hover:bg-brand-50"
                      >
                        <p className="font-mono text-brand-700">{v.key}</p>
                        <p className="text-gray-500">{v.label}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <button onClick={() => setEditing(null)} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !editing.name || !editing.bodyHtml}
                className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
