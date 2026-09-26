import { useRef, useState } from 'react'
import type { Season } from '../types'
import { episodeKey, todayIso } from '../types'
import { gradientBorderStyle, BRAND_TEXT } from '../lib/theme'
import { useToast } from '../hooks/useToast'
import Checkbox from './Checkbox'
import AnchoredMenu from './AnchoredMenu'
import DateChipEditor from './DateChipEditor'

function formatAirDate(v: string) {
  const [y, m, d] = v.split('-')
  if (!y || !m || !d) return v
  return `${d}.${m}.${y}`
}

function formatShort(v: string) {
  const [y, m, d] = v.split('-')
  if (!y || !m || !d) return v
  return `${d}.${m}.${y.slice(2)}`
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
  editable,
}: {
  episodeNumber: number
  name: string
  overview: string
  airDate: string
  stillUrl: string | null
  dates: string[]
  onSetDates: (dates: string[]) => void
  editable: boolean
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const watched = dates.length > 0

  function toggle() {
    onSetDates(watched ? [] : [todayIso()])
  }

  return (
    <div className="flex gap-3">
      {editable && (
        <Checkbox checked={watched} onChange={toggle} label="Bölümü izlendi olarak işaretle" className="mt-1.5 shrink-0" />
      )}
      <div className="w-28 sm:w-36 aspect-video rounded-md overflow-hidden bg-neutral-800 shrink-0">
        {stillUrl ? (
          <img src={stillUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">{episodeNumber}</div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-neutral-200">
          <span className="text-neutral-500">{episodeNumber}.</span> {name}
        </p>
        {airDate && <p className="text-[11px] text-neutral-500 mt-0.5">Yayın: {formatAirDate(airDate)}</p>}
        {overview && <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{overview}</p>}
        {watched && (
          <p className="text-[11px] mt-1.5 font-medium" style={{ color: BRAND_TEXT }}>
            ✓ İzlendi: {dates.slice().sort().map(formatShort).join(', ')}
            {dates.length > 1 ? ` (${dates.length}x)` : ''}
          </p>
        )}
        {editable && (
          <button
            ref={anchorRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            title={watched ? 'Başka bir izleme tarihi ekle' : 'İzleme tarihi gir (geçmişe dönük olabilir)'}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-50 transition"
          >
            <PlusIcon />
            {watched ? 'Tarih ekle' : 'Tarih gir'}
          </button>
        )}
        {editable && open && (
          <AnchoredMenu anchorRef={anchorRef} onClose={() => setOpen(false)} width={230}>
            <div className="bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl p-3 normal-case">
              <p className="text-[11px] text-neutral-500 mb-2">İzleme tarihleri</p>
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
  editable = false,
}: {
  seasons: Season[]
  // O kaydın bölüm bazlı izleme haritası: { [episodeKey(sezon, bölüm)]: ISO tarih dizisi }
  watched: Record<string, string[]>
  onSetEpisodeDates: (key: string, dates: string[]) => void
  onMarkSeasonWatched: (seasonNumber: number) => void
  onUnmarkSeasonWatched: (seasonNumber: number) => void
  // Sadece BoardView'ın "Detayı Gör"üyle açılan pencerede true — bkz. EpisodeRow'un başındaki not.
  editable?: boolean
}) {
  const { confirm } = useToast()
  const [activeSeason, setActiveSeason] = useState(seasons[0]?.seasonNumber)
  const season = seasons.find((s) => s.seasonNumber === activeSeason) ?? seasons[0]
  const seasonEpisodeDates = season
    ? season.episodes.map((ep) => watched[episodeKey(season.seasonNumber, ep.episodeNumber)]?.length ?? 0)
    : []
  const seasonAllWatched = seasonEpisodeDates.length > 0 && seasonEpisodeDates.every((n) => n > 0)

  // Tek buton, iki anlamdan birini alır: sezon henüz tam izlenmediyse "izlendi işaretle"
  // (katkısız ekleme, onay sormuyor), tamamı zaten izlendiyse "izlenmedi işaretle" (yıkıcı,
  // önce soruyor). Sezonun hiç bölümü yoksa (olmamalı ama) buton hiç gösterilmiyor.
  async function handleToggleSeason() {
    if (!season) return
    if (seasonAllWatched) {
      const ok = await confirm({
        message: `${season.name || `Sezon ${season.seasonNumber}`}'daki tüm bölümlerin izlenme tiklerini (ve varsa tekrar izleme tarihlerini) kaldırmak istediğine emin misin?`,
        confirmLabel: 'İzlenmedi Yap',
        tone: 'danger',
      })
      if (!ok) return
      onUnmarkSeasonWatched(season.seasonNumber)
    } else {
      onMarkSeasonWatched(season.seasonNumber)
    }
  }

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
              {s.name || `Sezon ${s.seasonNumber}`}
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
        {editable && season && season.episodes.length > 0 && (
          <button
            type="button"
            onClick={handleToggleSeason}
            title={seasonAllWatched ? 'Sezonu izlenmedi olarak işaretle' : 'Sezonu izlendi olarak işaretle'}
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
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {season?.episodes.map((ep) => {
          const key = episodeKey(season!.seasonNumber, ep.episodeNumber)
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
            />
          )
        })}
      </div>
    </div>
  )
}
