// =============================================================================
// checklist.js — painel do "Checklist de entrega técnica".
//
// O painel não faz nada sozinho: manda o service worker rodar e fica lendo o
// estado/relatório do chrome.storage. Assim, se você fechar esta aba no meio,
// a rodada continua.
// =============================================================================
const $ = (id) => document.getElementById(id)
const enviar = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, (resp) => r(resp || { ok: false, erro: 'sem resposta do service worker' })))

let filtro = 'TODOS'
let relatorio = null
let form = 'entrega'

const DESCRICAO = {
  entrega: 'Acha a negociação em que a placa está <strong>na saída</strong> (veículo vendido) e anexa como <strong>“Check list de entrega tecnica assinado”</strong>. Placa digitada errado é resgatada pelo nome do cliente.',
  laudo: 'O formulário do laudo não tem cliente: vale a negociação <strong>mais próxima da data</strong>, compra ou venda. Anexa como <strong>“Protocolo de laudo - TIPO”</strong> (ECV, CAUTELAR ou AMBOS).',
}

const escapar = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function pintarResumo(r) {
  const z = r || { total: 0, anexados: 0, vaiSubir: 0, jaTinha: 0, revisar: 0, naoEncontradas: 0, erros: 0, pulados: 0 }
  $('c-total').textContent = z.total || 0
  $('c-anexados').textContent = z.anexados || 0
  $('c-vaisubir').textContent = z.vaiSubir || 0
  $('c-jatinha').textContent = z.jaTinha || 0
  $('c-revisar').textContent = z.revisar || 0
  $('c-erros').textContent = z.erros || 0
  $('c-naoencontradas').textContent = z.naoEncontradas || 0
  $('c-pulados').textContent = z.pulados || 0
}

function pintarLinhas() {
  const corpo = $('linhas')
  const todas = (relatorio && relatorio.linhas) || []
  const linhas = filtro === 'TODOS' ? todas : todas.filter((l) => l.resultado === filtro)
  if (!linhas.length) {
    corpo.innerHTML = '<tr><td colspan="7" class="mini">Nada nesta visão.</td></tr>'
    return
  }
  corpo.innerHTML = linhas.map((l) => {
    const neg = l.negociacaoId
      ? '<a href="' + escapar(l.urlNegociacao || ('https://app.autoconf.com.br/negociacao/' + l.negociacaoId + '/contrato')) + '" target="_blank">#' + escapar(l.negociacaoId) + '</a>'
      : '—'
    const extra = l.candidatas && l.candidatas.length ? '<br><span class="mini">candidatas: ' + escapar(l.candidatas.join(' | ')) + '</span>' : ''
    const conf = l.confianca === 'media' ? ' <span class="mini">(confiança média)</span>' : ''
    return '<tr>'
      + '<td><strong>' + escapar(l.placa || l.placaCrua || '—') + '</strong></td>'
      + '<td>' + escapar(l.dataEnvio || '') + '</td>'
      + '<td>' + escapar(l.cliente || '') + '</td>'
      + '<td><span class="tag t-' + escapar(l.resultado) + '">' + escapar(l.resultado.replace(/_/g, ' ')) + '</span>' + conf + '</td>'
      + '<td>' + neg + '</td>'
      + '<td>' + escapar((l.motivo ? l.motivo + ': ' : '') + (l.detalhe || '')) + extra + '</td>'
      + '<td><a href="' + escapar(l.urlEnvio) + '" target="_blank">abrir</a></td>'
      + '</tr>'
  }).join('')
}

async function carregarRelatorio() {
  const r = await enviar({ type: 'chkRelatorio', form })
  relatorio = r && r.relatorio ? r.relatorio : null
  pintarResumo(relatorio && relatorio.resumo)
  pintarLinhas()
}

async function pintarEstado() {
  const r = await enviar({ type: 'chkEstado' })
  const e = (r && r.estado) || { rodando: false }
  const rodando = !!e.rodando
  $('simular').disabled = rodando
  $('subir').disabled = rodando
  $('parar').disabled = !rodando
  const pct = e.total ? Math.round((e.feitos / e.total) * 100) : 0
  $('progresso').style.width = (rodando ? pct : 0) + '%'
  if (rodando) {
    $('estado').textContent = (e.dryRun ? 'Simulando' : 'Subindo') + ': ' + e.feitos + ' de ' + e.total + ' — ' + (e.etapa || '')
  } else if (e.erro && e.form === form) {
    $('estado').textContent = 'A última rodada falhou: ' + e.erro
  } else if (relatorio) {
    const quando = new Date(relatorio.em).toLocaleString('pt-BR')
    $('estado').textContent = (relatorio.erro ? 'Parou com erro: ' + relatorio.erro + ' — ' : '')
      + 'última rodada ' + (relatorio.dryRun ? '(simulação) ' : '(anexando) ') + 'em ' + quando + '.'
  } else {
    $('estado').textContent = 'Pronto.'
  }
  return rodando
}

async function acompanhar() {
  const rodando = await pintarEstado()
  await carregarRelatorio()
  if (rodando) setTimeout(acompanhar, 1500)
}

async function rodar(dryRun) {
  const desde = $('desde').value || ''
  const limite = Number($('limite').value) || 0
  if (!dryRun) {
    const quantos = relatorio && relatorio.resumo ? relatorio.resumo.vaiSubir : null
    const rotulo = form === 'laudo' ? 'protocolo(s) de laudo' : 'checklist(s) de entrega'
    const texto = quantos != null && relatorio.dryRun
      ? 'Vou anexar ' + quantos + ' ' + rotulo + ' no AutoConf. Confirma?'
      : 'Vou anexar no AutoConf todos os ' + rotulo + ' pendentes que casarem com uma negociação. Confirma?'
    if (!confirm(texto)) return
  }
  $('estado').textContent = 'Iniciando…'
  // A resposta só diz se a rodada ARRANCOU (ela continua no service worker).
  // Sem mostrar isso, um "já tem uma rodada em andamento" ou um módulo que não
  // carregou viravam silêncio no painel.
  const inicio = await enviar({ type: 'chkRodar', form, dryRun, desde, limite })
  if (!inicio || inicio.ok === false) {
    $('estado').textContent = 'Não consegui iniciar: ' + (inicio && (inicio.erro || inicio.error) || 'sem resposta do service worker')
    return
  }
  setTimeout(acompanhar, 800)
}

function baixarCsv() {
  const linhas = (relatorio && relatorio.linhas) || []
  if (!linhas.length) return
  const cols = ['placa', 'dataEnvio', 'cliente', 'veiculo', 'tipo', 'vendedor', 'resultado', 'motivo', 'negociacaoId', 'detalhe', 'urlEnvio']
  const csv = [cols.join(';')].concat(linhas.map((l) => cols.map((c) => '"' + String(l[c] == null ? '' : l[c]).replace(/"/g, '""') + '"').join(';'))).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = (form === 'laudo' ? 'protocolos-laudo-' : 'checklists-entrega-') + new Date().toISOString().slice(0, 10) + '.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

document.addEventListener('DOMContentLoaded', async () => {
  $('descricao').innerHTML = DESCRICAO[form]
  $('simular').addEventListener('click', () => rodar(true))
  $('subir').addEventListener('click', () => rodar(false))
  $('parar').addEventListener('click', async () => { await enviar({ type: 'chkParar' }); $('estado').textContent = 'Parando após o item atual…' })
  $('csv').addEventListener('click', baixarCsv)
  $('limpar').addEventListener('click', async () => {
    if (!confirm('Isso só apaga a memória da extensão para este formulário (o que ela já processou). Nada é removido do AutoConf. Continuar?')) return
    await enviar({ type: 'chkLimparHistorico', form })
    $('estado').textContent = 'Histórico limpo — a próxima rodada reavalia tudo.'
  })
  document.querySelectorAll('.abas button[data-form]').forEach((b) => {
    b.addEventListener('click', async () => {
      form = b.dataset.form
      document.querySelectorAll('.abas button[data-form]').forEach((o) => o.classList.toggle('on', o === b))
      $('descricao').innerHTML = DESCRICAO[form]
      relatorio = null
      await acompanhar()
    })
  })
  document.querySelectorAll('.filtros button[data-f]').forEach((b) => {
    b.addEventListener('click', () => {
      filtro = b.dataset.f
      document.querySelectorAll('.filtros button[data-f]').forEach((o) => o.classList.toggle('on', o === b))
      pintarLinhas()
    })
  })
  $('salvarAuto').addEventListener('click', async () => {
    await enviar({ type: 'chkSalvarConfig', config: { autoLigado: $('auto').checked, horas: Number($('horas').value) || 24 } })
    $('ultimaAuto').textContent = $('auto').checked
      ? 'Rotina ligada: roda a cada ' + ($('horas').value || 24) + 'h.'
      : 'Rotina desligada.'
  })

  const cfg = await enviar({ type: 'chkConfig' })
  if (cfg && cfg.config) {
    $('auto').checked = cfg.config.autoLigado === true
    $('horas').value = cfg.config.horas || 24
  }
  if (cfg && cfg.ultimaAuto) {
    const u = cfg.ultimaAuto
    const partes = Object.entries(u.resultados || {}).map(([k, v]) => k + ': ' + (v.ok ? ((v.resumo && v.resumo.anexados) || 0) + ' anexado(s)' : 'falhou — ' + (v.erro || '')))
    $('ultimaAuto').textContent = 'Última rodada automática: ' + new Date(u.em).toLocaleString('pt-BR')
      + (partes.length ? ' — ' + partes.join(' | ') : '')
  }
  acompanhar()
})
