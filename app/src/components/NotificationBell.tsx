import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { AppNotification } from '../lib/notifications'
import { useProfiles } from '../hooks/useProfiles'
import { useToast } from '../hooks/useToast'
import { useEscape } from '../hooks/useEscape'
import { tt, ttx, locale } from '../lib/i18n'
import { MOBILE } from '../lib/mobile/ui'
import EmptyState from './EmptyState'
import Icon, { type IconName } from './Icon'

// Üst menüdeki zil — kullanıcı "bildirimler için bir yer olsun" dedi. Dizi kendiliğinden İzlendi olunca,
// bitmiş bir diziye yeni bölüm gelince ya da yeni sezon tarihi açıklanınca burada birikir. Okunmamış
// sayısı zilin üstünde; tıklayınca liste açılır, bir bildirime tıklayınca o kaydın detayı açılır.
const POLL_MS = 60_000

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return tt('şimdi')
  if (m < 60) return tt('{0} dk önce', m)
  const h = Math.round(m / 60)
  if (h < 24) return tt('{0} sa önce', h)
  const d = Math.round(h / 24)
  if (d < 30) return tt('{0} gün önce', d)
  return new Date(t).toLocaleDateString(locale())
}

const TYPE_ICON: Record<string, { icon: IconName; cls: string }> = {
  watched: { icon: 'check', cls: 'bg-emerald-500/15 text-emerald-300' },
  newSeason: { icon: 'play', cls: 'bg-[#00c0fa]/15 text-[#7fdcff]' },
  announce: { icon: 'calendar', cls: 'bg-amber-500/15 text-amber-300' },
  feature: { icon: 'star', cls: 'bg-fuchsia-500/15 text-fuchsia-300' },
  platform: { icon: 'tv', cls: 'bg-violet-500/15 text-violet-300' },
  collection: { icon: 'film', cls: 'bg-[#00c0fa]/15 text-[#7fdcff]' },
  // v1.23.4 Ekstralar
  achievement: { icon: 'trophy', cls: 'bg-amber-500/15 text-amber-300' },
  weekly: { icon: 'chart', cls: 'bg-[#00c0fa]/15 text-[#7fdcff]' },
  follow: { icon: 'person', cls: 'bg-violet-500/15 text-violet-300' },
}

// Türe göre sekmeler (v1.26, A14). Sunucu yeni türler ekledikçe sabit bir liste yerine türün adına bakılır;
// hiçbirine uymayan (bilinmeyen) türler "Diğer"e düşer.
type NoteTab = 'all' | 'bolum' | 'platform' | 'basarim' | 'sistem' | 'diger'
const NOTE_TABS: { id: NoteTab; label: () => string }[] = [
  { id: 'all', label: () => tt('Hepsi') },
  { id: 'bolum', label: () => tt('Bölümler') },
  { id: 'platform', label: () => tt('Platformlar') },
  { id: 'basarim', label: () => tt('Başarımlar') },
  { id: 'sistem', label: () => tt('Sistem') },
  { id: 'diger', label: () => tt('Diğer') },
]
function noteTab(type: string | undefined): Exclude<NoteTab, 'all'> {
  const t = (type ?? '').toLocaleLowerCase('tr')
  if (/platform|provider|stream|kalkt|leaving/.test(t)) return 'platform'
  if (/achiev|basarim|başarım|odul|ödül|reward|badge|rozet/.test(t)) return 'basarim'
  if (/season|episode|announce|sezon|bolum|bölüm|airing|finale/.test(t)) return 'bolum'
  if (/backup|yedek|update|guncel|güncel|disk|feature|system|sistem|error|hata|bulk|device|recover/.test(t)) return 'sistem'
  return 'diger'
}

function BellIcon() {
  return (
    <Icon name="bell" className="h-5 w-5" />
  )
}

export default function NotificationBell() {
  const { activeProfileId } = useProfiles()
  const { notify } = useToast()
  const navigate = useNavigate()
  const [items, setItems] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  // Türe göre sekme (v1.26, A14) ve "artık izlenebilir" grubunun açıklığı
  const [tab, setTab] = useState<NoteTab>('all')
  const [groupOpen, setGroupOpen] = useState(false)
  useEscape(open, () => setOpen(false))
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const knownIds = useRef<Set<string> | null>(null)
  // Profil değişince eski profilin bildirimleri bir an bile görünmesin; yolda kalmış eski cevap da yazılmasın (v1.26, H10)
  const profileRef = useRef(activeProfileId)
  const [shownFor, setShownFor] = useState(activeProfileId)
  if (shownFor !== activeProfileId) {
    setShownFor(activeProfileId)
    setItems([])
    setTab('all')
    setGroupOpen(false)
  }

  const load = useCallback(() => {
    if (!activeProfileId) return
    profileRef.current = activeProfileId
    const pid = activeProfileId
    Promise.resolve()
      .then(() => api.getNotifications())
      .then((r) => {
        if (profileRef.current !== pid) return
        // Uygulama açıkken yeni gelen okunmamış bildirim kısa bir kart olarak da gösterilsin.
        // Aynı anda birden çok geldiyse (ör. Genel Güncelleme'den sonra) tek bir özet kart — yeni kullanıcı
        // denemesinde 8 kart üst üste yığılıp ekranın sağ altını kapatıyordu.
        if (knownIds.current) {
          const all = r.items.filter((n) => !n.read && !knownIds.current!.has(n.id))
          // "Artık şurada izlenebilir" haberleri ayrı ayrı kart olmaz, hep tek bir özet kart (kullanıcı
          // "tek seferde gelsin, tıklayınca hangileri olduğunu göreyim" dedi) — liste zildeki grupta.
          const platform = all.filter((n) => n.type === 'platform')
          const fresh = all.filter((n) => n.type !== 'platform')
          if (platform.length > 0)
            notify(
              platform.length === 1
                ? `${platform[0].title}: ${platform[0].text}`
                : tt('{0} içerik artık izlenebilir — hangileri olduğunu zil simgesinden görebilirsin.', platform.length),
              'success',
            )
          if (fresh.length === 1) notify(`${fresh[0].title}: ${fresh[0].text}`, 'success')
          else if (fresh.length > 1)
            notify(tt('{0} yeni bildirim ({1}{2}) — zil simgesinden bakabilirsin.', fresh.length, fresh.slice(0, 3).map((n) => n.title).join(', '), fresh.length > 3 ? '…' : ''), 'success')
        }
        knownIds.current = new Set(r.items.map((n) => n.id))
        setItems(r.items)
      })
      .catch(() => {})
  }, [activeProfileId, notify])

  useEffect(() => {
    knownIds.current = null
    load()
    // Sekme/pencere gizliyken sorma; görünür olunca hemen tazele
    const id = setInterval(() => {
      if (!document.hidden) load()
    }, POLL_MS)
    const onPing = () => load()
    const onVis = () => {
      if (document.visibilityState === 'visible') load()
    }
    window.addEventListener('argus-notifications', onPing)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      window.removeEventListener('argus-notifications', onPing)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load])

  const unread = items.filter((n) => !n.read).length

  // Sekmeler: sadece içinde bildirim olan türler görünür, her birinde okunmamış sayısı
  const tabs = NOTE_TABS.map((t) => {
    const list = t.id === 'all' ? items : items.filter((n) => noteTab(n.type) === t.id)
    return { ...t, count: list.length, unread: list.filter((n) => !n.read).length }
  }).filter((t) => t.id === 'all' || t.count > 0)
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'all'
  const visible = activeTab === 'all' ? items : items.filter((n) => noteTab(n.type) === activeTab)

  // "Artık şurada izlenebilir" haberleri listede tek bir satırda toplanır (en yenisinin yerinde);
  // tıklayınca açılır, her biri ayrı ayrı görünür ve tıklanınca o kaydın detayı açılır.
  const platformItems = visible.filter((n) => n.type === 'platform')
  type ListEntry = { kind: 'item'; item: AppNotification } | { kind: 'group'; items: AppNotification[] }
  const listEntries: ListEntry[] = []
  for (const n of visible) {
    if (n.type !== 'platform') listEntries.push({ kind: 'item', item: n })
    else if (platformItems.length === 1) listEntries.push({ kind: 'item', item: n })
    else if (n === platformItems[0]) listEntries.push({ kind: 'group', items: platformItems })
  }

  async function toggleGroup(g: AppNotification[]) {
    const opening = !groupOpen
    setGroupOpen(opening)
    const ids = g.filter((n) => !n.read).map((n) => n.id)
    if (opening && ids.length) {
      await api.markNotificationsRead(ids).catch(() => {})
      load()
    }
  }

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right - 8) })
    }
    setOpen((v) => !v)
  }

  async function markAll() {
    // Bir sekme seçiliyse sadece o sekmedekiler okundu sayılır
    const ids = activeTab === 'all' ? undefined : visible.filter((n) => !n.read).map((n) => n.id)
    await api.markNotificationsRead(ids).catch(() => {})
    load()
  }

  // Silinenler önce kopyalanıyor ki "Geri al" sunucuya geri yazabilsin (K8). Geri gelenler "yeni" sayılıp
  // tekrar kart olarak çıkmasın diye bilinenlere ekleniyor.
  async function restore(list: AppNotification[]) {
    for (const n of list) knownIds.current?.add(n.id)
    await api.restoreNotifications(list).catch(() => notify(tt('Geri alınamadı'), 'danger'))
    load()
  }
  function undoAction(list: AppNotification[]) {
    return { action: { label: tt('Geri al'), onClick: () => restore(list) } }
  }

  async function clearAll() {
    const copy = items
    setItems([])
    await api.clearNotifications().catch(() => {})
    load()
    if (copy.length) notify(tt('{0} bildirim temizlendi', copy.length), 'info', undoAction(copy))
  }

  // Tek bildirimi (ya da platform grubunu) sil — ×
  async function removeItems(list: AppNotification[]) {
    const ids = new Set(list.map((n) => n.id))
    setItems((cur) => cur.filter((n) => !ids.has(n.id)))
    await Promise.all(list.map((n) => api.deleteNotification(n.id).catch(() => {})))
    load()
    notify(list.length === 1 ? tt('Bildirim silindi') : tt('{0} bildirim silindi', list.length), 'info', undoAction(list))
  }

  function openSettings() {
    setOpen(false)
    navigate('/arsivlerim?sekme=uygulama&bolum=zil')
  }

  // × düğmesi: bilgisayarda üzerine gelince, telefonda hep görünür; satırın tıklamasını (detayı açma) tetiklemez
  function deleteBtn(list: AppNotification[]) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          removeItems(list)
        }}
        title={tt('Bildirimi sil')}
        aria-label={tt('Bildirimi sil')}
        className={`absolute top-2 right-2 h-7 w-7 rounded-full flex items-center justify-center text-neutral-500 hover:text-rose-300 hover:bg-neutral-800 transition focus-visible:opacity-100 ${
          MOBILE ? '' : 'opacity-0 group-hover/not:opacity-100'
        }`}
      >
        ×
      </button>
    )
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
        title={tt('Bildirimler')}
        aria-label={tt('Bildirimler')}
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
              // Telefonda tam ekran sayfa (köşeden açılan küçük panel telefona sığmıyordu)
              style={MOBILE ? { paddingTop: 'env(safe-area-inset-top)' } : { top: pos.top, right: pos.right }}
              className={
                MOBILE
                  ? 'fixed inset-0 z-[81] flex flex-col bg-neutral-950'
                  : 'fixed z-[81] w-[min(24rem,calc(100vw-1rem))] max-h-[70vh] flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden'
              }
            >
              <div className={`flex items-center justify-between gap-2 border-b border-neutral-800 ${MOBILE ? 'px-3 h-16' : 'px-4 py-3'}`}>
                {MOBILE && (
                  <button onClick={() => setOpen(false)} aria-label={tt('Kapat')} className="h-10 w-10 -ml-1 flex items-center justify-center rounded-full text-neutral-200 text-2xl active:bg-neutral-800">
                    ‹
                  </button>
                )}
                <p className={`${MOBILE ? 'flex-1 text-xl font-bold text-neutral-50' : 'text-sm font-semibold text-neutral-100'}`}>
                  {tt('Bildirimler')}{unread > 0 && <span className="ml-1.5 text-xs font-normal text-neutral-500">{ttx('{0} okunmamış', unread)}</span>}
                </p>
                <div className="flex items-center gap-3 text-xs">
                  {/* Dişli: Ayarlar › Uygulama Ayarları › Zil bildirimleri (telefonda o bölüm yok) */}
                  {!MOBILE && (
                    <button onClick={openSettings} title={tt('Zil bildirimleri ayarları')} aria-label={tt('Zil bildirimleri ayarları')} className="text-neutral-500 hover:text-neutral-100 transition">
                      <Icon name="gear" className="h-4 w-4" />
                    </button>
                  )}
                  {(activeTab === 'all' ? unread : visible.some((n) => !n.read)) ? (
                    <button onClick={markAll} className="text-[#00c0fa] hover:underline">
                      {tt('Hepsini okundu say')}
                    </button>
                  ) : null}
                  {items.length > 0 && (
                    <button onClick={clearAll} className="text-neutral-500 hover:text-rose-300">
                      {tt('Temizle')}
                    </button>
                  )}
                </div>
              </div>
              {/* Türe göre haplar (v1.26, A14): Hepsi · Bölümler · Platformlar · Başarımlar…; yanında okunmamış sayısı */}
              {tabs.length > 2 && (
                <div className={`no-scrollbar shrink-0 flex gap-1.5 overflow-x-auto border-b border-neutral-800 ${MOBILE ? 'px-3 py-2.5' : 'px-3 py-2'}`}>
                  {tabs.map((t) => {
                    const on = t.id === activeTab
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTab(t.id)
                          setGroupOpen(false)
                        }}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border transition ${MOBILE ? 'px-3.5 py-1.5 text-[13px]' : 'px-3 py-1 text-xs'} ${
                          on ? 'border-[#00c0fa]/60 bg-[#00c0fa]/15 text-neutral-50' : 'border-neutral-700 text-neutral-400 hover:text-neutral-100 hover:border-neutral-500'
                        }`}
                      >
                        {t.label()}
                        {t.unread > 0 && <span className="min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-4 text-center">{t.unread > 9 ? '9+' : t.unread}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className={`overflow-y-auto ${MOBILE ? 'flex-1 pb-8' : ''}`}>
                {items.length === 0 ? (
                  <EmptyState compact art="bildirim" title={tt('Henüz bildirim yok.')} text={tt('Bir diziyi bitirince ya da izlediğin bir diziye yeni sezon gelince burada görünür.')} />
                ) : (
                  listEntries.map((entry) => {
                    if (entry.kind === 'group') {
                      const g = entry.items
                      const gUnread = g.filter((n) => !n.read).length
                      const look = TYPE_ICON.platform
                      return (
                        <div key="platform-group" className="border-b border-neutral-800/60">
                          <div className="group/not relative">
                          <button
                            onClick={() => toggleGroup(g)}
                            className={`w-full flex items-start gap-3 text-left pl-4 pr-10 py-3 hover:bg-neutral-800/60 transition ${gUnread ? 'bg-[#00c0fa]/[0.04]' : ''}`}
                          >
                            <span className={`${MOBILE ? 'h-10 w-10 text-base' : 'h-8 w-8 text-sm'} shrink-0 rounded-full flex items-center justify-center ${look.cls}`}><Icon name={look.icon} className={MOBILE ? 'h-5 w-5' : 'h-4 w-4'} /></span>
                            <span className="flex-1 min-w-0">
                              <span className="flex items-center gap-2">
                                <span className={`text-sm truncate ${gUnread ? 'text-neutral-50 font-medium' : 'text-neutral-300'}`}>{tt('{0} içerik artık izlenebilir', g.length)}</span>
                                {gUnread > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[#00c0fa] shrink-0" />}
                              </span>
                              <span className="block text-xs text-neutral-400 mt-0.5 leading-snug truncate">{g.slice(0, 3).map((n) => n.title).join(', ')}{g.length > 3 ? '…' : ''}</span>
                              <span className="block text-[11px] text-neutral-600 mt-1">{ago(g[0].t)}</span>
                            </span>
                            <span className={`shrink-0 self-center text-neutral-500 transition-transform ${groupOpen ? 'rotate-90' : ''}`}>›</span>
                          </button>
                          {deleteBtn(g)}
                          </div>
                          {groupOpen &&
                            g.map((n) => (
                              <div key={n.id} className="group/not relative">
                                <button
                                  onClick={() => openItem(n)}
                                  className="w-full flex items-start gap-3 text-left pl-[3.75rem] pr-10 py-2 hover:bg-neutral-800/60 transition"
                                >
                                  <span className="flex-1 min-w-0">
                                    <span className="block text-sm text-neutral-200 truncate">{n.title}</span>
                                    <span className="block text-xs text-neutral-500 leading-snug">{n.text}</span>
                                  </span>
                                </button>
                                {deleteBtn([n])}
                              </div>
                            ))}
                        </div>
                      )
                    }
                    const n = entry.item
                    const look = TYPE_ICON[n.type] ?? { icon: 'sparkle' as IconName, cls: 'bg-neutral-800 text-neutral-300' }
                    return (
                      <div key={n.id} className="group/not relative">
                      <button
                        onClick={() => openItem(n)}
                        className={`w-full flex items-start gap-3 text-left pl-4 pr-10 py-3 border-b border-neutral-800/60 hover:bg-neutral-800/60 transition ${n.read ? '' : 'bg-[#00c0fa]/[0.04]'}`}
                      >
                        <span className={`${MOBILE ? 'h-10 w-10 text-base' : 'h-8 w-8 text-sm'} shrink-0 rounded-full flex items-center justify-center ${look.cls}`}><Icon name={look.icon} className={MOBILE ? 'h-5 w-5' : 'h-4 w-4'} /></span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2">
                            <span className={`text-sm truncate ${n.read ? 'text-neutral-300' : 'text-neutral-50 font-medium'}`}>{n.title}</span>
                            {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-[#00c0fa] shrink-0" />}
                          </span>
                          <span className="block text-xs text-neutral-400 mt-0.5 leading-snug">{n.text}</span>
                          <span className="block text-[11px] text-neutral-600 mt-1">{ago(n.t)}</span>
                        </span>
                      </button>
                      {deleteBtn([n])}
                      </div>
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
