import { describe, expect, it } from 'vitest'
import { absoluteUrl, cleanFolderName, cleanTreatedList, originFolder, splitPhotos, treatedAtOrigin, vehicleFolder, vehicleOrigin } from './photo-studio-core'

const AC = 'https://resized-images.autoconf.com.br/fotos/'

describe('splitPhotos', () => {
  it('1ª png do AutoConf é a capa da loja', () => {
    const r = splitPhotos([`${AC}capa.png`, `${AC}1.jpeg`, `${AC}2.jpeg`])
    expect(r.storeArt).toEqual([`${AC}capa.png`])
    expect(r.photos).toEqual([`${AC}1.jpeg`, `${AC}2.jpeg`])
  })
  it('galeria inteira em png: só a 1ª é arte', () => {
    const r = splitPhotos([`${AC}a.png`, `${AC}b.png`, `${AC}c.png`])
    expect(r.photos).toEqual([`${AC}b.png`, `${AC}c.png`])
  })
  it('png minoria no meio é arte; logotipo do BNDV sempre é arte', () => {
    const r = splitPhotos([`${AC}1.jpeg`, `${AC}2.jpeg`, `${AC}tarja.png`, `${AC}3.jpeg`, 'https://x.bndv.com.br/sites-logo/clientes/766/logo.jpeg'])
    expect(r.storeArt).toEqual([`${AC}tarja.png`, 'https://x.bndv.com.br/sites-logo/clientes/766/logo.jpeg'])
    expect(r.photos).toHaveLength(3)
  })
  it('png fora do AutoConf (foto já tratada) nunca é descartado; repetidas saem', () => {
    const r = splitPhotos(['/api/site/assets/abcdefghij12.png', '/api/site/assets/abcdefghij12.png', 'https://blob/x.png'])
    expect(r.photos).toEqual(['/api/site/assets/abcdefghij12.png', 'https://blob/x.png'])
  })
})

describe('vehicleOrigin / originFolder', () => {
  it('loja parceira vence', () => {
    const o = vehicleOrigin({ originType: 'PARTNER', partnerName: 'Now Car Multimarcas' }, 'CONSIGNADO')
    expect(o).toEqual({ kind: 'PARCEIRO', store: 'Now Car Multimarcas' })
    expect(originFolder(o)).toBe('Now Car Multimarcas')
  })
  it('particular e próprio', () => {
    expect(vehicleOrigin({ originType: 'PRIVATE' }, null).kind).toBe('PARTICULAR')
    expect(originFolder(vehicleOrigin({ originType: 'OWN' }, null))).toBe('autodrive')
    expect(vehicleOrigin(null, 'CONSIGNADO').kind).toBe('PARTICULAR')
    expect(vehicleOrigin(null, 'PROPRIO').kind).toBe('PROPRIO')
    expect(originFolder(vehicleOrigin(null, null))).toBe('autodrive')
  })
})

describe('pastas', () => {
  it('limpa acento e caractere proibido no Windows', () => {
    expect(cleanFolderName('Tchesco / Filial: "2"*')).toBe('Tchesco - Filial- 2')
    expect(cleanFolderName('João Ávila')).toBe('Joao Avila')
  })
  it('placa primeiro; sem placa usa código interno ou o id', () => {
    expect(vehicleFolder({ id: 'ckabc12345', plate: 'RFW6C77', brand: 'Fiat', model: 'Uno', version: 'Attractive 1.0', modelYear: 2021 })).toBe('RFW6C77 - Fiat Uno Attractive 1.0 2021')
    expect(vehicleFolder({ id: 'ckabc12345', internalCode: 'AD-PAR-002652', brand: 'Ford' })).toBe('AD-PAR-002652 - Ford')
    expect(vehicleFolder({ id: 'ckabc12345' })).toBe('ckabc123')
  })
})

describe('absoluteUrl / cleanTreatedList', () => {
  it('relativa vira absoluta', () => {
    expect(absoluteUrl('/api/site/assets/x', 'https://www.appautodrive.online/')).toBe('https://www.appautodrive.online/api/site/assets/x')
    expect(absoluteUrl('https://cdn/x.jpg', 'https://a')).toBe('https://cdn/x.jpg')
  })
  it('só aceita fotos do próprio SaaS, normaliza e tira repetida', () => {
    expect(cleanTreatedList(['https://www.appautodrive.online/api/site/assets/abcdefghij12', '/api/site/assets/abcdefghij12', '/api/site/assets/zzzzzzzzzz99']))
      .toEqual(['/api/site/assets/abcdefghij12', '/api/site/assets/zzzzzzzzzz99'])
    expect(cleanTreatedList(['https://outro.com/foto.png'])).toBeNull()
    expect(cleanTreatedList([])).toBeNull()
    expect(cleanTreatedList('x')).toBeNull()
  })
})

describe('treatedAtOrigin', () => {
  it('galeria toda no Vercel Blob do site antigo = já tratada', () => {
    expect(treatedAtOrigin(['https://abc.public.blob.vercel-storage.com/vehicle-images/1.png', 'https://abc.public.blob.vercel-storage.com/2.png'])).toBe(true)
    expect(treatedAtOrigin(['https://abc.public.blob.vercel-storage.com/1.png', `${AC}2.jpeg`])).toBe(false)
    expect(treatedAtOrigin([`${AC}1.jpeg`])).toBe(false)
    expect(treatedAtOrigin([])).toBe(false)
  })
})
