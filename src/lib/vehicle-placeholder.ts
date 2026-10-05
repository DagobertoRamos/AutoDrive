// Imagem exibida no painel para veículo sem nenhuma foto. É só visual: não vira
// VehiclePhoto, não conta como foto e não vai para site/portais.
export const VEHICLE_NO_PHOTO_IMG = '/aguardando-fotos.webp'

/** Arte genérica "em breve"/"sem foto" (do site antigo ou subida à mão) — não é foto do carro. */
export function isPlaceholderPhoto(url: string): boolean {
  const file = url.split(/[?#]/)[0].split('/').pop() ?? ''
  return /(em[-_ ]?breve|coming[-_ ]?soon|sem[-_ ]?fotos?|no[-_ ]?(image|photo)|aguardando[-_ ]?fotos?)/i.test(decodeURIComponentSafe(file))
}

/** Só as fotos de verdade (sem vazias nem placeholders). */
export function realPhotoUrls<T extends string | null | undefined>(urls: T[]): string[] {
  return urls.filter((u): u is NonNullable<T> & string => !!u && !isPlaceholderPhoto(u))
}

function decodeURIComponentSafe(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}
