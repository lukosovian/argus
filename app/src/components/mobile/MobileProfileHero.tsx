import { useEffect, useState } from 'react'
import type { Board, HomeSettings, Row } from '../../types'
import { titleText } from '../../types'
import { resolveRole, resolveStatusOption } from '../../lib/roles'
import { locale, tt } from '../../lib/i18n'
import { averageColor } from '../../lib/imageColor'
import Icon, { type IconName } from '../Icon'

// ARGUS Android › "Kim izliyor?" arka planı — kullanıcı "tam tam Netflix gibi olsun, üstteki içerik birkaç
// saniyede bir değişiyor" dedi: arşivden birkaç yapım (önce yakında vizyona girecekler, sonra izlemekte olduğun /
// izleyeceklerin / en sevdiklerin) ekranın tamamını kaplayan görsel + logo + kısa etiketle sırayla gelir.
// Görselin baskın rengi dışarı bildirilir; alttaki profil bölümü o renge bürünür. Profil seçilmeden önce açıldığı
// için veriler son kullanılan (yoksa ilk) profilden okunur.
export const LAST_PROFILE_KEY = 'mobil.sonProfil'
const ROTATE_MS = 3500

export interface HeroSlide {
  image: string
  logo: string
  title: string
  icon: IconName
  caption: string
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url)
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

// Arşivden sırayla gösterilecek yapımlar (telefonda ve bilgisayarda "Kim izliyor?" arka planı) + şu anki sıra
export function useHeroSlides(profileIds: string[], rotateMs = ROTATE_MS) {
  const [slides, setSlides] = useState<HeroSlide[]>([])
  const [index, setIndex] = useState(0)
  // Profil listesi her çizimde yeni bir dizi olarak geliyor; sadece içerik değişince yeniden yüklensin
  // (yoksa renk her güncellendiğinde liste baştan karışıp görsel her saniye değişiyordu).
  const idsKey = profileIds.join(',')

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : []
    if (!ids.length) return
    const last = localStorage.getItem(LAST_PROFILE_KEY)
    const pid = last && ids.includes(last) ? last : ids[0]
    let alive = true
    ;(async () => {
      const home = await getJson<HomeSettings>(`/api/profiles/${pid}/home-settings`)
      const boards = await getJson<Board[]>(`/api/profiles/${pid}/boards`)
      const board = boards?.find((b) => b.id === home?.boardId) ?? boards?.[0]
      if (!board) return
      const rows = (await getJson<Row[]>(`/api/profiles/${pid}/boards/${board.id}/rows`)) ?? []
      const coverProp = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
      const logoProp = board.properties.find((p) => p.id === board.titleImagePropertyId && p.type === 'image')
      const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
      const vizyon = resolveRole(board, 'vizyon')
      const durum = resolveRole(board, 'durum')
      const puan = resolveRole(board, 'puan')
      const izleniyor = resolveStatusOption(board, 'izleniyor')
      const izlenecek = resolveStatusOption(board, 'izlenecek')
      const str = (r: Row, id?: string) => (id && typeof r.values[id] === 'string' ? (r.values[id] as string) : '')
      // Logosu ve yazısız görseli olanlar (Netflix'teki gibi görsel + logo)
      const usable = rows.filter((r) => str(r, coverProp?.id) && str(r, logoProp?.id))
      const today = new Date().toISOString().slice(0, 10)
      const avg = (r: Row) => {
        const v = puan ? r.values[puan.id] : null
        const nums = v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v as Record<string, number>) : []
        return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
      }
      const fmt = (d: string) =>
        new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))).toLocaleDateString(locale(), { day: 'numeric', month: 'long' })

      const picked = new Map<string, HeroSlide>()
      const add = (r: Row, icon: IconName, caption: string) => {
        if (picked.has(r.id) || picked.size >= 6) return
        picked.set(r.id, { image: str(r, coverProp?.id), logo: str(r, logoProp?.id), title: titleProp ? titleText(titleProp, r.values[titleProp.id]) : '', icon, caption })
      }
      if (vizyon)
        usable
          .filter((r) => str(r, vizyon.id) >= today)
          .sort((a, b) => str(a, vizyon.id).localeCompare(str(b, vizyon.id)))
          .slice(0, 2)
          .forEach((r) => add(r, 'clapper', tt('Vizyon: {0}', fmt(str(r, vizyon.id)))))
      if (durum && izleniyor) shuffle(usable.filter((r) => r.values[durum.id] === izleniyor)).slice(0, 2).forEach((r) => add(r, 'play', tt('İzlemeye devam et')))
      shuffle(usable.filter((r) => avg(r) >= 8.5))
        .slice(0, 2)
        .forEach((r) => add(r, 'star', tt('{0} puan verdin', avg(r).toFixed(1))))
      if (durum && izlenecek) shuffle(usable.filter((r) => r.values[durum.id] === izlenecek)).slice(0, 2).forEach((r) => add(r, 'bookmark', tt('Listende')))
      shuffle(usable).forEach((r) => add(r, 'sparkle', tt('Arşivinden')))
      if (alive) setSlides(shuffle([...picked.values()]))
    })()
    return () => {
      alive = false
    }
  }, [idsKey])

  // Birkaç saniyede bir sıradaki
  useEffect(() => {
    if (slides.length < 2) return
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), rotateMs)
    return () => clearInterval(t)
  }, [slides.length, rotateMs])

  return { slides, index }
}

export default function MobileProfileHero({ profileIds, onColor }: { profileIds: string[]; onColor: (rgb: [number, number, number] | null) => void }) {
  const { slides, index } = useHeroSlides(profileIds)
  const current = slides[index]
  useEffect(() => {
    if (!current) return
    let alive = true
    averageColor(current.image).then((c) => alive && onColor(c))
    return () => {
      alive = false
    }
  }, [current, onColor])

  return (
    <div className="absolute inset-0 overflow-hidden bg-neutral-950">
      {slides.map((s, i) => (
        <img
          key={s.image + i}
          src={s.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
          style={{ opacity: i === index ? 1 : 0, objectPosition: '60% center' }}
        />
      ))}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/50 to-transparent" />
      {current && (
        <div key={current.image} className="absolute inset-x-0 z-10 flex flex-col items-center px-8 text-center" style={{ bottom: 'calc(var(--profil-panel, 21rem) + 3.25rem)', animation: 'argus-fade-in .8s ease-out' }}>
          {current.logo ? (
            <img src={current.logo} alt={current.title} className="max-h-20 max-w-[72%] object-contain drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]" />
          ) : (
            <p className="text-3xl font-bold text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
              {current.title}
            </p>
          )}
          {current.caption && (
            <p className="mt-3 flex items-center gap-2 text-[15px] font-semibold text-white">
              <Icon name={current.icon} className="h-[18px] w-[18px]" />
              {current.caption}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
