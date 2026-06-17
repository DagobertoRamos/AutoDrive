// =============================================================================
// Testes do pipeline de extração (ramos determinísticos — sem libs de PDF).
// =============================================================================

import { describe, it, expect } from 'vitest'
import { extractDocumentText } from './extract-text'

const buf = (s: string) => Buffer.from(s, 'utf8')

describe('extractDocumentText', () => {
  it('texto puro → text_extracted', async () => {
    const r = await extractDocumentText(buf('Contrato de teste com conteúdo legível.'), 'text/plain')
    expect(r.status).toBe('text_extracted')
    expect(r.ok).toBe(true)
    expect(r.text).toContain('Contrato')
  })

  it('imagem → requires_ocr', async () => {
    const r = await extractDocumentText(Buffer.alloc(1000), 'image/png')
    expect(r.status).toBe('requires_ocr')
    expect(r.ok).toBe(false)
    expect(r.message.toLowerCase()).toContain('ocr')
  })

  it('arquivo vazio → corrupted', async () => {
    const r = await extractDocumentText(Buffer.alloc(0), 'application/pdf')
    expect(r.status).toBe('corrupted')
  })

  it('arquivo grande demais → too_large', async () => {
    const r = await extractDocumentText(Buffer.alloc(2048), 'application/pdf', { maxBytes: 1024 })
    expect(r.status).toBe('too_large')
  })

  it('tipo não suportado (docx) → unsupported', async () => {
    const r = await extractDocumentText(Buffer.alloc(500), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(r.status).toBe('unsupported')
  })

  it('sempre retorna mensagem clara e nunca lança', async () => {
    const r = await extractDocumentText(buf('x'), 'application/zip')
    expect(typeof r.message).toBe('string')
    expect(r.message.length).toBeGreaterThan(0)
  })
})
