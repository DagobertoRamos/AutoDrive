// =============================================================================
// contrato-anexar.js — content script no AutoConf: busca a negociação pela
// placa, lê os documentos já anexados e sobe o checklist na aba Contratos.
//
// Tudo mesma-origem (cookie de sessão + CSRF da própria página). O anexo é o
// mesmo POST que o botão "Anexar" faz:
//   POST /negociacao/{id}/contrato/store  (multipart)
//        _token, tipo_documento_id=4 (Outros), nome, documento_file
// =============================================================================
(() => {
  const VERSAO = 2   // combina com VERSAO_SCRIPTS em checklist-fluxo.js
  const CORE = globalThis.CHK_CORE

  const csrf = () => {
    const m = document.querySelector('meta[name="csrf-token"]')
    return m ? m.getAttribute('content') : ''
  }

  const paginaDeLogin = (html) => /name="password"/i.test(html) && /login/i.test(html)

  async function buscarPorPlaca(placa) {
    const p = CORE.normalizarPlaca(placa)
    const r = await fetch('/api/ui/v1/negociacoes?page=1&q=' + encodeURIComponent(p), { headers: { Accept: 'application/json' } })
    if (r.status === 401 || r.status === 419) throw new Error('sessão do AutoConf expirada')
    if (!r.ok) throw new Error('busca respondeu ' + r.status)
    const j = await r.json()
    const dados = (j && j.negociacoes && j.negociacoes.data) || []
    return dados.map((d) => ({
      id: d.id,
      tipo: d.tipo,
      status: d.status,
      etapa: d.etapa,
      criadoEm: d.criadoEm,
      cliente: d.cliente,
      responsavel: d.responsavel,
      veiculosEntrada: (d.veiculosEntrada || []).map((v) => v.placa),
      veiculosSaida: (d.veiculosSaida || []).map((v) => v.placa),
      url: 'https://app.autoconf.com.br/negociacao/' + d.id + '/contrato',
    }))
  }

  // Busca pelo nome do cliente — usada só quando a placa não achou a negociação
  // (placa digitada errado no formulário). Tenta o nome inteiro e o sobrenome,
  // porque o AutoConf costuma ter o nome completo e o formulário, o abreviado.
  async function buscarPorCliente(cliente) {
    const palavras = CORE.palavrasNome(cliente)
    if (!palavras.length) return []
    const sobrenome = palavras.slice(1).sort((a, b) => b.length - a.length)[0]
    const termos = [CORE.chave(cliente).trim(), sobrenome].filter(Boolean)
    const porId = new Map()
    for (const termo of [...new Set(termos)]) {
      const r = await fetch('/api/ui/v1/negociacoes?page=1&q=' + encodeURIComponent(termo), { headers: { Accept: 'application/json' } })
      if (!r.ok) continue
      const j = await r.json()
      for (const d of (j && j.negociacoes && j.negociacoes.data) || []) {
        if (!porId.has(d.id)) {
          porId.set(d.id, {
            id: d.id, tipo: d.tipo, status: d.status, etapa: d.etapa, criadoEm: d.criadoEm,
            cliente: d.cliente, responsavel: d.responsavel,
            veiculosEntrada: (d.veiculosEntrada || []).map((v) => v.placa),
            veiculosSaida: (d.veiculosSaida || []).map((v) => v.placa),
            url: 'https://app.autoconf.com.br/negociacao/' + d.id + '/contrato',
          })
        }
      }
      await new Promise((r2) => setTimeout(r2, 200))
    }
    return [...porId.values()]
  }

  // A aba Contratos não tem API JSON: os anexos são os itens da lista que
  // apontam para o S3 (os outros itens são os modelos que o AutoConf gera).
  async function anexosDe(negociacaoId) {
    const r = await fetch('/negociacao/' + negociacaoId + '/contrato', { headers: { Accept: 'text/html' } })
    if (!r.ok) throw new Error('contratos respondeu ' + r.status)
    const html = await r.text()
    if (paginaDeLogin(html)) throw new Error('sessão do AutoConf expirada')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const nomes = new Set()
    doc.querySelectorAll('a[href*="amazonaws"]').forEach((a) => {
      const item = a.closest('.list-group-item')
      const txt = (item ? item.innerText : a.innerText || '').replace(/\s+/g, ' ').trim()
      if (txt) nomes.add(txt.slice(0, 120))
    })
    return [...nomes]
  }

  function blobDeBase64(base64) {
    const bin = atob(base64)
    const buf = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
    return new Blob([buf], { type: 'application/pdf' })
  }

  async function anexar({ negociacaoId, nome, base64, arquivo, tipoDocumento, form }) {
    // O token vem da própria tela de anexo (é o mesmo da meta, mas confirma que
    // a sessão ainda vale e que a negociação aceita anexo).
    const rCreate = await fetch('/negociacao/' + negociacaoId + '/contrato/create', { headers: { Accept: 'text/html' } })
    if (!rCreate.ok) throw new Error('tela de anexo respondeu ' + rCreate.status)
    const htmlCreate = await rCreate.text()
    if (paginaDeLogin(htmlCreate)) throw new Error('sessão do AutoConf expirada')
    const docCreate = new DOMParser().parseFromString(htmlCreate, 'text/html')
    const formDom = docCreate.querySelector('form[action*="contrato/store"]')
    const token = (formDom && formDom.querySelector('input[name="_token"]') || {}).value || csrf()
    if (!token) throw new Error('não achei o token da tela de anexo')

    const fd = new FormData()
    fd.append('_token', token)
    fd.append('tipo_documento_id', tipoDocumento || CORE.TIPO_DOCUMENTO_OUTROS)
    fd.append('nome', String(nome).slice(0, 250))
    fd.append('documento_file', blobDeBase64(base64), arquivo)

    const r = await fetch('/negociacao/' + negociacaoId + '/contrato/store', { method: 'POST', body: fd })
    if (r.status === 419) throw new Error('token expirado (419) — recarregue a aba do AutoConf')
    if (!r.ok) throw new Error('anexo respondeu ' + r.status)

    // Confere no servidor: só damos como feito o que aparece na lista.
    const depois = await anexosDe(negociacaoId)
    const confirmado = CORE.jaAnexado(depois, form)
    if (!confirmado) throw new Error('o AutoConf aceitou o envio mas o anexo não apareceu na lista')
    return { anexos: depois }
  }

  chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    if (req && req.type === 'CHK_AC_PING') { sendResponse({ ok: true, versao: VERSAO, logado: !!csrf() }); return true }
    if (req && req.type === 'CHK_AC_BUSCA') {
      buscarPorPlaca(req.placa).then((c) => sendResponse({ ok: true, candidatas: c }))
        .catch((e) => sendResponse({ ok: false, erro: e.message || String(e) }))
      return true
    }
    if (req && req.type === 'CHK_AC_BUSCA_NOME') {
      buscarPorCliente(req.cliente).then((c) => sendResponse({ ok: true, candidatas: c }))
        .catch((e) => sendResponse({ ok: false, erro: e.message || String(e) }))
      return true
    }
    if (req && req.type === 'CHK_AC_ANEXOS') {
      anexosDe(req.negociacaoId).then((anexos) => sendResponse({ ok: true, anexos }))
        .catch((e) => sendResponse({ ok: false, erro: e.message || String(e) }))
      return true
    }
    if (req && req.type === 'CHK_AC_UPLOAD') {
      anexar(req).then((r) => sendResponse({ ok: true, ...r }))
        .catch((e) => sendResponse({ ok: false, erro: e.message || String(e) }))
      return true
    }
    return false
  })
})()
