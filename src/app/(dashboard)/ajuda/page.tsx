'use client'

import { BookOpen, MessageCircleQuestion, LifeBuoy, Mail } from 'lucide-react'
import HelpChat from '@/components/ai/HelpChat'

const CARDS = [
  { icon: BookOpen,              title: 'Como usar',          desc: 'Guias passo a passo para os principais fluxos.' },
  { icon: MessageCircleQuestion, title: 'Dúvidas frequentes', desc: 'Perguntas mais comuns dos usuários.' },
  { icon: LifeBuoy,              title: 'Suporte',            desc: 'Abra um chamado técnico com nossa equipe.' },
  { icon: Mail,                  title: 'Contato',            desc: 'Fale conosco por e-mail ou WhatsApp.' },
]

export default function AjudaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Central de Ajuda</h1>
        <p className="mt-1 text-sm text-gray-500">
          Encontre respostas rápidas, tutoriais e canais de atendimento.
        </p>
      </div>

      <HelpChat />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="rounded-xl bg-brand-50 p-3 inline-flex">
              <Icon className="h-6 w-6 text-brand-600" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{desc}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
        <p className="font-semibold text-gray-800">Precisa de ajuda agora?</p>
        <p className="mt-1">
          Entre em contato com o administrador do seu sistema ou abra um chamado pelo botão Suporte acima.
        </p>
      </div>
    </div>
  )
}
