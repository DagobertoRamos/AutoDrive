import AlertSetup from '@/components/seller-queue/AlertSetup'

export default function AtivarNotificacoesPage() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Ativar notificações neste aparelho</h1>
        <p className="mt-1 text-sm text-gray-500">
          Libere as permissões para receber avisos importantes do AutoDrive no celular ou navegador.
        </p>
      </div>
      <AlertSetup scope="general" />
    </div>
  )
}
