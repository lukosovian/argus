import { useState } from 'react'
import type { Board } from '../../types'
import { getConfig, getState, reconnectNow } from '../../lib/mobile/connection'
import { kindAvailable, setMobileKind, useMobileKind, type MobileKind } from '../../lib/mobile/kindFilter'
import { useMobileState } from './MobileStatusBar'
import { tt } from '../../lib/i18n'

// ARGUS Android › Ana Sayfa'nın en üstü (v1.26):
//   - "PC'yi uzun süredir görmedim" kartı (A7): telefon 3 günden uzun eşitlenmediyse kaç gündür eşitlenmediği, kaç
//     değişikliğin beklediği, "PC'yi ara" düğmesi ve kısa ipucu. × ile o gün için gizlenir.
//   - "Diziler / Filmler" hapları (A15): Netflix uygulamasındaki gibi; seçince vitrin ve bütün satırlar o türe göre
//     süzülür (bkz. lib/mobile/kindFilter). Arşivin Kategori sütununda hem dizi hem film yoksa görünmez.

const STALE_DAYS = 3
const HIDE_KEY = 'mobil.eskiKartGizli'
const DAY = 24 * 60 * 60 * 1000

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function StaleCard() {
  const s = useMobileState()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === todayKey()
    } catch {
      return false
    }
  })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  if (!getConfig() || hidden || s.status !== 'offline' || !s.lastSync) return null
  const days = Math.floor((Date.now() - s.lastSync) / DAY)
  if (days < STALE_DAYS) return null

  async function search() {
    setBusy(true)
    setResult(null)
    const ok = await reconnectNow().catch(() => false)
    setBusy(false)
    if (!ok) setResult(getState().unpaired ? tt('PC bu telefonu artık tanımıyor — Ayarlar › Uygulama Ayarları\'ndan yeniden bağlan.') : tt('PC bulunamadı.'))
  }

  return (
    <div className="rounded-2xl border border-amber-700/40 bg-gradient-to-br from-amber-950/70 to-neutral-900/90 p-4 shadow-lg shadow-black/40">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[#fde68a]">
            {tt('PC ile {0} gündür eşitlenmedi', days)}
            {s.pending > 0 && <span className="font-normal text-amber-200/80"> · {tt('{0} değişiklik bekliyor', s.pending)}</span>}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-400">{tt("PC'de ARGUS açık mı, telefon PC ile aynı Wi-Fi'da mı? İkisi de tamamsa PC'yi ara.")}</p>
          {result && <p className="mt-1.5 text-xs text-amber-300">{result}</p>}
        </div>
        <button
          onClick={() => {
            setHidden(true)
            try {
              localStorage.setItem(HIDE_KEY, todayKey())
            } catch {
              /* önemsiz */
            }
          }}
          aria-label={tt('Bugünlük gizle')}
          className="-mr-1 -mt-1 shrink-0 px-1.5 text-lg leading-none text-neutral-500"
        >
          ×
        </button>
      </div>
      <button
        onClick={() => void search()}
        disabled={busy}
        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-neutral-50 text-sm font-semibold text-neutral-950 disabled:opacity-70"
      >
        {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-neutral-950" />}
        {busy ? tt('PC aranıyor…') : tt("PC'yi ara")}
      </button>
    </div>
  )
}

function KindPills({ board }: { board: Board | null | undefined }) {
  const kind = useMobileKind()
  if (!kindAvailable(board)) return null
  const pill = (k: Exclude<MobileKind, 'all'>, label: string) => {
    const active = kind === k
    if (kind !== 'all' && !active) return null
    return (
      <button
        key={k}
        onClick={() => setMobileKind(active ? 'all' : k)}
        aria-pressed={active}
        className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
          active ? 'border-neutral-50 bg-neutral-50 text-neutral-950' : 'border-neutral-600 bg-transparent text-neutral-100'
        }`}
      >
        {label}
      </button>
    )
  }
  return (
    <div className="flex items-center gap-2">
      {/* Seçiliyken solda "×" (Netflix'teki gibi): dokununca hepsine döner */}
      {kind !== 'all' && (
        <button onClick={() => setMobileKind('all')} aria-label={tt('Tümü')} className="h-8 w-8 shrink-0 rounded-full border border-neutral-600 text-lg leading-none text-neutral-200">
          ×
        </button>
      )}
      {pill('dizi', tt('Diziler'))}
      {pill('film', tt('Filmler'))}
    </div>
  )
}

export default function MobileHomeTop({ board, showPills }: { board: Board | null | undefined; showPills: boolean }) {
  const s = useMobileState()
  useMobileKind()
  // Boş bir kap bırakılmasın (sayfanın satır aralığı boşuna eklenmesin)
  const staleMaybe = Boolean(getConfig()) && s.status === 'offline' && Boolean(s.lastSync) && Date.now() - (s.lastSync ?? 0) >= STALE_DAYS * DAY
  const pills = showPills && kindAvailable(board)
  if (!staleMaybe && !pills) return null
  return (
    <div className="space-y-3">
      <StaleCard />
      {pills && <KindPills board={board} />}
    </div>
  )
}
