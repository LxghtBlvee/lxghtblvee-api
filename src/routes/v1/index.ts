import type { FastifyInstance } from 'fastify'
import type { LastFmClient } from '../../services/lastfm.js'
import { registerMusicRoutes } from './music.js'
import { registerBadgeRoutes } from './badges.js'

export async function registerV1Routes(
  app: FastifyInstance,
  opts: { lastfm: LastFmClient }
) {
  await app.register(
    async (v1) => {
      await v1.register(
        async (r) => registerMusicRoutes(r, opts),
        { prefix: '/music' }
      )

      await v1.register(
        async (r) => registerBadgeRoutes(r, opts),
        { prefix: '/badges' }
      )
    },
    { prefix: '/v1' }
  )
}