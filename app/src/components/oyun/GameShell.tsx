import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useProfiles } from '../../hooks/useProfiles'
import { useExtras } from '../../lib/extras'
import { gameReward, pushHistory, readRecord, saveRecord, sfx, soundMode, setSoundMode, today, type SoundMode } from '../../lib/games'
import { tt, ttx } from '../../lib/i18n'
import Icon from '../Icon'

// Oyun salonundaki her oyunun ortak çerçevesi (v1.24): üstte geri dönüş, oyunun adı, skor ve rekor; sağda ses ayarı.

export function GameShell({ title, subtitle, score, game, children, right, record }: { title: string; subtitle?: string; score?: number | null; game: string; children: ReactNode; right?: ReactNode; record?: number }) {
  const { activeProfileId } = useProfiles()
  const rec = record ?? (activeProfileId ? readRecord(activeProfileId, game) : 0)
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <Link to="/oyunlar" className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-100">
        ‹ {tt('Oyun salonu')}
      </Link>
      <section className="flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <h1 className="text-4xl font-black text-neutral-50 tracking-tight">{title}</h1>
          {subtitle && <p className="text-neutral-400 mt-1">{subtitle}</p>}
        </div>
        <div className="ml-auto flex items-end gap-5">
          {right}
          {score !== undefined && score !== null && (
            <div className="text-right">
              <p className="text-xs text-neutral-500">{tt('Skor')}</p>
              <p className="text-3xl font-black text-neutral-50 tabular-nums">{score}</p>
            </div>
          )}
          <div className="text-right">
            <p className="text-xs text-neutral-500">{tt('Rekorun')}</p>
            <p className="text-xl font-bold text-amber-300 tabular-nums">{rec}</p>
          </div>
          <SoundToggle />
        </div>
      </section>
      {children}
    </div>
  )
}

// S10: oyun sesleri — kapalı başlar
export function SoundToggle() {
  const [m, setM] = useState<SoundMode>(soundMode)
  const next: Record<SoundMode, SoundMode> = { kapali: 'sonuc', sonuc: 'hepsi', hepsi: 'kapali' }
  const label: Record<SoundMode, string> = { kapali: tt('Ses kapalı'), sonuc: tt('Sadece doğru/yanlış sesi'), hepsi: tt('Bütün sesler açık') }
  return (
    <button
      onClick={() => {
        const n = next[m]
        setSoundMode(n)
        setM(n)
        if (n !== 'kapali') sfx.ok()
      }}
      title={label[m]}
      aria-label={label[m]}
      className={`h-10 w-10 rounded-xl border flex items-center justify-center transition ${m === 'kapali' ? 'border-neutral-700 text-neutral-500' : 'border-[#00c0fa]/60 text-[#7fdcff] bg-[#00c0fa]/10'}`}
    >
      <span className="text-lg leading-none">{m === 'kapali' ? '🔇' : m === 'sonuc' ? '🔉' : '🔊'}</span>
    </button>
  )
}

export interface Finish {
  record: boolean
  history: number[]
  packs: ('bronz' | 'gumus' | 'altin')[]
}

// Oyun bitince: rekor, son oyunlar, Ödüller açıksa paket (O2)
export function useFinish(game: string) {
  const { activeProfileId } = useProfiles()
  const rewards = useExtras().on('rewards')
  return async (score: number, extra?: { key: string; tier: 'bronz' | 'gumus' | 'altin' } | null, recordFn?: (pid: string, score: number) => boolean): Promise<Finish> => {
    sfx.end()
    if (!activeProfileId) return { record: false, history: [], packs: [] }
    const record = recordFn ? recordFn(activeProfileId, score) : saveRecord(activeProfileId, game, score)
    const history = pushHistory(activeProfileId, game, score)
    const packs: Finish['packs'] = []
    if (rewards && score > 0) {
      if (await gameReward(`bitir:${game}:${Date.now()}`, 'bronz')) packs.push('bronz')
      if (record && (await gameReward(`rekor:${game}:${today()}`, 'gumus'))) packs.push('gumus')
      if (extra && (await gameReward(extra.key, extra.tier))) packs.push(extra.tier)
    }
    return { record, history, packs }
  }
}

const PACK_NAME: Record<string, string> = { bronz: 'Bronz', gumus: 'Gümüş', altin: 'Altın' }

// Sonuç ekranının ortak alt kısmı: rekor rozeti, son oyunlar grafiği, kazanılan paketler
export function FinishInfo({ f }: { f: Finish | null }) {
  if (!f) return null
  const max = Math.max(...f.history, 1)
  return (
    <div className="space-y-4">
      {f.record && <span className="inline-block rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-200">{tt('Yeni rekor!')}</span>}
      {f.packs.length > 0 && (
        <Link to="/koleksiyon?sekme=oduller" className="flex items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 hover:bg-amber-500/15 transition">
          <Icon name="cards" className="h-5 w-5 text-amber-300" />
          <span className="text-sm text-amber-100">
            {ttx('Kart paketi kazandın: {0}. Koleksiyon › Ödüller\'de açabilirsin.', f.packs.map((p) => PACK_NAME[p]).join(', '))}
          </span>
        </Link>
      )}
      {f.history.length > 1 && (
        <div>
          <p className="text-xs text-neutral-500 mb-1.5">{tt('Son oyunların')}</p>
          <div className="flex items-end gap-1 h-16">
            {f.history.map((v, i) => (
              <div key={i} title={String(v)} className="flex-1 rounded-t" style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: i === f.history.length - 1 ? 'linear-gradient(180deg,#00c0fa,#015eea)' : 'var(--color-neutral-700)' }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export const PRIMARY_BTN = 'inline-flex items-center gap-2 text-base font-semibold rounded-full px-6 py-2.5 text-white disabled:opacity-60'
export const PRIMARY_BG = { background: 'linear-gradient(90deg,#015eea,#00c0fa)' }
