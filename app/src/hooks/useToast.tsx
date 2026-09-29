import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'

// Uygulama içi bildirim sistemi — tarayıcının `alert`/`confirm` pop-up'ları yerine
// sağ altta beliren küçük kartlar. İki kullanımı var:
//   notify('Profil silindi')                       → kendiliğinden kaybolan bilgi mesajı
//   await confirm({ message: 'Emin misin?' })      → "Sil / Vazgeç" butonlu, cevabı beklenen kart
// `confirm` bir Promise<boolean> döner, yani çağıran taraf `if (!(await confirm(...))) return`
// diyerek tam da native `window.confirm` gibi kullanabilir — ama ekranı kilitleyen bir
// pop-up açılmaz, kullanıcı isterse görmezden gelebilir (bir süre sonra kendiliğinden kapanır
// ve "hayır" sayılır).
//
// Not: Bu bir Context — aynı anda birden fazla bileşen bildirim gösterebilsin ve hepsi TEK bir
// listeyi paylaşsın diye (bkz. useProfiles.tsx'teki aynı ders: düz bir custom hook her
// tüketiciye ayrı bir state kopyası verir).

type ToastTone = 'info' | 'success' | 'danger'

type ConfirmOptions = {
  message: string
  /** Onay butonunun yazısı — ör. "Sil". */
  confirmLabel?: string
  cancelLabel?: string
  tone?: ToastTone
  // Cevap verilene kadar ekranda kalsın (süre dolunca "vazgeçildi" sayılmasın) — ör. güncelleme sorusu.
  persist?: boolean
}

type Toast = {
  id: string
  message: string
  tone: ToastTone
  confirmLabel?: string
  cancelLabel?: string
  /** true ise kartta "onayla/vazgeç" butonları var ve bir Promise cevabı bekliyor. */
  asks?: boolean
  /** Doluysa kart köşede değil, bu ekran noktasının (son tıklamanın) yanında açılır. */
  at?: { x: number; y: number }
}

type ToastContextValue = {
  notify: (message: string, tone?: ToastTone) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ToastContext = createContext<ToastContextValue | null>(null)

// Bilgi mesajı kısa, cevap bekleyen onay kartı daha uzun durur (kullanıcının okuyup
// karar vermesi gerekiyor); süre dolarsa onay "vazgeçildi" sayılır.
// Kullanıcı "bildirimlerin süreleri kısa, okumaya yetişemiyorum" dedi: en az 7 sn, uzun mesajda
// okuma süresi kadar (karakter başına ~70 ms, en çok 20 sn). Fare üstündeyken hiç kapanmıyor.
const NOTIFY_MIN_MS = 7000
const NOTIFY_MAX_MS = 20000
const notifyMs = (message: string) => Math.min(NOTIFY_MAX_MS, Math.max(NOTIFY_MIN_MS, message.length * 70))
// Fareyle üstünden çıkınca kalan süre
const RESUME_MS = 3000
const CONFIRM_MS = 12000
// Onay kartı son tıklamanın yanında açılıyor (kullanıcı "silmek istediğine emin misin yazısı taa
// en sağda çıkıyo, silme butonunun orda sorsun" dedi). Tıklama bundan eskiyse (ör. klavyeyle
// tetiklendiyse) o nokta alakasız olabilir — o zaman eskisi gibi köşede.
const POINTER_FRESH_MS = 4000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // Promise'ın `resolve`'u bilerek state'te değil burada: state güncelleyicisinin içinden
  // yan etki çağırmak (StrictMode'da iki kez çalışabilir) doğru değil.
  const resolvers = useRef<Record<string, (ok: boolean) => void>>({})
  const lastPointer = useRef<{ x: number; y: number; t: number } | null>(null)

  // Capture aşamasında dinleniyor — tıklanan menü kendini kapatıp olayı durdursa bile konum alınsın.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      lastPointer.current = { x: e.clientX, y: e.clientY, t: Date.now() }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  const dismiss = useCallback((id: string, answer: boolean) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    const resolve = resolvers.current[id]
    delete resolvers.current[id]
    setToasts((list) => list.filter((x) => x.id !== id))
    resolve?.(answer)
  }, [])

  // Sayfa kapanırken/provider kalkarken bekleyen zamanlayıcılar kalmasın.
  useEffect(() => {
    const running = timers.current
    return () => {
      Object.values(running).forEach(clearTimeout)
    }
  }, [])

  const push = useCallback(
    (toast: Omit<Toast, 'id'>, ms: number) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((list) => [...list, { ...toast, id }])
      // Infinity: süresiz (setTimeout Infinity'yi 0 sayar, o yüzden hiç kurulmuyor)
      if (Number.isFinite(ms)) timers.current[id] = setTimeout(() => dismiss(id, false), ms)
      return id
    },
    [dismiss],
  )

  const notify = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      push({ message, tone }, notifyMs(message))
    },
    [push],
  )

  // Fare kartın üstündeyken süre durur, çıkınca birkaç saniye daha kalır.
  const hold = useCallback(
    (id: string, holding: boolean) => {
      clearTimeout(timers.current[id])
      if (holding) delete timers.current[id]
      else timers.current[id] = setTimeout(() => dismiss(id, false), RESUME_MS)
    },
    [dismiss],
  )

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        const p = lastPointer.current
        // Süresiz sorular (güncelleme gibi) kullanıcının tıklamasıyla açılmıyor — köşede dursun.
        const at = !options.persist && p && Date.now() - p.t < POINTER_FRESH_MS ? { x: p.x, y: p.y } : undefined
        const id = push(
          {
            message: options.message,
            tone: options.tone ?? 'danger',
            confirmLabel: options.confirmLabel ?? 'Evet',
            cancelLabel: options.cancelLabel ?? 'Vazgeç',
            asks: true,
            at,
          },
          options.persist ? Infinity : CONFIRM_MS,
        )
        resolvers.current[id] = resolve
      }),
    [push],
  )

  return (
    <ToastContext.Provider value={{ notify, confirm }}>
      {children}
      <ToastHost toasts={toasts} onAnswer={dismiss} onHold={hold} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast, ToastProvider içinde kullanılmalı')
  return ctx
}

// Bildirimler her şeyin (modal'lar z-50) üstünde dursun diye z-[100]; modal açıkken
// silme onayı sorulduğunda kartın modal'ın arkasında kalmaması için gerekli.
type HoldFn = (id: string, holding: boolean) => void

function ToastHost({ toasts, onAnswer, onHold }: { toasts: Toast[]; onAnswer: (id: string, answer: boolean) => void; onHold: HoldFn }) {
  if (toasts.length === 0) return null
  const anchored = toasts.filter((t) => t.at)
  const stacked = toasts.filter((t) => !t.at)
  return (
    <>
      {stacked.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 w-[min(22rem,calc(100vw-3rem))]">
          {stacked.map((t) => (
            <ToastCard key={t.id} toast={t} onAnswer={onAnswer} onHold={onHold} />
          ))}
        </div>
      )}
      {anchored.map((t) => (
        <AnchoredToast key={t.id} toast={t} onAnswer={onAnswer} onHold={onHold} />
      ))}
    </>
  )
}

// Tıklanan noktanın yanına yerleşen onay kartı. Ekranın alt kısmında tıklandıysa kart
// noktanın ÜSTÜNE açılıyor, sağ kenara yakınsa sola kayıyor — hiçbir zaman ekrandan taşmıyor.
function AnchoredToast({ toast, onAnswer, onHold }: { toast: Toast; onAnswer: (id: string, answer: boolean) => void; onHold: HoldFn }) {
  const { x, y } = toast.at!
  const width = Math.min(352, window.innerWidth - 24)
  const left = Math.min(Math.max(12, x - 24), window.innerWidth - width - 12)
  const openUp = y > window.innerHeight * 0.6
  const style: React.CSSProperties = openUp
    ? { left, width, bottom: Math.max(12, window.innerHeight - y + 10) }
    : { left, width, top: Math.max(12, y + 10) }
  return (
    <div className="fixed z-[100]" style={style}>
      <ToastCard toast={toast} onAnswer={onAnswer} onHold={onHold} />
    </div>
  )
}

function ToastCard({ toast: t, onAnswer, onHold }: { toast: Toast; onAnswer: (id: string, answer: boolean) => void; onHold: HoldFn }) {
  return (
    <div
      // Bilgi mesajı fare üstündeyken kapanmasın (onay kartının kendi süresi var, ona dokunulmuyor).
      onMouseEnter={t.asks ? undefined : () => onHold(t.id, true)}
      onMouseLeave={t.asks ? undefined : () => onHold(t.id, false)}
      style={{ animation: 'argus-toast-in .18s ease-out' }}
      className={`relative rounded-xl border bg-neutral-900/95 backdrop-blur-sm shadow-xl shadow-black/40 px-4 py-3 ${
        t.tone === 'danger' ? 'border-rose-500/40' : t.tone === 'success' ? 'border-emerald-500/40' : 'border-neutral-700'
      }`}
    >
      <p className="text-sm text-neutral-100 pr-5">{t.message}</p>
      {t.asks ? (
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => onAnswer(t.id, true)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              t.tone === 'danger' ? 'bg-rose-600 text-white font-medium transition hover:brightness-110' : PRIMARY_BUTTON
            }`}
            style={t.tone === 'danger' ? undefined : primaryButtonStyle}
          >
            {t.confirmLabel}
          </button>
          <button
            onClick={() => onAnswer(t.id, false)}
            className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-50 transition"
          >
            {t.cancelLabel}
          </button>
        </div>
      ) : (
        <button
          onClick={() => onAnswer(t.id, false)}
          className="absolute top-2 right-3 text-neutral-600 hover:text-neutral-300 text-lg leading-none"
          aria-label="Kapat"
        >
          ×
        </button>
      )}
    </div>
  )
}
