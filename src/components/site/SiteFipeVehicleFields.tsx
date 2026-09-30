'use client'

// Marca → Modelo → Versão → Ano pela tabela FIPE (menus que carregam em
// cascata), para o "Venda seu carro". Envia os mesmos campos de antes
// (brand, model, version, year) em inputs ocultos. Se a FIPE cair ou o carro
// não estiver na lista, o cliente digita (campos de texto, como antes).
import { useEffect, useMemo, useRef, useState } from 'react'
import { groupModels, parseFipeYear, type FipeOption } from '@/lib/site/fipe-picker-core'

type Load<T> = { state: 'idle' | 'loading' | 'ok' | 'error'; data: T }
const idle = <T,>(data: T): Load<T> => ({ state: 'idle', data })

async function fetchList(url: string): Promise<FipeOption[]> {
  const r = await fetch(url)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok || !Array.isArray(d.data)) throw new Error(d?.error ?? 'FIPE indisponível')
  return d.data as FipeOption[]
}

function ManualFields({ onBack }: { onBack?: () => void }) {
  return (
    <>
      <label>Marca *<input name="brand" required maxLength={80} /></label>
      <label>Modelo *<input name="model" required maxLength={100} /></label>
      <label className="vlead-full">Versão<input name="version" maxLength={140} /></label>
      <label>Ano *<input name="year" required inputMode="numeric" maxLength={9} placeholder="Ex.: 2020/2021" /></label>
      {onBack && (
        <p className="vlead-full fipe-hint"><button type="button" className="fipe-link" onClick={onBack}>Escolher pela lista da FIPE</button></p>
      )}
    </>
  )
}

export function SiteFipeVehicleFields({ fipeUrl }: { fipeUrl: string }) {
  const [manual, setManual] = useState(false)
  const [brands, setBrands] = useState<Load<FipeOption[]>>({ state: 'loading', data: [] })
  const [models, setModels] = useState<Load<FipeOption[]>>(idle([]))
  const [years,  setYears]  = useState<Load<FipeOption[]>>(idle([]))
  const [brandId, setBrandId] = useState('')
  const [groupKey, setGroupKey] = useState('')
  const [versionId, setVersionId] = useState('')
  const [yearId, setYearId] = useState('')
  // Ignora respostas atrasadas (cliente trocou a marca/versão no meio).
  const seq = useRef({ models: 0, years: 0 })

  useEffect(() => {
    let alive = true
    fetchList(fipeUrl)
      .then((data) => { if (alive) setBrands({ state: 'ok', data }) })
      .catch(() => { if (alive) { setBrands({ state: 'error', data: [] }); setManual(true) } })
    return () => { alive = false }
  }, [fipeUrl])

  function loadYears(bId: string, vId: string) {
    setVersionId(vId); setYearId('')
    if (!vId) { setYears(idle([])); return }
    const n = ++seq.current.years
    setYears({ state: 'loading', data: [] })
    fetchList(`${fipeUrl}?brandId=${encodeURIComponent(bId)}&modelId=${encodeURIComponent(vId)}`)
      .then((data) => { if (seq.current.years === n) setYears({ state: 'ok', data }) })
      .catch(() => { if (seq.current.years === n) setYears({ state: 'error', data: [] }) })
  }

  function chooseBrand(id: string) {
    setBrandId(id); setGroupKey(''); loadYears(id, '')
    if (!id) { setModels(idle([])); return }
    const n = ++seq.current.models
    setModels({ state: 'loading', data: [] })
    fetchList(`${fipeUrl}?brandId=${encodeURIComponent(id)}`)
      .then((data) => { if (seq.current.models === n) setModels({ state: 'ok', data }) })
      .catch(() => { if (seq.current.models === n) setModels({ state: 'error', data: [] }) })
  }

  const groups = useMemo(() => groupModels(models.data), [models.data])
  const group = groups.find((g) => g.key === groupKey)

  function chooseGroup(key: string) {
    setGroupKey(key)
    const g = groups.find((x) => x.key === key)
    // Modelo com uma versão só: já seleciona e carrega os anos.
    loadYears(brandId, g && g.versions.length === 1 ? g.versions[0].code : '')
  }

  if (manual) {
    return <ManualFields onBack={brands.state === 'ok' ? () => setManual(false) : undefined} />
  }

  const brand   = brands.data.find((b) => b.code === brandId)
  const version = group?.versions.find((v) => v.code === versionId)
  const yearOpt = years.data.find((y) => y.code === yearId)
  const yearVal = yearOpt ? parseFipeYear(yearOpt.name).year : null
  const ph = (l: Load<unknown>, ready: string, empty: string) =>
    l.state === 'loading' ? 'Carregando…' : l.state === 'error' ? 'Não foi possível carregar' : l.state === 'ok' ? ready : empty

  return (
    <>
      <input type="hidden" name="brand" value={brand?.name ?? ''} />
      <input type="hidden" name="model" value={group?.label ?? ''} />
      <input type="hidden" name="version" value={version?.name ?? ''} />
      <input type="hidden" name="year" value={yearVal ? String(yearVal) : ''} />

      <label>Marca *
        <select required value={brandId} disabled={brands.state !== 'ok'} onChange={(e) => chooseBrand(e.target.value)}>
          <option value="">{ph(brands, 'Selecione', 'Selecione')}</option>
          {brands.data.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </select>
      </label>
      <label>Modelo *
        <select required value={groupKey} disabled={models.state !== 'ok'} onChange={(e) => chooseGroup(e.target.value)}>
          <option value="">{ph(models, 'Selecione', 'Escolha a marca')}</option>
          {groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
      </label>
      <label className="vlead-full">Versão *
        <select required value={versionId} disabled={!group} onChange={(e) => loadYears(brandId, e.target.value)}>
          <option value="">{group ? 'Selecione' : 'Escolha o modelo'}</option>
          {group?.versions.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
        </select>
      </label>
      <label>Ano *
        <select required value={yearId} disabled={years.state !== 'ok'} onChange={(e) => setYearId(e.target.value)}>
          <option value="">{ph(years, 'Selecione', 'Escolha a versão')}</option>
          {years.data.map((y) => <option key={y.code} value={y.code}>{parseFipeYear(y.name).label}</option>)}
        </select>
      </label>
      <p className="vlead-full fipe-hint">
        Não achou o seu carro? <button type="button" className="fipe-link" onClick={() => setManual(true)}>Digitar os dados</button>
      </p>
    </>
  )
}
