// =============================================================================
// GET /api/address/lookup-by-cep?cep=06000000
//
// Busca endereço por CEP. Hoje delega ao service central da BrasilAPI
// (que já cobre v2 com coordenadas e v1 como fallback) e, em última instância,
// faz fallback para ViaCEP — mantendo a tela funcionando se a BrasilAPI cair.
//
// Mantém compatibilidade com o consumidor antigo: retorna `{ data: {...} }`
// com os mesmos campos que o frontend já lê (logradouro/bairro/cidade/estado).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { normalizeCEP, isValidCEP } from '@/lib/br-docs/cep'
import { getCep } from '@/lib/brasilapi/service'

const VIACEP_URL = process.env.VIACEP_URL ?? 'https://viacep.com.br/ws'
const TIMEOUT_MS = Number(process.env.CEP_LOOKUP_TIMEOUT_MS ?? 5000)

interface CepPayload {
  cep:         string
  logradouro:  string
  complemento: string
  bairro:      string
  cidade:      string
  estado:      string
}

async function viaCepFallback(cep: string): Promise<CepPayload | null> {
  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${VIACEP_URL}/${cep}/json/`, {
      signal:  controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const d = await res.json()
    if (d?.erro) return null
    return {
      cep:         String(d.cep        ?? cep).replace(/\D/g, ''),
      logradouro:  String(d.logradouro ?? '').trim(),
      complemento: String(d.complemento ?? '').trim(),
      bairro:      String(d.bairro     ?? '').trim(),
      cidade:      String(d.localidade ?? '').trim(),
      estado:      String(d.uf         ?? '').toUpperCase().trim(),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 })

  const raw = req.nextUrl.searchParams.get('cep') ?? ''
  const cep = normalizeCEP(raw)
  if (!isValidCEP(cep)) {
    return NextResponse.json({ success: false, error: 'CEP inválido.' }, { status: 400 })
  }

  // 1) BrasilAPI (via service central, com cache 30 min)
  const ba = await getCep(cep)
  if (ba.ok && ba.data) {
    const d = ba.data
    return NextResponse.json({
      success: true,
      found:   true,
      source:  ba.source,
      // payload compatível com chamadores antigos
      logradouro:  d.street       ?? '',
      complemento: d.complement   ?? '',
      bairro:      d.neighborhood ?? '',
      cidade:      d.city         ?? '',
      estado:      d.state        ?? '',
      data: {
        cep:         String(d.cep ?? cep).replace(/\D/g, ''),
        logradouro:  d.street       ?? '',
        complemento: d.complement   ?? '',
        bairro:      d.neighborhood ?? '',
        cidade:      d.city         ?? '',
        estado:      d.state        ?? '',
      },
    })
  }

  // 2) Fallback ViaCEP — mantém tela funcionando se a BrasilAPI cair
  const via = await viaCepFallback(cep)
  if (via) {
    return NextResponse.json({
      success: true,
      found:   true,
      source:  'fallback',
      logradouro:  via.logradouro,
      complemento: via.complemento,
      bairro:      via.bairro,
      cidade:      via.cidade,
      estado:      via.estado,
      data:        via,
    })
  }

  return NextResponse.json(
    { success: false, found: false, error: 'CEP não encontrado. Preencha o endereço manualmente.' },
    { status: 404 },
  )
}
