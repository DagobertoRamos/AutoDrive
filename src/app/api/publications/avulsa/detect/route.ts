// POST /api/publications/avulsa/detect — identifica o tipo de carro do vídeo/foto.
// { image?: base64 JPEG (quadros do vídeo lado a lado, montados no navegador), hints?: nome do arquivo/título/observação }
// → { guess: { kind, model, brand, source, confidence, scene } | null, label }
// Ordem: IA de visão (se configurada) corrigida pela tabela de marcas/modelos;
// sem IA, as palavras do nome do arquivo/título.
import { NextResponse } from 'next/server'
import { runAiWithFailover } from '@/lib/ai/resolve-ai-provider'
import { bad, pubAuth } from '@/lib/publications/api'
import { CAR_KIND_LABEL, kindFromText, parseVision, visionPrompt, type KindGuess } from '@/lib/publications/social/caption-library-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as { image?: unknown; hints?: unknown }
  const hints = typeof b.hints === 'string' ? b.hints.slice(0, 600) : ''
  const image = typeof b.image === 'string' ? b.image.replace(/^data:image\/\w+;base64,/, '') : ''
  if (image && (image.length > 2_800_000 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200)))) return bad('Imagem inválida ou grande demais.')
  const byText = kindFromText(hints)
  let guess: KindGuess | null = null
  let note = ''
  if (image) {
    // Erro de cada provedor (o último da fila é o simulado, que esconderia o motivo real).
    const errs: string[] = []
    const r = await runAiWithFailover('social_caption', async (ai) => {
      if (ai.mock) throw new Error('nenhuma IA real configurada no Master › IA')
      try {
        if (!ai.adapter.capabilities.image) throw new Error('não lê imagens')
        const out = await ai.adapter.analyzeImage({ base64: image, mimeType: 'image/jpeg', prompt: visionPrompt() }, { ...ai.ctx, maxTokens: 300 })
        return parseVision(out.summary)
      } catch (e) { errs.push(`${ai.providerName}: ${(e as Error).message}`); throw e }
    })
    if (r.ok) guess = r.result
    else note = `IA de imagem indisponível (${(errs.join(' | ') || r.error).slice(0, 220)})`
  }
  // O nome do arquivo/título com marca reconhecida vale mais que um palpite fraco da IA.
  if (byText && (!guess || (byText.model && guess.confidence < 0.6))) guess = byText
  return NextResponse.json({ success: true, guess, label: guess ? CAR_KIND_LABEL[guess.kind] : null, note })
}
