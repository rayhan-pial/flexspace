/**
 * Twelve random hex characters. `crypto.randomUUID` only exists in secure contexts (HTTPS or localhost), so a
 * page opened over plain HTTP at a LAN address such as http://192.168.1.71:5173 must not depend on it;
 * `getRandomValues` is available everywhere.
 */
function randomHex(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * A new unique ID such as `widget-3f9a1c2b7d4e`. IDs match the schema pattern (A-Z a-z 0-9 _ -,
 * 1-64 characters). Commands take the ID as an argument so they stay pure; UI code calls this.
 */
export function newId(prefix: string): string {
  return `${prefix}-${randomHex()}`
}
