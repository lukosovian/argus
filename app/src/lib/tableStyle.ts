import { useSyncExternalStore } from 'react'

// Arşiv tablosunun isteğe bağlı "Cilalı" görünümü (v1.23.3, öneri R1): türler renkli nokta + tam adla, puan
// kırmızıdan yeşile dönen renkte ve küçük bir çubukla, satırın üstüne gelince sağda hızlı düğmeler. Araç
// çubuğundaki fırça düğmesiyle açılıp kapanır; tercih bu bilgisayarda hatırlanır (localStorage, ui-prefs ile eşlenir).

const KEY = 'argus_tablo_cila'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setPolishedTable(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* kaydedilemese de bu oturumda çalışsın */
  }
  listeners.forEach((l) => l())
}

export function usePolishedTable(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    read,
  )
}

// Seçenek renklerinin (types.ts OPTION_COLORS) dolu nokta karşılıkları — aynı sırayla
export const OPTION_DOTS = ['#a3a3a3', '#d97706', '#fb923c', '#facc15', '#34d399', '#38bdf8', '#a78bfa', '#f472b6', '#fb7185']

// 10 üzerinden puanın rengi: 5 ve altı kırmızı → 9 ve üstü yeşil
export function scoreColor(s: number): string {
  if (s >= 9) return '#22c55e'
  if (s >= 8) return '#84cc16'
  if (s >= 7) return '#eab308'
  if (s >= 6) return '#f97316'
  return '#ef4444'
}
