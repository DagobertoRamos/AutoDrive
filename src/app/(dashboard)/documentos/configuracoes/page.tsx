'use client'
/* eslint-disable @next/next/no-img-element -- prévia do logo */

// =============================================================================
// Documentos › Configurações — cabeçalho dos documentos da venda (logo,
// endereço, contatos, local de assinatura) e cadastro dos OUTORGADOS das
// procurações. Usado pelo contrato, termos e procurações da negociação.
// =============================================================================

import { HelpHint } from '@/components/ui/help-hint'
import { useEffect, useState } from 'react'
import { Loader2, Plus, Save, Trash2, Upload, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RequiredMark } from '@/components/ui/field'
import { isValidCPF } from '@/lib/br-docs/cpf'
import type { DocSettings, Outorgado } from '@/lib/negotiation/contracts/doc-settings-core'

interface Defaults { nome: string; cnpj: string; logoUrl: string; endereco: string; telefone: string; email: string; cidade: string; uf: string }

const inputCls = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50'
const ESTADOS_CIVIS = ['solteiro(a)', 'casado(a)', 'divorciado(a)', 'viúvo(a)', 'separado(a) judicialmente', 'em união estável']
const maskCpf = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
const newOutorgado = (): Outorgado => ({ id: `o${Date.now().toString(36)}`, nome: '', cpf: '', rg: '', orgaoRg: '', nacionalidade: 'brasileiro(a)', estadoCivil: '', profissao: '', endereco: '', cargo: '', ativo: true })

export default function DocumentosConfiguracoesPage() {
  const [s, setS] = useState<DocSettings | null>(null)
  const [def, setDef] = useState<Defaults | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/settings/documents', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      if (j.success) { setS(j.settings); setDef(j.defaults); setCanEdit(!!j.canEdit) } else setMsg({ ok: false, text: j.error ?? 'Falha ao carregar.' })
    }).catch(() => setMsg({ ok: false, text: 'Falha ao carregar.' }))
  }, [])

  if (!s || !def) return <div className="py-16 text-center">{msg ? <p className="text-sm text-red-700">{msg.text}</p> : <Loader2 className="mx-auto animate-spin text-gray-400" />}</div>

  const set = <K extends keyof DocSettings>(k: K, v: DocSettings[K]) => setS({ ...s, [k]: v })
  const setO = (id: string, patch: Partial<Outorgado>) => set('outorgados', s.outorgados.map((o) => (o.id === id ? { ...o, ...patch } : o)))

  const save = async () => {
    if (s.outorgados.some((o) => !o.nome.trim() || !isValidCPF(o.cpf))) {
      setMsg({ ok: false, text: 'Preencha nome e CPF válido de todos os outorgados.' }); return
    }
    setBusy('save'); setMsg(null)
    try {
      const r = await fetch('/api/settings/documents', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) })
      const j = await r.json()
      if (!r.ok || !j.success) throw new Error(j.error ?? 'Falha ao salvar.')
      setS(j.settings); setMsg({ ok: true, text: 'Configurações salvas.' })
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const uploadLogo = async (f: File) => {
    setBusy('logo'); setMsg(null)
    try {
      const fd = new FormData(); fd.append('logo', f)
      const r = await fetch('/api/settings/documents', { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok || !j.success) throw new Error(j.error ?? 'Falha ao enviar.')
      set('logoUrl', j.url)
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const logo = s.logoUrl || def.logoUrl
  const missing = (o: Outorgado) => [!o.cpf && 'CPF', !o.rg && 'RG', !o.estadoCivil && 'estado civil', !o.profissao && 'profissão', !o.endereco && 'endereço'].filter(Boolean)

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Configurações dos documentos</h1>
      {msg && <p role="status" className={cn('rounded-lg px-3 py-2 text-sm', msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{msg.text}</p>}

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900">Cabeçalho</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-48 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-2">
            {logo ? <img src={logo} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-gray-400">Sem logo</span>}
          </div>
          {canEdit && (
            <div className="space-y-1 text-xs">
              <label className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-brand-300 px-3 py-1.5 font-medium text-brand-700 hover:bg-brand-50', busy === 'logo' && 'pointer-events-none opacity-60')}>
                {busy === 'logo' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}Enviar outro logo
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = '' }} />
              </label>
              {s.logoUrl && <button type="button" onClick={() => set('logoUrl', '')} className="block text-gray-500 underline">Voltar a usar o logo da loja</button>}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500">Empresa: <b>{def.nome || '—'}</b>{def.cnpj ? ` · CNPJ ${def.cnpj}` : ''}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-gray-600 sm:col-span-2">Endereço
            <input disabled={!canEdit} className={inputCls} value={s.endereco} onChange={(e) => set('endereco', e.target.value)} placeholder={def.endereco || 'Rua, número, bairro, cidade/UF, CEP'} />
          </label>
          <label className="text-xs font-medium text-gray-600">Telefone<input disabled={!canEdit} className={inputCls} value={s.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder={def.telefone} /></label>
          <label className="text-xs font-medium text-gray-600">E-mail<input disabled={!canEdit} className={inputCls} value={s.email} onChange={(e) => set('email', e.target.value)} placeholder={def.email} /></label>
          <label className="text-xs font-medium text-gray-600">Cidade (local de assinatura)<input disabled={!canEdit} className={inputCls} value={s.cidade} onChange={(e) => set('cidade', e.target.value)} placeholder={def.cidade} /></label>
          <label className="text-xs font-medium text-gray-600">UF<input disabled={!canEdit} className={inputCls} maxLength={2} value={s.uf} onChange={(e) => set('uf', e.target.value.toUpperCase())} placeholder={def.uf} /></label>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1 font-semibold text-gray-900">Outorgados das procurações<HelpHint className="ml-1" title="Outorgado" text="Pessoas da loja que recebem os poderes nas procurações (o procurador), como sócio, gerente ou despachante. Os ativos aparecem automaticamente nas procurações geradas." /></h2>
          {canEdit && <button type="button" onClick={() => set('outorgados', [...s.outorgados, newOutorgado()])} className="btn-secondary px-3 py-1.5 text-xs"><Plus size={13} />Adicionar outorgado</button>}
        </div>
        {!s.outorgados.length && <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">Nenhum outorgado cadastrado: as procurações sairão com o procurador em branco.</p>}
        {s.outorgados.map((o) => (
          <div key={o.id} className={cn('space-y-3 rounded-lg border p-4', o.ativo ? 'border-gray-200' : 'border-gray-100 opacity-60')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800"><UserRound size={15} className="text-brand-700" />{o.nome || 'Novo outorgado'}</p>
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5"><input type="checkbox" disabled={!canEdit} checked={o.ativo} onChange={(e) => setO(o.id, { ativo: e.target.checked })} />Ativo</label>
                {canEdit && <button type="button" onClick={() => set('outorgados', s.outorgados.filter((x) => x.id !== o.id))} className="inline-flex items-center gap-1 text-red-600 hover:underline"><Trash2 size={12} />Remover</button>}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-gray-600 sm:col-span-2">Nome completo <RequiredMark /><input disabled={!canEdit} className={inputCls} value={o.nome} onChange={(e) => setO(o.id, { nome: e.target.value })} /></label>
              <label className="text-xs font-medium text-gray-600">CPF <RequiredMark /><input disabled={!canEdit} className={inputCls} value={maskCpf(o.cpf)} onChange={(e) => setO(o.id, { cpf: e.target.value.replace(/\D/g, '') })} /></label>
              <label className="text-xs font-medium text-gray-600">RG<input disabled={!canEdit} className={inputCls} value={o.rg ?? ''} onChange={(e) => setO(o.id, { rg: e.target.value })} /></label>
              <label className="text-xs font-medium text-gray-600">Órgão emissor<input disabled={!canEdit} className={inputCls} value={o.orgaoRg ?? ''} onChange={(e) => setO(o.id, { orgaoRg: e.target.value })} placeholder="SSP/SP" /></label>
              <label className="text-xs font-medium text-gray-600">Nacionalidade<input disabled={!canEdit} className={inputCls} value={o.nacionalidade ?? ''} onChange={(e) => setO(o.id, { nacionalidade: e.target.value })} /></label>
              <label className="text-xs font-medium text-gray-600">Estado civil
                <select disabled={!canEdit} className={inputCls} value={o.estadoCivil ?? ''} onChange={(e) => setO(o.id, { estadoCivil: e.target.value })}>
                  <option value="">Selecione</option>{ESTADOS_CIVIS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-gray-600">Profissão<input disabled={!canEdit} className={inputCls} value={o.profissao ?? ''} onChange={(e) => setO(o.id, { profissao: e.target.value })} placeholder="empresário, despachante…" /></label>
              <label className="text-xs font-medium text-gray-600">Função na loja<input disabled={!canEdit} className={inputCls} value={o.cargo ?? ''} onChange={(e) => setO(o.id, { cargo: e.target.value })} placeholder="sócio, gerente, despachante" /></label>
              <label className="text-xs font-medium text-gray-600 sm:col-span-3">Endereço completo<input disabled={!canEdit} className={inputCls} value={o.endereco ?? ''} onChange={(e) => setO(o.id, { endereco: e.target.value })} placeholder="Rua, número, bairro, cidade/UF, CEP" /></label>
            </div>
            {missing(o).length > 0 && <p className="text-[11px] text-amber-700">Falta: {missing(o).join(', ')} (qualificação exigida pelo art. 654, §1º, do Código Civil).</p>}
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900">Procurações</h2>
        <label className="block max-w-xs text-xs font-medium text-gray-600">Validade da procuração do comprador (dias)<HelpHint className="ml-1" title="Validade" text="Por quantos dias a procuração assinada pelo comprador vale, contados da data de emissão." />
          <input disabled={!canEdit} type="number" min={30} max={730} className={inputCls} value={s.validadeProcuracaoDias} onChange={(e) => set('validadeProcuracaoDias', Number(e.target.value) || 180)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" disabled={!canEdit} checked={s.exigirFirmaReconhecida} onChange={(e) => set('exigirFirmaReconhecida', e.target.checked)} />Incluir o aviso de reconhecimento de firma (exigido pelo DETRAN para procuração particular)<HelpHint className="ml-1" title="Reconhecimento de firma" text="Reconhecer firma é o cartório confirmar que a assinatura é mesmo da pessoa. Marcado, a procuração sai com o aviso de que a firma deve ser reconhecida." /></label>
      </section>

      {canEdit && (
        <div className="sticky bottom-3 flex justify-end">
          <button type="button" onClick={() => void save()} disabled={busy === 'save'} className="btn-primary px-5 py-2.5 text-sm shadow-lg">{busy === 'save' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Salvar configurações</button>
        </div>
      )}
    </div>
  )
}
