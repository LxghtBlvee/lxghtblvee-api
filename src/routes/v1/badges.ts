import type { FastifyInstance } from 'fastify'
import type { LastFmClient } from '../../services/lastfm.js'
import { createBadge, svgReply } from '../../services/badges/badge.util.js'
import { getEstTimeLabel } from '../../services/badges/time.badge.js'
import { getLastFmNowPlaying } from '../../services/badges/lastfm.badge.js'
import { setDiscordPresence, getDiscordPresence, normalizeDiscordPresence } from '../../services/badges/discord.presence.js'

type BadgeOpts = {
  lastfm: LastFmClient
}

export async function registerBadgeRoutes(app: FastifyInstance, opts: BadgeOpts) {

  app.get('/time', async (_req, reply) => {
    const msg = getEstTimeLabel()
    return svgReply(reply, createBadge('Local time', msg, 'blue'))
  })

  app.get('/music', async (_req, reply) => {
    try {
      const np = await getLastFmNowPlaying(opts.lastfm)

      if (!np.track || !np.artist) {
        return svgReply(reply, createBadge('Listening', 'offline', 'grey'))
      }

      const msg = np.isNowPlaying ? `${np.artist} — ${np.track}` : `Last: ${np.artist} — ${np.track}`
      const color = np.isNowPlaying ? '1db954' : 'grey'

      return svgReply(reply, createBadge('Listening', msg, color))
    } catch {
      return svgReply(reply, createBadge('Listening', 'error', 'red'))
    }
  })

  app.get('/discord', async (_req, reply) => {
  const p = getDiscordPresence()

  const ageMs = Date.now() - (p.updatedAt || 0)
  const stale = !p.updatedAt || ageMs > 5 * 60 * 1000

  const status = stale ? 'offline' : p.status

  const label = 'Discord'
  const message =
    status === 'online' ? 'online' :
    status === 'idle' ? 'idle' :
    status === 'dnd' ? 'dnd' :
    status === 'offline' ? 'offline' :
    'unknown'

  const color =
    status === 'online' ? '2ea44f' :
    status === 'idle' ? 'fbbf24' :
    status === 'dnd' ? 'ef4444' :
    '6b7280'

  return svgReply(reply, createBadge(label, message, color))
})

app.post('/discord/update', async (req, reply) => {
  const secret = String(process.env.DISCORD_PRESENCE_SECRET || '')
  const got = String((req.headers['x-presence-secret'] as any) || '')

  if (!secret || got !== secret) {
    reply.status(401)
    return { ok: false, error: 'Unauthorized' }
  }

  const body = (req.body || {}) as any
  const status = normalizeDiscordPresence(body.status)

  setDiscordPresence(status)

  return { ok: true }
})
}