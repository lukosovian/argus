import { useEffect } from 'react'
import type { Row } from '../types'
import { titleText, todayIso } from '../types'
import { api } from '../lib/api'
import { resolveRole, resolveStatusOption } from '../lib/roles'
import { deviceOn } from '../lib/extras'
import { entryEnd, toEntries } from '../lib/dateRange'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { tt } from '../lib/i18n'

// Ekstralar › Açılış penceresi (v1.23.4): ARGUS.exe'nin açılış penceresi bir sonraki açılışta göstereceği afişleri ve
// "bugünün haberi" satırlarını data/splash-info.txt'den okur (bkz. launcher/ARGUS.cs). Bu bileşen, açık profilin
// verisinden o dosyayı oturum başına bir kez yazar. İki açılış ayarı da kapalıysa hiçbir şey yapmaz.
export default function SplashInfoWriter() {
  const { settings } = useHomeSettings()
  useEffect(() => {
    const boardId = settings.boardId
    if (!boardId || !(deviceOn('argus_splash_ciz') || deviceOn('argus_splash_bilgi'))) return
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
        const tp = b.properties.find((p) => p.id === b.titlePropertyId)
        const poster = resolveRole(b, 'poster')
        const dateProp = resolveRole(b, 'izlemeTarihi')
        const vizyon = resolveRole(b, 'vizyon')
        const durum = resolveRole(b, 'durum')
        const later = resolveStatusOption(b, 'izlenecek')
        const title = (r: Row) => (tp ? titleText(tp, r.values[tp.id]) : '')
        const img = (r: Row) => (poster ? ((r.values[poster.id] as string) ?? '') : '')
        const lines: [string, string, string][] = []
        // 1) yeni bölümler
        try {
          const ne = await api.getNewEpisodes(boardId)
          for (const it of ne.items.filter((i) => i.latestIsNew).slice(0, 2)) {
            const r = rows.find((x) => x.id === it.rowId)
            if (r) lines.push([tt('Yeni bölüm'), `${title(r)} · S${it.latest.season}B${it.latest.episode}`, img(r)])
          }
        } catch {
          /* yoksa geç */
        }
        // 2) geçmiş yıllarda bugün
        const md = todayIso().slice(5)
        const past = rows.filter((r) => dateProp && toEntries(r.values[dateProp.id]).map(entryEnd).some((d) => d.slice(5) === md && d.slice(0, 4) !== todayIso().slice(0, 4)))
        for (const r of past.slice(0, 2)) {
          const d = toEntries(r.values[dateProp!.id]).map(entryEnd).find((x) => x.slice(5) === md)!
          lines.push([tt('{0} yılında bugün', d.slice(0, 4)), tt('{0} izlemiştin', title(r)), img(r)])
        }
        // 3) evren turunda sıradaki
        try {
          const ev = await api.getEvrenler(boardId)
          for (const u of ev.universes) {
            const p = ev.prefs[u.id]
            if (!p?.maraton) continue
            const skip = new Set(p.atla ?? [])
            const next = [...u.items].filter((i) => (p.ek || !i.extra) && i.released && !i.tour?.done && !skip.has(i.key)).sort((a, c) => (a.date || '').localeCompare(c.date || ''))[0]
            if (next) lines.push([tt('{0} turunda sıradaki', u.short || u.name), next.archiveTitle || next.title, next.poster ?? ''])
          }
        } catch {
          /* yoksa geç */
        }
        // 4) bu hafta vizyona girecek izlenecekler
        const week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
        for (const r of rows.filter((r) => vizyon && durum && r.values[durum.id] === later && String(r.values[vizyon.id] ?? '') > todayIso() && String(r.values[vizyon.id] ?? '') <= week).slice(0, 2))
          lines.push([tt('Bu hafta vizyonda'), title(r), img(r)])
        const posters = [...rows]
          .sort((a, c) => (c.updatedAt ?? 0) - (a.updatedAt ?? 0))
          .map(img)
          .filter((s) => s.startsWith('/medya/'))
          .slice(0, 24)
        const clean = (s: string) => s.replace(/[\t\r\n]/g, ' ')
        const text = [...posters.map((p) => `P\t${p}`), ...lines.map(([a, c, p]) => `L\t${clean(a)}\t${clean(c)}\t${p.startsWith('/medya/') ? p : ''}`)].join('\n')
        await fetch('/api/splash-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      } catch {
        /* açılış penceresi sade haliyle açılır */
      }
    }, 8000)
    return () => clearTimeout(t)
  }, [settings.boardId])
  return null
}
