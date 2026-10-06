// Contrato entre o hub de relatórios e cada visão.

export interface CsvSpec { name: string; headers: string[]; rows: (string | number | null | undefined)[][] }

export interface ReportViewProps {
  /** URL completa do endpoint (já com view e filtros). */
  url: string
  /** Devolve a resposta ao hub (para preencher as listas dos filtros). */
  onData: (data: unknown) => void
  /** Registra o CSV da visão atual (null = nada a exportar). */
  registerCsv: (spec: CsvSpec | null) => void
}
