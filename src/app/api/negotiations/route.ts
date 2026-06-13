// =============================================================================
// /api/negotiations — Listar e criar negociações
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { requireModule }        from '@/lib/permissions'
import { handlePrismaError }    from '@/lib/prisma-errors'

// ── GET — Listar negociações ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  try {
    const { searchParams } = req.nextUrl
    const search = searchParams.get('search') ?? ''
    const type   = searchParams.get('type')   ?? ''
    const status = searchParams.get('status') ?? ''
    const unitId = searchParams.get('unitId') ?? ''
    const page   = Math.max(1, Number(searchParams.get('page') ?? 1))
    const take   = 50

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}

    // Isolamento por tenant
    if (session.user.tenantId) where.tenantId = session.user.tenantId

    // Filtro de unidade — opcional. VENDEDOR sempre limitado à própria unidade.
    if (session.user.role === 'VENDEDOR' && session.user.unitId) {
      where.unitId = session.user.unitId
    } else if (unitId) {
      where.unitId = unitId
    }

    // Vendedores veem apenas suas próprias negociações
    if (session.user.role === 'VENDEDOR') {
      const seller = await prisma.seller.findUnique({
        where:  { userId: session.user.id },
        select: { id: true },
      })
      // Sem cadastro de vendedor → nenhuma negociação própria
      if (!seller) return NextResponse.json({ data: [], pagination: { page, total: 0, totalPages: 0, limit: take } })
      where.sellerId = seller.id
    }

    if (type)   where.type   = type
    if (status) where.status = status

    if (search) {
      where.OR = [
        { person: { nomeCompleto: { contains: search, mode: 'insensitive' } } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { dealNumber: { contains: search, mode: 'insensitive' } },
        { seller: { user: { name: { contains: search, mode: 'insensitive' } } } },
      ]
    }

    const [deals, total, typeCounts, statusCounts] = await Promise.all([
      prisma.deal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * take,
        take,
        select: {
          id:                  true,
          dealNumber:          true,
          type:                true,
          status:              true,
          source:              true,
          isSellerProvisional: true,
          saleAmount:          true,
          totalPayments:       true,
          vehicleValue:        true,
          createdAt:           true,
          person:   { select: { nomeCompleto: true } },
          customer: { select: { name: true } },
          seller:   { select: { fullName: true, user: { select: { name: true } } } },
          sellerNameFromSheet: true,
          vehicles: {
            take:    1,
            orderBy: { createdAt: 'asc' },
            select:  { plate: true, brand: true, model: true, year: true, role: true },
          },
        },
      }),
      prisma.deal.count({ where }),
      prisma.deal.groupBy({
        by:    ['type'],
        where,
        _count: { _all: true },
      }),
      prisma.deal.groupBy({
        by:    ['status'],
        where,
        _count: { _all: true },
      }),
    ])

    // Converte groupBy em mapa { VENDA: N, COMPRA: N, ... }
    const byType = typeCounts.reduce<Record<string, number>>((acc, row) => {
      acc[row.type] = row._count._all
      return acc
    }, {})

    const byStatus = statusCounts.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all
      return acc
    }, {})

    return NextResponse.json({
      data:       deals,
      pagination: { page, total, totalPages: Math.ceil(total / take), limit: take },
      byType,
      byStatus,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — Criar negociação ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  try {
    const body = await req.json()
    const {
      type, person, customer, personId: bodyPersonId,
      // Localização
      unitId: bodyUnitId, sellerId: bodySellerId,
      vehicle, tradeInVehicle,
      // Valores
      saleAmount, purchaseAmount, financedAmount, documentationFee,
      signalAmount, payoffAmount, discountAmount, paymentBank, paymentType,
      consignMinValue, consignCommPct, consignDeadline,
      vehicleValue, tradeValue, totalPayments, changeAmount,
      // Dados bancários do cliente (compra)
      changeBeneficiary, changeBeneficiaryCpf, changeBank, changeAgency, changeAccount, changePix,
      // Agendamento
      deliveryDate,
      // Débitos do wizard (array criado de uma vez com a negociação)
      debts,
      // Pagamentos cadastrados no wizard
      payments,
      // Geral
      notes, submit,
    } = body

    if (!type) {
      return NextResponse.json({ error: 'Tipo da negociação é obrigatório.' }, { status: 400 })
    }
    if (!bodyPersonId && !person?.nomeCompleto && !customer?.name) {
      return NextResponse.json({ error: 'Cliente é obrigatório.' }, { status: 400 })
    }

    // ── Validação de campos obrigatórios PF/PJ (apenas quando cadastro novo) ──
    // bodyPersonId pula validação (cadastro já existente).
    if (!bodyPersonId && person && submit) {
      const errors: string[] = []
      const isPJ = person.type === 'JURIDICA'

      // Comum: contato e endereço
      if (!person.phone || person.phone.replace(/\D/g, '').length < 10)
        errors.push('Celular é obrigatório.')
      if (!person.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email))
        errors.push('E-mail é obrigatório e deve ser válido.')
      if (!person.cep || person.cep.replace(/\D/g, '').length !== 8)
        errors.push('CEP é obrigatório.')
      if (!person.logradouro) errors.push('Logradouro é obrigatório.')
      if (!person.numero)     errors.push('Número é obrigatório.')
      if (!person.bairro)     errors.push('Bairro é obrigatório.')
      if (!person.cidade)     errors.push('Cidade é obrigatória.')
      if (!person.estado)     errors.push('Estado é obrigatório.')

      if (isPJ) {
        if (!person.cnpj || person.cnpj.replace(/\D/g, '').length !== 14)
          errors.push('CNPJ é obrigatório.')
        if (!person.razaoSocial) errors.push('Razão social é obrigatória.')
        // Responsável Legal completo (PF)
        if (!person.socioAdmCpf || person.socioAdmCpf.replace(/\D/g, '').length !== 11)
          errors.push('CPF do responsável legal é obrigatório.')
        if (!person.socioAdmNome)
          errors.push('Nome completo do responsável legal é obrigatório.')
        if (!person.socioAdmRg)
          errors.push('RG do responsável legal é obrigatório.')
        if (!person.socioAdmDataNascimento)
          errors.push('Data de nascimento do responsável legal é obrigatória.')
        if (!person.socioAdmEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.socioAdmEmail))
          errors.push('E-mail do responsável legal é obrigatório e deve ser válido.')
        if (!person.socioAdmPhone || person.socioAdmPhone.replace(/\D/g, '').length < 10)
          errors.push('Celular do responsável legal é obrigatório.')
        if (!person.socioAdmCep || person.socioAdmCep.replace(/\D/g, '').length !== 8)
          errors.push('CEP do responsável legal é obrigatório.')
        if (!person.socioAdmLogradouro) errors.push('Logradouro do responsável legal é obrigatório.')
        if (!person.socioAdmNumero)     errors.push('Número do responsável legal é obrigatório.')
        if (!person.socioAdmBairro)     errors.push('Bairro do responsável legal é obrigatório.')
        if (!person.socioAdmCidade)     errors.push('Cidade do responsável legal é obrigatória.')
        if (!person.socioAdmEstado)     errors.push('Estado do responsável legal é obrigatório.')
      } else {
        if (!person.cpf || person.cpf.replace(/\D/g, '').length !== 11)
          errors.push('CPF é obrigatório.')
        if (!person.nomeCompleto) errors.push('Nome completo é obrigatório.')
        if (!person.rg) errors.push('RG é obrigatório.')
        if (!person.dataNascimento) errors.push('Data de nascimento é obrigatória.')
      }

      if (errors.length > 0) {
        return NextResponse.json(
          { error: errors[0], errors },
          { status: 400 },
        )
      }
    }

    // ── Resolução segura de unitId ──────────────────────────────────────────────
    // Aceita do body apenas se a unidade pertencer ao tenant da sessão.
    // Cai de volta para session.user.unitId quando não fornecido/inválido.
    let resolvedUnitId: string | null = session.user.unitId ?? null
    if (bodyUnitId && typeof bodyUnitId === 'string') {
      const unit = await prisma.unit.findFirst({
        where:  { id: bodyUnitId, tenantId: session.user.tenantId ?? undefined },
        select: { id: true },
      })
      if (unit) resolvedUnitId = unit.id
    }

    // ── Resolução segura de sellerId ────────────────────────────────────────────
    // VENDEDOR só pode usar o próprio cadastro (ignora body.sellerId).
    // GERENTE+/ADM pode escolher qualquer vendedor da unidade.
    const ownSeller = await prisma.seller.findUnique({
      where:  { userId: session.user.id },
      select: { id: true },
    })

    let resolvedSellerId: string | null = ownSeller?.id ?? null
    if (bodySellerId && typeof bodySellerId === 'string' && session.user.role !== 'VENDEDOR') {
      const sel = await prisma.seller.findFirst({
        where: {
          id: bodySellerId,
          ...(resolvedUnitId      ? { unitId:   resolvedUnitId } : {}),
          ...(session.user.tenantId ? { tenantId: session.user.tenantId } : {}),
        },
        select: { id: true },
      })
      if (sel) resolvedSellerId = sel.id
    }

    const result = await prisma.$transaction(async (tx) => {
      let personId: string | null = null

      // 1) Reuso: se o wizard já vinculou um Person existente, valida tenant e usa.
      if (bodyPersonId) {
        const existing = await tx.person.findFirst({
          where:  { id: bodyPersonId, tenantId: session.user.tenantId ?? undefined },
          select: { id: true },
        })
        if (existing) personId = existing.id
      }

      // 2) Caso contrário, cria/atualiza por documento.
      if (!personId && person?.nomeCompleto) {
        let personRecord = null
        if (person.cpf || person.cnpj) {
          personRecord = await tx.person.findFirst({
            where: {
              tenantId: session.user.tenantId ?? undefined,
              OR: [
                person.cpf  ? { cpf:  person.cpf  } : undefined,
                person.cnpj ? { cnpj: person.cnpj } : undefined,
              ].filter(Boolean) as object[],
            },
          })
        }

        // Campos extras do sócio adm (RG/data nasc/endereço) ainda não têm coluna
        // dedicada — guardamos como JSON no notes para preservar sem perder a UI.
        const socioAdmExtras = person.type === 'JURIDICA' ? {
          socioAdmRg:             person.socioAdmRg             ?? null,
          socioAdmDataNascimento: person.socioAdmDataNascimento ?? null,
          socioAdmCep:            person.socioAdmCep            ?? null,
          socioAdmLogradouro:     person.socioAdmLogradouro     ?? null,
          socioAdmNumero:         person.socioAdmNumero         ?? null,
          socioAdmComplemento:    person.socioAdmComplemento    ?? null,
          socioAdmBairro:         person.socioAdmBairro         ?? null,
          socioAdmCidade:         person.socioAdmCidade         ?? null,
          socioAdmEstado:         person.socioAdmEstado         ?? null,
        } : null
        const hasSocioExtras = socioAdmExtras &&
          Object.values(socioAdmExtras).some((v) => v != null && v !== '')
        const notesJson = hasSocioExtras
          ? `__socioAdmExtras__=${JSON.stringify(socioAdmExtras)}`
          : null

        if (!personRecord) {
          personRecord = await tx.person.create({
            data: {
              tenantId:          session.user.tenantId ?? null,
              type:              person.type   ?? 'FISICA',
              cpf:               person.cpf    ?? null,
              cnpj:              person.cnpj   ?? null,
              nomeCompleto:      person.nomeCompleto,
              rg:                person.rg              ?? null,
              dataNascimento:    person.dataNascimento
                                   ? new Date(person.dataNascimento) : null,
              nomeMae:           person.nomeMae           ?? null,
              razaoSocial:       person.razaoSocial       ?? null,
              nomeFantasia:      person.nomeFantasia      ?? null,
              inscricaoEstadual: person.inscricaoEstadual ?? null,
              socioAdmNome:      person.socioAdmNome      ?? null,
              socioAdmCpf:       person.socioAdmCpf       ?? null,
              socioAdmPhone:     person.socioAdmPhone     ?? null,
              socioAdmNomeMae:   person.socioAdmNomeMae   ?? null,
              socioAdmEmail:     person.socioAdmEmail     ?? null,
              socioAdmWhatsapp:  person.socioAdmWhatsapp  ?? false,
              email:             person.email   ?? null,
              phone:             person.phone   ?? null,
              whatsapp:          person.whatsapp ?? false,
              cep:               person.cep        ?? null,
              logradouro:        person.logradouro ?? null,
              numero:            person.numero     ?? null,
              complemento:       person.complemento ?? null,
              bairro:            person.bairro     ?? null,
              cidade:            person.cidade     ?? null,
              estado:            person.estado     ?? null,
              notes:             notesJson,
            },
          })
        }
        personId = personRecord.id
      }

      const count = await tx.deal.count({ where: { tenantId: session.user.tenantId ?? undefined } })
      const dealNumber    = `NEG-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`
      const initialStatus = submit ? 'AGUARDANDO_APROVACAO' : 'RASCUNHO'

      const deal = await tx.deal.create({
        data: {
          dealNumber,
          tenantId: session.user.tenantId ?? null,
          unitId:   resolvedUnitId,
          sellerId: resolvedSellerId,
          personId,
          type,
          status:     initialStatus,
          source:     'MANUAL',
          // Financeiro
          saleAmount:       saleAmount        ? Number(saleAmount)       : null,
          purchaseAmount:   purchaseAmount    ? Number(purchaseAmount)   : null,
          financedAmount:   financedAmount    ? Number(financedAmount)   : null,
          documentationFee: documentationFee  ? Number(documentationFee) : null,
          signalAmount:     signalAmount      ? Number(signalAmount)     : null,
          payoffAmount:     payoffAmount      ? Number(payoffAmount)     : null,
          discountAmount:   discountAmount    ? Number(discountAmount)   : null,
          paymentBank:      paymentBank       ?? null,
          paymentType:      paymentType       ?? null,
          // Legado / calculados
          vehicleValue:  vehicleValue  ? Number(vehicleValue)  : saleAmount  ? Number(saleAmount)  : null,
          tradeValue:    tradeValue    ? Number(tradeValue)    : null,
          totalPayments: totalPayments ? Number(totalPayments) : null,
          changeAmount:  changeAmount  ? Number(changeAmount)  : null,
          // Agendamento
          deliveryDate: deliveryDate   ? new Date(deliveryDate) : null,
          // Troco/Dados bancários
          changeBeneficiary:    changeBeneficiary    ?? null,
          changeBeneficiaryCpf: changeBeneficiaryCpf ?? null,
          changeBank:           changeBank           ?? null,
          changeAgency:         changeAgency         ?? null,
          changeAccount:        changeAccount        ?? null,
          changePix:            changePix            ?? null,
          // Consignação
          consignMinValue:  consignMinValue  ? Number(consignMinValue)  : null,
          consignCommPct:   consignCommPct   ? Number(consignCommPct)   : null,
          consignDeadline:  consignDeadline  ? new Date(consignDeadline): null,
          notes: notes ?? null,
        } as never,
      })

      const vehicleRoleMap: Record<string, string> = {
        VENDA: 'VENDIDO', COMPRA: 'COMPRADO', TROCA: 'VENDIDO', CONSIGNACAO: 'CONSIGNADO',
      }

      if (vehicle?.plate || vehicle?.brand || vehicle?.vehicleId) {
        // Se o usuário selecionou veículo do estoque, usa o ID diretamente
        let vehicleId: string | null = vehicle?.vehicleId ?? null

        if (!vehicleId) {
          // Tenta localizar por placa existente
          let vehicleRecord = vehicle.plate
            ? await tx.vehicle.findFirst({
                where: { tenantId: session.user.tenantId ?? undefined, plate: vehicle.plate.toUpperCase() },
              })
            : null

          if (!vehicleRecord) {
            vehicleRecord = await tx.vehicle.create({
              data: {
                tenantId: session.user.tenantId ?? null,
                unitId:   resolvedUnitId,
                plate:    vehicle.plate?.toUpperCase() ?? null,
                brand:    vehicle.brand  ?? null,
                model:    vehicle.model  ?? null,
                year:     vehicle.year   ? Number(vehicle.year) : null,
                color:    vehicle.color  ?? null,
                km:       vehicle.km     ? Number(vehicle.km)   : null,
              },
            })
          }
          vehicleId = vehicleRecord.id
        }

        // ── Guard: impede duplicidade de venda do mesmo veículo ───────────
        // Pra VENDA/TROCA, recusa se o veículo já está em outra negociação
        // ativa (qualquer status que não seja terminal). Mensagem clara
        // pro vendedor saber quem está com o carro.
        if (vehicleId && (type === 'VENDA' || type === 'TROCA')) {
          const OPEN = ['AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO',
            'APROVADA', 'LIBERADA', 'SINAL_RECEBIDO', 'RESERVADA',
            'AGUARDANDO_FINANCEIRO', 'FINANCEIRO_APROVADO',
            'AGUARDANDO_DOCUMENTACAO', 'DOCUMENTACAO_CONCLUIDA',
            'AGUARDANDO_CONTRATO', 'CONTRATO_GERADO',
            'AGUARDANDO_ASSINATURA', 'ASSINADA',
            'AGUARDANDO_ENTREGA', 'ENTREGUE', 'EM_ANDAMENTO', 'FINALIZADA']
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const conflict: any = await tx.dealVehicle.findFirst({
            where: {
              vehicleId,
              role:  { in: ['VENDIDO', 'CONSIGNADO'] },
              deal:  { status: { in: OPEN as never[] } },
            },
            select: {
              deal: {
                select: {
                  id: true, dealNumber: true, status: true,
                  seller: { select: { fullName: true, shortName: true } },
                },
              },
            },
          })
          if (conflict?.deal) {
            const APPROVED = new Set(OPEN.filter((s) => s !== 'AGUARDANDO_APROVACAO' && s !== 'AGUARDANDO_LIBERACAO'))
            const sellerLbl = conflict.deal.seller?.shortName ?? conflict.deal.seller?.fullName ?? 'outro vendedor'
            const negLbl    = conflict.deal.dealNumber ?? conflict.deal.id.slice(0, 8)
            const msg = APPROVED.has(conflict.deal.status)
              ? `Este veículo não está mais disponível. Venda já liberada pelo gerente na negociação ${negLbl}.`
              : `Este veículo já está em negociação pelo vendedor ${sellerLbl} (negociação ${negLbl}).`
            throw new Error(msg)
          }
        }

        await tx.dealVehicle.create({
          data: {
            dealId:    deal.id,
            vehicleId,
            role:      vehicleRoleMap[type] ?? 'VENDIDO',
            plate:     vehicle.plate?.toUpperCase() ?? null,
            brand:     vehicle.brand  ?? null,
            model:     vehicle.model  ?? null,
            year:      vehicle.year   ? Number(vehicle.year) : null,
            color:     vehicle.color  ?? null,
            km:        vehicle.km     ? Number(vehicle.km)   : null,
            agreedValue: saleAmount || purchaseAmount
              ? Number(saleAmount ?? purchaseAmount ?? 0) : null,
          } as never,
        })

        // Marca veículo do estoque como EM_NEGOCIACAO
        if (vehicle?.vehicleId && (type === 'VENDA' || type === 'TROCA')) {
          await tx.vehicle.update({
            where: { id: vehicle.vehicleId },
            data:  { stockStatus: 'EM_NEGOCIACAO' as never },
          }).catch(() => {})
        }
      }

      // 5. Veículo de troca (TROCA)
      if (type === 'TROCA' && tradeInVehicle?.plate) {
        // ── Guard duplicidade: avaliação não pode entrar em 2 trocas ativas
        if (tradeInVehicle.evaluationId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ev: any = await (tx as any).vehicleEvaluation.findUnique({
            where:  { id: tradeInVehicle.evaluationId },
            select: {
              id: true, status: true, result: true,
              customerDecision: true, availableFor: true,
              cancelledAt: true, proposalValidUntil: true,
            },
          })
          if (!ev) {
            throw new Error('Avaliação informada não foi encontrada.')
          }
          // Reusa o helper canEvaluationVehicleBeUsed pra mensagem consistente
          // (não importa aqui pra evitar ciclo — duplica a checagem mínima).
          if (ev.cancelledAt)
            throw new Error('Este veículo avaliado não está disponível para troca. Avaliação cancelada.')
          const releasedOk = ['LIBERADA', 'APROVADO', 'APPROVED', 'FINALIZED'].includes(
            (ev.status ?? ev.result ?? '').toUpperCase(),
          ) || (ev.result ?? '').toUpperCase() === 'APROVADO'
          if (!releasedOk)
            throw new Error('Este veículo avaliado não está disponível para troca. Proposta ainda não liberada pelo gerente.')
          const decision = (ev.customerDecision ?? 'PENDENTE').toUpperCase()
          if (decision !== 'ACEITA')
            throw new Error('Este veículo avaliado não está disponível para troca. Cliente ainda não aceitou a proposta.')
          const af = (ev.availableFor ?? '').toUpperCase()
          if (af && !af.split(',').map((s: string) => s.trim()).includes('TROCA'))
            throw new Error('Este veículo avaliado não está disponível para troca. Liberação do gerente é para outra operação.')
          // Já vinculada a deal ativo?
          const OPEN = ['AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO',
            'APROVADA', 'LIBERADA', 'SINAL_RECEBIDO', 'RESERVADA',
            'AGUARDANDO_FINANCEIRO', 'FINANCEIRO_APROVADO',
            'AGUARDANDO_DOCUMENTACAO', 'DOCUMENTACAO_CONCLUIDA',
            'AGUARDANDO_CONTRATO', 'CONTRATO_GERADO',
            'AGUARDANDO_ASSINATURA', 'ASSINADA',
            'AGUARDANDO_ENTREGA', 'ENTREGUE', 'EM_ANDAMENTO', 'FINALIZADA']
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const conflict: any = await tx.dealVehicle.findFirst({
            where: {
              role:  'TROCA',
              plate: tradeInVehicle.plate.toUpperCase(),
              deal:  { status: { in: OPEN as never[] } },
            },
            select: { deal: { select: { id: true, dealNumber: true } } },
          })
          if (conflict?.deal) {
            const neg = conflict.deal.dealNumber ?? conflict.deal.id.slice(0, 8)
            throw new Error(`Este veículo avaliado já está vinculado à negociação ${neg}.`)
          }
        }

        await tx.dealVehicle.create({
          data: {
            dealId:        deal.id,
            role:          'TROCA',
            plate:         tradeInVehicle.plate?.toUpperCase()  ?? null,
            brand:         tradeInVehicle.brand  ?? null,
            model:         tradeInVehicle.model  ?? null,
            year:          tradeInVehicle.year   ? Number(tradeInVehicle.year)  : null,
            color:         tradeInVehicle.color  ?? null,
            km:            tradeInVehicle.km     ? Number(tradeInVehicle.km)    : null,
            condition:     tradeInVehicle.condition ?? null,
            agreedValue:   tradeInVehicle.agreedValue   ? Number(tradeInVehicle.agreedValue)   : null,
            evaluatedValue:tradeInVehicle.evaluatedValue ? Number(tradeInVehicle.evaluatedValue): null,
            fipeValue:     tradeInVehicle.fipeValue      ? Number(tradeInVehicle.fipeValue)     : null,
            hasFinancing:  tradeInVehicle.hasFinancing   ?? false,
            payoffValue:   tradeInVehicle.payoffValue    ? Number(tradeInVehicle.payoffValue)   : null,
            payoffBank:    tradeInVehicle.payoffBank     ?? null,
            notes:         tradeInVehicle.notes          ?? null,
          } as never,
        })
      }

      // 6. Débitos do wizard (array opcional)
      if (Array.isArray(debts) && debts.length > 0) {
        await (tx.dealDebt as any).createMany({
          data: debts.map((d: {
            vehicleRole?: string
            type: string
            description?: string
            value: number
            responsavel?: string
            notes?: string
          }) => ({
            dealId:      deal.id,
            vehicleRole: d.vehicleRole ?? null,
            type:        d.type,
            description: d.description ?? null,
            value:       Number(d.value),
            responsavel: d.responsavel ?? 'LOJA',
            notes:       d.notes       ?? null,
          })),
        })
      }

      // 6.5. Pagamentos do wizard (array opcional)
      if (Array.isArray(payments) && payments.length > 0) {
        const isVendedor = ['VENDEDOR', 'VENDEDOR_LIDER'].includes(session.user.role)
        await (tx.dealPayment as any).createMany({
          data: payments.map((p: any) => {
            // Sanitiza retorno % pra 0..6 com 2 casas
            let returnPct: number | null = null
            if (p.returnPct != null && p.returnPct !== '') {
              const n = Number(p.returnPct)
              if (Number.isFinite(n)) returnPct = Math.min(6, Math.max(0, Math.round(n * 100) / 100))
            }
            // Vendedor só pode mandar PENDENTE
            const rawStatus = typeof p.status === 'string' ? p.status.toUpperCase() : null
            const status    = isVendedor
              ? 'PENDENTE'
              : (['PENDENTE', 'CONFIRMADO', 'CANCELADO'].includes(rawStatus ?? '') ? rawStatus : 'PENDENTE')

            return {
              dealId:                  deal.id,
              tenantId:                session.user.tenantId ?? null,
              type:                    String(p.type ?? 'OUTROS').toUpperCase(),
              status,
              value:                   Number(p.amount ?? p.value ?? 0),
              bank:                    p.bank      || null,
              cardBrand:               p.cardBrand || null,
              pixKey:                  p.pixKey    || null,
              agency:                  p.agency    || null,
              account:                 p.account   || null,
              installments:            p.installments ? Number(p.installments) : null,
              installmentValue:        p.installmentValue != null && p.installmentValue !== '' ? Number(p.installmentValue) : null,
              installmentIntervalDays: p.installmentIntervalDays ? Number(p.installmentIntervalDays) : null,
              returnPct,
              vehiclePlate:            p.vehiclePlate || null,
              firstDueDate:            p.firstDueDate ? new Date(p.firstDueDate) : null,
              dueDate:                 p.dueDate      ? new Date(p.dueDate)      : null,
              paidAt:                  p.paidAt       ? new Date(p.paidAt)       : null,
              notes:                   p.notes || null,
              createdById:             session.user.id,
            }
          }),
        })
      }

      // 6.6. Troco (se cadastrado no wizard com beneficiário)
      if (changeAmount && Number(changeAmount) > 0 && (changeBeneficiary || changePix || changeBank)) {
        await (tx.dealChange as any).create({
          data: {
            dealId:      deal.id,
            tenantId:    session.user.tenantId ?? null,
            value:       Number(changeAmount),
            beneficiary: changeBeneficiary || 'Cliente',
            document:    changeBeneficiaryCpf || null,
            bank:        changeBank    || null,
            agency:      changeAgency  || null,
            account:     changeAccount || null,
            pixKey:      changePix     || null,
            createdById: session.user.id,
          },
        })
      }

      // 7. Histórico inicial
      await tx.dealStatusHistory.create({
        data: {
          dealId:          deal.id,
          previousStatus:  null,
          newStatus:       initialStatus,
          changedByUserId: session.user.id,
          reason:          submit ? 'Criada e enviada para aprovação' : 'Negociação criada',
        },
      })

      // 8. Auditoria
      await tx.auditLog.create({
        data: {
          userId:   session.user.id,
          tenantId: session.user.tenantId ?? null,
          action:   'CREATE',
          entity:   'Deal',
          entityId: deal.id,
          userName: session.user.name,
          userRole: session.user.role,
          status:   'SUCCESS',
          afterData: { type, status: initialStatus, dealNumber } as never,
        },
      })

      return deal
    })

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
