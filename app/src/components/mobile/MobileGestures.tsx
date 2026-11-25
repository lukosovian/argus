import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Board, Row } from '../../types'
import { titleText, todayIso } from '../../types'
import { api } from '../../lib/api'
import { isWatchedStatus, resolveRole, resolveStatusOption } from '../../lib/roles'
import { isSeriesRow } from '../../lib/watchWindow'
import { showcaseMeta } from '../../lib/rowMeta'
import { notifyDataChanged } from '../../lib/dataEvents'
import { useAklimda } from '../../hooks/useAklimda'
import { useToast } from '../../hooks/useToast'
import { useEscape } from '../../hooks/useEscape'
import { getState, reconnectNow } from '../../lib/mobile/connection'
import { tt } from '../../lib/i18n'
import Icon, { IconText, type IconName } from '../Icon'

// ARGUS Android › telefona özel dokunma hareketleri (v1.26). Navbar'ın telefon dalında bir kez durur:
//   - Afişe basılı tutunca hızlı menü (A3): hafif titreşim, alttan küçük sayfa — İzledim · Aklımda · Puan · Detay.
//     Afiş kartları data-argus-row / data-argus-board taşır (Ana Sayfa kartları, Arşiv ızgarası/listesi).
//   - Aşağı çekince eşitle (A4): Ana Sayfa, Arşiv ve Takvim'de sayfanın en üstündeyken aşağı çekip bırakınca PC aranır
//     ve eşitlenir; ortada dönen ARGUS halkası, sonunda "Eşitlendi" / "PC bulunamadı".
//   - Kaydırınca saklanan çubuklar (A5): aşağı kaydırırken üst başlık yukarı, alt sekme çubuğu aşağı çekilir; parmak
//     yukarı gidince ikisi de geri gelir. Çubuklar data-mobile-chrome="top|bottom" ile işaretli (bkz. Navbar).

const LONG_PRESS_MS = 450
const PULL_TRIGGER = 72
const PULL_MAX = 120

const CHROME_CSS = `
[data-mobile-chrome]{transition:transform .28s cubic-bezier(.2,.8,.3,1),background-color .3s,box-shadow .3s;will-change:transform}
html[data-chrome-hidden] [data-mobile-chrome="top"]{transform:translateY(calc(-100% + env(safe-area-inset-top)))}
html[data-chrome-hidden] [data-mobile-chrome="bottom"]{transform:translateY(calc(100% + 24px))}
[data-argus-row]{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
@keyframes argus-hizli-in{from{transform:translateY(100%)}to{transform:translateY(0)}}
`

// Açık bir pencere (detay, menü sayfası…) var mı — varken sayfa hareketleri çalışmaz
function overlayOpen(): boolean {
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return true
  return document.body.style.overflow === 'hidden' || document.documentElement.style.overflow === 'hidden'
}

// Dokunulan yerden yukarı doğru kendi içinde kaydırılmış bir alan var mı (o önce yukarı kaysın)
function insideScrolled(target: EventTarget | null): boolean {
  for (let n = target as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
    if (n.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return true
  }
  return false
}

function useHideOnScroll() {
  const location = useLocation()
  useEffect(() => {
    const root = document.documentElement
    let last = window.scrollY
    let acc = 0
    let hidden = false
    const set = (h: boolean) => {
      if (h === hidden) return
      hidden = h
      root.toggleAttribute('data-chrome-hidden', h)
    }
    const onScroll = () => {
      const y = window.scrollY
      const d = y - last
      last = y
      if (y < 80 || overlayOpen()) {
        acc = 0
        set(false)
        return
      }
      if (d === 0) return
      if (d > 0 !== acc > 0) acc = 0
      acc += d
      if (acc > 28) set(true)
      else if (acc < -14) set(false)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      root.removeAttribute('data-chrome-hidden')
    }
  }, [])
  // Sayfa değişince çubuklar hemen görünsün
  useEffect(() => {
    document.documentElement.removeAttribute('data-chrome-hidden')
  }, [location.pathname, location.search])
}

type PullPhase = 'idle' | 'pull' | 'sync' | 'done'

function usePullToSync() {
  const location = useLocation()
  const [pull, setPull] = useState(0)
  const [phase, setPhase] = useState<PullPhase>('idle')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  useEffect(() => {
    let startX = 0
    let startY = 0
    let tracking = false
    let pulling = false
    let amount = 0
    const allowed = () => {
      const p = pathRef.current
      return p === '/' || p.startsWith('/board/') || p.startsWith('/takvim')
    }
    const onStart = (e: TouchEvent) => {
      tracking = false
      pulling = false
      if (e.touches.length !== 1 || phaseRef.current === 'sync' || !allowed() || window.scrollY > 2 || overlayOpen() || insideScrolled(e.target)) return
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      tracking = true
    }
    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      const x = e.touches[0].clientX - startX
      const y = e.touches[0].clientY - startY
      if (!pulling) {
        if (Math.abs(x) < 8 && Math.abs(y) < 8) return
        if (y <= 0 || Math.abs(x) > Math.abs(y) || window.scrollY > 2) {
          tracking = false
          return
        }
        pulling = true
        setPhase('pull')
      }
      e.preventDefault()
      // Parmağın yarısı kadar, en çok PULL_MAX — esnek his
      amount = Math.min(PULL_MAX, Math.max(0, y) * 0.5)
      setPull(amount)
    }
    const onEnd = () => {
      if (!tracking) return
      tracking = false
      if (!pulling) return
      pulling = false
      if (amount < PULL_TRIGGER) {
        setPhase('idle')
        setPull(0)
        return
      }
      setPhase('sync')
      setPull(PULL_TRIGGER)
      navigator.vibrate?.(10)
      reconnectNow()
        .catch(() => false)
        .then((ok) => {
          setMsg(ok ? { text: tt('Eşitlendi'), ok: true } : { text: getState().unpaired ? tt('PC bu telefonu tanımıyor') : tt('PC bulunamadı'), ok: false })
          setPhase('done')
          setTimeout(() => {
            setPhase('idle')
            setPull(0)
            setMsg(null)
          }, 1600)
        })
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])
  return { pull, phase, msg }
}

function PullIndicator({ pull, phase, msg }: { pull: number; phase: PullPhase; msg: { text: string; ok: boolean } | null }) {
  if (phase === 'idle') return null
  const ready = pull >= PULL_TRIGGER
  const r = 15
  const c = 2 * Math.PI * r
  const shown = phase === 'pull' ? Math.min(1, pull / PULL_TRIGGER) : 0.72
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 z-[150] flex flex-col items-center" style={{ top: `calc(env(safe-area-inset-top) + ${12 + pull * 0.6}px)` }}>
      <div
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-neutral-900/95 shadow-xl shadow-black/60"
        style={{ opacity: phase === 'pull' ? Math.min(1, pull / 40) : 1, transform: phase === 'pull' ? `rotate(${pull * 3}deg)` : undefined }}
      >
        <img src="/logoblue.png" alt="" className="h-5 w-5 object-contain" style={{ transform: phase === 'pull' ? `rotate(${-pull * 3}deg)` : undefined }} />
        <svg viewBox="0 0 36 36" className={`absolute inset-0 h-full w-full ${phase === 'sync' ? 'animate-spin' : ''}`} aria-hidden>
          <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2.5" />
          {phase !== 'done' && (
            <circle cx="18" cy="18" r={r} fill="none" stroke={ready || phase === 'sync' ? '#00c0fa' : '#3a8fb0'} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${c * shown} ${c}`} transform="rotate(-90 18 18)" />
          )}
        </svg>
      </div>
      {phase === 'pull' && <p className="mt-2 text-[11px] font-medium text-neutral-400">{ready ? tt('Bırak, PC ile eşitlensin') : tt('Eşitlemek için çek')}</p>}
      {phase === 'sync' && <p className="mt-2 text-[11px] font-medium text-[#bdeeff]">{tt('PC aranıyor…')}</p>}
      {phase === 'done' && msg && (
        <p className={`mt-2 rounded-full border px-3 py-1 text-[12px] font-semibold ${msg.ok ? 'border-emerald-800/60 bg-emerald-950/95 text-[#a7f3d0]' : 'border-amber-800/60 bg-amber-950/95 text-[#fde68a]'}`}>
          {msg.text}
        </p>
      )}
    </div>,
    document.body,
  )
}

// ---- Basılı tutunca hızlı menü ----
function useLongPress(onFire: (boardId: string, rowId: string) => void) {
  const fire = useRef(onFire)
  fire.current = onFire
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let sx = 0
    let sy = 0
    let firedAt = 0
    const cancel = () => {
      if (timer) clearTimeout(timer)
      timer = null
    }
    const onStart = (e: TouchEvent) => {
      cancel()
      if (e.touches.length !== 1) return
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-argus-row]')
      const rowId = card?.dataset.argusRow
      const boardId = card?.dataset.argusBoard
      if (!rowId || !boardId) return
      sx = e.touches[0].clientX
      sy = e.touches[0].clientY
      timer = setTimeout(() => {
        timer = null
        firedAt = Date.now()
        navigator.vibrate?.(18)
        fire.current(boardId, rowId)
      }, LONG_PRESS_MS)
    }
    const onMove = (e: TouchEvent) => {
      if (!timer) return
      if (Math.abs(e.touches[0].clientX - sx) > 10 || Math.abs(e.touches[0].clientY - sy) > 10) cancel()
    }
    // Basılı tutmanın ardından gelen dokunma "tıklaması" detay penceresini açmasın
    const onClick = (e: MouseEvent) => {
      if (Date.now() - firedAt < 700) {
        e.preventDefault()
        e.stopPropagation()
        firedAt = 0
      }
    }
    // Android'in kendi basılı tutma menüsü (görseli kaydet vb.) afişlerde çıkmasın
    const onContext = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest('[data-argus-row]')) e.preventDefault()
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', cancel)
    window.addEventListener('touchcancel', cancel)
    window.addEventListener('scroll', cancel, { passive: true })
    window.addEventListener('click', onClick, true)
    window.addEventListener('contextmenu', onContext)
    return () => {
      cancel()
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', cancel)
      window.removeEventListener('touchcancel', cancel)
      window.removeEventListener('scroll', cancel)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('contextmenu', onContext)
    }
  }, [])
}

function QuickMenu({ boardId, rowId, onClose }: { boardId: string; rowId: string; onClose: () => void }) {
  const { notify } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const aklimda = useAklimda()
  const [data, setData] = useState<{ board: Board; row: Row } | null>(null)
  const [busy, setBusy] = useState(false)
  useEscape(true, onClose)

  useEffect(() => {
    let alive = true
    Promise.all([api.getBoards(), api.getRows(boardId)])
      .then(([boards, rows]) => {
        const board = boards.find((b) => b.id === boardId)
        const row = rows.find((r) => r.id === rowId)
        if (!alive) return
        if (board && row) setData({ board, row })
        else onClose()
      })
      .catch(() => alive && onClose())
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, rowId])

  if (!data) return null
  const { board, row } = data
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const title = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
  const posterProp = resolveRole(board, 'poster')
  const coverProp = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
  const poster = (posterProp && (row.values[posterProp.id] as string)) || (coverProp && (row.values[coverProp.id] as string)) || ''
  const meta = showcaseMeta(board, row).slice(0, 3).join(' · ')
  const durum = resolveRole(board, 'durum')
  const izlendi = resolveStatusOption(board, 'izlendi')
  const puan = resolveRole(board, 'puan')
  const watched = Boolean(durum && isWatchedStatus(board, row.values[durum.id]))
  const inAklimda = Boolean(aklimda.items[row.id])

  async function markWatched() {
    if (!durum || !izlendi || watched) return
    setBusy(true)
    try {
      const fresh = (await api.getRows(board.id)).find((x) => x.id === row.id) ?? row
      const values = { ...fresh.values, [durum.id]: izlendi }
      const changed = [durum.id]
      // Filmde bugünün tarihi de izleme tarihine yazılır (dizide bölümler ayrı işaretleniyor)
      const tarih = resolveRole(board, 'izlemeTarihi')
      if (tarih && !isSeriesRow(board, fresh)) {
        const today = todayIso()
        const cur = fresh.values[tarih.id]
        if (tarih.type === 'multidate') {
          const list = Array.isArray(cur) ? (cur as string[]) : typeof cur === 'string' && cur ? [cur] : []
          values[tarih.id] = list.includes(today) ? list : [...list, today]
        } else if (!cur) values[tarih.id] = today
        changed.push(tarih.id)
      }
      await api.updateRow(board.id, row.id, { values, createdAt: fresh.createdAt, updatedAt: Date.now() }, changed)
      notifyDataChanged(board.id, 'rows')
      notify(tt('"{0}" izlendi olarak işaretlendi.', title || tt('Kayıt')), 'success')
      onClose()
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Kaydedilemedi.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function toggleAklimda() {
    setBusy(true)
    try {
      if (inAklimda) {
        await aklimda.remove(row.id)
        notify(tt('Aklımda listesinden çıkarıldı.'))
      } else {
        await aklimda.addRow(board.id, row.id)
        notify(tt('Aklımda listesine eklendi.'), 'success')
      }
      onClose()
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Kaydedilemedi.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  function rate() {
    window.dispatchEvent(new CustomEvent('argus-ask-rating', { detail: { boardId: board.id, rowId: row.id, force: true } }))
    onClose()
  }

  function details() {
    onClose()
    // Ana Sayfa ve Arşiv "?detay=" ile detay penceresini açıyor; başka sayfalarda kaydın arşivine gidilir
    const p = location.pathname
    if (p === '/' || p === `/board/${board.id}`) {
      const q = new URLSearchParams(location.search)
      q.set('detay', row.id)
      navigate(`${p}?${q.toString()}`)
    } else navigate(`/board/${board.id}?detay=${encodeURIComponent(row.id)}`)
  }

  const actions: { key: string; icon: IconName; label: string; on: () => void; active?: boolean; disabled?: boolean }[] = [
    ...(durum && izlendi ? [{ key: 'izle', icon: 'check' as IconName, label: watched ? tt('İzlendi') : tt('İzledim'), on: () => void markWatched(), active: watched, disabled: watched }] : []),
    { key: 'aklimda', icon: 'bookmark', label: inAklimda ? tt('Aklımda') : tt('Aklıma ekle'), on: () => void toggleAklimda(), active: inAklimda },
    ...(puan ? [{ key: 'puan', icon: 'star' as IconName, label: tt('Puan ver'), on: rate }] : []),
    { key: 'detay', icon: 'external', label: tt('Detay'), on: details },
  ]

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title || tt('Hızlı menü')} className="fixed inset-0 z-[96] flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div
        className="rounded-t-3xl border-t border-white/10 bg-neutral-900 px-4 pt-3 shadow-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)', animation: 'argus-hizli-in .22s cubic-bezier(.2,.8,.3,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-700" />
        <div className="flex items-center gap-3">
          <span className="h-[84px] w-14 shrink-0 overflow-hidden rounded-md bg-neutral-800">{poster && <img src={poster} alt="" className="h-full w-full object-cover" />}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold leading-snug text-neutral-50 line-clamp-2">{title || tt('Adsız')}</p>
            {meta && (
              <p className="mt-0.5 truncate text-xs text-neutral-400">
                <IconText text={meta} />
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label={tt('Kapat')} className="h-9 w-9 shrink-0 rounded-full bg-neutral-800 text-lg leading-none text-neutral-300">
            ×
          </button>
        </div>
        <div className={`mt-4 grid gap-2 ${actions.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {actions.map((a) => (
            <button
              key={a.key}
              onClick={a.on}
              disabled={busy || a.disabled}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border py-3.5 text-[12px] font-medium transition active:scale-95 disabled:active:scale-100 ${
                a.active ? 'border-[#00c0fa]/50 bg-[#00c0fa]/10 text-[#bdeeff]' : 'border-neutral-800 bg-neutral-800/60 text-neutral-100'
              } ${busy && !a.active ? 'opacity-60' : ''}`}
            >
              <Icon name={a.icon} className="h-6 w-6" />
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function MobileGestures() {
  useHideOnScroll()
  const { pull, phase, msg } = usePullToSync()
  const [quick, setQuick] = useState<{ boardId: string; rowId: string } | null>(null)
  useLongPress((boardId, rowId) => setQuick({ boardId, rowId }))
  return (
    <>
      <style>{CHROME_CSS}</style>
      <PullIndicator pull={pull} phase={phase} msg={msg} />
      {quick && <QuickMenu key={quick.rowId} boardId={quick.boardId} rowId={quick.rowId} onClose={() => setQuick(null)} />}
    </>
  )
}
