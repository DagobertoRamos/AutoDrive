// Resposta em fluxo (pedaços de 1 MB): na hospedagem, resposta inteira de uma
// vez é cortada em ~4,5 MB; em fluxo, vídeos maiores passam.
export function streamBytes(bytes: Uint8Array, chunk = 1024 * 1024): ReadableStream<Uint8Array> {
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) { controller.close(); return }
      const end = Math.min(offset + chunk, bytes.length)
      controller.enqueue(bytes.subarray(offset, end))
      offset = end
    },
  })
}
