'use client'
/* eslint-disable @next/next/no-img-element -- prévias locais (blob:) */

// Venda seu carro — pré-avaliação em 3 etapas, no padrão das grandes
// plataformas: (1) dados do carro; (2) passo a passo de fotos — tira na hora
// pelo celular ou escolhe da galeria/computador, com "tem avaria?" em cada
// etapa (abre foto + descrição da avaria); (3) revisão e envio. Ao enviar, o
// lead entra no CRM e o sistema cadastra a avaliação (liberada
// automaticamente; a gerência confere antes de negociar). As fotos vão uma a
// uma, já comprimidas, direto para a avaliação.
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { AlertTriangle, Camera, Check, ChevronLeft, ChevronRight, ImagePlus } from 'lucide-react'
import { compressPhoto } from '@/lib/stock/photo-compress'
import {
  activeSteps, DAMAGE_SHOT, PRE_EVAL_STEPS, TIRE_CONDITIONS, type PreEvalStep, type TireCondition,
} from '@/lib/evaluation/site-pre-evaluation'
import { submitSiteLead } from './lead-utils'
import { Chips, ContactFields, DonePanel, FormCard, FormFooter, MultiChips, onMoney, Section } from './SiteFormKit'

type Photo = { blob: Blob; url: string }
type Phase = 'dados' | 'fotos' | 'revisao' | 'sending' | 'uploading' | 'done'
type Side = 'RIGHT' | 'LEFT'
type Damage = { on: boolean; text: string }

// JPG/PNG/WebP: o iPhone converte HEIC para JPG ao entregar a foto.
const ACCEPT = 'image/jpeg,image/png,image/webp'
const LEGACY_MAX = 10
const slot = (step: string, shot: string) => `${step}:${shot}`
const TIRE_OPTIONS = Object.values(TIRE_CONDITIONS) as string[]
const tireFromLabel = (label: string) => (Object.keys(TIRE_CONDITIONS) as TireCondition[]).find((k) => TIRE_CONDITIONS[k] === label) ?? null

function ShotSlot({ label, photo, busy, touch, onPick }: { label: string; photo?: Photo; busy: boolean; touch: boolean; onPick: (f: File | undefined) => void }) {
  const input = (capture: boolean) => (
    <input type="file" accept={ACCEPT} {...(capture ? { capture: 'environment' as const } : {})} onChange={(e) => { onPick(e.target.files?.[0]); e.currentTarget.value = '' }} />
  )
  return (
    <div className={`pe-shot${photo ? ' has-photo' : ''}`}>
      <span className="pe-shot-label">{photo && <Check size={14} aria-hidden="true" />}{label}</span>
      <div className="pe-shot-frame">
        {photo ? <img src={photo.url} alt={label} /> : <span>{busy ? 'Preparando a foto…' : <Camera size={30} aria-hidden="true" />}</span>}
      </div>
      <div className="pe-shot-actions">
        {touch && <label className="button"><Camera size={16} aria-hidden="true" />{photo ? 'Tirar outra' : 'Tirar foto'}{input(true)}</label>}
        <label className={`button${touch || photo ? ' button-outline' : ''}`}><ImagePlus size={16} aria-hidden="true" />{photo ? 'Trocar foto' : touch ? 'Da galeria' : 'Escolher foto'}{input(false)}</label>
      </div>
    </div>
  )
}

export function SiteSellCarForm({ apiUrl, privacyHref, whatsappHref }: { apiUrl: string; privacyHref: string; whatsappHref: string }) {
  const [phase, setPhase] = useState<Phase>('dados')
  const [goal, setGoal] = useState('')
  const [stepIdx, setStepIdx] = useState(0)
  const [photos, setPhotos] = useState<Record<string, Photo>>({})
  const [busySlot, setBusySlot] = useState<string | null>(null)
  const [sunroof, setSunroof] = useState<boolean | null>(null)
  const [tires, setTires] = useState<Record<Side, TireCondition | null>>({ RIGHT: null, LEFT: null })
  const [damage, setDamage] = useState<Record<string, Damage>>({})
  const [showMissing, setShowMissing] = useState(false)
  const [error, setError] = useState('')
  const [protocol, setProtocol] = useState<string | null>(null)
  const [upload, setUpload] = useState({ done: 0, total: 0, failed: 0, error: '' })
  // Celular/tablet: mostra "Tirar foto" (abre a câmera). Computador: só "Escolher foto".
  const touch = useSyncExternalStore(() => () => {}, () => window.matchMedia('(pointer: coarse)').matches, () => false)
  const dadosRef = useRef<HTMLFormElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const photosRef = useRef(photos)
  useEffect(() => { photosRef.current = photos }, [photos])

  useEffect(() => () => Object.values(photosRef.current).forEach((p) => URL.revokeObjectURL(p.url)), [])
  // Não perder as fotos sem querer (voltar do navegador, fechar a aba).
  const dirty = Object.keys(photos).length > 0 && phase !== 'done'
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const steps = activeSteps(sunroof === true)

  async function pick(key: string, file: File | undefined) {
    if (!file) return
    setBusySlot(key); setError('')
    try {
      const blob = await compressPhoto(file)
      setPhotos((p) => { if (p[key]) URL.revokeObjectURL(p[key].url); return { ...p, [key]: { blob, url: URL.createObjectURL(blob) } } })
    } catch (e) {
      setError(`Não deu para usar esta foto: ${e instanceof Error ? e.message : 'formato não suportado'}.`)
    } finally { setBusySlot(null) }
  }

  function stepMissing(step: PreEvalStep): string | null {
    if (step.sunroof) {
      if (sunroof === null) return 'Responda se o carro tem teto solar ou panorâmico.'
      if (!sunroof) return null
    }
    for (const shot of step.shots) if (!photos[slot(step.key, shot.key)]) return `Falta a foto: ${shot.label.toLowerCase()}.`
    if (step.tires && !tires[step.tires]) return 'Escolha como estão os pneus deste lado.'
    const d = damage[step.key]
    if (d?.on) {
      if (!photos[slot(step.key, DAMAGE_SHOT)]) return 'Falta a foto da avaria.'
      if (d.text.trim().length < 3) return 'Descreva a avaria.'
    }
    return null
  }
  const firstIncomplete = PRE_EVAL_STEPS.findIndex((s) => stepMissing(s))
  const reachable = firstIncomplete === -1 ? PRE_EVAL_STEPS.length - 1 : firstIncomplete

  function next() {
    const step = PRE_EVAL_STEPS[stepIdx]
    if (stepMissing(step)) { setShowMissing(true); return }
    setShowMissing(false); setError('')
    if (stepIdx < PRE_EVAL_STEPS.length - 1) setStepIdx(stepIdx + 1)
    else setPhase('revisao')
    scrollTop()
  }
  function back() {
    setShowMissing(false); setError('')
    if (stepIdx === 0) setPhase('dados')
    else setStepIdx(stepIdx - 1)
    scrollTop()
  }
  const setDamageOf = (key: string, patch: Partial<Damage>) => setDamage((d) => ({ ...d, [key]: { ...(d[key] ?? { on: false, text: '' }), ...patch } }))

  function uploadQueue() {
    return steps.flatMap((s) => [
      ...s.shots.map((sh) => ({ step: s.key, shot: sh.key })),
      ...(damage[s.key]?.on ? [{ step: s.key, shot: DAMAGE_SHOT }] : []),
    ]).filter((q) => photos[slot(q.step, q.shot)])
  }

  async function uploadAll(evaluationToken?: string, leadToken?: string) {
    const queue = uploadQueue()
    const legacy = !evaluationToken
    const token = evaluationToken ?? leadToken
    if (!token) return
    const list = legacy ? queue.slice(0, LEGACY_MAX) : queue
    const url = apiUrl.replace(/\/leads$/, legacy ? '/leads/photos' : '/leads/evaluation-photos')
    let done = 0, failed = 0, error = ''
    setUpload({ done, total: list.length, failed, error })
    for (const q of list) {
      let ok = false, stop = false
      for (let attempt = 0; attempt < 2 && !ok && !stop; attempt++) {
        try {
          const fd = new FormData()
          fd.append('token', token); fd.append('step', q.step); fd.append('shot', q.shot)
          fd.append('file', photos[slot(q.step, q.shot)].blob, `${q.step}-${q.shot}.webp`)
          const r = await fetch(url, { method: 'POST', body: fd })
          if (r.ok) ok = true
          else {
            error = ((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Falha no envio.'
            if (r.status === 403 || r.status === 409 || r.status === 429) stop = true
            else if (r.status < 500) break
          }
        } catch (e) { error = e instanceof Error ? e.message : 'Falha no envio.' }
      }
      if (ok) done++; else failed++
      setUpload({ done, total: list.length, failed, error })
      if (stop) { failed += list.length - done - failed; setUpload({ done, total: list.length, failed, error }); break }
    }
  }

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data: Record<string, unknown> = {}
    for (const form of [dadosRef.current, e.currentTarget]) {
      if (!form) continue
      const fd = new FormData(form)
      for (const k of new Set(fd.keys())) { const v = fd.getAll(k); data[k] = v.length > 1 ? v : v[0] }
    }
    const damages = Object.fromEntries(steps.filter((s) => damage[s.key]?.on).map((s) => [s.key, damage[s.key].text.trim()]))
    setPhase('sending'); setError('')
    const r = await submitSiteLead(apiUrl, { ...data, kind: 'sell_car', inspection: { sunroof: sunroof === true, tires, damages } })
    if (!r.ok) { setError(r.error); setPhase('revisao'); return }
    setProtocol(r.protocol)
    setPhase('uploading'); scrollTop()
    await uploadAll(r.evaluationToken, r.uploadToken)
    setPhase('done')
  }

  function restart() {
    Object.values(photos).forEach((p) => URL.revokeObjectURL(p.url))
    setPhotos({}); setSunroof(null); setTires({ RIGHT: null, LEFT: null }); setDamage({}); setGoal('')
    setStepIdx(0); setProtocol(null); setUpload({ done: 0, total: 0, failed: 0, error: '' }); setError('')
    dadosRef.current?.reset(); setPhase('dados')
  }

  const head = { eyebrow: 'Pré-avaliação', title: 'Avalie seu carro', subtitle: 'Venda ou use como entrada na troca.' }

  if (phase === 'uploading') {
    const pct = upload.total ? Math.round(((upload.done + upload.failed) / upload.total) * 100) : 0
    return (
      <FormCard {...head}>
        <div className="vlead-done" ref={topRef}>
          <h2>Enviando as fotos…</h2>
          <p>Foto {Math.min(upload.done + upload.failed + 1, upload.total)} de {upload.total}. Não feche esta página.</p>
          <div className="pe-progress pe-progress-wide"><span style={{ width: `${pct}%` }} /></div>
        </div>
      </FormCard>
    )
  }
  if (phase === 'done') {
    const incomplete = upload.done < uploadQueue().length
    return (
      <FormCard {...head}>
        <DonePanel protocol={protocol} text="Recebemos seu carro. Nossa equipe confere a avaliação e chama você pelo WhatsApp."
          whatsappHref={whatsappHref} whatsappText={`Olá! Enviei pelo site a pré-avaliação do meu carro${protocol ? ` (protocolo ${protocol})` : ''}.${incomplete ? ' Algumas fotos não foram, seguem aqui:' : ''}`}
          onAgain={restart}>
          {upload.done > 0 && <p><strong>{upload.done} foto(s) enviada(s).</strong></p>}
          {incomplete && <p className="pe-warn"><AlertTriangle size={16} aria-hidden="true" /> {uploadQueue().length - upload.done} foto(s) não foram enviadas{upload.error ? ` (${upload.error})` : ''}. Mande pelo WhatsApp para completar a avaliação.</p>}
        </DonePanel>
      </FormCard>
    )
  }

  const step = PRE_EVAL_STEPS[stepIdx]
  const missing = stepMissing(step)
  const phaseIdx = phase === 'dados' ? 0 : phase === 'fotos' ? 1 : 2
  const damageOn = !!damage[step.key]?.on
  const stepVisible = !step.sunroof || sunroof === true

  return (
    <FormCard {...head}>
      <div ref={topRef} className="pe-top">
        <ol className="pe-phases" aria-label="Etapas">
          {['Dados do carro', 'Fotos', 'Enviar'].map((label, i) => (
            <li key={label} className={i === phaseIdx ? 'active' : i < phaseIdx ? 'done' : ''}><b>{i < phaseIdx ? <Check size={13} aria-hidden="true" /> : i + 1}</b>{label}</li>
          ))}
        </ol>
      </div>

      <form ref={dadosRef} className="vlead-form" method="post" style={{ display: phase === 'dados' ? undefined : 'none' }}
        onSubmit={(e) => { e.preventDefault(); setPhase('fotos'); scrollTop() }}>
        <h2>Dados do seu carro</h2>
        <p className="vlead-lead">Campos com * são obrigatórios. Depois vêm as fotos, uma de cada vez.</p>
        <Section legend="Seus dados">
          <ContactFields />
          <label className="vlead-full">Cidade *<input name="city" required maxLength={100} autoComplete="address-level2" /></label>
        </Section>
        <Section legend="O que você quer fazer?">
          <Chips name="goal" label="Objetivo" options={['Vender', 'Trocar por outro carro', 'Ainda não sei']} value={goal} onChange={setGoal} />
        </Section>
        <Section legend="Seu carro">
          <label>Marca *<input name="brand" required maxLength={80} /></label>
          <label>Modelo *<input name="model" required maxLength={100} /></label>
          <label className="vlead-full">Versão<input name="version" maxLength={140} /></label>
          <label>Ano *<input name="year" required inputMode="numeric" maxLength={9} placeholder="Ex.: 2020/2021" /></label>
          <label>Quilometragem *<input name="mileage" required inputMode="numeric" maxLength={20} /></label>
          <label>Câmbio<select name="transmission" defaultValue=""><option value="">Selecione</option><option>Manual</option><option>Automático</option><option>CVT</option><option>Automatizado</option></select></label>
          <label>Combustível<select name="fuel" defaultValue=""><option value="">Selecione</option><option>Flex</option><option>Gasolina</option><option>Etanol</option><option>Diesel</option><option>Híbrido</option><option>Elétrico</option></select></label>
          <label>Placa<input name="plate" maxLength={8} autoCapitalize="characters" /></label>
          <label>Cor<input name="color" maxLength={60} /></label>
          <label className="vlead-full">Valor pretendido *<input name="targetPrice" required inputMode="numeric" placeholder="R$ 0,00" onInput={onMoney} /></label>
        </Section>
        <Section legend="Situação do carro">
          <MultiChips name="vehicleStatus" label="Situação" options={['Quitado', 'Financiado', 'Possui débitos', 'Possui sinistro', 'Possui leilão']} />
        </Section>
        <button className="button vlead-submit">Continuar para as fotos <ChevronRight size={18} aria-hidden="true" /></button>
      </form>

      {phase === 'fotos' && (
        <div className="vlead-form pe-step">
          <div className="pe-step-head">
            <span>Foto {stepIdx + 1} de {PRE_EVAL_STEPS.length}</span>
            <div className="pe-progress"><span style={{ width: `${((stepIdx + (missing ? 0 : 1)) / PRE_EVAL_STEPS.length) * 100}%` }} /></div>
          </div>
          <h2>{step.title}</h2>
          <p className="vlead-lead">{step.hint}</p>

          {step.sunroof && (
            <div className="pe-question">
              <p>O carro tem teto solar ou panorâmico?</p>
              <Chips name="sunroof" label="Teto solar" options={['Sim, tem', 'Não tem']} value={sunroof === null ? '' : sunroof ? 'Sim, tem' : 'Não tem'} onChange={(v) => setSunroof(v === 'Sim, tem')} />
            </div>
          )}

          {stepVisible && (
            <>
              <div className={`pe-shots${step.shots.length > 1 ? ' pe-shots-2' : ''}`}>
                {step.shots.map((shot) => {
                  const key = slot(step.key, shot.key)
                  return <ShotSlot key={key} label={shot.label} photo={photos[key]} busy={busySlot === key} touch={touch} onPick={(f) => pick(key, f)} />
                })}
              </div>

              {step.tires && (
                <div className="pe-question">
                  <p>Como estão os pneus deste lado?</p>
                  <Chips name={`tires-${step.tires}`} label="Condição dos pneus" options={TIRE_OPTIONS}
                    value={tires[step.tires] ? TIRE_CONDITIONS[tires[step.tires]!] : ''}
                    onChange={(v) => setTires((t) => ({ ...t, [step.tires!]: tireFromLabel(v) }))} />
                </div>
              )}

              <label className={`pe-damage-toggle${damageOn ? ' active' : ''}`}>
                <input type="checkbox" checked={damageOn} onChange={(e) => setDamageOf(step.key, { on: e.target.checked })} />
                <span><strong>Tem avaria nesta parte?</strong> Risco, amassado, trinca, ferrugem ou desgaste.</span>
              </label>
              {damageOn && (
                <div className="pe-damage">
                  <ShotSlot label="Foto da avaria (de perto)" photo={photos[slot(step.key, DAMAGE_SHOT)]} busy={busySlot === slot(step.key, DAMAGE_SHOT)} touch={touch} onPick={(f) => pick(slot(step.key, DAMAGE_SHOT), f)} />
                  <label>Descreva a avaria *
                    <textarea rows={2} maxLength={500} value={damage[step.key]?.text ?? ''} placeholder="Ex.: risco na porta dianteira, amassado pequeno no para-choque"
                      onChange={(e) => setDamageOf(step.key, { text: e.target.value })} />
                  </label>
                </div>
              )}
            </>
          )}

          {error && <p className="form-status error" role="alert">{error}</p>}
          {showMissing && missing && <p className="form-status error" role="alert">{missing}</p>}
          <div className="pe-nav">
            <button type="button" className="button button-outline" onClick={back}><ChevronLeft size={18} aria-hidden="true" />Voltar</button>
            <button type="button" className="button" onClick={next}>{stepIdx === PRE_EVAL_STEPS.length - 1 ? 'Revisar e enviar' : 'Próxima'}<ChevronRight size={18} aria-hidden="true" /></button>
          </div>
          <div className="pe-dots" aria-label="Etapas das fotos">
            {PRE_EVAL_STEPS.map((s, i) => (
              <button key={s.key} type="button" title={s.title} aria-label={`${i + 1}. ${s.title}`} disabled={i > reachable}
                className={`${i === stepIdx ? 'current' : ''}${!stepMissing(s) ? ' ok' : ''}`}
                onClick={() => { setShowMissing(false); setStepIdx(i) }} />
            ))}
          </div>
        </div>
      )}

      {(phase === 'revisao' || phase === 'sending') && (
        <form className="vlead-form" method="post" onSubmit={send}>
          <h2>Revise e envie</h2>
          <p className="vlead-lead">Toque numa foto para refazer. As fotos só são enviadas depois de você confirmar.</p>
          <div className="pe-review">
            {steps.map((s) => {
              const i = PRE_EVAL_STEPS.indexOf(s)
              const cover = photos[slot(s.key, s.shots[0].key)]
              return (
                <button key={s.key} type="button" className="pe-review-item" onClick={() => { setStepIdx(i); setPhase('fotos'); scrollTop() }}>
                  {cover && <img src={cover.url} alt="" />}
                  <span>{s.title}</span>
                  {damage[s.key]?.on && <em>Avaria</em>}
                </button>
              )
            })}
          </div>
          <p className="vlead-hint">
            {uploadQueue().length} fotos · teto solar: {sunroof ? 'sim' : 'não'} · pneus: direitos {tires.RIGHT ? TIRE_CONDITIONS[tires.RIGHT].toLowerCase() : '—'}, esquerdos {tires.LEFT ? TIRE_CONDITIONS[tires.LEFT].toLowerCase() : '—'}
          </p>
          <FormFooter privacyHref={privacyHref} button="Enviar pré-avaliação" sending={phase === 'sending'} error={error} notesPlaceholder="Revisões, opcionais, detalhes que ajudam na avaliação..." />
          <button type="button" className="button button-outline" disabled={phase === 'sending'} onClick={() => { setPhase('fotos'); scrollTop() }}><ChevronLeft size={18} aria-hidden="true" />Voltar às fotos</button>
        </form>
      )}
    </FormCard>
  )
}
