import type { LastFmClient } from '../lastfm.js'

type NowPlaying = {
  track?: string | null
  artist?: string | null
  album?: string | null
  isNowPlaying: boolean
}

function clamp(s: string, max = 42) {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function pickFirstTrack(recent: any) {
  // Support a few likely shapes:
  // - { tracks: [...] }
  // - { recenttracks: { track: [...] } }
  // - { track: [...] }
  const a =
    recent?.tracks ??
    recent?.recenttracks?.track ??
    recent?.track ??
    recent?.recentTracks ??
    null

  if (Array.isArray(a)) return a[0] ?? null
  return a ?? null
}

function parseTrack(t: any) {
  if (!t) return null

  const name = t?.name ?? t?.track ?? null

  // Last.fm often uses artist as { name: '...' } or { '#text': '...' }
  const artist =
    t?.artist?.name ??
    t?.artist?.['#text'] ??
    t?.artist ??
    null

  const album =
    t?.album?.name ??
    t?.album?.['#text'] ??
    t?.album ??
    null

  // Now playing is sometimes '@attr': { nowplaying: 'true' }
  const nowPlaying =
    t?.nowPlaying === true ||
    t?.['@attr']?.nowplaying === 'true' ||
    t?.['@attr']?.nowplaying === true

  return {
    name: name ? String(name) : null,
    artist: artist ? String(artist) : null,
    album: album ? String(album) : null,
    nowPlaying
  }
}

async function callRecent(lastfm: LastFmClient) {
  const client = lastfm as any

  // Try common method names you might have implemented
  if (typeof client.getRecentTracks === 'function') return client.getRecentTracks({ limit: 1 })
  if (typeof client.getRecent === 'function') return client.getRecent({ limit: 1 })
  if (typeof client.recentTracks === 'function') return client.recentTracks({ limit: 1 })
  if (typeof client.recent === 'function') return client.recent({ limit: 1 })

  throw new Error('LastFmClient has no supported recent tracks method')
}

export async function getLastFmNowPlaying(lastfm: LastFmClient): Promise<NowPlaying> {
  const recent = await callRecent(lastfm)
  const firstRaw = pickFirstTrack(recent)
  const first = parseTrack(firstRaw)

  if (!first?.name || !first?.artist) {
    return { track: null, artist: null, album: null, isNowPlaying: false }
  }

  return {
    track: clamp(first.name, 42),
    artist: clamp(first.artist, 28),
    album: first.album ? clamp(first.album, 28) : null,
    isNowPlaying: Boolean(first.nowPlaying)
  }
}