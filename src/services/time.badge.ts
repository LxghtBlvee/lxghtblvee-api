export function getEstTime() {
    const now = new Date()

    return now.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
    }) + ' EST'
}