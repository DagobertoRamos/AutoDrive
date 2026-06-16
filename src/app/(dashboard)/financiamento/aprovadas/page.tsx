'use client'
import ProposalsManager from '@/components/financing/ProposalsManager'

export default function AprovadasPage() {
  return <ProposalsManager fixedStatus="APROVADA" title="Fichas Aprovadas" subtitle="aprovadas" allowCreate={false} />
}
