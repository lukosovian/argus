import { todayIso } from '../../types'
import type { Bilet } from '../../lib/api'
import { tt } from '../../lib/i18n'

// Yaklaşan seans (Y26): ileri tarihli (ya da bugün, saati henüz gelmemiş) bilet. Böyle biletler Biletlerim'de ayrı
// "Yaklaşan seans" kartında durur, duvara girmez ve izlendi sayılmaz (markBiletWatched ileri tarihe dokunmaz).
// Seans saati geçince (film süresi bilinmediğinden ~2,5 saat sonra) SeansWatcher izlendi işaretler; puan sorusu
// sunucudan gelir.

export function seansTime(b: Pick<Bilet, 'date' | 'time'>): Date | null {
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return null
  const [y, m, d] = b.date.split('-').map(Number)
  const t = /^(\d{1,2})[:.]?(\d{2})/.exec((b.time ?? '').trim())
  // Saatsiz bilette o günün sonu
  return t ? new Date(y, m - 1, d, Number(t[1]), Number(t[2])) : new Date(y, m - 1, d, 23, 59)
}

export function isUpcoming(b: Pick<Bilet, 'date' | 'time'>, now = new Date()): boolean {
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return false
  if (b.date > todayIso()) return true
  if (b.date < todayIso() || !b.time) return false
  const at = seansTime(b)
  return Boolean(at && at.getTime() > now.getTime())
}

// Seans bitti mi (izlendi işaretlemek için): seans + 150 dk geçmiş, en fazla 14 gün önce
export function seansOver(b: Pick<Bilet, 'date' | 'time'>, now = new Date()): boolean {
  const at = seansTime(b)
  if (!at) return false
  const end = at.getTime() + (b.time ? 150 : 0) * 60000
  return end <= now.getTime() && now.getTime() - end < 14 * 86400000
}

// "3 gün 4 saat" / "2 saat 10 dk" / "Bugün 21:00"
export function countdown(b: Pick<Bilet, 'date' | 'time'>, now = new Date()): string {
  const at = seansTime(b)
  if (!at) return ''
  const ms = at.getTime() - now.getTime()
  if (ms <= 0) return tt('Seans başladı')
  const min = Math.floor(ms / 60000)
  const days = Math.floor(min / 1440)
  const hours = Math.floor((min % 1440) / 60)
  if (days >= 1) return hours ? tt('{0} gün {1} saat', days, hours) : tt('{0} gün', days)
  if (hours >= 1) return tt('{0} saat {1} dk', hours, min % 60)
  return tt('{0} dk', Math.max(1, min))
}

// Telefonda çekilen bilet fotoğrafı: küçültülüp JPEG metnine çevrilir (PC yokken de kaydedilir, PC'ye gidince dosya olur)
export async function photoToDataUrl(file: File, max = 1400, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error(tt('Fotoğraf okunamadı.')))
      i.src = url
    })
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * k)
    c.height = Math.round(img.naturalHeight * k)
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error(tt('Fotoğraf okunamadı.'))
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}
