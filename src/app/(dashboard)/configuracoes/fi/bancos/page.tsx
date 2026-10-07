import { redirect } from 'next/navigation'

// Bancos da loja ficam em F&I › Bancos (conexão, canal e teste).
export default function FiConfigBancosPage() {
  redirect('/financiamento/bancos')
}
