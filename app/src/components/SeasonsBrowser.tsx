import { useEffect, useRef, useState } from 'react'
import type { Season } from '../types'
import { episodeKey, todayIso } from '../types'
import { gradientBorderStyle, BRAND_GRADIENT, BRAND_TEXT } from '../lib/theme'
import { useToast } from '../hooks/useToast'
import Icon from './Icon'
import AnchoredMenu from './AnchoredMenu'
import DateChipEditor from './DateChipEditor'
import DateField from './DateField'
import { isoDate, tt, ttx } from '../lib/i18n'
import { MOBILE } from '../lib/mobile/ui'

function formatAirDate(v: string) {
  return isoDate(v) ?? v
}

function formatShort(v: string) {
  return isoDate(v) ?? v
}

// Tek bir "pano" (liste/checklist) ikonu, üzerinde durumuna göre ya bir tik ya bir çarpı —
// eskiden yan yana iki ayrı yazılı buton vardı ("Sezonu İzlendi İşaretle" / "...İzlenmedi
// İşaretle"), kullanıcı "ikisine gerek yoktu, tek buton yeter, hangisi anlamlıysa o gelsin,
// yazı değil ikon olsun" dedi — bkz. aşağıdaki tek `SeasonToggleButton`.
function ClipboardCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6" />
      <path d="m9 12.5 2.2 2.2L15.5 10" />
    </svg>
  )
}

function ClipboardXIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6" />
      <path d="m9.5 10.5 5 5M14.5 10.5l-5 5" />
    </svg>
  )
}

// Bir bölüm satırı. Soldaki kutu artık SEÇİM kutusu (D2): kullanıcı "sol taraftaki tikleri seçme olarak
// kullanalım, tıklayınca o bölümü izlendi yapıp bugünün tarihini atmasın" dedi — izlendi/izlenmedi yapmak
// seçince çıkan işlem çubuğundan, tek bölüme geçmişe dönük tarih "+ Tarih gir"den. İzlenmişlik, görselin
// köşesindeki tik ve marka renkli "✓ İzlendi:" satırıyla görünür (yayın tarihiyle karışmasın diye ayrı renk).
//
// `editable` false iken (bkz. SeasonsBrowser) seçim kutusu ve düğmeler hiç render edilmez, ama izleme
// tarihi varsa yine salt-okunur gösterilir — düzenleme sadece BoardView'daki "Detayı Gör" penceresinde.
function EpisodeRow({
  episodeNumber,
  name,
  overview,
  airDate,
  stillUrl,
  dates,
  onSetDates,
  editable,
  upToCount = 0,
  onUpTo,
  selected = false,
  onSelect,
  isNext = false,
  unaired = false,
}: {
  episodeNumber: number
  name: string
  overview: string
  airDate: string
  stillUrl: string | null
  dates: string[]
  onSetDates: (dates: string[]) => void
  editable: boolean
  // "Buraya kadar izledim": sezonun başından bu bölüme kadar işaretsiz ve yayınlanmış kaç bölüm var (0 = düğme yok)
  upToCount?: number
  onUpTo?: (anchor: HTMLElement) => void
  selected?: boolean
  // Shift+tık: son seçilenden buna kadar aralık seçer
  onSelect?: (shift: boolean) => void
  // Sıradaki (ilk izlenmemiş) bölüm vurgulanır
  isNext?: boolean
  unaired?: boolean
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const watched = dates.length > 0

  return (
    <div
      className={`group flex gap-3 rounded-lg -mx-1.5 px-1.5 py-1 transition ${
        selected ? 'bg-[#00c0fa]/10 ring-1 ring-[#00c0fa]/50' : isNext ? 'bg-[#00c0fa]/[0.06] ring-1 ring-[#00c0fa]/30' : ''
      }`}
      data-ep={episodeNumber}
    >
      {editable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={tt('Bölümü seç')}
          title={MOBILE ? tt('Bölümü seç') : tt('Bölümü seç (Shift+tık: aralık)')}
          onClick={(e) => {
            e.stopPropagation()
            onSelect?.(e.shiftKey)
          }}
          style={selected ? { background: BRAND_GRADIENT } : undefined}
          className={`mt-1.5 h-5 w-5 shrink-0 rounded-md flex items-center justify-center border transition ${
            selected ? 'border-transparent text-white' : 'border-neutral-600 bg-neutral-800 hover:border-neutral-400'
          }`}
        >
          {selected && <Icon name="check" className="h-3 w-3" />}
        </button>
      )}
      <div className={`relative w-28 sm:w-36 aspect-video rounded-md overflow-hidden bg-neutral-800 shrink-0 ${unaired ? 'opacity-60' : ''}`}>
        {stillUrl ? (
          <img src={stillUrl} alt={name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">{episodeNumber}</div>
        )}
        {watched && (
          <span className="absolute top-1 left-1 h-5 w-5 rounded-full flex items-center justify-center text-white shadow" style={{ background: BRAND_GRADIENT }} title={tt('İzlendi')}>
            <Icon name="check" className="h-3 w-3" />
          </span>
        )}
        {isNext && !watched && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
            <span className="h-8 w-8 rounded-full bg-black/60 ring-1 ring-white/30 flex items-center justify-center text-white">
              <Icon name="play" className="h-4 w-4" />
            </span>
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-neutral-200">
          <span className="text-neutral-500">{episodeNumber}.</span> {name}
        </p>
        {isNext && !watched && <p className="text-[11px] font-semibold mt-0.5" style={{ color: BRAND_TEXT }}>{tt('Sıradaki bölüm')}</p>}
        {airDate && <p className="text-[11px] text-neutral-500 mt-0.5">{ttx('Yayın: {0}', formatAirDate(airDate))}</p>}
        {overview && <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{overview}</p>}
        {watched && (
          <p className="text-[11px] mt-1.5 font-medium" style={{ color: BRAND_TEXT }}>
            {ttx('✓ İzlendi: {0}{1}', dates.slice().sort().map(formatShort).join(', '), dates.length > 1 ? ` (${dates.length}x)` : '')}
          </p>
        )}
        {editable && (
          <button
            ref={anchorRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            title={watched ? tt('Başka bir izleme tarihi ekle') : tt('İzleme tarihi gir (geçmişe dönük olabilir)')}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-50 transition"
          >
            <Icon name="plus" className="h-3 w-3" />
            {watched ? tt('Tarih ekle') : tt('Tarih gir')}
          </button>
        )}
        {/* PC'de üzerine gelince görünür; telefonda (fare yok) hep görünür */}
        {editable && onUpTo && upToCount > 1 && (
          <button
            type="button"
            onClick={(e) => onUpTo(e.currentTarget)}
            title={tt('Sezonun başından bu bölüme kadar izlemediğin {0} bölümü işaretle', upToCount)}
            className={`mt-1 ml-3 inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-50 transition ${MOBILE ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
          >
            <Icon name="check" className="h-3 w-3" />
            {tt('Buraya kadar izledim')}
          </button>
        )}
        {editable && open && (
          <AnchoredMenu anchorRef={anchorRef} onClose={() => setOpen(false)} width={230}>
            <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl p-3 normal-case">
              <p className="text-[11px] text-neutral-500 mb-2">{tt('İzleme tarihleri')}</p>
              <DateChipEditor dates={dates} onChange={onSetDates} autoFocus />
            </div>
          </AnchoredMenu>
        )}
      </div>
    </div>
  )
}

export default function SeasonsBrowser({
  seasons,
  watched,
  onSetEpisodeDates,
  onMarkSeasonWatched,
  onUnmarkSeasonWatched,
  onSetManyEpisodeDates,
  onSaveManyWithUndo,
  editable = false,
}: {
  seasons: Season[]
  // O kaydın bölüm bazlı izleme haritası: { [episodeKey(sezon, bölüm)]: ISO tarih dizisi }
  watched: Record<string, string[]>
  onSetEpisodeDates: (key: string, dates: string[]) => void
  // upTo: "Buraya kadar izledim" — sezonun başından o bölüme kadar (dahil)
  onMarkSeasonWatched: (seasonNumber: number, date: string, upTo?: number) => void
  onUnmarkSeasonWatched: (seasonNumber: number) => void
  // Birden çok bölümün tarihlerini tek kayıtta değiştir ({ anahtar: yeni tarihler }, boş dizi = sil)
  onSetManyEpisodeDates?: (changes: Record<string, string[]>) => void
  // Aynısı, ama "Geri al" bildirimini (Durum ve İzleme Tarihi dahil) çağıran taraf gösterir
  onSaveManyWithUndo?: (changes: Record<string, string[]>, message: string) => void
  // Sadece BoardView'ın "Detayı Gör"üyle açılan pencerede true — bkz. EpisodeRow'un başındaki not.
  editable?: boolean
}) {
  const { confirm, notify } = useToast()
  // "Geri al" bildirimden sonra (pencere yeniden çizilmiş olabilir) en güncel kaydetme fonksiyonunu kullansın
  const setManyRef = useRef(onSetManyEpisodeDates)
  useEffect(() => {
    setManyRef.current = onSetManyEpisodeDates
  }, [onSetManyEpisodeDates])
  const canBulk = Boolean(onSaveManyWithUndo || onSetManyEpisodeDates)
  // Toplu değişikliği kaydet + "Geri al"
  function saveMany(changes: Record<string, string[]>, prev: Record<string, string[]>, message: string, tone: 'success' | 'info') {
    if (onSaveManyWithUndo) {
      onSaveManyWithUndo(changes, message)
      return
    }
    setManyRef.current?.(changes)
    notify(message, tone, { action: { label: tt('Geri al'), onClick: () => setManyRef.current?.(prev) } })
  }

  const today = todayIso()
  const aired = (ep: { airDate: string }) => !ep.airDate || ep.airDate <= today
  const isSeen = (sn: number, en: number) => (watched[episodeKey(sn, en)]?.length ?? 0) > 0
  // Sıradaki bölüm: izlenmiş en ileri bölümden sonraki ilk yayınlanmış, izlenmemiş bölüm (hiç izlenmediyse ilki).
  // Özel bölümler (0. sezon) çoğu zaman izlenmediği için hesaba girmez.
  const regular = seasons.filter((s) => s.seasonNumber > 0)
  const order = (regular.length ? regular : seasons).flatMap((s) => s.episodes.map((e) => ({ s: s.seasonNumber, e })))
  const nextEp = (() => {
    let last = -1
    order.forEach((x, i) => {
      if (isSeen(x.s, x.e.episodeNumber)) last = i
    })
    const n = order.slice(last + 1).find((x) => aired(x.e) && !isSeen(x.s, x.e.episodeNumber))
    return n ? episodeKey(n.s, n.e.episodeNumber) : null
  })()
  // Kaldığın yerden aç: sıradaki bölümün sezonu seçili gelir ve listede o bölüme kaydırılır. Yoksa son sezon.
  const [start] = useState(() => {
    if (nextEp) {
      const [sn, en] = nextEp.split('-').map(Number)
      return { season: sn, episode: en as number | null }
    }
    const list = regular.length ? regular : seasons
    return { season: list[list.length - 1]?.seasonNumber, episode: null as number | null }
  })
  const [activeSeason, setActiveSeason] = useState(start.season)
  const season = seasons.find((s) => s.seasonNumber === activeSeason) ?? seasons[0]
  // Sadece bölüm listesinin kendi kabı kaydırılır (scrollIntoView pencerenin tamamını zıplatırdı)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = listRef.current
    if (!box || !start.episode) return
    const el = box.querySelector<HTMLElement>(`[data-ep="${start.episode}"]`)
    if (el) box.scrollTop = Math.max(0, el.getBoundingClientRect().top - box.getBoundingClientRect().top - 8)
  }, [start.episode])
  // Yayın tarihi gelmemiş bölümler "tamamı izlendi" hesabına girmez (işaretlenemezler)
  const airedEps = season ? season.episodes.filter(aired) : []
  const seasonAllWatched = airedEps.length > 0 && airedEps.every((ep) => isSeen(season!.seasonNumber, ep.episodeNumber))

  // Sezonu izlendi yaparken hangi tarih: kullanıcı "bugünün tarihini atıyor, tarih sorsun, hatırlamıyorum
  // da olsun" dedi. Bugün, bir gün, yalnızca yıl ya da "?" (hatırlamıyorum — takvimde bir güne düşmez).
  // Aynı tarih menüsü "Buraya kadar izledim" ve seçili bölümler ("Başka tarih") için de açılır.
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuAnchor = useRef<HTMLElement | null>(null)
  const [dateMenu, setDateMenu] = useState<false | { upTo?: number; count?: number; bulk?: boolean }>(false)
  const [day, setDay] = useState('')
  const [year, setYear] = useState('')
  const markWith = (date: string) => {
    const upTo = dateMenu ? dateMenu.upTo : undefined
    const bulk = dateMenu && dateMenu.bulk
    setDateMenu(false)
    setDay('')
    setYear('')
    if (bulk) {
      bulkAdd(date)
      return
    }
    if (season) onMarkSeasonWatched(season.seasonNumber, date, upTo)
  }

  // ---- Seçim (D2): soldaki kutular seçer; en az bir bölüm seçiliyse işlem çubuğu çıkar. Seçim sezon değişince de kalır ----
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [bulkDate, setBulkDate] = useState(today)
  const lastPick = useRef<{ season: number; episode: number } | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  function clearSel() {
    setSel(new Set())
    lastPick.current = null
  }
  function pickEpisode(seasonNumber: number, episodeNumber: number, shift: boolean) {
    const key = episodeKey(seasonNumber, episodeNumber)
    setSel((prev) => {
      const next = new Set(prev)
      const from = lastPick.current
      if (shift && from && from.season === seasonNumber && season) {
        // Shift+tık: son seçilenden buna kadar hepsi seçilir (aynı sezonda)
        const [a, b] = [Math.min(from.episode, episodeNumber), Math.max(from.episode, episodeNumber)]
        for (const ep of season.episodes) if (ep.episodeNumber >= a && ep.episodeNumber <= b) next.add(episodeKey(seasonNumber, ep.episodeNumber))
      } else if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    lastPick.current = { season: seasonNumber, episode: episodeNumber }
  }
  // Seçili bölümlere tarihi EKLER (aynı tarih zaten varsa tekrar eklemez); "Geri al" eski hallerine döndürür
  function bulkAdd(date: string) {
    const changes: Record<string, string[]> = {}
    const prev: Record<string, string[]> = {}
    for (const key of sel) {
      const cur = watched[key] ?? []
      if (cur.includes(date)) continue
      prev[key] = [...cur]
      changes[key] = [...cur, date]
    }
    const n = Object.keys(changes).length
    if (n === 0) {
      notify(tt('Seçili bölümlerde bu tarih zaten var.'), 'info')
      return
    }
    clearSel()
    saveMany(changes, prev, tt('{0} bölüme izleme tarihi eklendi.', n), 'success')
  }
  async function bulkUnmark() {
    const keys = [...sel].filter((k) => (watched[k] ?? []).length > 0)
    if (keys.length === 0) {
      notify(tt('Seçili bölümlerin hiçbiri izlenmiş değil.'), 'info')
      return
    }
    // Tekrar izleme tarihleri de silineceği için birden çok tarihli bölüm varsa önce sorulur ("Geri al" her durumda var)
    if (keys.some((k) => (watched[k] ?? []).length > 1)) {
      const ok = await confirm({
        message: tt('Seçili {0} bölümün izleme tarihleri (tekrar izlemeler dahil) silinsin mi?', keys.length),
        confirmLabel: tt('İzlenmedi Yap'),
        tone: 'danger',
      })
      if (!ok) return
    }
    const prev: Record<string, string[]> = {}
    const changes: Record<string, string[]> = {}
    for (const k of keys) {
      prev[k] = [...(watched[k] ?? [])]
      changes[k] = []
    }
    clearSel()
    saveMany(changes, prev, tt('{0} bölüm izlenmedi yapıldı.', keys.length), 'info')
  }
  const yesterday = (() => {
    const t = new Date()
    t.setDate(t.getDate() - 1)
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  })()

  // Tek buton, iki anlamdan birini alır: sezon henüz tam izlenmediyse "izlendi işaretle"
  // (önce tarihi sorar), tamamı zaten izlendiyse "izlenmedi işaretle" (yıkıcı, önce soruyor).
  async function handleToggleSeason() {
    if (!season) return
    if (seasonAllWatched) {
      const ok = await confirm({
        message: tt('{0}\'daki tüm bölümlerin izlenme tiklerini (ve varsa tekrar izleme tarihlerini) kaldırmak istediğine emin misin?', season.name || tt('Sezon {0}', season.seasonNumber)),
        confirmLabel: tt('İzlenmedi Yap'),
        tone: 'danger',
      })
      if (!ok) return
      onUnmarkSeasonWatched(season.seasonNumber)
    } else {
      menuAnchor.current = toggleRef.current
      setDateMenu({})
    }
  }
  const opt = 'block w-full text-left px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800'
  const seasonLabel = (s: Season) => (s.seasonNumber > 0 ? ttx('{0}. Sezon', s.seasonNumber) : s.name || tt('Sezon {0}', s.seasonNumber))
  const totalSeen = order.filter((x) => isSeen(x.s, x.e.episodeNumber)).length
  const totalAired = order.filter((x) => aired(x.e)).length

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs text-neutral-500 tabular-nums">
          {totalSeen > 0 ? ttx('{0} / {1} bölüm izlendi', totalSeen, totalAired) : ttx('{0} bölüm', totalAired)}
        </p>
        {editable && season && airedEps.length > 0 && (
          <button
            ref={toggleRef}
            type="button"
            onClick={handleToggleSeason}
            title={seasonAllWatched ? tt('Sezonu izlenmedi olarak işaretle') : tt('Sezonu izlendi olarak işaretle')}
            className={`shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border transition ${
              seasonAllWatched
                ? 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10'
                : 'border-neutral-700 text-neutral-400 hover:text-neutral-50 hover:border-neutral-500'
            }`}
          >
            {seasonAllWatched ? <ClipboardXIcon /> : <ClipboardCheckIcon />}
          </button>
        )}
      </div>
      {/* Sezon şeridi (D2): her sezon küçük bir kutu, içinde bölüm başına bir nokta. Çok sezonlu dizilerde
          PC'de alt satıra geçer (çok yüksekse kendi içinde kayar), telefonda yatay kayar — üst üste binmez. */}
      <div
        className={`mb-3 flex gap-2 ${MOBILE ? 'overflow-x-auto pb-1 -mx-1 px-1' : 'flex-wrap max-h-56 overflow-y-auto pr-1'}`}
        role="tablist"
        aria-label={tt('Sezonlar')}
      >
        {seasons.map((s) => {
          const on = s.seasonNumber === season?.seasonNumber
          const seen = s.episodes.filter((ep) => isSeen(s.seasonNumber, ep.episodeNumber)).length
          const all = s.episodes.length > 0 && seen === s.episodes.length
          return (
            <button
              key={s.seasonNumber}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActiveSeason(s.seasonNumber)}
              title={s.name || undefined}
              style={on ? gradientBorderStyle() : undefined}
              className={`shrink-0 w-36 text-left rounded-xl border-[1.5px] px-2.5 py-2 transition ${
                on ? '' : 'bg-neutral-800/70 border-neutral-700/80 hover:border-[#00c0fa]/60'
              }`}
            >
              <span className="flex items-baseline justify-between gap-1.5">
                <span className={`text-xs font-semibold truncate ${on ? 'text-neutral-50' : 'text-neutral-200'}`}>{seasonLabel(s)}</span>
                <span className={`text-[11px] tabular-nums shrink-0 inline-flex items-center gap-0.5 ${all ? 'text-emerald-400' : 'text-neutral-500'}`}>
                  {all && <Icon name="check" className="h-3 w-3" />}
                  {seen}/{s.episodes.length}
                </span>
              </span>
              <span className="mt-1.5 flex flex-wrap gap-[3px]">
                {s.episodes.map((ep) => {
                  const w = isSeen(s.seasonNumber, ep.episodeNumber)
                  const nx = episodeKey(s.seasonNumber, ep.episodeNumber) === nextEp
                  return (
                    <i
                      key={ep.episodeNumber}
                      className={`block h-1.5 w-1.5 rounded-full ${
                        w ? 'bg-[#00c0fa]' : nx ? 'bg-neutral-50 shadow-[0_0_6px_2px_rgba(0,192,250,0.75)]' : aired(ep) ? 'bg-neutral-600' : 'bg-neutral-600/30'
                      }`}
                    />
                  )
                })}
              </span>
            </button>
          )
        })}
      </div>
      {dateMenu && (
        <AnchoredMenu anchorRef={menuAnchor} align={dateMenu.upTo !== undefined || dateMenu.bulk ? 'left' : 'right'} width={248} onClose={() => setDateMenu(false)}>
          <div className="py-1 rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl overflow-hidden">
            <p className="px-3 pt-1 pb-1 text-[11px] uppercase tracking-wider text-neutral-500">{tt('Ne zaman izledin?')}</p>
            {dateMenu.upTo !== undefined && (
              <p className="px-3 pb-1 text-[11px] text-neutral-400">{tt('{0}. bölüme kadar {1} bölüm işaretlenecek', dateMenu.upTo, dateMenu.count ?? 0)}</p>
            )}
            {dateMenu.bulk && <p className="px-3 pb-1 text-[11px] text-neutral-400">{tt('{0} seçili bölüme eklenecek', sel.size)}</p>}
            <button className={opt} onClick={() => markWith(today)}>{tt('Bugün')}</button>
            <button className={opt} onClick={() => markWith(yesterday)}>{tt('Dün')}</button>
            <div className="flex gap-1.5 px-3 py-1">
              <DateField value={day} max={today} onChange={setDay} className="flex-1" ariaLabel={tt('Bir gün seç')} onEnter={() => day && markWith(day)} />
              <button disabled={!day} onClick={() => markWith(day)} className="rounded-md bg-neutral-800 hover:bg-neutral-700 px-2 text-sm text-neutral-100 disabled:opacity-40">{tt('Ekle')}</button>
            </div>
            <div className="flex gap-1.5 px-3 py-1">
              <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder={tt('Yılı (ör. 2019)')} inputMode="numeric" className="min-w-0 flex-1 rounded-md bg-neutral-950 border border-neutral-700 px-2 py-1 text-sm text-neutral-100" />
              <button disabled={!/^(19|20)\d\d$/.test(year)} onClick={() => markWith(year)} className="rounded-md bg-neutral-800 hover:bg-neutral-700 px-2 text-sm text-neutral-100 disabled:opacity-40">{tt('Ekle')}</button>
            </div>
            <button className={opt} onClick={() => markWith('?')}>{tt('Ne zaman izlediğimi hatırlamıyorum')}</button>
          </div>
        </AnchoredMenu>
      )}
      {editable && canBulk && sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-[#00c0fa]/40 bg-[#00c0fa]/5 px-3 py-2 text-xs">
          <span className="text-neutral-100 font-medium mr-1">{tt('{0} bölüm seçildi', sel.size)}</span>
          <span className="inline-flex items-stretch gap-1">
            <DateField value={bulkDate} max={today} allowEmpty={false} onChange={(d) => d && setBulkDate(d)} className="w-32" ariaLabel={tt('İzleme tarihi')} onEnter={() => bulkAdd(bulkDate || today)} />
            <button type="button" onClick={() => bulkAdd(bulkDate || today)} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium text-white" style={{ background: BRAND_GRADIENT }}>
              <Icon name="check" className="h-3.5 w-3.5" />
              {tt('İzlendi yap')}
            </button>
            <button
              ref={moreRef}
              type="button"
              title={tt('Başka tarih: dün, yalnızca yıl ya da hatırlamıyorum')}
              aria-label={tt('Başka tarih')}
              onClick={() => {
                menuAnchor.current = moreRef.current
                setDateMenu({ bulk: true })
              }}
              className="rounded-md border border-neutral-700 px-1.5 text-neutral-300 hover:text-neutral-50"
            >
              <Icon name="calendar" className="h-3.5 w-3.5" />
            </button>
          </span>
          <button type="button" onClick={() => void bulkUnmark()} className="rounded-md border border-rose-500/40 px-2.5 py-1 text-rose-300 hover:bg-rose-500/10">
            {tt('İzlenmedi yap')}
          </button>
          {season && (
            <button
              type="button"
              onClick={() => setSel((prev) => new Set([...prev, ...season.episodes.filter(aired).map((e) => episodeKey(season.seasonNumber, e.episodeNumber))]))}
              className="rounded-md border border-neutral-700 px-2.5 py-1 text-neutral-300 hover:text-neutral-50"
            >
              {tt('Bu sezonun hepsini seç')}
            </button>
          )}
          <button type="button" onClick={clearSel} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-neutral-400 hover:text-neutral-50">
            <Icon name="close" className="h-3 w-3" />
            {tt('Seçimi temizle')}
          </button>
        </div>
      )}
      <div ref={listRef} className="space-y-2 max-h-96 overflow-y-auto pr-1 pl-1.5">
        {season?.episodes.map((ep) => {
          const key = episodeKey(season!.seasonNumber, ep.episodeNumber)
          // Bu bölüme kadar (dahil) işaretsiz ve yayınlanmış bölüm sayısı
          const upToCount =
            editable && aired(ep)
              ? season!.episodes.filter((e) => e.episodeNumber <= ep.episodeNumber && aired(e) && !isSeen(season!.seasonNumber, e.episodeNumber)).length
              : 0
          return (
            <EpisodeRow
              key={ep.episodeNumber}
              episodeNumber={ep.episodeNumber}
              name={ep.name}
              overview={ep.overview}
              airDate={ep.airDate}
              stillUrl={ep.stillUrl}
              dates={watched[key] ?? []}
              onSetDates={(dates) => onSetEpisodeDates(key, dates)}
              editable={editable}
              upToCount={upToCount}
              selected={sel.has(key)}
              onSelect={canBulk ? (shift) => pickEpisode(season!.seasonNumber, ep.episodeNumber, shift) : undefined}
              isNext={key === nextEp}
              unaired={!aired(ep)}
              onUpTo={(anchor) => {
                menuAnchor.current = anchor
                setDateMenu({ upTo: ep.episodeNumber, count: upToCount })
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
