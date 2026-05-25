'use client'

import { Construction, type LucideIcon } from 'lucide-react'

interface Props {
  title:        string
  description?: string
  icon?:        LucideIcon
}

export function PlaceholderPage({ title, description, icon: Icon = Construction }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="rounded-2xl bg-brand-50 p-4 mb-4">
        <Icon className="h-10 w-10 text-brand-600" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
      {description && <p className="text-gray-500 max-w-md">{description}</p>}
      <p className="mt-6 text-sm text-gray-400">Página em desenvolvimento</p>
    </div>
  )
}
