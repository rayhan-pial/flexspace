/**
 * A new unique ID such as `widget-3f9a1c2b7d4e`. IDs match the schema pattern (A-Z a-z 0-9 _ -,
 * 1-64 characters). Commands take the ID as an argument so they stay pure; UI code calls this.
 */
export function newId(prefix: string): string {
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 12)
  return `${prefix}-${random}`
}
