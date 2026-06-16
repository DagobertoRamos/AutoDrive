'use client'
import ProposalsManager from '@/components/financing/ProposalsManager'

export default function RecusadasPage() {
  return <ProposalsManager fixedStatus="RECUSADA" title="Fichas Recusadas" subtitle="recusadas" allowCreate={false} />
}
