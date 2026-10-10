import { tt, ttx } from '../lib/i18n'
// Genel Güncelleme sürerken (ve durdurulunca) tablonun üstünde duran ayrıntı kutusu. Kullanıcı
// "genel güncelleme yaparken daha fazla detay görebiliyosak görelim, o an ne yapıyo" ve
// "durdurup sonra kaldığı yerden devam ettirme" istedi.
export interface BulkLogEntry {
  title: string
  kind: 'ok' | 'same' | 'fail'
  text: string
}

export interface BulkState {
  running: boolean
  done: number
  total: number
  updated: number
  failed: number
  current: string | null
  startedAt: number
  // Bu oturumda işlenen kayıt sayısı (kalan süre tahmini için; devam edilince sıfırdan sayılır).
  sessionDone: number
  log: BulkLogEntry[]
  // Başlıktaki iş adı (ör. "Bölüm yenileme"); yoksa "Genel Güncelleme".
  label?: string
}

function formatEta(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} sn`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} dk`
  return `${Math.floor(m / 60)} sa ${m % 60} dk`
}

export default function BulkUpdatePanel({
  state,
  onStop,
  onResume,
  onDiscard,
}: {
  state: BulkState
  onStop: () => void
  onResume: () => void
  onDiscard: () => void
}) {
  const pct = state.total ? Math.round((state.done / state.total) * 100) : 0
  const left = state.total - state.done
  const elapsed = Date.now() - state.startedAt
  const eta = state.running && state.sessionDone >= 2 ? (elapsed / state.sessionDone) * left : null

  return (
    <section className="rounded-2xl border border-[#00c0fa]/25 bg-[#00c0fa]/[0.04] px-4 sm:px-5 py-4 mb-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex-1 min-w-[14rem]">
          <p className="text-sm font-semibold text-neutral-100">
            {state.label ?? tt('Genel Güncelleme')} {state.running ? tt('sürüyor') : left > 0 ? tt('durduruldu') : tt('bitti')}
            <span className="ml-2 font-normal text-neutral-400 tabular-nums">
              {state.done}/{state.total} · %{pct}
            </span>
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">
            <span className="text-emerald-400">{ttx('{0} güncellendi', state.updated)}</span>
            {state.failed > 0 && <span className="text-rose-400"> {' '}{ttx('· {0} bulunamadı/hata', state.failed)}</span>}
            {left > 0 && <span> {' '}{ttx('· {0} kaldı', left)}</span>}
            {eta !== null && <span>{' '}{ttx('· yaklaşık {0}', formatEta(eta))}</span>}
            {!state.running && left > 0 && <span>{' '}{tt('· istediğin zaman kaldığın yerden devam edebilirsin')}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state.running ? (
            <button onClick={onStop} className="text-sm rounded-lg border border-rose-500/50 text-rose-300 hover:bg-rose-500/10 px-3 py-1.5 transition">
              {tt('⏸ Durdur')}
            </button>
          ) : (
            <>
              {left > 0 && (
                <button
                  onClick={onResume}
                  className="text-sm font-semibold rounded-lg text-white px-3.5 py-1.5 bg-gradient-to-r from-[#00c0fa] to-[#015eea] hover:opacity-90 transition"
                >
                  {ttx('▶ Devam et ({0} kaldı)', left)}
                </button>
              )}
              <button onClick={onDiscard} className="text-sm text-neutral-400 hover:text-neutral-100 px-2 py-1.5 transition">
                {left > 0 ? tt('Vazgeç') : tt('Kapat')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-neutral-800 mt-3 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-[#00c0fa] to-[#015eea] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      {state.running && state.current && (
        <p className="text-sm text-neutral-300 mt-3 flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#00c0fa] opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00c0fa]" />
          </span>
          <span className="truncate">
            {tt('Şu an:')}{' '}<span className="text-neutral-50 font-medium">{state.current}</span>
            <span className="text-neutral-500">{' '}{tt('— TMDB\'de aranıyor, bilgileri ve görselleri indiriliyor')}</span>
          </span>
        </p>
      )}

      {state.log.length > 0 && (
        <ul className="mt-3 space-y-1 max-h-40 overflow-y-auto pr-1">
          {state.log.map((l, i) => (
            <li key={i} className="flex items-baseline gap-2 text-xs min-w-0">
              <span className={`shrink-0 ${l.kind === 'ok' ? 'text-emerald-400' : l.kind === 'fail' ? 'text-rose-400' : 'text-neutral-500'}`}>
                {l.kind === 'ok' ? '✓' : l.kind === 'fail' ? '✕' : '–'}
              </span>
              <span className="text-neutral-200 shrink-0 max-w-[45%] truncate">{l.title}</span>
              <span className="text-neutral-500 truncate">{l.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
