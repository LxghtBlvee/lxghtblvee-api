export function getEstTimeLabel() {
  const now = new Date()

  const time = now.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit'
  })

  return `${time} EST`
}