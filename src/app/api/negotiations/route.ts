// =============================================================================
// /api/negotiations — Listar e criar negociações
// =============================================================================

import { saleBlockers, saleBlockedMessage } from '@/lib/automotive/overview'
import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { requireModule }        from '@/lib/permissions'
import { assertModuleEnabled }  from '@/lib/tenant-modules'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { buildCommissionAccessWhere, buildNegotiationAccessWhere, getNegotiationActorIds } from '@/lib/negotiation-access'
import {
  buildNegotiationFilterWhere,
  buildNegotiationOrderBy,
  parseNegotiationFilters,
} from '@/lib/negotiation-filters'
import { notifyStockChanged } from '@/lib/publications/service'
import { resolveNegotiationGate } from '@/lib/stock/intake'
import {
  assertNoOtherEntryDeal, assertTradeEvaluationUsable, linkTradeEvaluation, assertVehicleNotInOtherSale, createExtraDealVehicles,
  createWizardDebt, createWizardPayment,
} from '@/lib/negotiation/deal-children'
import { syncDealFinanceSafe } from '@/lib/finance/deal-finance-sync'
import { resolveDealManagerUserId } from '@/lib/negotiation/manager'
import { ensureUniqueDealNumber, generateDealNumber } from '@/lib/negotiation-service'
import { parseDateOnly } from '@/lib/negotiation/date-only'

// ── GET — Listar negociações ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  try {
    const { searchParams } = req.nextUrl
    const parsed = parseNegotiationFilters(searchParams)
    if (parsed.errors.length) {
      return NextResponse.json({ error: parsed.errors[0], errors: parsed.errors }, { status: 400 })
    }

    const filters = parsed.filters
    const extra = buildNegotiationFilterWhere(filters)

    if (filters.commission !== 'any') {
      const commissionStatus = ['PREVISTO', 'APROVADO', 'PAGO', 'ESTORNADO'].includes(filters.commission)
        ? filters.commission
        : ''
      const commissionWhere = await buildCommissionAccessWhere(session.user, {
        ...(commissionStatus ? { status: commissionStatus as never } : {}),
      })
      const calculations = await prisma.commissionCalculation.findMany({
        where: commissionWhere,
        take: 50_000,
        select: { ruleDetails: true },
      })
      const dealIds = [...new Set(calculations.map((row) => {
        const details = row.ruleDetails as { dealId?: unknown } | null
        return typeof details?.dealId === 'string' ? details.dealId : null
      }).filter((id): id is string => Boolean(id)))]

      if (filters.commission === 'without') {
        extra.AND = [...(Array.isArray(extra.AND) ? extra.AND : []), { id: { notIn: dealIds } }]
      } else {
        extra.AND = [...(Array.isArray(extra.AND) ? extra.AND : []), { id: { in: dealIds.length ? dealIds : ['__no_deal_with_commission__'] } }]
      }
    }

    const where = await buildNegotiationAccessWhere(session.user, extra)
    const take = filters.pageSize
    const page = filters.page
    const actor = await getNegotiationActorIds(session.user)
    const tenantId = session.user.role === 'MASTER' ? undefined : session.user.tenantId ?? '__no_tenant__'
    const unitWhere =
      session.user.role === 'MASTER'
        ? {}
        : { tenantId }
    const sellerWhere =
      ['VENDEDOR', 'VENDEDOR_LIDER'].includes(session.user.role)
        ? { id: actor.sellerId ?? '__no_seller__' }
        : session.user.role === 'GERENTE'
          ? { unitId: actor.unitId ?? '__no_unit__' }
          : session.user.role === 'MASTER'
            ? {}
            : { unit: { tenantId } }

    const [deals, total, typeCounts, statusCounts, units, sellers] = await Promise.all([
      prisma.deal.findMany({
        where,
        orderBy: buildNegotiationOrderBy(filters),
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
          purchaseAmount:      true,
          totalPayments:       true,
          vehicleValue:        true,
          createdAt:           true,
          approvedAt:          true,
          updatedAt:           true,
          unitId:              true,
          person:   { select: { nomeCompleto: true } },
          customer: { select: { name: true } },
          seller:   { select: { fullName: true, user: { select: { name: true } } } },
          sellerNameFromSheet: true,
          vehicles: {
            take:    4,
            orderBy: { createdAt: 'asc' },
            select:  { plate: true, brand: true, model: true, year: true, role: true, agreedValue: true, vehicle: { select: { salePrice: true } } },
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
      prisma.unit.findMany({
        where: unitWhere,
        orderBy: { name: 'asc' },
        take: 300,
        select: { id: true, name: true, active: true },
      }),
      prisma.seller.findMany({
        where: sellerWhere,
        orderBy: { fullName: 'asc' },
        take: 500,
        select: { id: true, fullName: true, shortName: true, unitId: true, active: true, user: { select: { name: true } } },
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
      pagination: { page, total, totalPages: Math.ceil(total / take), limit: take, pageSize: take },
      byType,
      byStatus,
      appliedFilters: filters,
      availableFilters: {
        units,
        sellers: sellers.map((seller) => ({
          id: seller.id,
          name: seller.user?.name ?? seller.fullName,
          shortName: seller.shortName,
          unitId: seller.unitId,
          active: seller.active,
        })),
      },
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
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  try {
    const body = await req.json()
    const {
      type, person, customer, personId: bodyPersonId, draftId,
      // Localização
      unitId: bodyUnitId, sellerId: bodySellerId,
      vehicle, tradeInVehicle, extraVehicles, extraTradeInVehicles,
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
          // Seller não tem tenantId: a loja vem pela unidade do vendedor.
          ...(session.user.tenantId ? { unit: { tenantId: session.user.tenantId } } : {}),
        },
        select: { id: true },
      })
      if (sel) resolvedSellerId = sel.id
    }

    // Veículos do estoque informados pelo cliente: só da mesma loja.
    for (const vid of [vehicle?.vehicleId, tradeInVehicle?.vehicleId]) {
      if (!vid) continue
      const ok = await prisma.vehicle.findFirst({ where: { id: String(vid), tenantId: session.user.tenantId ?? undefined }, select: { id: true } })
      if (!ok) return NextResponse.json({ error: 'Veículo inválido para esta loja.' }, { status: 400 })
    }

    // Compliance: carro com pendência que impede a venda não entra em negociação de venda.
    if (vehicle?.vehicleId && (type === 'VENDA' || type === 'TROCA')) {
      const blocked = await saleBlockers([String(vehicle.vehicleId), ...(Array.isArray(extraVehicles) ? extraVehicles.map((v: { vehicleId?: string }) => v?.vehicleId).filter(Boolean) as string[] : [])])
      if (blocked.length) return NextResponse.json({ error: saleBlockedMessage(blocked), blockers: blocked }, { status: 409 })
    }

    let heldExtra: string[] = []
    const result = await prisma.$transaction(async (tx) => {
      // ── Trava de envio duplicado ─────────────────────────────────────────
      // 1) Rascunho de uso único: o mesmo rascunho aberto em dois aparelhos
      //    só vira negociação uma vez (quem consumir primeiro).
      if (typeof draftId === 'string' && draftId) {
        const used = await tx.dealDraft.deleteMany({ where: { id: draftId, tenantId: session.user.tenantId ?? null } })
        if (used.count === 0) throw new Error('Esta negociação já foi enviada (ou o rascunho foi descartado) em outro aparelho. Confira em Negociações antes de enviar de novo.')
      }
      // 2) Um carro só tem UMA negociação de entrada (consignação/compra) ativa.
      if ((type === 'CONSIGNACAO' || type === 'COMPRA') && (vehicle?.vehicleId || vehicle?.plate)) {
        await assertNoOtherEntryDeal(tx, session.user.tenantId ?? null, vehicle)
      }

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

      const dealNumber    = await generateDealNumber(session.user.tenantId ?? null, tx)
      const initialStatus = submit ? 'AGUARDANDO_APROVACAO' : 'RASCUNHO'

      // Gerente responsável: o do vendedor (ou o 1º gerente ativo da unidade).
      const managerUserId = await resolveDealManagerUserId(tx, { sellerId: resolvedSellerId, unitId: resolvedUnitId })

      const deal = await tx.deal.create({
        data: {
          dealNumber,
          tenantId: session.user.tenantId ?? null,
          unitId:   resolvedUnitId,
          sellerId: resolvedSellerId,
          managerId: managerUserId,
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
          deliveryDate: parseDateOnly(deliveryDate),
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
          consignDeadline:  parseDateOnly(consignDeadline),
          notes: notes ?? null,
        } as never,
      })

      const vehicleRoleMap: Record<string, string> = {
        VENDA: 'VENDIDO', COMPRA: 'COMPRADO', TROCA: 'VENDIDO', CONSIGNACAO: 'CONSIGNADO',
      }

      const hasExtras = (Array.isArray(extraVehicles) && extraVehicles.length > 0) || (Array.isArray(extraTradeInVehicles) && extraTradeInVehicles.length > 0)
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
        if (vehicleId && (type === 'VENDA' || type === 'TROCA')) await assertVehicleNotInOtherSale(tx, vehicleId)

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
            condition:      vehicle.condition ?? null,
            evaluatedValue: vehicle.evaluatedValue ? Number(vehicle.evaluatedValue) : null,
            fipeValue:      vehicle.fipeValue      ? Number(vehicle.fipeValue)      : null,
            hasFinancing:   vehicle.hasFinancing   ?? false,
            payoffValue:    vehicle.payoffValue    ? Number(vehicle.payoffValue)    : null,
            payoffBank:     vehicle.payoffBank     ?? null,
            notes:          vehicle.notes          ?? null,
            // Vários veículos: cada um com o próprio valor; um só = valor da operação.
            agreedValue: hasExtras && vehicle.agreedValue != null
              ? Number(vehicle.agreedValue)
              : saleAmount || purchaseAmount ? Number(saleAmount ?? purchaseAmount ?? 0) : null,
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
        if (tradeInVehicle.evaluationId) { await assertTradeEvaluationUsable(tx, tradeInVehicle.evaluationId, tradeInVehicle.plate); await linkTradeEvaluation(tx, tradeInVehicle.evaluationId, deal.id) }

        await tx.dealVehicle.create({
          data: {
            dealId:        deal.id,
            role:          'TROCA',
            // Carro que já está no estoque (veio da avaliação pela esteira): vincula direto.
            vehicleId:     tradeInVehicle.vehicleId ?? null,
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

      // 5.5. Veículos adicionais (mais carros vendidos/comprados e mais carros na troca).
      if (hasExtras) {
        heldExtra = await createExtraDealVehicles(tx, {
          deal: { id: deal.id, tenantId: session.user.tenantId ?? null, unitId: resolvedUnitId },
          type, vehicles: extraVehicles, tradeIns: extraTradeInVehicles,
        })
      }

      // 6. Débitos do wizard (array opcional)
      const uploader = { id: session.user.id, name: session.user.name ?? null, tenantId: session.user.tenantId ?? null }
      if (Array.isArray(debts)) {
        // Um a um: o boleto/comprovante enviado na tela vira anexo do próprio débito.
        for (const d of debts) await createWizardDebt(tx, deal.id, uploader, d)
      }

      // 6.5. Pagamentos do wizard (array opcional). Entram sempre PENDENTES:
      // quem confirma é o financeiro, no módulo Financeiro › Recebimentos.
      // Comprovante enviado no modal vira anexo do próprio pagamento.
      if (Array.isArray(payments)) {
        for (const p of payments) await createWizardPayment(tx, deal.id, uploader, p)
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

    // Central de Publicações: venda registrada (veículo em negociação) → pausa
    // os anúncios conforme a regra da loja. Segundo plano; nunca bloqueia.
    if (type === 'VENDA' || type === 'TROCA') notifyStockChanged((result as { tenantId?: string | null }).tenantId ?? session.user.tenantId, [vehicle?.vehicleId, ...heldExtra], { id: session.user.id, name: session.user.name ?? null })

    // Esteira de entrada: carro que ENTRA por esta negociação (troca/compra/
    // consignação) tem o portão "Negociação de entrada" resolvido ao cadastrar.
    const newDealId = (result as { id?: string }).id
    if (newDealId) await ensureUniqueDealNumber(newDealId).catch((e) => console.error('[negociacao] número duplicado', e))
    if (newDealId) {
      await resolveNegotiationGate(newDealId, { id: session.user.id, name: session.user.name ?? null, role: session.user.role })
        .catch((e) => console.error('[esteira] portão de negociação', e))
    }

    await syncDealFinanceSafe(newDealId)
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
