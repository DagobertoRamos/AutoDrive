'use client'

// Formulários dos serviços do site (porta dos SellCarLeadForm e FindCarLeadForm
// do dagobertoeasycar), todos no visual do pop-up do anúncio (SiteFormKit):
// pré-avaliação do carro do cliente, busca de um carro que não está no estoque,
// Financia Fácil (carro de particular), atacado e parceria (lojistas). Viram
// lead no CRM da loja.
import { useState, type FormEvent } from 'react'
import { formatCnpj } from '@/lib/site/leads-core'
import { compressPhoto } from '@/lib/stock/photo-compress'
import { submitSiteLead } from './lead-utils'
import { Chips, ContactFields, DonePanel, FormCard, FormFooter, MultiChips, onMoney, Section } from './SiteFormKit'

const SELL_PHOTOS_MAX = 10
const TERMS = ['12x', '24x', '36x', '48x', '60x']

type State = 'idle' | 'sending' | 'uploading' | 'done' | 'error'
export type ServiceKind = 'sell_car' | 'find_car' | 'private_financing' | 'wholesale' | 'partner' | 'contact' | 'financing'

/** Envio padrão: campos repetidos (chips de múltipla escolha) vão como lista. */
export function useSubmit(apiUrl: string, kind: ServiceKind, extra?: () => Record<string, unknown>, afterOk?: (uploadToken: string | undefined) => Promise<void>) {
  const [state, setState] = useState<State>('idle')
  const [msg, setMsg] = useState('')
  const [protocol, setProtocol] = useState<string | null>(null)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState('sending'); setMsg('')
    const fd = new FormData(e.currentTarget)
    fd.delete('photos')
    const data: Record<string, unknown> = {}
    for (const k of new Set(fd.keys())) { const v = fd.getAll(k); data[k] = v.length > 1 ? v : v[0] }
    const r = await submitSiteLead(apiUrl, { ...data, ...extra?.(), kind })
    if (!r.ok) { setState('error'); setMsg(r.error); return }
    setProtocol(r.protocol)
    if (afterOk) { setState('uploading'); await afterOk(r.uploadToken) }
    setState('done')
  }
  const reset = () => { setState('idle'); setMsg(''); setProtocol(null) }
  return { state, msg, protocol, submit, reset, sending: state === 'sending' }
}

function TradeFields() {
  const [trade, setTrade] = useState('')
  return (
    <Section legend="Tem carro na troca?">
      <Chips name="hasTrade" label="Carro na troca" options={['Sim', 'Não']} value={trade} onChange={setTrade} />
      {trade === 'Sim' && (
        <>
          <label className="vlead-full">Marca e modelo *<input name="tradeVehicle" required maxLength={120} placeholder="Ex.: VW Gol 1.0" /></label>
          <label>Ano<input name="tradeYear" inputMode="numeric" maxLength={9} placeholder="2019/2020" /></label>
          <label>Quilometragem<input name="tradeMileage" inputMode="numeric" maxLength={9} placeholder="Ex.: 65000" /></label>
        </>
      )}
    </Section>
  )
}

export function SiteSellCarForm({ apiUrl, privacyHref, whatsappHref }: { apiUrl: string; privacyHref: string; whatsappHref: string }) {
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([])
  const [upload, setUpload] = useState({ sent: 0, failed: 0, current: 0, error: '' })
  const [goal, setGoal] = useState('')

  async function uploadPhotos(token: string | undefined) {
    if (!photos.length || !token) return
    const photoUrl = apiUrl.replace(/\/leads$/, '/leads/photos')
    let sent = 0, failed = 0, error = ''
    for (let i = 0; i < photos.length; i++) {
      setUpload({ sent, failed, current: i + 1, error })
      try {
        const blob = await compressPhoto(photos[i].file)
        const fd = new FormData(); fd.append('token', token); fd.append('file', blob, 'foto.webp')
        const r = await fetch(photoUrl, { method: 'POST', body: fd })
        if (r.ok) sent++
        else { failed++; error = ((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Falha no envio.' }
        if (r.status === 403 || r.status === 409 || r.status === 429) break
      } catch (e) { failed++; error = e instanceof Error ? e.message : 'Falha no envio.' }
    }
    setUpload({ sent, failed, current: 0, error })
    photos.forEach((p) => URL.revokeObjectURL(p.url))
    setPhotos([])
  }

  const { state, msg, protocol, submit, reset, sending } = useSubmit(apiUrl, 'sell_car', undefined, uploadPhotos)
  const pick = (files: FileList | null) => {
    const room = SELL_PHOTOS_MAX - photos.length
    const added = Array.from(files ?? []).filter((f) => f.type.startsWith('image/')).slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))
    setPhotos((p) => [...p, ...added])
  }
  const remove = (i: number) => setPhotos((p) => { URL.revokeObjectURL(p[i].url); return p.filter((_, j) => j !== i) })
  const head = { eyebrow: 'Pré-avaliação', title: 'Avalie seu carro', subtitle: 'Venda ou use como entrada na troca.' }

  if (state === 'uploading') {
    return <FormCard {...head}><div className="vlead-done"><h2>Enviando fotos…</h2><p>Foto {upload.current} de {photos.length}. Não feche esta página.</p></div></FormCard>
  }
  if (state === 'done') {
    const needPhotos = upload.sent === 0 || upload.failed > 0
    return (
      <FormCard {...head}>
        <DonePanel protocol={protocol} text="Nossa equipe vai analisar os dados e chamar você pelo WhatsApp."
          whatsappHref={whatsappHref} whatsappText={`Olá! Enviei pelo site a pré-avaliação do meu carro${protocol ? ` (protocolo ${protocol})` : ''}.${needPhotos ? ' Seguem as fotos:' : ''}`}
          onAgain={() => { setUpload({ sent: 0, failed: 0, current: 0, error: '' }); setGoal(''); reset() }}>
          {upload.sent > 0 && <p><strong>{upload.sent} foto(s) enviada(s).</strong>{upload.failed ? ` ${upload.failed} não foram (${upload.error}).` : ''}</p>}
          {needPhotos && <p>Adiante a avaliação: mande fotos reais do carro (frente, traseira, laterais, painel ligado, interior, motor, pneus e avarias).</p>}
        </DonePanel>
      </FormCard>
    )
  }
  return (
    <FormCard {...head}>
      <form className="vlead-form" method="post" onSubmit={submit}>
        <h2>Dados do seu carro</h2>
        <p className="vlead-lead">Campos com * são obrigatórios. A avaliação final depende de vistoria.</p>
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
        <Section legend="Fotos (opcional)">
          <p className="vlead-hint vlead-full">Até {SELL_PHOTOS_MAX} fotos reais: frente, traseira, laterais, painel ligado, interior, motor, pneus e avarias.</p>
          {photos.length > 0 && (
            <div className="sell-photo-grid vlead-full">
              {photos.map((p, i) => (
                <div key={p.url} className="sell-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
                  <img src={p.url} alt={`Foto ${i + 1}`} />
                  <button type="button" onClick={() => remove(i)} aria-label={`Remover foto ${i + 1}`}>×</button>
                </div>
              ))}
            </div>
          )}
          {photos.length < SELL_PHOTOS_MAX && (
            <label className="photo-upload-card vlead-full"><span>{photos.length ? 'Adicionar mais fotos' : 'Escolher fotos'}</span><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { pick(e.target.files); e.currentTarget.value = '' }} /></label>
          )}
        </Section>
        <FormFooter privacyHref={privacyHref} button="Enviar pré-avaliação" sending={sending} error={state === 'error' ? msg : ''} notesPlaceholder="Revisões, avarias, opcionais..." />
      </form>
    </FormCard>
  )
}

export function SiteFindCarForm({ apiUrl, privacyHref, whatsappHref }: { apiUrl: string; privacyHref: string; whatsappHref?: string }) {
  const { state, msg, protocol, submit, reset, sending } = useSubmit(apiUrl, 'find_car')
  const [financing, setFinancing] = useState('')
  const head = { eyebrow: 'Busca personalizada', title: 'Encontre seu carro', subtitle: 'Nós procuramos e avisamos você.' }
  if (state === 'done') {
    return <FormCard {...head}><DonePanel protocol={protocol} text="Vamos procurar e chamar você pelo WhatsApp com as opções." whatsappHref={whatsappHref} whatsappText={`Olá! Enviei pelo site uma busca de carro${protocol ? ` (protocolo ${protocol})` : ''}.`} onAgain={() => { setFinancing(''); reset() }} /></FormCard>
  }
  return (
    <FormCard {...head}>
      <form className="vlead-form" method="post" onSubmit={submit}>
        <h2>Qual carro você procura?</h2>
        <p className="vlead-lead">Quanto mais detalhes, mais rápido encontramos.</p>
        <Section legend="Seus dados"><ContactFields /></Section>
        <Section legend="Carro procurado">
          <label>Marca *<input name="brand" required maxLength={80} /></label>
          <label>Modelo *<input name="model" required maxLength={100} /></label>
          <label>Ano mínimo<input name="yearMin" inputMode="numeric" maxLength={4} /></label>
          <label>Orçamento *<input name="budget" required maxLength={40} placeholder="Ex.: até R$ 90.000" /></label>
        </Section>
        <Section legend="Pretende financiar?">
          <Chips name="wantsFinancing" label="Pretende financiar" options={['Sim', 'Não', 'Ainda não sei']} value={financing} onChange={setFinancing} />
          {financing === 'Sim' && <label className="vlead-full">Valor de entrada<input name="downPayment" inputMode="numeric" placeholder="R$ 0,00" onInput={onMoney} /></label>}
        </Section>
        <TradeFields />
        <FormFooter privacyHref={privacyHref} button="Enviar busca" sending={sending} error={state === 'error' ? msg : ''} notesPlaceholder="Versões, cores, opcionais ou lojas onde já pesquisou" />
      </form>
    </FormCard>
  )
}

export function SitePrivateFinancingForm({ apiUrl, privacyHref, whatsappHref }: { apiUrl: string; privacyHref: string; whatsappHref?: string }) {
  const { state, msg, protocol, submit, reset, sending } = useSubmit(apiUrl, 'private_financing')
  const [term, setTerm] = useState('48x')
  const head = { eyebrow: 'Financia Fácil', title: 'Financie o carro de um particular', subtitle: 'Sem CPF nesta primeira etapa.' }
  if (state === 'done') {
    return <FormCard {...head}><DonePanel protocol={protocol} text="Um consultor vai falar com você com as condições das financeiras." whatsappHref={whatsappHref} whatsappText={`Olá! Enviei pelo site uma simulação do Financia Fácil${protocol ? ` (protocolo ${protocol})` : ''}.`} onAgain={reset} /></FormCard>
  }
  return (
    <FormCard {...head}>
      <form className="vlead-form" method="post" onSubmit={submit}>
        <h2>Simule seu financiamento</h2>
        <p className="vlead-lead">Informe o carro que você está negociando e um consultor envia as condições.</p>
        <Section legend="Seus dados">
          <ContactFields />
          <label className="vlead-full">Cidade<input name="city" maxLength={100} autoComplete="address-level2" /></label>
        </Section>
        <Section legend="Carro que você está negociando">
          <label>Marca *<input name="brand" required maxLength={80} /></label>
          <label>Modelo *<input name="model" required maxLength={100} /></label>
          <label>Ano *<input name="year" required inputMode="numeric" maxLength={9} placeholder="Ex.: 2020/2021" /></label>
          <label>Quilometragem<input name="mileage" inputMode="numeric" maxLength={20} /></label>
          <label className="vlead-full">Valor combinado com o vendedor *<input name="vehicleValue" required inputMode="numeric" placeholder="R$ 0,00" onInput={onMoney} /></label>
        </Section>
        <Section legend="Condições">
          <label className="vlead-full">Valor de entrada<input name="downPayment" inputMode="numeric" placeholder="R$ 0,00" onInput={onMoney} /></label>
          <Chips name="installments" label="Prazo desejado" options={TERMS} value={term} onChange={setTerm} />
        </Section>
        <FormFooter privacyHref={privacyHref} button="Enviar simulação" sending={sending} error={state === 'error' ? msg : ''} notesPlaceholder="Ex.: o carro é de um amigo e está quitado" />
      </form>
    </FormCard>
  )
}

const cnpjMask = (e: FormEvent<HTMLInputElement>) => { e.currentTarget.value = formatCnpj(e.currentTarget.value) }

export function SiteWholesaleForm({ apiUrl, privacyHref, whatsappHref }: { apiUrl: string; privacyHref: string; whatsappHref?: string }) {
  const { state, msg, protocol, submit, reset, sending } = useSubmit(apiUrl, 'wholesale')
  const head = { eyebrow: 'Para lojistas', title: 'Cadastro no atacado', subtitle: 'Exclusivo para empresas com CNPJ.' }
  if (state === 'done') {
    return <FormCard {...head}><DonePanel protocol={protocol} text="A equipe de atacado vai falar com você." whatsappHref={whatsappHref} whatsappText={`Olá! Fiz pelo site o cadastro de lojista no atacado${protocol ? ` (protocolo ${protocol})` : ''}.`} onAgain={reset} /></FormCard>
  }
  return (
    <FormCard {...head}>
      <form className="vlead-form" method="post" onSubmit={submit}>
        <h2>Cadastre sua empresa</h2>
        <p className="vlead-lead">Receba as oportunidades de repasse antes de irem para a vitrine.</p>
        <Section legend="Empresa">
          <label className="vlead-full">Razão social *<input name="companyName" required maxLength={160} autoComplete="organization" /></label>
          <label>CNPJ *<input name="cnpj" required inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" onInput={cnpjMask} /></label>
          <label>Cidade<input name="city" maxLength={100} /></label>
        </Section>
        <Section legend="Responsável"><ContactFields nameLabel="Nome" /></Section>
        <Section legend="Interesse">
          <label className="vlead-full">Que carros interessam?<input name="interest" maxLength={200} placeholder="Ex.: populares até 2018, SUVs, carros para repasse" /></label>
        </Section>
        <FormFooter privacyHref={privacyHref} button="Enviar cadastro" sending={sending} error={state === 'error' ? msg : ''} />
      </form>
    </FormCard>
  )
}

export function SitePartnerForm({ apiUrl, privacyHref, whatsappHref }: { apiUrl: string; privacyHref: string; whatsappHref?: string }) {
  const { state, msg, protocol, submit, reset, sending } = useSubmit(apiUrl, 'partner')
  const [type, setType] = useState('')
  const head = { eyebrow: 'Parceria', title: 'Quero ser parceiro', subtitle: 'Para lojistas e profissionais do setor.' }
  if (state === 'done') {
    return <FormCard {...head}><DonePanel protocol={protocol} text="Nossa equipe vai analisar o cadastro e falar com você pelo WhatsApp." whatsappHref={whatsappHref} whatsappText={`Olá! Fiz pelo site o cadastro de parceiro${protocol ? ` (protocolo ${protocol})` : ''}.`} onAgain={() => { setType(''); reset() }} /></FormCard>
  }
  return (
    <FormCard {...head}>
      <form className="vlead-form" method="post" onSubmit={submit}>
        <h2>Cadastre sua loja</h2>
        <p className="vlead-lead">Conte como quer trabalhar com a gente. A equipe retorna com os próximos passos.</p>
        <Section legend="Como quer ser parceiro?">
          <Chips name="partnerType" label="Tipo de parceria" required options={['Oferecer veículos do meu estoque', 'Procuro veículos para meu estoque', 'Os dois']} value={type} onChange={setType} />
        </Section>
        <Section legend="Sua loja">
          <label className="vlead-full">Nome da loja / empresa *<input name="companyName" required maxLength={160} autoComplete="organization" /></label>
          <label>CNPJ<input name="cnpj" inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" onInput={cnpjMask} /></label>
          <label>Cidade *<input name="city" required maxLength={100} autoComplete="address-level2" /></label>
          <label className="vlead-full">Carros em estoque<select name="stockSize" defaultValue=""><option value="">Selecione</option><option>Até 10</option><option>11 a 30</option><option>31 a 60</option><option>Mais de 60</option></select></label>
        </Section>
        <Section legend="Responsável"><ContactFields nameLabel="Nome" /></Section>
        <Section legend="Veículos">
          <label className="vlead-full">Que carros você oferece ou procura?<input name="interest" maxLength={200} placeholder="Ex.: SUVs e sedãs 2018+, populares para repasse" /></label>
        </Section>
        <FormFooter privacyHref={privacyHref} button="Enviar cadastro" sending={sending} error={state === 'error' ? msg : ''} />
      </form>
    </FormCard>
  )
}
