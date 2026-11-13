import { useEffect, useState } from 'react'
import type { Board, HomeSettings, RandomPickerTmdbSettings, Row, YearRange } from '../types'
import { api } from '../lib/api'
import { resolveRole } from '../lib/roles'
import { filterConditions, withConditions } from '../lib/filters'
import MultiFilterEditor from './MultiFilterEditor'
import GenreTriPicker from './GenreTriPicker'
import { choiceClass } from './settings/SettingsUi'
import { tt } from '../lib/i18n'

// Ne İzlesem'in havuz ayarları (nereden, hangi filtreyle, hangi yıllardan). Kullanıcı "Ne İzlesem'in
// filtrelemeleri Ne İzlesem'in içinden de yapılabilsin" dedi — aynı bileşen hem Ayarlar › Ana Sayfa ›
// Ne İzlesem'de hem de Ne İzlesem ekranındaki "Filtreler" panelinde kullanılıyor.

function ChoiceButtons<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`text-xs rounded-lg border px-3 py-1.5 transition ${choiceClass(value === o.value)}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const DEFAULT_PICKER_TMDB: RandomPickerTmdbSettings = { type: 'movie', genreIds: [], sort: 'popular' }

// Ne İzlesem'in TMDB modu ayarları: film/dizi/karışık, tür, sıralama. Türler TMDB'den (Türkçe)
// çekiliyor; "karışık"ta film ve dizi tür listeleri farklı olduğu için tür seçimi yok.
function TmdbPickerSettings({ value, onChange }: { value: RandomPickerTmdbSettings; onChange: (v: RandomPickerTmdbSettings) => void }) {
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([])
  const [needsApiKey, setNeedsApiKey] = useState(false)

  useEffect(() => {
    if (value.type === 'mixed') return
    let cancelled = false
    api
      .getTmdbGenres(value.type)
      .then((d) => {
        if (cancelled) return
        setGenres(d.genres)
        setNeedsApiKey(Boolean(d.needsApiKey))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [value.type])

  if (needsApiKey) {
    return <p className="text-sm text-amber-500">{tt('Bunun için önce Ayarlar → Veritabanı → API\'den TMDB anahtarını girmelisin.')}</p>
  }

  return (
    <div className="space-y-3 rounded-xl border border-neutral-800 p-3">
      <div>
        <label className="block text-xs text-neutral-400 mb-1.5">{tt('Ne')}</label>
        <ChoiceButtons
          value={value.type}
          // Tür id'leri film ve dizi için farklı — tür değişince seçili türler sıfırlanıyor.
          onChange={(type) => onChange({ ...value, type, genreIds: [], excludeGenreIds: [] })}
          options={[
            { value: 'movie', label: tt('Film') },
            { value: 'tv', label: tt('Dizi') },
            { value: 'mixed', label: tt('Karışık') },
          ]}
        />
      </div>
      {value.type !== 'mixed' && (
        <div>
          <label className="block text-xs text-neutral-400 mb-1.5">{tt('Tür — bir tık ✓ gelsin, iki tık ✕ gelmesin (hiçbiri seçilmezse hepsi)')}</label>
          <GenreTriPicker
            genres={genres}
            include={value.genreIds}
            exclude={value.excludeGenreIds ?? []}
            onChange={(genreIds, excludeGenreIds) => onChange({ ...value, genreIds, excludeGenreIds })}
          />
        </div>
      )}
      <div>
        <label className="block text-xs text-neutral-400 mb-1.5">{tt('Hangileri')}</label>
        <ChoiceButtons
          value={value.sort}
          onChange={(sort) => onChange({ ...value, sort })}
          options={[
            { value: 'popular', label: tt('Popüler olanlar') },
            { value: 'top', label: tt('En yüksek puanlılar') },
            { value: 'gem', label: tt('Gizli kalmışlar') },
            { value: 'new', label: tt('Yeni çıkanlar') },
            { value: 'any', label: tt('Her şeyden') },
          ]}
        />
        <p className="text-[11px] text-neutral-600 mt-1.5">{SORT_HINTS[value.sort]}</p>
      </div>
    </div>
  )
}

const SORT_HINTS: Record<RandomPickerTmdbSettings['sort'], string> = {
  popular: tt('Şu sıralar en çok izlenenlerden.'),
  top: tt('Çok oy almış, en beğenilen yapımlardan.'),
  gem: tt('Az bilinen ama izleyenlerin çok beğendiği yapımlardan (7+ puan).'),
  new: tt('Son iki yılda çıkanlardan.'),
  any: tt('Popülerlik sırasının çok daha derinlerinden — her seferinde bambaşka şeyler.'),
}

const yearInput =
  'w-20 rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-neutral-100 text-sm outline-none focus:border-neutral-500 tabular-nums'

function YearBox({ value, placeholder, onCommit }: { value: number | null; placeholder: string; onCommit: (n: number | null) => void }) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => setText(value ? String(value) : ''), [value])
  function commit() {
    const n = Number(text)
    if (!text.trim()) onCommit(null)
    else if (Number.isInteger(n) && n >= 1880 && n <= 2100) onCommit(n)
    else setText(value ? String(value) : '')
  }
  return (
    <input
      inputMode="numeric"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 4))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      className={yearInput}
    />
  )
}

const YEAR_PRESETS: { label: string; range: YearRange }[] = [
  { label: tt('Son 5 yıl'), range: { from: new Date().getFullYear() - 4, to: null } },
  { label: tt('2010\'lar'), range: { from: 2010, to: 2019 } },
  { label: tt('2000\'ler'), range: { from: 2000, to: 2009 } },
  { label: tt('90\'lar'), range: { from: 1990, to: 1999 } },
  { label: tt('Daha eski'), range: { from: null, to: 1989 } },
]

function YearRangeEditor({ value, onChange }: { value: YearRange; onChange: (v: YearRange) => void }) {
  const active = (r: YearRange) => r.from === value.from && r.to === value.to
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <YearBox value={value.from} placeholder={tt('ör. 1990')} onCommit={(from) => onChange({ ...value, from })} />
        <span className="text-neutral-500 text-sm">–</span>
        <YearBox value={value.to} placeholder={tt('ör. 2010')} onCommit={(to) => onChange({ ...value, to })} />
        {(value.from || value.to) && (
          <button onClick={() => onChange({ from: null, to: null })} className="text-xs text-neutral-500 hover:text-neutral-200">
            {tt('Temizle')}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {YEAR_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onChange(active(p.range) ? { from: null, to: null } : p.range)}
            className={`text-xs rounded-lg border px-2.5 py-1 transition ${choiceClass(active(p.range))}`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Arşiv kayıtlarını vizyon yılına göre süzer (yıl aralığı boşsa hepsi; vizyon tarihi olmayanlar aralık
// seçiliyse dışarıda kalır).
export function filterByYears(board: Board, rows: Row[], years: YearRange | undefined): Row[] {
  if (!years || (!years.from && !years.to)) return rows
  const vizyonProp = resolveRole(board, 'vizyon')
  if (!vizyonProp) return rows
  return rows.filter((r) => {
    const v = r.values[vizyonProp.id]
    const y = typeof v === 'string' ? Number(v.slice(0, 4)) : NaN
    if (!Number.isFinite(y) || y < 1000) return false
    return (!years.from || y >= years.from) && (!years.to || y <= years.to)
  })
}

const MINUTE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: tt('Fark etmez') },
  { value: 90, label: tt('90 dk\'ya kadar') },
  { value: 120, label: tt('2 saate kadar') },
  { value: 150, label: tt('2,5 saate kadar') },
]

// Abone olunan platformlar: logolu düğmeler, tıklayınca seçilir/kaldırılır. Bu seçim "platforma geldi"
// bildirimlerinde de kullanılıyor (seçiliyse sadece bu platformlar için haber gelir).
// prefer: önce gösterilecek platformlar (ör. Abonelik sayfasında listende geçenler), sırasıyla
const rank = (list: number[], id: number) => {
  const i = list.indexOf(id)
  return i === -1 ? 1e6 : i
}

export function MyPlatformsPicker({ value, onChange, prefer }: { value: number[]; onChange: (ids: number[]) => void; prefer?: number[] }) {
  const [items, setItems] = useState<{ id: number; name: string; logo: string | null }[]>([])
  useEffect(() => {
    let alive = true
    api
      .getPlatforms()
      .then((d) => alive && setItems(d.items))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  if (items.length === 0) return <p className="text-xs text-neutral-600">{tt('Platformlar yükleniyor...')}</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {(prefer?.length ? [...items].sort((a, b) => rank(prefer, a.id) - rank(prefer, b.id)) : items).map((p) => {
        const on = value.includes(p.id)
        return (
          <button
            key={p.id}
            onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
            title={p.name}
            className={`flex items-center gap-1.5 rounded-lg border pl-1 pr-2 py-1 text-xs transition ${choiceClass(on)}`}
          >
            {p.logo ? <img src={p.logo} alt="" className={`h-5 w-5 rounded ${on ? '' : 'opacity-60 grayscale'}`} /> : <span className="h-5 w-5" />}
            <span className="max-w-[7rem] truncate">{p.name}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function PickerPoolEditor({
  board,
  settings,
  onSave,
}: {
  board: Board | undefined
  settings: HomeSettings
  onSave: (s: HomeSettings) => void
}) {
  const source = settings.randomPickerSource ?? 'arsiv'
  return (
    <div className="space-y-4">
      <ChoiceButtons
        value={source}
        onChange={(v) => onSave({ ...settings, randomPickerSource: v })}
        options={[
          { value: 'arsiv', label: tt('Arşivimden') },
          { value: 'tmdb', label: tt('TMDB\'den (arşivimde olmayanlar)') },
        ]}
      />

      {source === 'arsiv' ? (
        <div>
          <label className="block text-xs text-neutral-400 mb-1">
            {tt('Hangi havuzdan seçilsin (hiçbir filtre seçilmezse arşivdeki her şeyden rastgele seçilir)')}
          </label>
          <MultiFilterEditor
            board={board}
            conditions={filterConditions(settings.randomPickerFilter)}
            emptyText={tt('Filtre yok — arşivin tamamından rastgele.')}
            onChange={(c) =>
              onSave({ ...settings, randomPickerFilter: withConditions(settings.randomPickerFilter ?? { propertyId: null, optionIds: [] }, c) })
            }
          />
        </div>
      ) : (
        <TmdbPickerSettings
          value={settings.randomPickerTmdb ?? DEFAULT_PICKER_TMDB}
          onChange={(randomPickerTmdb) => onSave({ ...settings, randomPickerTmdb })}
        />
      )}

      <div>
        <label className="block text-xs text-neutral-400 mb-1.5">{tt('Ne kadar vaktin var (film süresi)')}</label>
        <div className="flex flex-wrap gap-1.5">
          {MINUTE_OPTIONS.map((o) => (
            <button
              key={o.label}
              onClick={() => onSave({ ...settings, randomPickerMaxMinutes: o.value })}
              className={`text-xs rounded-lg border px-3 py-1.5 transition ${choiceClass((settings.randomPickerMaxMinutes ?? null) === o.value)}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center justify-between gap-2 text-xs text-neutral-400">
          <span>{tt('Sadece platformlarımda izlenebilenler')}</span>
          <input
            type="checkbox"
            checked={Boolean(settings.randomPickerOnlyMine)}
            onChange={(e) => onSave({ ...settings, randomPickerOnlyMine: e.target.checked })}
            className="accent-[#00c0fa] h-4 w-4"
          />
        </label>
        {settings.randomPickerOnlyMine && (
          <>
            <MyPlatformsPicker value={settings.myPlatforms ?? []} onChange={(myPlatforms) => onSave({ ...settings, myPlatforms })} />
            {(settings.myPlatforms ?? []).length === 0 && <p className="text-[11px] text-amber-400">{tt('Abone olduğun platformları seç.')}</p>}
          </>
        )}
      </div>

      <div>
        <label className="block text-xs text-neutral-400 mb-1.5">{tt('Hangi yıllardan (vizyon yılı — boş bırakılırsa hepsi)')}</label>
        <YearRangeEditor
          value={settings.randomPickerYears ?? { from: null, to: null }}
          onChange={(randomPickerYears) => onSave({ ...settings, randomPickerYears })}
        />
      </div>
    </div>
  )
}
