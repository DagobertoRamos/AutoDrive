// =============================================================================
// jotform-checklist.js — content script na caixa de envios do Jotform.
//
// Serve os dois formulários (entrega e laudo): quem manda a mensagem diz qual,
// e a configuração (formId, reportId, qids) vem de CHK_CORE.FORMULARIOS.
//
// Por que content script e não fetch no service worker: a API da caixa de
// envios e o PDF só respondem com o cookie da sessão do Jotform. Rodando dentro
// da própria página a requisição é mesma-origem e o cookie vai junto — sem
// depender de SameSite nem de chave de API.
// =============================================================================
(() => {
  const VERSAO = 2   // combina com VERSAO_SCRIPTS em checklist-fluxo.js
  const CORE = globalThis.CHK_CORE

  const texto = (resposta) => {
    if (resposta == null) return ''
    if (typeof resposta === 'string') return resposta
    if (typeof resposta === 'object') {
      if (resposta.full) return String(resposta.full)
      if (resposta.datetime) return String(resposta.datetime)
      if (resposta.first || resposta.last) return [resposta.first, resposta.last].filter(Boolean).join(' ')
    }
    return String(resposta)
  }

  function linha(envio, cfg) {
    const r = envio.answers || {}
    const val = (qid) => (qid ? texto(r[qid] && r[qid].answer) : '')
    const q = cfg.qid
    const placa = CORE.normalizarPlaca(val(q.placa))
    const assinou = (q.assinaturas || []).some((a) => !!val(a))
    return {
      formulario: cfg.chave,
      submissionId: String(envio.id),
      criadoEm: envio.created_at,                       // "2026-08-12 16:39:29"
      dataDeclarada: val(q.data),                       // data digitada no formulário
      placa,
      placaCrua: val(q.placa),
      placaValida: CORE.placaValida(placa),
      cliente: val(q.cliente),                          // o laudo não tem cliente
      veiculo: val(q.veiculo),
      vendedor: val(q.vendedor),
      tipo: val(q.tipo),                                // laudo: ECV / CAUTELAR / AMBOS
      assinado: assinou,
      urlEnvio: 'https://www.jotform.com/pt/inbox/' + cfg.formId + '/' + envio.id,
    }
  }

  async function listar({ form, limite = 1000 }) {
    const cfg = CORE.formulario(form)
    const filtro = encodeURIComponent(JSON.stringify({ 'status:ne': ['DELETED', 'ARCHIVED'] }))
    const url = '/API/inbox/form/' + cfg.formId + '/submissions?limit=' + limite + '&offset=0&orderby=created_at,desc&filter=' + filtro
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    if (r.status === 401 || r.status === 403) throw new Error('sessão do Jotform expirada — faça login de novo')
    if (!r.ok) throw new Error('Jotform respondeu ' + r.status)
    const j = await r.json()
    const envios = Array.isArray(j.content) ? j.content : []
    return envios.map((e) => linha(e, cfg))
  }

  // O PDF é o MESMO do menu "⋮ → Baixar → <documento>": o documento customizado
  // do formulário (reportid), não a "Versão para impressão" de /pdf-submission,
  // que é outro arquivo.
  async function baixarPdf({ form, submissionId }) {
    const cfg = CORE.formulario(form)
    const p = new URLSearchParams({
      type: 'PDFv2',
      formid: cfg.formId,
      submissionid: String(submissionId),
      reportid: cfg.reportId,
      useNew: '1',
      forDownload: '1',
    })
    const r = await fetch('/API/inbox/generatePDF?' + p.toString())
    if (!r.ok) throw new Error('PDF respondeu ' + r.status)
    const blob = await r.blob()
    const tipo = (blob.type || '').toLowerCase()
    // Sem plano B para /pdf-submission de propósito: anexar o documento errado
    // em silêncio é pior do que a linha cair como erro e ser reprocessada.
    if (!tipo.includes('pdf')) throw new Error('resposta não é PDF (' + (tipo || 'sem tipo') + ') — sessão expirada ou o documento do Jotform mudou de id')
    if (blob.size < 2000) throw new Error('PDF veio vazio (' + blob.size + ' bytes)')
    const base64 = await new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onerror = () => reject(new Error('falha ao ler o PDF'))
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '')
      fr.readAsDataURL(blob)
    })
    return { base64, bytes: blob.size }
  }

  chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    if (req && req.type === 'CHK_JF_PING') { sendResponse({ ok: true, versao: VERSAO }); return true }
    if (req && req.type === 'CHK_JF_LISTA') {
      listar({ form: req.form, limite: req.limite || 1000 })
        .then((envios) => sendResponse({ ok: true, envios }))
        .catch((e) => sendResponse({ ok: false, erro: e.message || String(e) }))
      return true
    }
    if (req && req.type === 'CHK_JF_PDF') {
      baixarPdf({ form: req.form, submissionId: req.submissionId })
        .then((r) => sendResponse({ ok: true, ...r }))
        .catch((e) => sendResponse({ ok: false, erro: e.message || String(e) }))
      return true
    }
    return false
  })
})()
