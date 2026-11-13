import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { useProfiles } from '../hooks/useProfiles'
import { api, type Evren, type EvrenPrefs, type PlatformOzet } from '../lib/api'
import { tt, ttx, getLang } from '../lib/i18n'
import { MyPlatformsPicker } from '../components/PickerPool'

// Hangi aboneliği almalıyım? — kullanıcı "bu ay hangi platformu alsam" sorusunun cevabını istedi. İzlenecekler
// listendeki (ya da bir evrende izlemediklerindeki) yapımların hangi abonelik platformunda olduğu toplanır; en çok
// izleme süresini karşılayan platform en üstte, en iyi ikili ayrıca yazılır (bkz. server/evrenler.js platform-ozet).

const hours = (min: number) => Math.round(min / 60)

// Bilinen platformların marka renkleri (planda ve kıyas çubuklarında); bilinmeyen platform ARGUS mavisi
const BRAND: [RegExp, string][] = [
  [/netflix/i, '#e50914'],
  [/disney/i, '#1f6feb'],
  [/prime|amazon/i, '#00a8e1'],
  [/hbo|max\b/i, '#7b2cf5'],
  [/apple/i, '#a3a3a3'],
  [/hulu/i, '#1ce783'],
  [/mubi/i, '#2f6bff'],
  [/blu ?tv/i, '#00b4f0'],
  [/exxen/i, '#ffd400'],
  [/gain/i, '#ff3d6e'],
  [/tabii|trt/i, '#00b2a9'],
  [/tod|bein/i, '#7c3aed'],
]
const brandColor = (name: string) => BRAND.find(([re]) => re.test(name))?.[1] ?? '#00c0fa'
const monthName = (offset: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() + offset, 1)
  return d.toLocaleDateString(getLang() === 'tr' ? 'tr-TR' : 'en-US', { month: 'long' })
}

export default function Abonelik() {
  const { settings, saveSettings } = useHomeSettings()
  const myPlatforms = settings.myPlatforms ?? []
  const [editMine, setEditMine] = useState(false)
  const { activeProfileId } = useProfiles()
  const boardId = settings.boardId ?? undefined
  const [params, setParams] = useSearchParams()
  const source = params.get('evren') ?? 'izlenecek'
  const [universes, setUniverses] = useState<{ list: Evren[]; prefs: Record<string, EvrenPrefs> } | null>(null)
  const [result, setResult] = useState<{ source: string; data: PlatformOzet } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!boardId || !activeProfileId) return
    api
      .getEvrenler(boardId)
      .then((d) => setUniverses({ list: d.universes, prefs: d.prefs }))
      .catch(() => setUniverses({ list: [], prefs: {} }))
  }, [boardId, activeProfileId])

  // Evren seçiliyse: turda (yoksa hiç) izlenmemiş, çıkmış yapımlar; bir dizinin sezonları tek yapım sayılır
  const evrenItems = useMemo(() => {
    if (source === 'izlenecek' || !universes) return null
    const u = universes.list.find((x) => x.id === source)
    if (!u) return null
    const p = universes.prefs[u.id] ?? {}
    const keys = p.turKeys?.length ? new Set(p.turKeys) : null
    const skip = new Set(p.atla ?? [])
    const map = new Map<string, { type: 'movie' | 'tv'; tmdbId: number; title: string; poster: string | null; minutes: number }>()
    for (const i of u.items) {
      if (!i.released || !i.tmdbId || (!p.ek && i.extra) || skip.has(i.key) || (keys && !keys.has(i.key))) continue
      const done = p.maraton ? Boolean(i.tour?.done) : i.watched
      if (done) continue
      const k = i.type + i.tmdbId
      const cur = map.get(k)
      if (cur) cur.minutes += i.minutes ?? 0
      else map.set(k, { type: i.type, tmdbId: i.tmdbId, title: i.archiveTitle || i.title, poster: i.poster, minutes: i.minutes ?? 0 })
    }
    return [...map.values()]
  }, [source, universes])

  useEffect(() => {
    if (!boardId || !activeProfileId) return
    if (source !== 'izlenecek' && !evrenItems) return
    let alive = true
    api
      .platformOzet(boardId, evrenItems ?? undefined)
      .then((data) => {
        if (!alive) return
        setResult({ source, data })
        setError(null)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : tt('Sunucuya ulaşılamadı.')))
    return () => {
      alive = false
    }
  }, [boardId, activeProfileId, source, evrenItems, myPlatforms.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const data = result?.source === source ? result.data : null
  // Abone olduğun platformlar işaretliyse öneri, onlarda olmayanlar için en iyi EK platform
  const bestNewP = data?.bestNew ? data.providers.find((p) => p.id === data.bestNew!.id) : undefined
  const best = myPlatforms.length && data?.bestNew ? bestNewP : data?.providers[0]
  const comboNames = data?.combo ? data.combo.ids.map((id) => data.providers.find((p) => p.id === id)?.name).filter(Boolean) : []
  const chip = (on: boolean) => `text-sm rounded-xl px-3 py-1.5 border transition ${on ? 'border-neutral-400 text-neutral-50 bg-neutral-800' : 'border-neutral-800 text-neutral-400 hover:text-neutral-100'}`

  if (!boardId) return <p className="text-center text-neutral-500 py-20">{tt('Önce bir arşiv seç (Ayarlar → Ana Sayfa).')}</p>

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <section
        className="relative overflow-hidden rounded-3xl border border-neutral-800 px-6 py-8 sm:px-10"
        style={{ background: 'radial-gradient(ellipse at 15% 0%, rgba(229,9,20,0.14), transparent 55%), radial-gradient(ellipse at 90% 100%, rgba(17,60,207,0.16), transparent 60%), var(--color-neutral-950)' }}
      >
        <p className="text-sm font-semibold tracking-widest text-[#7fdcff]">{tt('ARGUS')}</p>
        <h1 className="text-3xl sm:text-5xl font-black text-neutral-50 tracking-tight mt-1">{tt('Hangi aboneliği almalıyım?')}</h1>
        <p className="text-neutral-300 mt-2 max-w-2xl">{tt('İzlemek istediklerinin hangi platformda olduğuna bakıp en çok işine yarayanı söyler. Platformlar Türkiye için, TMDB\'den.')}</p>
      </section>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setParams({})} className={chip(source === 'izlenecek')}>
          {tt('İzlenecekler listem')}
        </button>
        {(universes?.list ?? []).map((u) => (
          <button key={u.id} onClick={() => setParams({ evren: u.id })} className={chip(source === u.id)}>
            {universes?.prefs[u.id]?.maraton ? tt('{0} turunun kalanı', u.name) : tt('{0}: izlemediklerim', u.name)}
          </button>
        ))}
      </div>

      {/* Abone olduğum platformlar (v1.23.13): kullanıcı "abone olduğum platformları işaretleyebileyim" dedi. Ne İzlesem'deki
          "sadece abone olduklarım" ayarıyla aynı liste. */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-50">{tt('Abone olduğum platformlar')}</p>
            <p className="text-xs text-neutral-500">
              {myPlatforms.length ? tt('{0} platform işaretli. Öneri, bunlarda olmayanlar için yapılır.', myPlatforms.length) : tt('İşaretlersen hangilerini zaten izleyebildiğini görür, öneriyi ona göre alırsın.')}
            </p>
          </div>
          <button onClick={() => setEditMine((v) => !v)} className="text-xs rounded-lg border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:text-neutral-50 hover:border-neutral-500 transition">
            {editMine ? tt('Bitti') : myPlatforms.length ? tt('Düzenle') : tt('İşaretle')}
          </button>
        </div>
        {!editMine && myPlatforms.length > 0 && data && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {myPlatforms.map((id) => {
              const p = data.providers.find((x) => x.id === id)
              return p ? (
                <span key={id} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 pl-1 pr-2 py-1 text-xs text-emerald-300">
                  {p.logo ? <img src={p.logo} alt="" className="h-5 w-5 rounded" /> : null}
                  {p.name}
                </span>
              ) : null
            })}
          </div>
        )}
        {editMine && (
          <div className="mt-3">
            <MyPlatformsPicker value={myPlatforms} prefer={data?.providers.map((p) => p.id)} onChange={(ids) => saveSettings({ ...settings, myPlatforms: ids })} />
          </div>
        )}
        {data?.mineCover && data.total > 0 && (
          <p className="mt-3 text-sm text-neutral-300">
            {tt('Aboneliklerinle {0} yapımın {1} tanesini izleyebilirsin, yaklaşık {2} saat.', data.total, data.mineCover.count, hours(data.mineCover.minutes))}
          </p>
        )}
      </section>

      {error && <p className="text-rose-400 text-sm">{error}</p>}
      {!data && !error && <p className="text-neutral-500 text-sm">{tt('Platformlar toplanıyor... (ilk seferde biraz sürebilir)')}</p>}
      {data?.needsApiKey && <p className="text-amber-400 text-sm">{tt('Bunun için Ayarlar → Veritabanı → API sekmesinden bir TMDB anahtarı girmelisin.')}</p>}

      {data && !data.needsApiKey && (
        <>
          {data.total === 0 ? (
            <p className="text-neutral-400">{tt('Burada izlenecek bir şey kalmamış.')}</p>
          ) : best ? (
            <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6 flex flex-col sm:flex-row gap-5 items-start">
              {best.logo && <img src={best.logo} alt="" className="h-20 w-20 rounded-2xl" />}
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs uppercase tracking-wider text-neutral-500">{myPlatforms.length ? tt('Aboneliklerine eklemek için') : tt('Önerim')}</p>
                <p className="text-2xl font-black text-neutral-50">{ttx('Bu ay {0} al', best.name)}</p>
                <p className="text-neutral-300">
                  {myPlatforms.length && data.bestNew
                    ? tt('Aboneliklerinde olmayan {0} yapım daha açılır, yaklaşık {1} saat.', data.bestNew.count, hours(data.bestNew.minutes))
                    : tt('{0} yapımın {1} tanesi orada, yaklaşık {2} saatlik izleme.', data.total, best.count, hours(best.minutes))}
                  {data.mine.includes(best.id) && <span className="text-emerald-400"> {tt('Zaten abonesin.')}</span>}
                </p>
                {!myPlatforms.length && data.combo && comboNames.length === 2 && data.combo.count > best.count && (
                  <p className="text-sm text-neutral-400">
                    {tt('{0} ve {1} birlikte: {2} yapım, yaklaşık {3} saat.', comboNames[0], comboNames[1], data.combo.count, hours(data.combo.minutes))}
                  </p>
                )}
              </div>
            </section>
          ) : null}

          {/* 3 aylık plan: bu ay en iyisi, sonra kalanlara göre ikinci ve üçüncü (v1.23.3, öneri B1) */}
          {data.plan && data.plan.length > 1 && (
            <section>
              <p className="text-xs uppercase tracking-wider text-neutral-500 mb-2">{tt('Sırayla al: 3 aylık plan')}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {data.plan.map((step, i) => {
                  const p = data.providers.find((x) => x.id === step.id)
                  if (!p) return null
                  const c = brandColor(p.name)
                  return (
                    <div
                      key={step.id}
                      className="relative rounded-2xl border p-4 transition"
                      style={
                        i === 0
                          ? { borderColor: c, boxShadow: `0 0 0 1px ${c}, 0 20px 40px -22px ${c}`, background: `linear-gradient(180deg, ${c}22, transparent 65%)` }
                          : { borderColor: 'var(--color-neutral-800)', background: 'color-mix(in srgb, var(--color-neutral-900) 50%, transparent)' }
                      }
                    >
                      {i === 0 && (
                        <span className="absolute top-3 right-3 text-[10px] font-bold rounded-full px-2 py-0.5 text-white" style={{ background: c }}>
                          {tt('Şimdi')}
                        </span>
                      )}
                      <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">{monthName(i)}</p>
                      <div className="flex items-center gap-2.5 mt-2.5">
                        {p.logo ? <img src={p.logo} alt="" className="h-9 w-9 rounded-xl" /> : <span className="h-9 w-9 rounded-xl" style={{ background: c }} />}
                        <span className="font-bold text-neutral-50 truncate">{p.name}</span>
                      </div>
                      <p className="mt-2.5 text-sm text-neutral-400">
                        <b className="text-2xl font-extrabold text-neutral-50 mr-1">{step.count}</b>
                        {i === 0 ? tt('yapım') : tt('yeni yapım')} · {tt('{0} saat', hours(step.minutes))}
                      </p>
                      <div className="mt-3 flex">
                        {step.items.map((it, k) => (
                          <span key={it.key} className="h-14 aspect-[2/3] rounded-md overflow-hidden bg-neutral-800 ring-2 ring-neutral-950" style={{ marginLeft: k ? -10 : 0 }} title={it.title}>
                            {it.poster && <img src={it.poster} alt="" loading="lazy" className="h-full w-full object-cover" />}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Tek bakışta kıyas: bütün platformlar yan yana, kendi renginde */}
          {data.providers.length > 1 && (
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
              {data.providers.slice(0, 8).map((p) => {
                const max = data.providers[0]?.minutes || data.providers[0]?.count || 1
                const val = data.providers[0]?.minutes ? p.minutes : p.count
                return (
                  <div key={p.id} className="grid grid-cols-[7.5rem_1fr_5.5rem] items-center gap-3 text-sm">
                    <span className="truncate font-medium text-neutral-200">{p.name}</span>
                    <span className="h-3 rounded-full bg-neutral-800 overflow-hidden">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (val / max) * 100)}%`, background: brandColor(p.name) }} />
                    </span>
                    <span className="text-right text-xs text-neutral-500 tabular-nums">{tt('{0} saat', hours(p.minutes))}</span>
                  </div>
                )
              })}
            </section>
          )}

          <div className="space-y-3">
            {data.providers.map((p) => {
              const share = data.totalMinutes ? Math.round((p.minutes / data.totalMinutes) * 100) : Math.round((p.count / data.total) * 100)
              return (
                <section key={p.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                  <div className="flex items-center gap-3">
                    {p.logo ? <img src={p.logo} alt="" className="h-10 w-10 rounded-xl" /> : <span className="h-10 w-10 rounded-xl bg-neutral-800" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-neutral-50 truncate">
                        {p.name}
                        {data.mine.includes(p.id) && <span className="ml-2 text-[11px] rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 align-middle">{tt('Abonesin')}</span>}
                      </p>
                      <p className="text-xs text-neutral-400">{tt('{0} yapım · yaklaşık {1} saat · %{2}', p.count, hours(p.minutes), share)}</p>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: brandColor(p.name) }} />
                  </div>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {p.items.map((it) => (
                      <div key={it.key} className="w-14 shrink-0" title={it.title}>
                        <div className="aspect-[2/3] rounded-md overflow-hidden bg-neutral-800">{it.poster && <img src={it.poster} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
                      </div>
                    ))}
                    {p.count > p.items.length && <span className="self-center text-xs text-neutral-500 shrink-0 px-2">{tt('+{0} daha', p.count - p.items.length)}</span>}
                  </div>
                </section>
              )
            })}
          </div>

          {data.noneCount > 0 && (
            <section className="rounded-2xl border border-dashed border-neutral-800 p-4">
              <p className="text-sm text-neutral-300">{tt('{0} yapım hiçbir abonelikte yok (kiralık, satın alma ya da sinemada).', data.noneCount)}</p>
              <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{data.none.map((n) => n.title).join(' · ')}</p>
            </section>
          )}
          {source !== 'izlenecek' && (
            <Link to={`/evrenler/${source}`} className="inline-block text-sm text-neutral-400 hover:text-neutral-100">
              {tt('← Evrene dön')}
            </Link>
          )}
        </>
      )}
    </div>
  )
}
