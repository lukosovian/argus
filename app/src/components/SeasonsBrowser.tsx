import { useEffect, useRef, useState } from 'react'
import type { Season } from '../types'
import { episodeKey, todayIso } from '../types'
import { gradientBorderStyle, BRAND_TEXT } from '../lib/theme'
import { useToast } from '../hooks/useToast'
import Checkbox from './Checkbox'
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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="h-3 w-3">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
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

// Bir bölümün izlenme durumu: tik = en az bir izleme tarihi var. Kutucuğa tıklamak hızlı
// açma/kapama (0 tarih <-> bugünün tarihi). Yayın tarihiyle (TMDB'den gelen, "Yayın:" ön ekli,
// nötr gri) karışmasın diye izleme tarihi ayrı, marka renginde ve "✓ İzlendi:" ön ekiyle
// gösteriliyor — kullanıcı "izleme tarihi kısmı güzel görünmüyo, üstte bölümün çıkış tarihi
// var ya onla karışırsa" dedi.
//
// "+ Tarih ekle/gir" düğmesi artık bölüm işaretliyken DEĞİL, `editable` her true olduğunda
// görünüyor — böylece bir bölümü tiklemeden ÖNCE de açılıp doğrudan geçmişe dönük bir tarih
// girilebiliyor (tikleme her zaman BUGÜNÜ varsayıyor, kullanıcı "geçmişe dönük tarih
// atamıyorum, tikliyorum bugünün tarihini atıyo" dedi — bu, o sınırı aşan ayrı bir yol).
//
// `editable` false iken (bkz. SeasonsBrowser) tik kutusu VE bu düğme hiç render edilmez, ama
// izleme tarihi varsa (varsa) yine salt-okunur gösterilir — kullanıcı: "tekrar izleme
// tarihlerini de ana sayfadan detay penceresine bakınca görebileyim sadece ekleme
// yapamıycam" — izleme durumu DÜZENLEMESİ sadece BoardView'daki "Detayı Gör" ile açılan
// pencerede, GÖRÜNTÜLEMESİ ise her ikisinde de.
function EpisodeRow({
  episodeNumber,
  name,
  overview,
  airDate,
  stillUrl,
  dates,
  onSetDates,
  onUntick,
  editable,
  upToCount = 0,
  onUpTo,
  selecting = false,
  selected = false,
  onSelect,
}: {
  episodeNumber: number
  name: string
  overview: string
  airDate: string
  stillUrl: string | null
  dates: string[]
  onSetDates: (dates: string[]) => void
  // Tik kaldırılırken: birden çok tarih varsa onay sorar, sonra "Geri al"lı bildirim gösterir (bkz. SeasonsBrowser)
  onUntick: (dates: string[]) => void
  editable: boolean
  // "Buraya kadar izledim": sezonun başından bu bölüme kadar işaretsiz ve yayınlanmış kaç bölüm var (0 = düğme yok)
  upToCount?: number
  onUpTo?: (anchor: HTMLElement) => void
  // Çoklu seçim modu (A8): satıra tıklamak seçer/bırakır, Shift+tık aralık seçer; izleme tiki o sırada gizli
  selecting?: boolean
  selected?: boolean
  onSelect?: (shift: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const watched = dates.length > 0

  function toggle() {
    if (watched) onUntick(dates)
    else onSetDates([todayIso()])
  }

  return (
    <div
      className={`group flex gap-3 ${selecting ? `cursor-pointer select-none rounded-lg -mx-1.5 px-1.5 py-1 transition ${selected ? 'bg-[#00c0fa]/10 ring-1 ring-[#00c0fa]/50' : 'hover:bg-white/5'}` : ''}`}
      data-ep={episodeNumber}
      onClick={selecting ? (e) => onSelect?.(e.shiftKey) : undefined}
    >
      {editable && selecting && (
        <span
          role="checkbox"
          aria-checked={selected}
          aria-label={tt('Bölümü seç')}
          className={`mt-1.5 shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center text-[11px] ${selected ? 'border-[#00c0fa] bg-[#00c0fa] text-neutral-950' : 'border-neutral-500'}`}
        >
          {selected ? '✓' : ''}
        </span>
      )}
      {editable && !selecting && (
        <Checkbox checked={watched} onChange={toggle} label={tt('Bölümü izlendi olarak işaretle')} className="mt-1.5 shrink-0" />
      )}
      <div className="w-28 sm:w-36 aspect-video rounded-md overflow-hidden bg-neutral-800 shrink-0">
        {stillUrl ? (
          <img src={stillUrl} alt={name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">{episodeNumber}</div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-neutral-200">
          <span className="text-neutral-500">{episodeNumber}.</span> {name}
        </p>
        {airDate && <p className="text-[11px] text-neutral-500 mt-0.5">{ttx('Yayın: {0}', formatAirDate(airDate))}</p>}
        {overview && <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{overview}</p>}
        {watched && (
          <p className="text-[11px] mt-1.5 font-medium" style={{ color: BRAND_TEXT }}>
            {ttx('✓ İzlendi: {0}{1}', dates.slice().sort().map(formatShort).join(', '), dates.length > 1 ? ` (${dates.length}x)` : '')}
          </p>
        )}
        {editable && !selecting && (
          <button
            ref={anchorRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            title={watched ? tt('Başka bir izleme tarihi ekle') : tt('İzleme tarihi gir (geçmişe dönük olabilir)')}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-50 transition"
          >
            <PlusIcon />
            {watched ? tt('Tarih ekle') : tt('Tarih gir')}
          </button>
        )}
        {/* PC'de üzerine gelince görünür; telefonda (fare yok) hep görünür */}
        {editable && !selecting && onUpTo && upToCount > 1 && (
          <button
            type="button"
            onClick={(e) => onUpTo(e.currentTarget)}
            title={tt('Sezonun başından bu bölüme kadar izlemediğin {0} bölümü işaretle', upToCount)}
            className={`mt-1 ml-3 inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-50 transition ${MOBILE ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
          >
            {tt('✓ Buraya kadar izledim')}
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
  editable = false,
}: {
  seasons: Season[]
  // O kaydın bölüm bazlı izleme haritası: { [episodeKey(sezon, bölüm)]: ISO tarih dizisi }
  watched: Record<string, string[]>
  onSetEpisodeDates: (key: string, dates: string[]) => void
  // upTo: "Buraya kadar izledim" — sezonun başından o bölüme kadar (dahil)
  onMarkSeasonWatched: (seasonNumber: number, date: string, upTo?: number) => void
  onUnmarkSeasonWatched: (seasonNumber: number) => void
  // Birden çok bölümün tarihlerini tek kayıtta değiştir ({ anahtar: yeni tarihler }, boş dizi = sil) — A8 çoklu seçim
  onSetManyEpisodeDates?: (changes: Record<string, string[]>) => void
  // Sadece BoardView'ın "Detayı Gör"üyle açılan pencerede true — bkz. EpisodeRow'un başındaki not.
  editable?: boolean
}) {
  const { confirm, notify } = useToast()
  // "Geri al" bildirimden sonra (pencere yeniden çizilmiş olabilir) en güncel kaydetme fonksiyonunu kullansın —
  // eski kopyası o arada yapılan diğer tikleri silebilirdi.
  const setDatesRef = useRef(onSetEpisodeDates)
  useEffect(() => {
    setDatesRef.current = onSetEpisodeDates
  }, [onSetEpisodeDates])
  const setManyRef = useRef(onSetManyEpisodeDates)
  useEffect(() => {
    setManyRef.current = onSetManyEpisodeDates
  }, [onSetManyEpisodeDates])

  // Bir bölümün tikini kaldırmak bütün izleme tarihlerini (tekrar izlemeler dahil) siler — kullanıcı yanlışlıkla
  // tıklarsa kaybolmasın: birden çok tarih varsa önce sorulur, her durumda "Geri al" düğmeli bildirim çıkar.
  async function untickEpisode(key: string, label: string, dates: string[]) {
    const prev = [...dates]
    if (prev.length > 1) {
      const ok = await confirm({
        message: tt('{0}. bölümün {1} izleme tarihi var (tekrar izlemeler dahil). Hepsi silinsin mi?', label, prev.length),
        confirmLabel: tt('Tarihleri sil'),
        tone: 'danger',
      })
      if (!ok) return
    }
    setDatesRef.current(key, [])
    notify(tt('{0}. bölümün izleme tarihi kaldırıldı.', label), 'info', {
      action: { label: tt('Geri al'), onClick: () => setDatesRef.current(key, prev) },
    })
  }
  const today = todayIso()
  const aired = (ep: { airDate: string }) => !ep.airDate || ep.airDate <= today
  // Kaldığın yerden aç: ilk izlenmemiş (yayınlanmış) bölümün sezonu seçili gelir ve listede o bölüme kaydırılır.
  // Özel bölümler (0. sezon) çoğu zaman izlenmediği için atlanır. Hepsi izlendiyse son sezon (en yenisi).
  const [start] = useState(() => {
    const regular = seasons.filter((s) => s.seasonNumber > 0)
    const list = regular.length ? regular : seasons
    for (const s of list) {
      const ep = s.episodes.find((e) => aired(e) && !watched[episodeKey(s.seasonNumber, e.episodeNumber)]?.length)
      if (ep) return { season: s.seasonNumber, episode: ep.episodeNumber as number | null }
    }
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
  const seasonAllWatched =
    airedEps.length > 0 && airedEps.every((ep) => (watched[episodeKey(season!.seasonNumber, ep.episodeNumber)]?.length ?? 0) > 0)

  // Sezonu izlendi yaparken hangi tarih: kullanıcı "bugünün tarihini atıyor, tarih sorsun, hatırlamıyorum
  // da olsun" dedi. Bugün, bir gün, yalnızca yıl ya da "?" (hatırlamıyorum — takvimde bir güne düşmez).
  // Aynı tarih menüsü "Buraya kadar izledim" için de açılır (upTo = o bölüm; menü o düğmenin yanında).
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuAnchor = useRef<HTMLElement | null>(null)
  const [dateMenu, setDateMenu] = useState<false | { upTo?: number; count?: number; bulk?: boolean }>(false)
  const [day, setDay] = useState('')
  const [year, setYear] = useState('')
  const markWith = (date: string) => {
    const upTo = dateMenu ? dateMenu.upTo : undefined
    setDateMenu(false)
    setDay('')
    setYear('')
    if (dateMenu && dateMenu.bulk) {
      bulkAdd(date)
      return
    }
    if (season) onMarkSeasonWatched(season.seasonNumber, date, upTo)
  }

  // ---- Çoklu seçim (A8): "Seç" ile açılır; seçim sezon sekmesi değişince de kalır ----
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const lastPick = useRef<{ season: number; episode: number } | null>(null)
  const bulkRef = useRef<HTMLButtonElement>(null)
  function stopSelecting() {
    setSelecting(false)
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
    setManyRef.current?.(changes)
    stopSelecting()
    notify(tt('{0} bölüme izleme tarihi eklendi.', n), 'success', {
      action: { label: tt('Geri al'), onClick: () => setManyRef.current?.(prev) },
    })
  }
  async function bulkUnmark() {
    const keys = [...sel].filter((k) => (watched[k] ?? []).length > 0)
    if (keys.length === 0) {
      notify(tt('Seçili bölümlerin hiçbiri izlenmiş değil.'), 'info')
      return
    }
    const ok = await confirm({
      message: tt('Seçili {0} bölümün izleme tarihleri (tekrar izlemeler dahil) silinsin mi?', keys.length),
      confirmLabel: tt('İzlenmedi Yap'),
      tone: 'danger',
    })
    if (!ok) return
    const prev: Record<string, string[]> = {}
    const changes: Record<string, string[]> = {}
    for (const k of keys) {
      prev[k] = [...(watched[k] ?? [])]
      changes[k] = []
    }
    setManyRef.current?.(changes)
    stopSelecting()
    notify(tt('{0} bölüm izlenmedi yapıldı.', keys.length), 'info', {
      action: { label: tt('Geri al'), onClick: () => setManyRef.current?.(prev) },
    })
  }
  const yesterday = (() => {
    const t = new Date()
    t.setDate(t.getDate() - 1)
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  })()

  // Tek buton, iki anlamdan birini alır: sezon henüz tam izlenmediyse "izlendi işaretle"
  // (önce tarihi sorar), tamamı zaten izlendiyse "izlenmedi işaretle" (yıkıcı,
  // önce soruyor). Sezonun hiç bölümü yoksa (olmamalı ama) buton hiç gösterilmiyor.
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

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {seasons.map((s) => (
            <button
              key={s.seasonNumber}
              onClick={() => setActiveSeason(s.seasonNumber)}
              style={s.seasonNumber === season?.seasonNumber ? gradientBorderStyle() : undefined}
              className={`shrink-0 text-sm px-3 py-1.5 rounded-full border-[1.5px] transition ${
                s.seasonNumber === season?.seasonNumber
                  ? 'text-white'
                  : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:border-[#00c0fa]/60'
              }`}
            >
              {s.name || tt('Sezon {0}', s.seasonNumber)}
              {(() => {
                const seen = s.episodes.filter((ep) => (watched[episodeKey(s.seasonNumber, ep.episodeNumber)] ?? []).length > 0).length
                if (seen === 0) return null
                return (
                  <span className={`ml-1.5 text-[11px] ${seen === s.episodes.length ? 'text-emerald-400' : 'opacity-60'}`}>
                    {seen === s.episodes.length ? '✓' : `${seen}/${s.episodes.length}`}
                  </span>
                )
              })()}
            </button>
          ))}
        </div>
        {editable && onSetManyEpisodeDates && (
          <button
            type="button"
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            title={tt('Birden çok bölüm seç, hepsine tek seferde tarih gir')}
            className={`shrink-0 h-8 px-2.5 text-xs rounded-lg border transition ${selecting ? 'border-[#00c0fa] text-[#7fdcff] bg-[#00c0fa]/10' : 'border-neutral-700 text-neutral-400 hover:text-neutral-50 hover:border-neutral-500'}`}
          >
            {selecting ? tt('Bitti') : tt('Seç')}
          </button>
        )}
        {editable && !selecting && season && airedEps.length > 0 && (
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
        {dateMenu && (
          <AnchoredMenu anchorRef={menuAnchor} align={dateMenu.upTo !== undefined ? 'left' : 'right'} width={248} onClose={() => setDateMenu(false)}>
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
      </div>
      {selecting && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-[#00c0fa]/40 bg-[#00c0fa]/5 px-3 py-2 text-xs">
          <span className="text-neutral-200 mr-1">
            {sel.size ? tt('{0} bölüm seçildi', sel.size) : MOBILE ? tt('Bölümlere dokunarak seç') : tt('Bölümlere tıklayarak seç (Shift+tık: aralık)')}
          </span>
          {sel.size > 0 && (
            <>
              <button
                ref={bulkRef}
                type="button"
                onClick={() => {
                  menuAnchor.current = bulkRef.current
                  setDateMenu({ bulk: true })
                }}
                className="rounded-md bg-[#00c0fa] px-2.5 py-1 font-medium text-neutral-950"
              >
                {tt('Tarih gir')}
              </button>
              <button type="button" onClick={() => void bulkUnmark()} className="rounded-md border border-rose-500/40 px-2.5 py-1 text-rose-300 hover:bg-rose-500/10">
                {tt('İzlenmedi yap')}
              </button>
            </>
          )}
          {season && (
            <button
              type="button"
              onClick={() => setSel((prev) => new Set([...prev, ...season.episodes.filter(aired).map((e) => episodeKey(season.seasonNumber, e.episodeNumber))]))}
              className="rounded-md border border-neutral-700 px-2.5 py-1 text-neutral-300 hover:text-neutral-50"
            >
              {tt('Sezonun hepsini seç')}
            </button>
          )}
          <button type="button" onClick={stopSelecting} className="ml-auto rounded-md px-2 py-1 text-neutral-400 hover:text-neutral-50">
            {tt('Seçimi bırak')}
          </button>
        </div>
      )}
      <div ref={listRef} className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {season?.episodes.map((ep) => {
          const key = episodeKey(season!.seasonNumber, ep.episodeNumber)
          // Bu bölüme kadar (dahil) işaretsiz ve yayınlanmış bölüm sayısı
          const upToCount =
            editable && aired(ep)
              ? season!.episodes.filter(
                  (e) => e.episodeNumber <= ep.episodeNumber && aired(e) && !watched[episodeKey(season!.seasonNumber, e.episodeNumber)]?.length,
                ).length
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
              onUntick={(dates) => untickEpisode(key, String(ep.episodeNumber), dates)}
              editable={editable}
              upToCount={upToCount}
              selecting={selecting}
              selected={sel.has(key)}
              onSelect={(shift) => pickEpisode(season!.seasonNumber, ep.episodeNumber, shift)}
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
