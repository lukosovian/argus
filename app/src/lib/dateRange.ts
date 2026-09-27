// İzleme tarihi aralıkları — kullanıcı "Notion'daki end date mantığı": dün başladım bugün bitirdim, ya da
// bir diziye aylar önce başlayıp dün bitirdim. Çoklu Tarih (multidate) sütunundaki her öğe ya tek bir
// gün ("2025-04-06") ya da bir aralık ("2025-04-06/2025-04-07", ISO aralık yazımı). Eski tek tarihler
// olduğu gibi geçerli; her öğe bir izleme (tekrar izleme = ikinci öğe).
export interface DateEntry {
  start: string
  end: string | null
}

export function parseEntry(s: string): DateEntry {
  const [a, b] = String(s).split('/')
  if (b && b !== a) return a < b ? { start: a, end: b } : { start: b, end: a }
  return { start: a, end: null }
}

export function makeEntry(start: string, end?: string | null): string {
  if (!end || end === start) return start
  return start < end ? `${start}/${end}` : `${end}/${start}`
}

// Bitiş (yoksa başlangıç) — "ne zaman izledin / bitirdin" sorularında kullanılan tarih.
export function entryEnd(s: string): string {
  const e = parseEntry(s)
  return e.end ?? e.start
}

export function entryStart(s: string): string {
  return parseEntry(s).start
}

// Bir öğenin kapsadığı günler mi? (tek gün ya da aralığın başı/sonu)
export function entryTouches(s: string, day: string): boolean {
  const e = parseEntry(s)
  return e.start === day || e.end === day
}

export function toEntries(v: unknown): string[] {
  if (Array.isArray(v)) return (v as string[]).filter(Boolean)
  return typeof v === 'string' && v ? [v] : []
}

// "12.08.24" ya da "09.08.24 → 12.08.24"; `fmt` tek günü biçimlendirir.
export function formatEntry(s: string, fmt: (iso: string) => string): string {
  const e = parseEntry(s)
  return e.end ? `${fmt(e.start)} → ${fmt(e.end)}` : fmt(e.start)
}
