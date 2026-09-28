import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { AppNotification } from '../lib/notifications'
import { useProfiles } from '../hooks/useProfiles'
import { useToast } from '../hooks/useToast'

// Üst menüdeki zil — kullanıcı "bildirimler için bir yer olsun" dedi. Dizi kendiliğinden İzlendi olunca,
// bitmiş bir diziye yeni bölüm gelince ya da yeni sezon tarihi açıklanınca burada birikir. Okunmamış
// sayısı zilin üstünde; tıklayınca liste açılır, bir bildirime tıklayınca o kaydın detayı açılır.
const POLL_MS = 60_000

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'şimdi'
  if (m < 60) return `${m} dk önce`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} sa önce`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} gün önce`
  return new Date(t).toLocaleDateString('tr-TR')
}

const TYPE_ICON: Record<string, { icon: string; cls: string }> = {
  watched: { icon: '✓', cls: 'bg-emerald-500/15 text-emerald-300' },
  newSeason: { icon: '▶', cls: 'bg-[#00c0fa]/15 text-[#7fdcff]' },
  announce: { icon: '📅', cls: 'bg-amber-500/15 text-amber-300' },
  feature: { icon: '★', cls: 'bg-fuchsia-500/15 text-fuchsia-300' },
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

export default function NotificationBell() {
  const { activeProfileId } = useProfiles()
  const { notify } = useToast()
  const navigate = useNavigate()
  const [items, setItems] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const knownIds = useRef<Set<string> | null>(null)

  const load = useCallback(() => {
    if (!activeProfileId) return
    Promise.resolve()
      .then(() => api.getNotifications())
      .then((r) => {
        // Uygulama açıkken yeni gelen okunmamış bildirim kısa bir kart olarak da gösterilsin.
        if (knownIds.current) {
          for (const n of r.items) if (!n.read && !knownIds.current.has(n.id)) notify(`${n.title}: ${n.text}`, 'success')
        }
        knownIds.current = new Set(r.items.map((n) => n.id))
        setItems(r.items)
      })
      .catch(() => {})
  }, [activeProfileId, notify])

  useEffect(() => {
    knownIds.current = null
    load()
    const id = setInterval(load, POLL_MS)
    const onPing = () => load()
    window.addEventListener('argus-notifications', onPing)
    return () => {
      clearInterval(id)
      window.removeEventListener('argus-notifications', onPing)
    }
  }, [load])

  const unread = items.filter((n) => !n.read).length

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right - 8) })
    }
    setOpen((v) => !v)
  }

  async function markAll() {
    await api.markNotificationsRead().catch(() => {})
    load()
  }

  async function clearAll() {
    await api.clearNotifications().catch(() => {})
    load()
  }

  async function openItem(n: AppNotification) {
    setOpen(false)
    if (!n.read) await api.markNotificationsRead([n.id]).catch(() => {})
    load()
    if (n.boardId && n.rowId) navigate(`/board/${n.boardId}?detay=${n.rowId}`)
    else if (n.link) navigate(n.link)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Bildirimler"
        aria-label="Bildirimler"
        className={`relative h-10 w-10 flex items-center justify-center rounded-full transition shrink-0 ${
          open ? 'bg-neutral-900 text-[#00c0fa]' : 'text-neutral-50 hover:bg-neutral-900 hover:text-[#00c0fa]'
        }`}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-neutral-950">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
            <div
              style={{ top: pos.top, right: pos.right }}
              className="fixed z-[81] w-[min(24rem,calc(100vw-1rem))] max-h-[70vh] flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-neutral-800">
                <p className="text-sm font-semibold text-neutral-100">
                  Bildirimler{unread > 0 && <span className="ml-1.5 text-xs font-normal text-neutral-500">{unread} okunmamış</span>}
                </p>
                <div className="flex items-center gap-3 text-xs">
                  {unread > 0 && (
                    <button onClick={markAll} className="text-[#00c0fa] hover:underline">
                      Hepsini okundu say
                    </button>
                  )}
                  {items.length > 0 && (
                    <button onClick={clearAll} className="text-neutral-500 hover:text-rose-300">
                      Temizle
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-y-auto">
                {items.length === 0 ? (
                  <p className="text-sm text-neutral-500 px-4 py-8 text-center">
                    Henüz bildirim yok.
                    <span className="block text-xs text-neutral-600 mt-1">Bir diziyi bitirince ya da izlediğin bir diziye yeni sezon gelince burada görünür.</span>
                  </p>
                ) : (
                  items.map((n) => {
                    const look = TYPE_ICON[n.type] ?? { icon: '•', cls: 'bg-neutral-800 text-neutral-300' }
                    return (
                      <button
                        key={n.id}
                        onClick={() => openItem(n)}
                        className={`w-full flex items-start gap-3 text-left px-4 py-3 border-b border-neutral-800/60 hover:bg-neutral-800/60 transition ${n.read ? '' : 'bg-[#00c0fa]/[0.04]'}`}
                      >
                        <span className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-sm ${look.cls}`}>{look.icon}</span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2">
                            <span className={`text-sm truncate ${n.read ? 'text-neutral-300' : 'text-neutral-50 font-medium'}`}>{n.title}</span>
                            {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-[#00c0fa] shrink-0" />}
                          </span>
                          <span className="block text-xs text-neutral-400 mt-0.5 leading-snug">{n.text}</span>
                          <span className="block text-[11px] text-neutral-600 mt-1">{ago(n.t)}</span>
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
