import type { FastifyInstance } from 'fastify'
import type { LastFmClient } from '../../services/lastfm.js'
import { registerMusicRoutes } from './music.js'

export async function registerV1Routes(
  app: FastifyInstance,
  opts: { lastfm: LastFmClient },
) {
  await app.register(
    async (v1) => {
      await registerMusicRoutes(v1, opts)
    },
    { prefix: '/v1/music' },
  )
}
