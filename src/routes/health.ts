import type { FastifyInstance } from 'fastify'

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Health check',
        response: {
          200: {
            type: 'object',
            properties: { ok: { type: 'boolean' }, ts: { type: 'number' } },
            required: ['ok', 'ts'],
          },
        },
      },
    },
    async () => {
      return { ok: true, ts: Date.now() }
    },
  )
}
