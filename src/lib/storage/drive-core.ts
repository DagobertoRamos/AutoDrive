// =============================================================================
// Google Drive — regras PURAS de organização (sem rede, sem banco).
// Padrão de pastas (decisão do usuário, 2026-10-14), sempre dentro de
// "AutoDrive/<Loja>/":
//   Avaliações/<MM-AAAA>/<Marca Modelo - PLACA>/
//   Documentos dos veículos/<MM-AAAA>/<Marca Modelo - PLACA>/
//   Documentos pessoais/<MM-AAAA>/<Nome - Marca Modelo - PLACA>/
// =============================================================================

export const DRIVE_ROOT_FOLDER = 'AutoDrive'
export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'
/** drive.file: o app só enxerga o que ele mesmo criou no Drive da conta. */
export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email']

export type DriveArea = 'EVALUATION' | 'VEHICLE_DOCS' | 'PERSONAL_DOCS'

export const DRIVE_AREA_FOLDER: Record<DriveArea, string> = {
  EVALUATION: 'Avaliações',
  VEHICLE_DOCS: 'Documentos dos veículos',
  PERSONAL_DOCS: 'Documentos pessoais',
}

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
  vehicle: DriveVehicleRef
  personName?: string | null
}

/** Caminho de pastas a partir da pasta raiz "AutoDrive" (ela não entra na lista). */
export function drivePath(i: DrivePathInput): string[] {
  const leaf = i.area === 'PERSONAL_DOCS' ? drivePersonLabel(i.personName, i.vehicle) : driveVehicleLabel(i.vehicle)
  return [driveSafeName(i.store, 'Loja'), DRIVE_AREA_FOLDER[i.area], driveMonthFolder(i.date), leaf]
}

/** Escapa um valor para a linguagem de busca do Drive (q='...'). */
export function driveQ(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}
