'use client'

// =============================================================================
// QrScanner — leitura do QR fixo da loja pela câmera (presença por QR).
// Usa a API nativa BarcodeDetector (Chrome Android — alvo do celular do
// vendedor). Sem dependência externa. Fallback: aviso + código manual na tela
// que abriu este scanner. O backend valida o token (não confia só na leitura).
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { X, Camera } from 'lucide-react'

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type DetectorCtor = new (opts: { formats: string[] }) => Detector

export function QrScanner({ onResult, onClose }: { onResult: (token: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false
    const BD = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
    if (!BD) { setErr('Leitura de QR não suportada neste navegador. Informe o código manualmente.'); return }

    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        const v = videoRef.current
        if (!v) return
        v.srcObject = stream
        await v.play()
        const det = new BD({ formats: ['qr_code'] })
        const loop = async () => {
          if (stopped) return
          try { const codes = await det.detect(v); if (codes?.length && codes[0].rawValue) { onResult(codes[0].rawValue); return } } catch { /* frame sem código */ }
          setTimeout(loop, 300)
        }
        void loop()
      } catch { setErr('Não foi possível acessar a câmera.') }
    }
    void run()
    return () => { stopped = true; stream?.getTracks().forEach((t) => t.stop()) }
  }, [onResult])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
      <button onClick={onClose} className="absolute right-4 top-4 text-white/80 hover:text-white"><X size={24} /></button>
      <p className="mb-3 flex items-center gap-2 text-sm text-white"><Camera size={16} />Aponte a câmera para o QR da loja</p>
      {err ? <p className="max-w-xs text-center text-sm text-amber-300">{err}</p> : <video ref={videoRef} playsInline muted className="max-h-[70vh] w-full max-w-sm rounded-xl bg-black" />}
      <button onClick={onClose} className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Cancelar</button>
    </div>
  )
}
