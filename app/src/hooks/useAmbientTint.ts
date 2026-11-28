import { useEffect, useState } from 'react'
import { averageColor, darkTone } from '../lib/imageColor'
import { useThemeMode } from './useThemeMode'

// Görselin baskın renginden koyu bir ton — detay penceresindeki "her yapım kendi renginde" arka planın aynısı
// (bkz. RowDetailModal). Açık temada varsayılan olarak null: oradaki yazılar koyu, koyu bir zemin okunmaz olur.
// Görselin ÜSTÜNE binen (yazısı hep beyaz) yerlerde inLight=true ile açık temada da renk verilir.
export function useAmbientTint(src: string | undefined, opts?: { lightness?: number; maxSat?: number; inLight?: boolean }): string | null {
  const { theme } = useThemeMode()
  const [tint, setTint] = useState<string | null>(null)
  const lightness = opts?.lightness ?? 0.13
  const maxSat = opts?.maxSat ?? 0.55
  const off = !src || (theme === 'light' && !opts?.inLight)
  useEffect(() => {
    if (off || !src) {
      setTint(null)
      return
    }
    let alive = true
    averageColor(src).then((c) => alive && setTint(c ? darkTone(c, lightness, maxSat) : null))
    return () => {
      alive = false
    }
  }, [src, off, lightness, maxSat])
  return tint
}
