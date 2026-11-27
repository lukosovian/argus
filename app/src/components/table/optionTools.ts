import type { MutableRefObject } from 'react'
import type { Board, PropertyDef, PropertyValue, Row, SelectOption } from '../../types'
import { tt } from '../../lib/i18n'

// A6 (v1.27): sütun menüsündeki seçenek araçları — sürükleyerek sıralama ve bir seçeneği başka bir
// seçenekle birleştirme. BoardView'ı şişirmemek için burada; kayıt yazma işi BoardView'ın putValues'u
// (sadece o sütunu yazan kısmi PUT, ilerleme çubuğu, sonunda kayıtları yeniden okur) ile yapılıyor.
type Deps = {
  boardRef: MutableRefObject<Board | null | undefined>
  rowsRef: MutableRefObject<Row[]>
  saveBoard: (patch: Partial<Board>) => Promise<unknown>
  putValues: (boardId: string, items: { row: Row; value: PropertyValue }[], propertyId: string, label: string) => Promise<number>
  notify: (message: string, tone?: 'success' | 'danger' | 'info', options?: { action?: { label: string; onClick: () => void } }) => void
}

function withOptions(b: Board, propertyId: string, fn: (opts: SelectOption[]) => SelectOption[]): PropertyDef[] {
  return b.properties.map((p) => (p.id !== propertyId ? p : { ...p, options: fn(p.options ?? []) }))
}

export function makeOptionTools({ boardRef, rowsRef, saveBoard, putValues, notify }: Deps) {
  // Seçeneklerin sırası property.options dizisinin sırası (Pano sütunları, gruplama, istatistikler bunu kullanıyor)
  function reorderOptions(propertyId: string, orderedIds: string[]) {
    const b = boardRef.current
    if (!b) return
    void saveBoard({
      properties: withOptions(b, propertyId, (opts) => {
        const byId = new Map(opts.map((o) => [o.id, o]))
        const listed = new Set(orderedIds)
        const next = orderedIds.map((id) => byId.get(id)).filter((o): o is SelectOption => Boolean(o))
        // Listede olmayan (bu arada eklenmiş) seçenekler kaybolmasın, sona
        for (const o of opts) if (!listed.has(o.id)) next.push(o)
        return next
      }),
    }).catch(() => notify(tt('Sıralama kaydedilemedi — ARGUS sunucusu açık mı?'), 'danger'))
  }

  // `fromId` taşıyan bütün kayıtlar `toId`'ye geçer (çoklu seçimde tekrar olmaz), sonra `fromId` silinir.
  // Geri alınabilir: seçenek eski yerine döner, kayıtların eski değerleri geri yazılır.
  async function mergeOption(propertyId: string, fromId: string, toId: string) {
    const b = boardRef.current
    const prop = b?.properties.find((p) => p.id === propertyId)
    if (!b || !prop || fromId === toId) return
    const opts = prop.options ?? []
    const fromIdx = opts.findIndex((o) => o.id === fromId)
    const fromOpt = opts[fromIdx]
    const toOpt = opts.find((o) => o.id === toId)
    if (!fromOpt || !toOpt) return
    const isMulti = prop.type === 'multiselect'
    const affected = rowsRef.current.filter((r) => {
      const v = r.values[propertyId]
      return isMulti ? Array.isArray(v) && (v as string[]).includes(fromId) : v === fromId
    })
    const before = affected.map((r) => ({ rowId: r.id, value: r.values[propertyId] }))
    const items = affected.map((row) => {
      const v = row.values[propertyId]
      const value: PropertyValue = isMulti ? Array.from(new Set((v as string[]).map((id) => (id === fromId ? toId : id)))) : toId
      return { row, value }
    })
    const failed = items.length
      ? await putValues(b.id, items, propertyId, tt('"{0}" → "{1}" birleştiriliyor', fromOpt.label, toOpt.label))
      : 0
    if (failed > 0) {
      // Yarım kalan birleştirmede eski seçenek silinmesin — kalan kayıtlarda görünmeye devam etsin
      notify(tt('{0} kayıt güncellenemedi, "{1}" silinmedi. Tekrar dene.', failed, fromOpt.label), 'danger')
      return
    }
    const fresh = boardRef.current ?? b
    try {
      await saveBoard({ properties: withOptions(fresh, propertyId, (o) => o.filter((x) => x.id !== fromId)) })
    } catch {
      notify(tt('Kayıtlar taşındı ama "{0}" silinemedi.', fromOpt.label), 'danger')
      return
    }
    notify(tt('"{0}", "{1}" ile birleşti ({2} kayıt).', fromOpt.label, toOpt.label, items.length), 'success', {
      action: { label: tt('Geri al'), onClick: () => void undoMerge(propertyId, fromOpt, fromIdx, before) },
    })
  }

  async function undoMerge(propertyId: string, fromOpt: SelectOption, fromIdx: number, before: { rowId: string; value: PropertyValue }[]) {
    const b = boardRef.current
    if (!b) return
    try {
      await saveBoard({
        properties: withOptions(b, propertyId, (opts) => {
          if (opts.some((o) => o.id === fromOpt.id)) return opts
          const next = [...opts]
          next.splice(Math.min(fromIdx, next.length), 0, fromOpt)
          return next
        }),
      })
    } catch {
      notify(tt('"{0}" geri getirilemedi.', fromOpt.label), 'danger')
      return
    }
    const byId = new Map(rowsRef.current.map((r) => [r.id, r]))
    const items = before.flatMap(({ rowId, value }) => {
      const row = byId.get(rowId)
      return row ? [{ row, value }] : []
    })
    const failed = items.length ? await putValues(b.id, items, propertyId, tt('"{0}" geri alınıyor', fromOpt.label)) : 0
    notify(
      failed > 0 ? tt('"{0}" geri geldi ama {1} kaydın değeri geri yazılamadı.', fromOpt.label, failed) : tt('Birleştirme geri alındı.'),
      failed > 0 ? 'danger' : 'success',
    )
  }

  return { reorderOptions, mergeOption }
}
