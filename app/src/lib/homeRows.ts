import type { HomeSettings } from '../types'

// Ana sayfada vitrinin altındaki satırların sırası — ayarlar (Görünüm › Satırların sırası) ve AnaSayfa aynı
// listeyi kullanıyor. Eskiden her özel satırın kendi "kaçıncı satırda" numarası vardı, sayfa satırlarının
// sırası ayrıca tutuluyordu; aynı numarayı alanlarda hangisinin önce geleceği gizli bir kurala bağlıydı.
// Artık settings.homeRowOrder tek liste. Yoksa (eski kayıtlar) eski numaralardan aynı sonucu verecek şekilde
// hesaplanır; listede olmayan (yeni açılmış) bir özel satır eski numarasının yerine, yeni bir sayfa en sona girer.
// "En altta rastgele satırlar" her zaman en sonda, bu listede değil.

export interface HomeRowEntry {
  key: string
  label: string
}

interface Special extends HomeRowEntry {
  position: number
}

function sortByOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  const idx = new Map(order.map((id, i) => [id, i]))
  return [...items].sort((a, b) => (idx.get(a.id) ?? Infinity) - (idx.get(b.id) ?? Infinity))
}

function parts(settings: HomeSettings) {
  const specials: Special[] = []
  if (settings.newEpisodesRow ?? true) specials.push({ key: 'new-episodes', label: 'Yeni Bölümler', position: settings.newEpisodesPosition ?? 1 })
  if (settings.onThisDay?.enabled ?? true) specials.push({ key: 'on-this-day', label: 'Geçmiş yıllarda bugün', position: settings.onThisDay?.position ?? 1 })
  if (settings.topRated?.enabled) specials.push({ key: 'top-rated', label: 'Arşivindeki En İyi 10', position: settings.topRated.position ?? 2 })
  if (settings.moodRow?.enabled) specials.push({ key: 'mood', label: settings.moodRow.title?.trim() || 'Mod satırı', position: settings.moodRow.position ?? 1 })
  const base: HomeRowEntry[] = [
    ...((settings.showAllSection ?? true) ? [{ key: 'all', label: 'Tümü' }] : []),
    ...sortByOrder(
      (settings.sections ?? []).filter((s) => s.showInBody !== false),
      settings.bodyOrder ?? [],
    ).map((s) => ({ key: `section:${s.id}`, label: s.name || 'Adsız sayfa' })),
  ]
  return { specials, base }
}

// Özel satırı eski numarasının yerine koy (aynı numaradakiler arka arkaya) — eski AnaSayfa davranışının aynısı
function placeLegacy(list: HomeRowEntry[], specials: Special[]) {
  let out = [...list]
  const ties = new Map<number, number>()
  for (const p of [...specials].sort((a, b) => a.position - b.position)) {
    const pos = Math.max(Math.round(p.position), 1)
    const t = ties.get(pos) ?? 0
    ties.set(pos, t + 1)
    const at = Math.min(pos - 1 + t, out.length)
    out = [...out.slice(0, at), { key: p.key, label: p.label }, ...out.slice(at)]
  }
  return out
}

// Açık olan satırlar, gösterilecek sırayla
export function homeRowOrder(settings: HomeSettings): HomeRowEntry[] {
  const { specials, base } = parts(settings)
  const saved = settings.homeRowOrder
  if (!saved?.length) return placeLegacy(base, specials)
  const all = new Map([...specials, ...base].map((e) => [e.key, { key: e.key, label: e.label }]))
  const list = saved.filter((k) => all.has(k)).map((k) => all.get(k)!)
  const inList = new Set(list.map((e) => e.key))
  // Listede olmayan sayfalar sona, özel satırlar eski numaralarının yerine
  const missingBase = base.filter((e) => !inList.has(e.key))
  const missingSpecials = specials.filter((e) => !inList.has(e.key))
  return placeLegacy([...list, ...missingBase], missingSpecials)
}

// Sıralamayı değiştirince kaydedilecek liste: açık olanların yeni sırası, kapalı olanlar sonda (yeniden
// açılınca en sona gelir, oradan istenen yere taşınır).
export function withOrder(settings: HomeSettings, keys: string[]): string[] {
  const rest = (settings.homeRowOrder ?? []).filter((k) => !keys.includes(k))
  return [...keys, ...rest]
}
