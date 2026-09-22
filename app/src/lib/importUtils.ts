// Notion CSV exports dates as dd/mm/yyyy and date-ranges as "dd/mm/yyyy → dd/mm/yyyy".
export function parseNotionDate(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]
  return ''
}

export function parseNotionDateRange(raw: string): [string, string] {
  const s = raw.trim()
  if (!s) return ['', '']
  const parts = s.split(/→|->/).map((p) => p.trim())
  return [parseNotionDate(parts[0] ?? ''), parseNotionDate(parts[1] ?? parts[0] ?? '')]
}

export function parseList(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
}

export function parseStars(raw: string): number {
  if (!raw) return 0
  const starCount = (raw.match(/★/g) || []).length
  if (starCount > 0) return starCount
  const n = parseFloat(raw.replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n) : 0
}

export function parseBool(raw: string): boolean {
  const s = raw.trim().toLocaleLowerCase('tr')
  return ['true', 'evet', 'yes', '✓', 'checked', '1', '♥'].includes(s)
}
