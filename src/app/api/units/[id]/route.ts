import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })

    if (!['MASTER', 'ADM', 'GERENTE'].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json()
    const { name, razaoSocial, cnpj, address, city, state, phone, email, responsavel, active } = body

    if (!name) {
      return NextResponse.json({ success: false, error: 'Nome é obrigatório' }, { status: 400 })
    }

    const unit = await prisma.unit.update({
      where: { id: params.id },
      data: {
        name:        String(name),
        razaoSocial: razaoSocial ? String(razaoSocial) : null,
        // Unit.cnpj é required no schema; só atualizamos se vier valor.
        ...(cnpj ? { cnpj: String(cnpj) } : {}),
        address:     address ? String(address) : null,
        city:        city ? String(city) : null,
        state:       state ? String(state) : null,
        phone:       phone ? String(phone) : null,
        email:       email ? String(email) : null,
        responsavel: responsavel ? String(responsavel) : null,
        active:      active !== undefined ? Boolean(active) : true,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId:   session.user.id,
        tenantId: session.user.tenantId ?? null,
        action:   'UPDATE',
        entity:   'Unit',
        entityId: params.id,
        userName: session.user.name,
        userRole: session.user.role,
        status:   'SUCCESS',
      },
    })

    return NextResponse.json({ success: true, data: unit })
  } catch (err) {
    console.error('[units PUT]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
