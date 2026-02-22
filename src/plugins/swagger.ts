import type { FastifyInstance } from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

export async function registerSwagger(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'LxghtBlvee API',
        description: 'Personal API for LxghtBlvee. Includes Last.fm now playing.',
        version: '1.0.0',
      },
      tags: [
        { name: 'System', description: 'Service health and diagnostics' },
        { name: 'Music', description: 'Music endpoints (Last.fm)' },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  })
}
