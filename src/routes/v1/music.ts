import type { FastifyInstance } from 'fastify'
import type { LastFmClient } from '../../services/lastfm.js'

export async function registerMusicRoutes(
  app: FastifyInstance,
  opts: { lastfm: LastFmClient },
) {
  app.get(
    '/now-playing',
    {
      schema: {
        tags: ['Music'],
        summary: 'Live music status from Last.fm',
        description:
          'Returns the most recent track and whether it is currently playing.',
        response: {
          200: {
            type: 'object',
            properties: {
              username: { type: 'string' },
              isNowPlaying: { type: 'boolean' },
              track: {
                anyOf: [
                  { type: 'null' },
                  {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      artist: { type: 'string' },
                      album: { anyOf: [{ type: 'null' }, { type: 'string' }] },
                      url: { type: 'string' },
                      imageUrl: { anyOf: [{ type: 'null' }, { type: 'string' }] },
                    },
                    required: ['name', 'artist', 'album', 'url', 'imageUrl'],
                  },
                ],
              },
              lastPlayedAt: { anyOf: [{ type: 'null' }, { type: 'number' }] },
              fetchedAt: { type: 'number' },
            },
            required: [
              'username',
              'isNowPlaying',
              'track',
              'lastPlayedAt',
              'fetchedAt',
            ],
          },
        },
      },
    },
    async () => {
      return await opts.lastfm.nowPlaying()
    },
  )
}
