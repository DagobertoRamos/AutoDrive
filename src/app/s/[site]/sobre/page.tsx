// Quem somos (serviço padrão). Textos em Painel do Site → Textos.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSiteContext } from '@/lib/site/context'

export const metadata: Metadata = { title: 'Quem somos' }

export default async function SiteAbout({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  if (!ctx.on('sobre')) notFound()
  const { about, legalNote } = ctx.config
  return (
    <>
      <section className="page-hero"><div className="shell"><p className="eyebrow">{about.eyebrow}</p><h1>{about.title}</h1><p>{about.intro}</p></div></section>
      <section className="shell section prose">
        {about.sections.map((s) => <div key={s.title}><h2>{s.title}</h2>{s.text.split(/\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>)}
      </section>
      {legalNote && <section className="shell" style={{ paddingBottom: 48 }}><p className="legal-note">{legalNote}</p></section>}
    </>
  )
}
