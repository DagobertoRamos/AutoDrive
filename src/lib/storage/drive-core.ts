// =============================================================================
// Google Drive — regras PURAS de organização (sem rede, sem banco).
// Padrão de pastas (decisão do usuário, 2026-10-14), sempre dentro de
// "AutoDrive/<Loja>/":
//   Avaliações/<MM-AAAA>/<Marca Modelo - PLACA>/
//   Documentos dos veículos/<MM-AAAA>/<Marca Modelo - PLACA>/
//   Documentos pessoais/<MM-AAAA>/<Nome - Marca Modelo - PLACA>/
//   Negociações/<MM-AAAA>/<Cliente - Marca Modelo - PLACA>/
//   Financeiro/<MM-AAAA>/
// =============================================================================

export const DRIVE_ROOT_FOLDER = 'AutoDrive'
export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'
/** drive.file: o app só enxerga o que ele mesmo criou no Drive da conta. */
export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email']

export type DriveArea = 'EVALUATION' | 'VEHICLE_DOCS' | 'PERSONAL_DOCS' | 'NEGOTIATIONS' | 'FINANCE'

export const DRIVE_AREA_FOLDER: Record<DriveArea, string> = {
  EVALUATION: 'Avaliações',
  VEHICLE_DOCS: 'Documentos dos veículos',
  PERSONAL_DOCS: 'Documentos pessoais',
  NEGOTIATIONS: 'Negociações',
  FINANCE: 'Financeiro',
}

/** Comprovante enviado antes de a negociação existir (sai daqui quando é vinculado). */
export const DRIVE_PENDING_FOLDER = 'Comprovantes aguardando vínculo'

/** Categorias de anexo que são documento da PESSOA (vão para "Documentos pessoais"). */
export const PERSONAL_DOC_CATEGORIES = new Set(['CNH', 'RG', 'CPF', 'COMPROVANTE_RESIDENCIA', 'COMPROVANTE_RENDA', 'HOLERITE'])

/** Nome seguro p/ pasta/arquivo no Drive: sem barras nem controle, espaços únicos, até 100 caracteres. */
export function driveSafeName(input: string | null | undefined, fallback = 'Sem nome'): string {
  // eslint-disable-next-line no-control-regex
  const s = String(input ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[/\\]+/g, '-').replace(/\s+/g, ' ').trim()
  return (s || fallback).slice(0, 100).trim()
}

/** Pasta do mês no fuso de São Paulo: "10-2026". */
export function driveMonthFolder(date: Date): string {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', month: '2-digit', year: 'numeric' }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('month')}-${get('year')}`
}

export interface DriveVehicleRef { brand?: string | null; model?: string | null; plate?: string | null }

/** "Marca Modelo - PLACA" (sem placa → "SEM PLACA"). */
export function driveVehicleLabel(v: DriveVehicleRef): string {
  const name = [v.brand, v.model].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ') || 'Veículo'
  const plate = String(v.plate ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase() || 'SEM PLACA'
  return driveSafeName(`${name} - ${plate}`)
}

/** "Nome - Marca Modelo - PLACA". */
export function drivePersonLabel(name: string | null | undefined, v: DriveVehicleRef): string {
  return driveSafeName(`${driveSafeName(name, 'Sem nome')} - ${driveVehicleLabel(v)}`)
}

export interface DrivePathInput {
  store: string
  area: DriveArea
  date: Date
  vehicle?: DriveVehicleRef
  personName?: string | null
  /** Pasta final fixa (substitui a do veículo/pessoa). */
  leaf?: string
}

/** Caminho de pastas a partir da pasta raiz "AutoDrive" (ela não entra na lista). */
export function drivePath(i: DrivePathInput): string[] {
  const base = [driveSafeName(i.store, 'Loja'), DRIVE_AREA_FOLDER[i.area], driveMonthFolder(i.date)]
  if (i.leaf) return [...base, driveSafeName(i.leaf)]
  if (i.area === 'FINANCE') return base
  const v = i.vehicle ?? {}
  const withPerson = i.area === 'PERSONAL_DOCS' || i.area === 'NEGOTIATIONS'
  return [...base, withPerson ? drivePersonLabel(i.personName, v) : driveVehicleLabel(v)]
}

/** Escapa um valor para a linguagem de busca do Drive (q='...'). */
export function driveQ(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
