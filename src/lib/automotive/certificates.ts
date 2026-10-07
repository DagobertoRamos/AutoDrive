// =============================================================================
// Certificado digital A1 da loja/filial. O .pfx e a senha ficam cifrados
// (AES-256-GCM, src/lib/crypto.ts); a tela só vê titular e validade. Nunca
// devolver o arquivo nem a senha por API.
// =============================================================================

import forge from 'node-forge'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { OpsError, recordEvent, type Actor } from './operations'

const MAX_PFX = 64 * 1024

export interface CertificateInfo { subjectName: string | null; subjectDoc: string | null; validFrom: Date | null; validUntil: Date | null; fingerprint: string }

/** Abre o .pfx com a senha e lê titular/validade (lança se a senha estiver errada). */
export function readPfx(pfx: Buffer, password: string): CertificateInfo {
  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary'))), password)
  } catch {
    throw new OpsError('Não foi possível abrir o certificado. Confira o arquivo e a senha.', 400)
  }
  const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
  const keys = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []
  if (!keys.length) throw new OpsError('O arquivo não contém a chave privada (use o certificado A1 em .pfx).', 400)
  // Certificado do titular = o que não é autoridade certificadora.
  const certs = bags.map((b) => b.cert).filter(Boolean) as forge.pki.Certificate[]
  const leaf = certs.find((c) => !c.getExtension('basicConstraints') || !(c.getExtension('basicConstraints') as { cA?: boolean }).cA) ?? certs[0]
  if (!leaf) throw new OpsError('Certificado não encontrado no arquivo.', 400)
  const cn = leaf.subject.getField('CN')?.value as string | undefined
  // e-CNPJ: "RAZAO SOCIAL:12345678000190"
  const doc = cn?.match(/:(\d{11}|\d{14})$/)?.[1] ?? null
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(leaf)).getBytes()
  return {
    subjectName: cn ? cn.replace(/:\d+$/, '') : null,
    subjectDoc: doc,
    validFrom: leaf.validity.notBefore ?? null,
    validUntil: leaf.validity.notAfter ?? null,
    fingerprint: createHash('sha256').update(Buffer.from(der, 'binary')).digest('hex'),
  }
}

export async function saveCertificate(tenantId: string, unitId: string | null, pfxBase64: string, password: string, actor: Actor) {
  const pfx = Buffer.from(String(pfxBase64 ?? '').replace(/^data:[^,]*,/, ''), 'base64')
  if (!pfx.length) throw new OpsError('Envie o arquivo .pfx.', 400)
  if (pfx.length > MAX_PFX) throw new OpsError('Arquivo grande demais para um certificado A1.', 400)
  if (!password) throw new OpsError('Informe a senha do certificado.', 400)
  const info = readPfx(pfx, password)
  if (info.validUntil && info.validUntil < new Date()) throw new OpsError('Este certificado já está vencido.', 400)
  const saved = await prisma.$transaction(async (tx) => {
    await tx.tenantCertificate.updateMany({ where: { tenantId, unitId, active: true }, data: { active: false, revokedAt: new Date() } })
    return tx.tenantCertificate.create({
      data: {
        tenantId, unitId, subjectName: info.subjectName, subjectDoc: info.subjectDoc, validFrom: info.validFrom, validUntil: info.validUntil,
        fingerprint: info.fingerprint, pfxEncrypted: encrypt(pfx.toString('base64')), passwordEncrypted: encrypt(password), uploadedById: actor.id ?? null,
      },
      select: { id: true, unitId: true, subjectName: true, subjectDoc: true, validFrom: true, validUntil: true, createdAt: true },
    })
  })
  await prisma.auditLog.create({ data: { tenantId, userId: actor.id ?? null, userName: actor.name ?? null, userRole: actor.role ?? null, action: 'CERTIFICATE_UPLOADED', entity: 'TenantCertificate', entityId: saved.id, afterData: { unitId, subjectDoc: info.subjectDoc, validUntil: info.validUntil, fingerprint: info.fingerprint } as never } }).catch(() => {})
  await recordEvent({ tenantId, type: 'CERTIFICATE_UPLOADED', title: 'Certificado digital atualizado.', actor, technical: true })
  return saved
}

export async function revokeCertificate(tenantId: string, id: string, actor: Actor) {
  const r = await prisma.tenantCertificate.updateMany({ where: { id, tenantId, active: true }, data: { active: false, revokedAt: new Date() } })
  if (!r.count) throw new OpsError('Certificado não encontrado.', 404)
  await prisma.auditLog.create({ data: { tenantId, userId: actor.id ?? null, userName: actor.name ?? null, userRole: actor.role ?? null, action: 'CERTIFICATE_REVOKED', entity: 'TenantCertificate', entityId: id } }).catch(() => {})
}

export async function listCertificates(tenantId: string) {
  return prisma.tenantCertificate.findMany({ where: { tenantId, active: true }, select: { id: true, unitId: true, subjectName: true, subjectDoc: true, validFrom: true, validUntil: true, createdAt: true }, orderBy: { createdAt: 'desc' } })
}
