import type { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'

export async function registerCors(app: FastifyInstance, opts: { origin: string }) {
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (origin === opts.origin) return cb(null, true)
      return cb(new Error('CORS blocked'), false)
    },
    credentials: true,
  })
}
