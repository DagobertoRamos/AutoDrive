'use client'

// Regras fiscais da loja — já vêm preenchidas pela legislação; o contador confere.
import { useState } from 'react'
import { FieldLabel } from '@/components/ui/field'
import type { FiscalRules } from '@/lib/automotive/fiscal-rules'
import { btn, fmtDate, Hint, input, StatusBadge } from './ui'

const CFOP_LABEL: [keyof FiscalRules['cfop'], string][] = [
  ['saleInState', 'Venda (mesma UF)'], ['saleOutState', 'Venda (outra UF)'],
  ['purchaseInState', 'Compra (mesma UF)'], ['purchaseOutState', 'Compra (outra UF)'],
  ['consignInState', 'Entrada em consignação'], ['consignedSaleInState', 'Venda de consignado'],
  ['consignReturnInState', 'Devolução de consignado'], ['transferOut', 'Transferência entre lojas'],
]

export function FiscalRulesPanel({ rules, defaults, onChange }: { rules: FiscalRules; defaults: FiscalRules; onChange: (r: FiscalRules) => void }) {
  const [advanced, setAdvanced] = useState(false)
  const set = (patch: Partial<FiscalRules>) => onChange({ ...rules, ...patch, confirmedAt: patch.confirmedAt !== undefined ? patch.confirmedAt : rules.confirmedAt })
  const reductionExpired = rules.icms.validoAte && new Date(`${rules.icms.validoAte}T23:59:59-03:00`) < new Date()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {rules.confirmedAt
          ? <StatusBadge tone="ok">Revisado em {fmtDate(rules.confirmedAt)}</StatusBadge>
          : <span className="inline-flex items-center gap-1"><StatusBadge tone="attention">Aguardando revisão do contador</StatusBadge><Hint term="REVISADO_CONTADOR" /></span>}
        <button className={btn.link} onClick={() => set({ confirmedAt: rules.confirmedAt ? null : new Date().toISOString() })}>{rules.confirmedAt ? 'Desmarcar revisão' : 'Marcar como revisado'}</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Regime tributário<Hint term="REGIME_TRIBUTARIO" size={11} /></FieldLabel>
          <select className={input} value={rules.regime} onChange={(e) => {
            const regime = e.target.value as FiscalRules['regime']
            set({ regime, crt: regime === 'SIMPLES' ? 1 : 3, pisCofins: regime === defaults.regime ? defaults.pisCofins : regime === 'SIMPLES' ? { equiparacaoConsignacao: false, cstPis: '49', cstCofins: '49', aliquotaPis: 0, aliquotaCofins: 0 } : { equiparacaoConsignacao: true, cstPis: '01', cstCofins: '01', aliquotaPis: 0.65, aliquotaCofins: 3 } })
          }}>
            <option value="SIMPLES">Simples Nacional</option>
            <option value="NORMAL">Regime normal</option>
          </select>
        </div>
        <div>
          <FieldLabel required>NCM padrão<Hint term="NCM" size={11} /></FieldLabel>
          <input className={input} inputMode="numeric" maxLength={10} value={rules.ncmDefault} onChange={(e) => set({ ncmDefault: e.target.value.replace(/\D/g, '').slice(0, 8) })} />
        </div>
        {rules.regime === 'NORMAL' ? (
          <>
            <div>
              <FieldLabel>Redução da base do ICMS (%)<Hint term="REDUCAO_BC" size={11} /></FieldLabel>
              <input className={input} inputMode="decimal" value={rules.icms.reducaoPct} onChange={(e) => set({ icms: { ...rules.icms, reducaoPct: Math.min(100, Number(e.target.value.replace(',', '.')) || 0) } })} />
              {reductionExpired && <p className="mt-1 text-xs font-medium text-red-700">Redução vencida em {fmtDate(rules.icms.validoAte)}.</p>}
            </div>
            <div>
              <FieldLabel>Alíquota do ICMS (%)</FieldLabel>
              <input className={input} inputMode="decimal" value={rules.icms.aliquota} onChange={(e) => set({ icms: { ...rules.icms, aliquota: Math.min(100, Number(e.target.value.replace(',', '.')) || 0) } })} />
            </div>
          </>
        ) : null}
      </div>
      <button className={btn.link} onClick={() => setAdvanced((a) => !a)}>{advanced ? 'Ocultar códigos' : 'Ver códigos (CFOP, CST, PIS/COFINS)'}</button>
      {advanced && (
        <div className="space-y-4 rounded-xl bg-gray-50 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CFOP_LABEL.map(([k, label]) => (
              <div key={k}>
                <FieldLabel>{label}</FieldLabel>
                <input className={input} inputMode="numeric" maxLength={4} value={rules.cfop[k]} onChange={(e) => set({ cfop: { ...rules.cfop, [k]: e.target.value.replace(/\D/g, '').slice(0, 4) } })} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><FieldLabel>{rules.regime === 'SIMPLES' ? 'CSOSN' : 'CST ICMS'}<Hint term="CST_ICMS" size={11} /></FieldLabel>
              <input className={input} maxLength={3} value={rules.regime === 'SIMPLES' ? rules.icms.csosn : rules.icms.cst} onChange={(e) => set({ icms: { ...rules.icms, [rules.regime === 'SIMPLES' ? 'csosn' : 'cst']: e.target.value.replace(/\D/g, '').slice(0, 3) } })} /></div>
            <div><FieldLabel>CST PIS</FieldLabel><input className={input} maxLength={2} value={rules.pisCofins.cstPis} onChange={(e) => set({ pisCofins: { ...rules.pisCofins, cstPis: e.target.value.replace(/\D/g, '').slice(0, 2) } })} /></div>
            <div><FieldLabel>CST COFINS</FieldLabel><input className={input} maxLength={2} value={rules.pisCofins.cstCofins} onChange={(e) => set({ pisCofins: { ...rules.pisCofins, cstCofins: e.target.value.replace(/\D/g, '').slice(0, 2) } })} /></div>
            <div><FieldLabel>Item LC 116<Hint term="ITEM_LC116" size={11} /></FieldLabel><input className={input} maxLength={6} value={rules.nfse.itemLc116} onChange={(e) => set({ nfse: { ...rules.nfse, itemLc116: e.target.value.slice(0, 6) } })} /></div>
          </div>
          {rules.regime === 'NORMAL' && (
            <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
              <span className="inline-flex items-center gap-1">PIS/COFINS sobre a margem<Hint term="EQUIPARACAO_CONSIGNACAO" size={11} /></span>
              <input type="checkbox" className="h-4 w-4" checked={rules.pisCofins.equiparacaoConsignacao} onChange={(e) => set({ pisCofins: { ...rules.pisCofins, equiparacaoConsignacao: e.target.checked } })} />
            </label>
          )}
          <div>
            <FieldLabel>Informações complementares padrão</FieldLabel>
            <textarea className={input} rows={2} maxLength={2000} value={rules.infCpl} onChange={(e) => set({ infCpl: e.target.value })} />
          </div>
          <button className={btn.link} onClick={() => onChange({ ...defaults, ncmDefault: rules.ncmDefault, confirmedAt: null })}>Restaurar valores sugeridos</button>
        </div>
      )}
    </div>
  )
}
