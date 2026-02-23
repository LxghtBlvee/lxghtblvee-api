import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4010),
  PUBLIC_ORIGIN: z.string().default('http://localhost:3000'),

  LASTFM_API_KEY: z.string().min(1),
  LASTFM_USERNAME: z.string().min(1),

  LASTFM_CACHE_TTL_MS: z.coerce.number().int().positive().default(3500),

  DISCORD_PRESENCE_SECRET: z.string().min(1),
})

export type Env = z.infer<typeof EnvSchema>

export function readEnv(raw: NodeJS.ProcessEnv): Env {
  const parsed = EnvSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid env:\n${msg}`)
  }
  return parsed.data
}
