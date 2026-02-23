import { makeBadge } from 'badge-maker'

export function createBadge(label: string, message: string, color: string) {
  return makeBadge({
    label,
    message,
    color,
    style: 'flat'
  })
}

export function svgReply(reply: any, svg: string) {
  reply.header('Content-Type', 'image/svg+xml')
  reply.header('Cache-Control', 'no-store')
  return reply.send(svg)
}