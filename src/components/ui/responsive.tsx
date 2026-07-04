import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ResponsiveMaxWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
type ResponsiveColumns = 1 | 2 | 3 | 4

const maxWidthClass: Record<ResponsiveMaxWidth, string> = {
  sm: 'max-w-3xl',
  md: 'max-w-5xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  '2xl': 'max-w-[90rem]',
  full: 'max-w-none',
}

const desktopColumnsClass: Record<ResponsiveColumns, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
}

interface BaseProps {
  children: ReactNode
  className?: string
}

interface PageContainerProps extends BaseProps {
  maxWidth?: ResponsiveMaxWidth
}

export function PageContainer({ children, className, maxWidth = 'xl' }: PageContainerProps) {
  return (
    <div className={cn('mx-auto w-full min-w-0 overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5 lg:px-6', maxWidthClass[maxWidth], className)}>
      {children}
    </div>
  )
}

interface ResponsiveGridProps extends BaseProps {
  desktopColumns?: ResponsiveColumns
  tabletColumns?: 1 | 2
}

export function ResponsiveGrid({ children, className, desktopColumns = 3, tabletColumns = 2 }: ResponsiveGridProps) {
  return (
    <div className={cn('grid min-w-0 grid-cols-1 gap-3 sm:gap-4', tabletColumns === 2 && 'md:grid-cols-2', desktopColumnsClass[desktopColumns], className)}>
      {children}
    </div>
  )
}

interface ResponsiveCardProps extends BaseProps {
  as?: 'article' | 'section' | 'div'
}

export function ResponsiveCard({ children, className, as: Component = 'div' }: ResponsiveCardProps) {
  return (
    <Component className={cn('min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-card sm:p-5', className)}>
      {children}
    </Component>
  )
}

interface ResponsiveActionsProps extends BaseProps {
  align?: 'start' | 'end' | 'between'
}

export function ResponsiveActions({ children, className, align = 'end' }: ResponsiveActionsProps) {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center',
        align === 'start' && 'sm:justify-start',
        align === 'end' && 'sm:justify-end',
        align === 'between' && 'sm:justify-between',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface ResponsiveTableColumn<T> {
  key: string
  header: ReactNode
  cell: (row: T, index: number) => ReactNode
  className?: string
}

interface ResponsiveTableProps<T> {
  rows: T[]
  columns: ResponsiveTableColumn<T>[]
  rowKey: (row: T, index: number) => string
  mobileCard: (row: T, index: number) => ReactNode
  emptyState?: ReactNode
  className?: string
  tableClassName?: string
}

export function ResponsiveTable<T>({
  rows,
  columns,
  rowKey,
  mobileCard,
  emptyState,
  className,
  tableClassName,
}: ResponsiveTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className={cn('rounded-lg border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500', className)}>
        {emptyState ?? 'Nenhum registro encontrado.'}
      </div>
    )
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div className="space-y-3 md:hidden">
        {rows.map((row, index) => (
          <div key={rowKey(row, index)} className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-card">
            {mobileCard(row, index)}
          </div>
        ))}
      </div>

      <div className="hidden min-w-0 overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
        <table className={cn('min-w-full divide-y divide-gray-200 text-sm', tableClassName)}>
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={cn('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500', column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, rowIndex) => (
              <tr key={rowKey(row, rowIndex)} className="hover:bg-gray-50">
                {columns.map((column) => (
                  <td key={column.key} className={cn('px-4 py-3 text-gray-700', column.className)}>
                    {column.cell(row, rowIndex)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ResponsiveModalFrame({ children, className }: BaseProps) {
  return (
    <div className={cn('max-h-[92vh] w-full max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg bg-white shadow-modal sm:max-w-lg', className)}>
      {children}
    </div>
  )
}

export function ResponsiveModalFooter({ children, className }: BaseProps) {
  return (
    <div className={cn('sticky bottom-0 grid grid-cols-1 gap-2 border-t border-gray-100 bg-white p-4 sm:flex sm:justify-end', className)}>
      {children}
    </div>
  )
}

export function ResponsiveTabs({ children, className }: BaseProps) {
  return (
    <div className={cn('flex min-w-0 gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]', className)}>
      {children}
    </div>
  )
}

interface ResponsiveDashboardSectionProps extends BaseProps {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

export function ResponsiveDashboardSection({ title, description, actions, children, className }: ResponsiveDashboardSectionProps) {
  return (
    <section className={cn('min-w-0 space-y-3', className)}>
      {(title || description || actions) && (
        <div className="grid gap-3 sm:flex sm:items-end sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold text-gray-900 sm:text-lg">{title}</h2>}
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
          </div>
          {actions && <ResponsiveActions>{actions}</ResponsiveActions>}
        </div>
      )}
      {children}
    </section>
  )
}
