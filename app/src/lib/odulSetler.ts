import { useEffect, useMemo, useRef } from 'react'
import type { KoleksiyonInfo, OdulData } from './api'
import { buildKoleksiyonItems, buildShelves, shelfSetMembers, type KoleksiyonShelf } from './koleksiyonRaflar'
import { SET_STORE, setTierFor, type OdulSetStore } from './oduller'
import { useStore } from './useProfileStore'
import { useToast } from '../hooks/useToast'
import { tt } from './i18n'
import type { Board, Row } from '../types'

// Seri seti bonusu (Y14): bir raftaki bütün film kartlarını toplayınca bir kerelik gümüş (≤3 film) ya da altın
// paket. Tamamlanan set 'odul-setler' kaydına yazılır; computeEarned oradan sayar, aynı set ikinci kez sayılmaz.
// Hem Raflar (rozet) hem Ödüller (yeni kart açılınca) bunu çağırır.
export function useSetBonuses(shelves: KoleksiyonShelf[] | null, odul: OdulData | null, enabled: boolean) {
  const { data: store, update } = useStore<OdulSetStore>(SET_STORE, enabled)
  const { notify } = useToast()
  const busy = useRef(false)
  const newly = useMemo(() => {
    if (!enabled || !shelves || !odul?.startedAt || !store) return []
    const done = store.sets ?? {}
    // Aynı film kümesi başka bir raf anahtarıyla (raf adı değişti vs.) ikinci kez sayılmasın
    const doneSigs = new Set(Object.values(done).map((s) => [...(s.rows ?? [])].sort().join(',')))
    const out: { key: string; name: string; rows: string[] }[] = []
    for (const sh of shelves) {
      if (done[sh.key]) continue
      const rows = shelfSetMembers(sh)
      if (!rows.length || !rows.every((id) => odul.cards[id])) continue
      if (doneSigs.has([...rows].sort().join(','))) continue
      out.push({ key: sh.key, name: sh.name, rows })
    }
    return out
  }, [enabled, shelves, odul, store])
  useEffect(() => {
    if (!newly.length || busy.current) return
    busy.current = true
    update((cur) => {
      const sets = { ...(cur.sets ?? {}) }
      for (const n of newly) if (!sets[n.key]) sets[n.key] = { at: Date.now(), tier: setTierFor(n.rows.length), name: n.name.slice(0, 120), rows: n.rows }
      return { ...cur, sets }
    })
      .then(() => {
        for (const n of newly)
          notify(tt('Set tamam: {0}! Bütün kartlarını topladın, {1} kazandın.', n.name, setTierFor(n.rows.length) === 'altin' ? tt('Altın paket') : tt('Gümüş paket')), 'success')
        // Ödüller'in sayıları yenilensin
        window.dispatchEvent(new Event('argus-oduller-degisti'))
      })
      .catch(() => {})
      .finally(() => {
        busy.current = false
      })
  }, [newly, update, notify])
  return useMemo(() => new Set(Object.keys(store?.sets ?? {})), [store])
}

// Ödüller sayfası rafları kendisi bilmiyor: koleksiyon bilgisinden aynı rafları çıkarır
export function shelvesFrom(board: Board | null | undefined, rows: Row[], info: KoleksiyonInfo | null) {
  if (!board || !info) return null
  return buildShelves(buildKoleksiyonItems(board, rows, info), info).shelves
}
