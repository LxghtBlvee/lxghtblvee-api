export type DiscordPresence = 'online' | 'idle' | 'dnd' | 'offline' | 'unknown'

type PresenceState = {
  status: DiscordPresence
  updatedAt: number
}

let state: PresenceState = {
  status: 'unknown',
  updatedAt: 0
}

export function setDiscordPresence(status: DiscordPresence) {
  state = {
    status,
    updatedAt: Date.now()
  }
}

export function getDiscordPresence() {
  return state
}

export function normalizeDiscordPresence(raw: unknown): DiscordPresence {
  const s = String(raw || '').toLowerCase()
  if (s === 'online') return 'online'
  if (s === 'idle') return 'idle'
  if (s === 'dnd') return 'dnd'
  if (s === 'offline') return 'offline'
  return 'unknown'
}