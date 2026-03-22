/**
 * Abbreviates a person's name by showing the first name and the first initial of subsequent names
 * @param name Full name to abbreviate (e.g., "Ben Herila" or "John Q. Public")
 * @returns Abbreviated name (e.g., "Ben H." or "John Q. P.") or "Unknown" if name is falsy
 */
export function abbreviateName(name: string | null | undefined): string {
  if (!name) return 'Unknown'
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  const first = parts[0]!
  const rest = parts.slice(1).map(part => `${part[0]}.`).join(' ')
  return `${first} ${rest}`
}
