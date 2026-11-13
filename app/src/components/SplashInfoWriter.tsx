import { useEffect } from 'react'
import { api } from '../lib/api'
import { resolveRole } from '../lib/roles'
import { deviceOn } from '../lib/extras'
import { useHomeSettings } from '../hooks/useHomeSettings'

// Ayarlar › Açılış › Açılış penceresinde afiş duvarı: ARGUS.exe'nin açılış penceresi bir sonraki açılışta arkada
// akıtacağı afişleri data/splash-info.txt'den okur (bkz. launcher/ARGUS.cs). Bu bileşen, açık profilin son
// eklediklerinden o dosyayı oturum başına bir kez yazar. Ayar kapalıysa hiçbir şey yapmaz.
export default function SplashInfoWriter() {
  const { settings } = useHomeSettings()
  useEffect(() => {
    const boardId = settings.boardId
    if (!boardId || !deviceOn('argus_splash_ciz')) return
    try {
      if (sessionStorage.getItem('argus_splash_yazildi')) return
      sessionStorage.setItem('argus_splash_yazildi', '1')
    } catch {
      /* önemsiz */
    }
    const t = setTimeout(async () => {
      try {
        const [boards, rows] = await Promise.all([api.getBoards(), api.getRows(boardId)])
        const b = boards.find((x) => x.id === boardId)
        if (!b) return
        const poster = resolveRole(b, 'poster')
        if (!poster) return
        const posters = [...rows]
          .sort((a, c) => (c.updatedAt ?? 0) - (a.updatedAt ?? 0))
          .map((r) => (r.values[poster.id] as string) ?? '')
          .filter((s) => typeof s === 'string' && s.startsWith('/medya/'))
          .slice(0, 24)
        const text = posters.map((p) => `P\t${p}`).join('\n')
        await fetch('/api/splash-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      } catch {
        /* açılış penceresi sade haliyle açılır */
      }
    }, 8000)
    return () => clearTimeout(t)
  }, [settings.boardId])
  return null
}
