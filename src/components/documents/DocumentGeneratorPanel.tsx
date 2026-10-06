'use client'

// =============================================================================
// DocumentGeneratorPanel — gera documentos (procurações/termos/declarações) a
// partir de modelos. Os dados vêm da base: escolhe a origem (negociação,
// cliente, veículo do estoque ou fornecedor) e os campos do modelo são
// preenchidos; a loja/outorgados vêm das Configurações. Campos seguem
// editáveis para ajuste fino. Imprime/salva em PDF pelo navegador.
// =============================================================================

import { HelpHint } from '@/components/ui/help-hint'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Loader2, Printer, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RequiredMark } from '@/components/ui/field'
import { templatesByCategory, type DocCategory } from '@/lib/documents/templates'
import { applySource, dateBR, type DocSource } from '@/lib/documents/source-fields'
import type { DocSourcePayload, SourceKind } from '@/lib/documents/source-loader'

const KINDS: Array<{ id: SourceKind; label: string; placeholder: string; param: string }> = [
  { id: 'deal', label: 'Negociação', placeholder: 'Nº, placa ou cliente', param: 'dealId' },
  { id: 'customer', label: 'Cliente', placeholder: 'Nome, CPF/CNPJ ou telefone', param: 'customerId' },
  { id: 'vehicle', label: 'Veículo', placeholder: 'Placa, modelo ou chassi', param: 'vehicleId' },
  { id: 'supplier', label: 'Fornecedor', placeholder: 'Nome ou CPF/CNPJ', param: 'supplierId' },
]

type Hit = { id: string; label: string; sub: string }

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

function storePart(p: DocSourcePayload): DocSource {
  return { loja: p.loja, cidade: p.cidade, uf: p.uf, outorgado: p.outorgados[0] ?? null }
}

export default function DocumentGeneratorPanel({ category }: { category: DocCategory }) {
  const templates = useMemo(() => templatesByCategory(category), [category])
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? '')
  const [values, setValues] = useState<Record<string, string>>(() => ({ data: dateBR() }))
  const tpl = templates.find((t) => t.id === selectedId) ?? templates[0]

  // Origem dos dados
  const [kind, setKind] = useState<SourceKind>('deal')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [source, setSource] = useState<DocSourcePayload | null>(null)
  const [store, setStore] = useState<DocSourcePayload | null>(null)
  const [parteKey, setParteKey] = useState('')
  const [veicKey, setVeicKey] = useState('')
  const [outIdx, setOutIdx] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }))
  const apply = useCallback((src: DocSource) => setValues((s) => applySource(s, src)), [])

  // Loja e outorgados das Configurações já no início.
  useEffect(() => {
    let alive = true
    fetch('/api/documents/source', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => { if (alive && j?.success && j.data) { setStore(j.data); apply(storePart(j.data)) } })
      .catch(() => {})
    return () => { alive = false }
  }, [apply])

  // Busca (negociação sem texto = mais recentes).
  useEffect(() => {
    if (!open) return
    if (kind !== 'deal' && q.trim().length < 2) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      setSearching(true)
      fetch(`/api/documents/source/search?type=${kind}&q=${encodeURIComponent(q.trim())}`, { credentials: 'include', signal: ctl.signal })
        .then((r) => r.json())
        .then((j) => setHits(j?.success ? j.data ?? [] : []))
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 250)
    return () => { clearTimeout(t); ctl.abort() }
  }, [q, kind, open])

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const choose = async (hit: Hit) => {
    setOpen(false); setQ(''); setError(''); setLoading(true)
    try {
      const param = KINDS.find((k) => k.id === kind)!.param
      const r = await fetch(`/api/documents/source?${param}=${encodeURIComponent(hit.id)}`, { credentials: 'include' })
      const j = await r.json()
      if (!r.ok || !j?.success) throw new Error(j?.error || 'Não foi possível carregar os dados.')
      const p = j.data as DocSourcePayload
      const parte = p.partes[0], veic = p.veiculos[0]
      setSource(p); setParteKey(parte?.key ?? ''); setVeicKey(veic?.key ?? ''); setOutIdx(0)
      apply({
        ...storePart(p),
        ...(parte ? { parte: parte.party } : {}),
        ...(veic ? { veiculo: veic.veiculo } : {}),
        ...(p.kind === 'deal' ? { valor: p.valor, formaPagamento: p.formaPagamento } : p.valor != null ? { valor: p.valor } : {}),
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const clear = () => {
    setSource(null); setError('')
    setValues(() => applySource({ data: dateBR() }, store ? storePart(store) : {}))
  }

  const pickParte = (key: string) => { setParteKey(key); const p = source?.partes.find((x) => x.key === key); if (p) apply({ parte: p.party }) }
  const pickVeic = (key: string) => {
    setVeicKey(key)
    const v = source?.veiculos.find((x) => x.key === key)
    if (v) apply({ veiculo: v.veiculo, ...(key === source?.veiculos[0]?.key && source?.valor != null ? { valor: source.valor } : {}) })
  }
  const outorgados = (source ?? store)?.outorgados ?? []
  const pickOut = (i: number) => { setOutIdx(i); apply({ outorgado: outorgados[i] ?? null }) }

  const has = (k: string) => !!tpl?.fields.some((f) => f.key === k)
  const showParte = (source?.partes.length ?? 0) > 1 && (has('clienteNome') || has('outorganteNome'))
  const showVeic = (source?.veiculos.length ?? 0) > 1 && has('placa')
  const showOut = outorgados.length > 1 && has('outorgadoNome')

  const html = tpl ? tpl.render(values) : ''
  const missing = tpl ? tpl.fields.some((f) => f.required && !(values[f.key] ?? '').trim()) : false

  const print = () => {
    if (missing) return
    const w = window.open('', '_blank', 'width=820,height=900')
    if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${tpl?.title ?? 'Documento'}</title><style>@media print{@page{margin:18mm}} body{margin:24px}</style></head><body>${html}<script>window.onload=function(){window.print()}</script></body></html>`)
    w.document.close()
  }

  if (!tpl) return <p className="text-sm text-gray-400">Nenhum modelo disponível.</p>
  const kindInfo = KINDS.find((k) => k.id === kind)!
  const canSearch = kind === 'deal' || q.trim().length >= 2
  const shown = canSearch ? hits : []

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Formulário */}
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Modelo<HelpHint className="ml-1" title="Modelo" text="Tipo de documento a gerar (contrato, procuração, declaração, termo...). Escolha abaixo de onde vêm os dados: negociação, cliente, veículo ou fornecedor; os campos são preenchidos sozinhos." /></label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={inputCls}>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-400">{tpl.description}</p>
        </div>

        {/* Origem dos dados */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex flex-wrap gap-1">
            {KINDS.map((k) => (
              <button key={k.id} type="button" onClick={() => { setKind(k.id); setHits([]); setQ('') }}
                className={cn('rounded-md px-2.5 py-1 text-xs font-medium', kind === k.id ? 'bg-white text-brand-700 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-800')}>
                {k.label}
              </button>
            ))}
          </div>
          <div ref={boxRef} className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
              placeholder={`Buscar ${kindInfo.label.toLowerCase()}: ${kindInfo.placeholder}`} className={cn(inputCls, 'pl-9 pr-8')} />
            {(searching || loading) && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
            {open && canSearch && (
              <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {shown.length === 0 && <li className="px-3 py-2 text-xs text-gray-400">{searching ? 'Buscando…' : 'Nada encontrado.'}</li>}
                {shown.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => choose(h)} className="block w-full px-3 py-2 text-left hover:bg-gray-50">
                      <div className="truncate text-sm font-medium text-gray-900">{h.label}</div>
                      {h.sub && <div className="truncate text-xs text-gray-500">{h.sub}</div>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {source && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-gray-200">
              <span className="truncate text-gray-700"><span className="text-gray-400">{KINDS.find((k) => k.id === source.kind)?.label}:</span> {source.label || '—'}</span>
              <button type="button" onClick={clear} title="Limpar" className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={13} /></button>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

          {(showParte || showVeic || showOut) && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {showParte && (
                <select value={parteKey} onChange={(e) => pickParte(e.target.value)} className={cn(inputCls, 'py-1.5 text-xs')}>
                  {source!.partes.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              )}
              {showVeic && (
                <select value={veicKey} onChange={(e) => pickVeic(e.target.value)} className={cn(inputCls, 'py-1.5 text-xs')}>
                  {source!.veiculos.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                </select>
              )}
              {showOut && (
                <select value={outIdx} onChange={(e) => pickOut(Number(e.target.value))} className={cn(inputCls, 'py-1.5 text-xs')}>
                  {outorgados.map((o, i) => <option key={i} value={i}>Outorgado · {o.nome}</option>)}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {tpl.fields.map((f) => (
            <div key={f.key} className={cn(f.full || f.type === 'textarea' ? 'col-span-2' : 'col-span-1')}>
              <label className="mb-1 block text-xs font-medium text-gray-700">{f.label}{f.required && <> <RequiredMark /></>}</label>
              {f.type === 'textarea' ? (
                <textarea value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} className={cn(inputCls, 'min-h-[64px] resize-y')} />
              ) : (
                <input type={f.type === 'number' ? 'number' : 'text'} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} className={inputCls} />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3">
          {missing && <span className="text-xs text-red-600">Preencha os campos obrigatórios.</span>}
          <button onClick={print} disabled={missing} className="btn-primary text-sm disabled:opacity-50"><Printer size={15} />Imprimir / Salvar PDF</button>
        </div>
        <p className="text-[11px] text-gray-400">Modelo genérico: confira o conteúdo antes de usar.</p>
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
