import type { FastifyInstance } from 'fastify'
import type { LastFmClient } from '../../services/lastfm'
import { createBadge, svgReply } from '../../services/badges/badge.util'
import { getEstTimeLabel } from '../../services/badges/time.badge'
import { getLastFmNowPlaying } from '../../services/badges/lastfm.badge'

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

  // Placeholder until we wire Discord presence ingestion
  app.get('/discord', async (_req, reply) => {
    return svgReply(reply, createBadge('Discord', 'unlinked', 'grey'))
  })
}