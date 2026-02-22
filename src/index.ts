import 'dotenv/config'
import Fastify from 'fastify'
import { readEnv } from './config/env.js'
import { registerSwagger } from './plugins/swagger.js'
import { registerCors } from './plugins/cors.js'
import { registerHealthRoutes } from './routes/health.js'
import { registerV1Routes } from './routes/v1/index.js'
import { LastFmClient } from './services/lastfm.js'

const env = readEnv(process.env)

const app = Fastify({
  logger: {
    level: 'info',
  },
})

await registerSwagger(app)
await registerCors(app, { origin: env.PUBLIC_ORIGIN })

await registerHealthRoutes(app)

const lastfm = new LastFmClient({
  apiKey: env.LASTFM_API_KEY,
  username: env.LASTFM_USERNAME,
  cacheTtlMs: env.LASTFM_CACHE_TTL_MS,
})

await registerV1Routes(app, { lastfm })

app.get(
  '/',
  {
    schema: {
      tags: ['System'],
      summary: 'Service root',
    },
  },
  async () => {
    return {
      name: 'lxghtblvee-api',
      docs: '/docs',
      ts: Date.now(),
    }
  },
)

app.setErrorHandler((err, _req, reply) => {
  const status = (err as any).statusCode && Number((err as any).statusCode)
  const code = status && status >= 400 && status < 600 ? status : 500

  app.log.error({ err }, 'request failed')

  reply.status(code).send({
    ok: false,
    error: code === 500 ? 'Internal Server Error' : String(err.message || err),
  })
})

await app.listen({ port: env.PORT, host: '0.0.0.0' })
