export function formatInvitationExpiry(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().slice(0, 19).replace('T', ' ')} UTC`
}
