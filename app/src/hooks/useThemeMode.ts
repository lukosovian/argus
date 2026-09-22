import { useCallback, useSyncExternalStore } from 'react'

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'argus_theme'

// ÖNEMLİ: bu paylaşılan, modül seviyesinde bir store (videoGuard.ts'teki aynı desen) — önceki
// sürüm her `useThemeMode()` çağıran bileşende KENDİ ayrı `useState`'ini tutuyordu, yani Navbar'da
// tema değiştirilince SADECE Navbar'ın kendi state'i güncelleniyordu; aynı anda mount olmuş başka
// bir bileşendeki (ör. MoodRow.tsx) ayrı `useThemeMode()` çağrısı bundan hiç haberdar olmuyordu —
// hep sayfa ilk açıldığındaki (genelde koyu) değerde donuk kalıyordu. Bu yüzden "açık temada mod
// görselleri siyaha dönmüyor" gibi şikayetler ısrarla devam ediyordu: MoodRow'un GÖRDÜĞÜ tema
// değeri gerçek temadan bağımsızdı. `useSyncExternalStore` ile TEK bir gerçek durum kaynağı var,
// her bileşen ona abone oluyor.
let theme: ThemeMode = readInitialTheme()
const listeners = new Set<() => void>()

function readInitialTheme(): ThemeMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(next: ThemeMode) {
  if (next === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

function setThemeInternal(next: ThemeMode) {
  theme = next
  applyTheme(next)
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // localStorage kapalı olabilir (gizli sekme vb.), sorun değil — tema sadece bu oturumda uygulanır.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): ThemeMode {
  return theme
}

export function useThemeMode() {
  const current = useSyncExternalStore(subscribe, getSnapshot)

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeInternal(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeInternal(theme === 'light' ? 'dark' : 'light')
  }, [])

  return { theme: current, setTheme, toggleTheme }
}
