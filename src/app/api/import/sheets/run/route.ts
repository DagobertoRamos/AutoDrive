import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sheetsImport } from '@/services/sheets-import.service'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })

    if (!['MASTER', 'ADM'].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const result = await sheetsImport.run()

    return NextResponse.json({ success: result.success, data: result })
  } catch (err) {
    console.error('[POST /api/import/sheets/run]', err)
    return NextResponse.json({ success: false, error: 'Erro ao executar importação' }, { status: 500 })
  }
}
