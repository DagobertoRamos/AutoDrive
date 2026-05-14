// =============================================================================
// GET /api/address/lookup-by-cep?cep=06000000
//
// Busca endereço por CEP usando ViaCEP (serviço público, gratuito, legal).
// Toda consulta acontece no backend — nenhuma API key necessária.
//
// ViaCEP: https://viacep.com.br — dados públicos dos Correios, LGPD adequado.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { normalizeCEP, isValidCEP } from '@/lib/br-docs/cep'

const VIACEP_URL   = process.env.VIACEP_URL   ?? 'https://viacep.com.br/ws'
const TIMEOUT_MS   = Number(process.env.CEP_LOOKUP_TIMEOUT_MS ?? 5000)

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 })
  }

  const raw = req.nextUrl.searchParams.get('cep') ?? ''
  const cep = normalizeCEP(raw)

  if (!isValidCEP(cep)) {
    return NextResponse.json({ success: false, error: 'CEP inválido.' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${VIACEP_URL}/${cep}/json/`, {
      signal:  controller.signal,
      headers: { 'Accept': 'application/json' },
    })

    if (!res.ok) {
      return NextResponse.json(
        { success: false, found: false, error: 'CEP não encontrado. Preencha o endereço manualmente.' },
        { status: 404 },
      )
    }

    const d = await res.json()

    // ViaCEP retorna { erro: true } quando não encontra
    if (d?.erro) {
      return NextResponse.json({
        success: true,
        found:   false,
        message: 'CEP não encontrado. Preencha o endereço manualmente.',
      })
    }

    return NextResponse.json({
      success: true,
      found:   true,
      data: {
        cep:         String(d.cep        ?? cep).replace(/\D/g, ''),
        logradouro:  String(d.logradouro ?? '').trim(),
        complemento: String(d.complemento ?? '').trim(),
        bairro:      String(d.bairro     ?? '').trim(),
        cidade:      String(d.localidade ?? '').trim(),
        estado:      String(d.uf         ?? '').toUpperCase().trim(),
      },
    })

  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return NextResponse.json(
        { success: false, found: false, error: 'Tempo limite excedido. Preencha o endereço manualmente.' },
        { status: 503 },
      )
    }
    return NextResponse.json(
      { success: false, found: false, error: 'Não foi possível consultar o CEP. Preencha manualmente.' },
      { status: 503 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
