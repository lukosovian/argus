import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useArchive } from './useArchive'
import { useProfiles } from '../../hooks/useProfiles'
import { readDaily, readRecord, shuffle, today } from '../../lib/games'
import { useExtras } from '../../lib/extras'
import { tt, ttx } from '../../lib/i18n'
import PageSkeleton from '../../components/Skeleton'
import Icon from '../../components/Icon'
import { SoundToggle } from '../../components/oyun/GameShell'

// O1 Oyun salonu (v1.24): bütün oyunlar tek sayfada — her kartta rekorun, günlük oyunun bugün bitip bitmediği, altta
// profiller arası toplam sıralama. Menüdeki "Oyunlar" buraya gelir.

export const GAMES: { id: string; to: string; title: string; text: string; emoji: string; rec: (pid: string) => number }[] = [
  {
    id: 'sahne',
    to: '/sahneden-bil',
    title: tt('Sahneden bil'),
    text: tt('Gerçek bir sahne gelir, hangi yapım? Soru sayısını, süreyi, efektleri sen ayarla.'),
    emoji: '🎬',
    rec: (pid) => {
      try {
        return Number(localStorage.getItem(`argus_sahne_rekor_${pid}`) ?? 0) || 0
      } catch {
        return 0
      }
    },
  },
  { id: 'gunluk', to: '/oyunlar/gunluk', title: tt('Günün yapımı'), text: tt('Her gün gizli bir yapım; 8 tahminde ipuçlarıyla bul.'), emoji: '📅', rec: (pid) => readRecord(pid, 'gunluk') },
  {
    id: 'yuksek',
    to: '/oyunlar/yuksek',
    title: tt('Hangisi daha yüksek?'),
    text: tt('İki yapım: hangisine daha yüksek puan verdin, hangisi daha yeni, hangisi daha uzun?'),
    emoji: '⚖️',
    rec: (pid) => Math.max(readRecord(pid, 'yuksek_puan'), readRecord(pid, 'yuksek_yil'), readRecord(pid, 'yuksek_sure')),
  },
  { id: 'sinopsis', to: '/oyunlar/sinopsis', title: tt('Sinopsisten bil'), text: tt('Ad ve isimleri karartılmış sinopsisten yapımı bul.'), emoji: '📜', rec: (pid) => readRecord(pid, 'sinopsis') },
  { id: 'zaman', to: '/oyunlar/zaman', title: tt('Zaman çizelgesi'), text: tt('Yapımları çıkış yılına göre eskiden yeniye diz.'), emoji: '⏳', rec: (pid) => readRecord(pid, 'zaman') },
  { id: 'oyuncu', to: '/oyunlar/oyuncu', title: tt('Oyuncuyu bil'), text: tt('Bulanık fotoğraf netleşir; karşına en çok çıkan oyunculardan kim?'), emoji: '🎭', rec: (pid) => readRecord(pid, 'oyuncu') },
  { id: 'zincir', to: '/oyunlar/zincir', title: tt('Oyuncu zinciri'), text: tt('İki oyuncuyu ortak yapımlar üzerinden en kısa yoldan bağla.'), emoji: '🔗', rec: (pid) => readRecord(pid, 'zincir') },
]

export default function OyunSalonu() {
  const { pool, loading } = useArchive()
  const { profiles, activeProfileId } = useProfiles()
  const rewards = useExtras().on('rewards')
  const art = useMemo(() => shuffle(pool.filter((x) => x.poster)).slice(0, 28), [pool])
  if (loading) return <PageSkeleton />
  const pid = activeProfileId ?? ''
  const daily = pid ? readDaily<{ done: boolean; won: boolean }>(pid, 'gunluk')[today()] : undefined
  const board = profiles
    .map((p) => ({ p, total: GAMES.reduce((s, g) => s + g.rec(p.id), 0) }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-neutral-800 px-6 py-10 sm:px-10">
        <div className="absolute inset-0 grid grid-cols-7 sm:grid-cols-14 opacity-20 pointer-events-none">
          {art.map((x) => (
            <img key={x.id} src={x.poster} alt="" className="w-full aspect-[2/3] object-cover" />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/85 to-neutral-950/40 pointer-events-none" />
        <div className="relative flex flex-wrap items-end gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.3em] text-[#7fdcff]">ARGUS</p>
            <h1 className="text-5xl font-black text-neutral-50 tracking-tight mt-1">{tt('Oyun salonu')}</h1>
            <p className="text-neutral-300 mt-2 max-w-xl">{tt('Hepsi kendi arşivinle oynanıyor: sahneler, puanların, oyuncular, sinopsisler.')}</p>
            {rewards && <p className="text-sm text-amber-200 mt-2">🃏 {tt('Oyun bitirmek Bronz (günde 3), rekor kırmak Gümüş, günün yapımında 7 gün seri Altın paket kazandırır.')}</p>}
          </div>
          <div className="ml-auto">
            <SoundToggle />
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((g, i) => {
          const rec = pid ? g.rec(pid) : 0
          const poster = art[i * 3]?.poster
          return (
            <Link key={g.id} to={g.to} className="group relative overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/60 hover:border-[#00c0fa]/60 transition">
              <div className="relative h-32 overflow-hidden">
                {poster && <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 blur-[1px] scale-110 group-hover:scale-125 transition duration-700" />}
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 to-transparent" />
                <span className="absolute left-5 bottom-3 text-4xl drop-shadow-lg">{g.emoji}</span>
                {g.id === 'gunluk' && (
                  <span className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-xs font-bold ${daily?.won ? 'bg-emerald-500/25 text-emerald-200' : daily?.done ? 'bg-rose-500/20 text-rose-200' : 'bg-amber-500/20 text-amber-200'}`}>
                    {daily?.won ? tt('Bugün bildin ✓') : daily?.done ? tt('Bugün bitti') : tt('Bugün oynanmadı')}
                  </span>
                )}
              </div>
              <div className="p-5 pt-3">
                <p className="text-xl font-black text-neutral-50">{g.title}</p>
                <p className="text-sm text-neutral-400 mt-1 min-h-[40px]">{g.text}</p>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-neutral-500">
                    {tt('Rekorun')} <b className="text-amber-300 text-sm tabular-nums">{rec}</b>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-sm font-semibold text-white" style={{ background: 'linear-gradient(90deg,#015eea,#00c0fa)' }}>
                    <Icon name="play" className="h-3.5 w-3.5" />
                    {tt('Oyna')}
                  </span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {board.length > 1 && (
        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 max-w-xl">
          <p className="text-xs uppercase tracking-wider text-neutral-500 mb-3">{tt('Profiller arası sıralama (rekorların toplamı)')}</p>
          <div className="space-y-1.5">
            {board.map(({ p, total }, i) => (
              <p key={p.id} className="flex items-center gap-3 rounded-xl bg-neutral-900 px-3 py-2 text-sm">
                <span className="w-5 text-center font-black text-neutral-500">{i + 1}</span>
                <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-neutral-800">{p.photo && <img src={p.photo} alt="" className="h-full w-full object-cover" />}</span>
                <span className="flex-1 truncate text-neutral-200">{p.username}</span>
                {i === 0 && <Icon name="trophy" className="h-4 w-4 text-amber-300" />}
                <span className="tabular-nums font-semibold text-neutral-100">{ttx('{0}', total)}</span>
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
