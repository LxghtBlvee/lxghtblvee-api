import { request } from 'undici'

type LastFmImage = { '#text': string; size: string }
type LastFmTrack = {
  name: string
  url: string
  artist: { name: string; mbid?: string; url?: string }
  album?: { '#text': string; mbid?: string }
  image?: LastFmImage[]
  date?: { uts: string; '#text': string }
  '@attr'?: { nowplaying?: 'true' }
}

type LastFmRecentTracksResponse = {
  recenttracks: {
    track: LastFmTrack[] | LastFmTrack
  }
}

export type NowPlaying = {
  username: string
  isNowPlaying: boolean
  track: {
    name: string
    artist: string
    album: string | null
    url: string
    imageUrl: string | null
  } | null
  lastPlayedAt: number | null
  fetchedAt: number
}

function pickLargestImage(images?: LastFmImage[]) {
  if (!images || images.length === 0) return null
  const nonEmpty = images.map((i) => i['#text']).filter((v) => Boolean(v))
  if (nonEmpty.length === 0) return null
  return nonEmpty[nonEmpty.length - 1]
}

function asArray<T>(v: T[] | T): T[] {
  return Array.isArray(v) ? v : [v]
}

export class LastFmClient {
  private apiKey: string
  private username: string
  private cacheTtlMs: number
  private lastFetchAt = 0
  private lastValue: NowPlaying | null = null

  constructor(opts: { apiKey: string; username: string; cacheTtlMs: number }) {
    this.apiKey = opts.apiKey
    this.username = opts.username
    this.cacheTtlMs = opts.cacheTtlMs
  }

  async nowPlaying(): Promise<NowPlaying> {
    const now = Date.now()
    if (this.lastValue && now - this.lastFetchAt < this.cacheTtlMs) {
      return { ...this.lastValue, fetchedAt: now }
    }

    const url = new URL('https://ws.audioscrobbler.com/2.0/')
    url.searchParams.set('method', 'user.getrecenttracks')
    url.searchParams.set('user', this.username)
    url.searchParams.set('api_key', this.apiKey)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')

    const res = await request(url.toString(), { method: 'GET' })
    const text = await res.body.text()

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`Last.fm error ${res.statusCode}: ${text.slice(0, 300)}`)
    }

    const data = JSON.parse(text) as LastFmRecentTracksResponse
    const tracks = asArray(data.recenttracks.track)
    const t = tracks[0]
    const isNowPlaying = Boolean(t?.['@attr']?.nowplaying === 'true')

    const track = t
      ? {
          name: String(t.name ?? ''),
          artist: String(t.artist?.name ?? ''),
          album: t.album && t.album['#text'] ? String(t.album['#text']) : null,
          url: String(t.url ?? ''),
          imageUrl: pickLargestImage(t.image),
        }
      : null

    const lastPlayedAt =
      t && t.date && t.date.uts ? Number(t.date.uts) * 1000 : null

    const value: NowPlaying = {
      username: this.username,
      isNowPlaying,
      track: track && track.name ? track : null,
      lastPlayedAt: isNowPlaying ? null : lastPlayedAt,
      fetchedAt: now,
    }

    this.lastFetchAt = now
    this.lastValue = value

    return value
  }
}
