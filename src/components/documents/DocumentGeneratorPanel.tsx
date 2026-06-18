'use client'

// =============================================================================
// DocumentGeneratorPanel — gera documentos (procurações/termos/declarações) a
// partir de modelos: escolhe o modelo, preenche os campos, pré-visualiza e
// imprime/salva em PDF (via navegador). Não persiste — geração sob demanda.
// =============================================================================

import { useMemo, useState } from 'react'
import { FileText, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { templatesByCategory, type DocCategory } from '@/lib/documents/templates'

export default function DocumentGeneratorPanel({ category }: { category: DocCategory }) {
  const templates = useMemo(() => templatesByCategory(category), [category])
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? '')
  const [values, setValues] = useState<Record<string, string>>({})
  const tpl = templates.find((t) => t.id === selectedId) ?? templates[0]

  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }))
  const html = tpl ? tpl.render(values) : ''

  const print = () => {
    const w = window.open('', '_blank', 'width=820,height=900')
    if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${tpl?.title ?? 'Documento'}</title><style>@media print{@page{margin:18mm}} body{margin:24px}</style></head><body>${html}<script>window.onload=function(){window.print()}</script></body></html>`)
    w.document.close()
  }

  if (!tpl) return <p className="text-sm text-gray-400">Nenhum modelo disponível.</p>

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Formulário */}
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Modelo</label>
          <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setValues({}) }} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
            {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-400">{tpl.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {tpl.fields.map((f) => (
            <div key={f.key} className={cn(f.full || f.type === 'textarea' ? 'col-span-2' : 'col-span-1')}>
              <label className="mb-1 block text-xs font-medium text-gray-700">{f.label}{f.required && <span className="ml-0.5 text-red-500">*</span>}</label>
              {f.type === 'textarea' ? (
                <textarea value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} className="min-h-[64px] w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              ) : (
                <input type={f.type === 'number' ? 'number' : 'text'} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button onClick={print} className="btn-primary text-sm"><Printer size={15} />Imprimir / Salvar PDF</button>
        </div>
        <p className="text-[11px] text-gray-400">Modelo genérico para conveniência — confira o conteúdo e adapte conforme a necessidade jurídica. Campos em branco aparecem como linha para preenchimento manual.</p>
      </div>

      {/* Pré-visualização */}
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500"><FileText size={13} />Pré-visualização</div>
        <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-card">
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  )
}
