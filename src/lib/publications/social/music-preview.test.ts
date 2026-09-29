import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { integrationCredential: { findFirst: async () => null }, publicationConnection: { findFirst: async () => null } } }))

describe('Música na pré-visualização = a mesma do post', () => {
  it('guarda o link longo da prévia da faixa do Instagram (links da Meta passam de 800 caracteres)', async () => {
    const { musicOf } = await import('./music-core')
    const url = `https://video.xx.fbcdn.net/o1/v/t2/f2/m69/${'a'.repeat(880)}.mp4`
    expect(musicOf({ mode: 'TRACK', source: 'IG', id: '123', title: 'Shining Sun', previewUrl: url })).toMatchObject({ previewUrl: url })
  })
  it('faixa do Instagram no Reels do Instagram toca pelo servidor (link sempre novo), com o mesmo título', async () => {
    const { previewAudio } = await import('./music')
    const a = await previewAudio({ mode: 'TRACK', source: 'IG', id: '1717', title: 'Shining Sun', artist: 'Giulio' }, 'INSTAGRAM', 'REELS', 'v1')
    expect(a).toMatchObject({ title: 'Shining Sun', url: expect.stringContaining('/api/publications/social/audio?id=1717') })
    expect(a?.note).toBeUndefined()
  })
  it('música livre escolhida: é a mesma no Instagram e no Facebook', async () => {
    process.env.FREESOUND_API_KEY = 'k'
    const track = { id: 789, name: 'SHADY', username: 'Mad', duration: 60, license: 'http://creativecommons.org/publicdomain/zero/1.0/', previews: { 'preview-hq-mp3': 'https://cdn.freesound.org/x-hq.mp3' } }
    const orig = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify(track), { status: 200 })) as typeof fetch
    try {
      const { previewAudio } = await import('./music')
      const choice = { mode: 'TRACK' as const, source: 'FREESOUND' as const, id: '789', title: 'SHADY' }
      const ig = await previewAudio(choice, 'INSTAGRAM', 'REELS', 'v1'); const fb = await previewAudio(choice, 'META_PAGE', 'REELS', 'v1')
      expect(ig?.title).toBe('SHADY'); expect(fb?.title).toBe('SHADY'); expect(fb?.note).toBeUndefined()
    } finally { globalThis.fetch = orig; delete process.env.FREESOUND_API_KEY }
  })
})
