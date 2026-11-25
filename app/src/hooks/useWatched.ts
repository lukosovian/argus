import { useCallback, useEffect, useRef, useState } from 'react'
import type { WatchedMap } from '../types'
import { api } from '../lib/api'
import { useProfiles } from './useProfiles'
import { useToast } from './useToast'
import { notifyDataChanged } from '../lib/dataEvents'
import { tt } from '../lib/i18n'

// episodes.json (TMDB, salt-okunur) ile aynı `{ [rowId]: ... }` şeklinde ama YAZILABİLİR —
// RowDetailModal'daki bölüm tikleri/tekrar izleme tarihleri buradan kaydedilir.
export function useWatched() {
  const { activeProfileId } = useProfiles()
  const { notify } = useToast()
  const [watched, setWatched] = useState<WatchedMap>({})

  const reload = useCallback(() => {
    if (!activeProfileId) return Promise.resolve()
    return api.getWatched().then(setWatched)
  }, [activeProfileId])

  useEffect(() => {
    reload()
  }, [reload])

  // Önce ekrana (iyimser) yazılır, sonra sunucuya gönderilir — kullanıcı "eskiye dönük tarih
  // giremiyorum, girdiğim tarihi güncelleyemiyorum" dedi; eski hâlde kayıt sunucudan dönene
  // kadar ekrana hiç yansımıyordu, ki gerçek bir hata (ör. ağ kopukluğu) hiçbir uyarı vermeden
  // sessizce yutuluyordu — kullanıcıya "hiçbir şey olmadı" gibi görünürdü. Artık başarısız
  // olursa geri alınır ve uygulama içi bir hata bildirimi gösterilir.
  // H9: hızlıca iki bölüm tiklenip ilki kaydedilemezse eskiden ekran İLK tikten önceki hale dönüyor, araya giren
  // ikinci tik de görünmez oluyordu. Artık aynı kaydın kayıtları sırayla gider (her biri o anki en güncel hali
  // gönderir) ve hata olursa sadece O değişiklik (eklenen/silinen tarihler) geri alınır.
  const current = useRef<WatchedMap>({})
  current.current = watched
  const queues = useRef(new Map<string, Promise<void>>())

  function saveRowWatched(rowId: string, map: Record<string, string[]>) {
    const before = current.current[rowId] ?? {}
    const diff = diffMaps(before, map)
    current.current = { ...current.current, [rowId]: map }
    setWatched((prev) => ({ ...prev, [rowId]: map }))
    const run = async () => {
      try {
        await api.saveRowWatched(rowId, current.current[rowId] ?? {})
        // Ana sayfadaki "Yeni Bölümler" satırı izlenen bölümü düşürsün diye. 'watched': sadece izleme tarihleri
        // değişti — açık arşiv tablosu bütün kayıtları baştan çekmesin.
        notifyDataChanged(undefined, 'watched')
      } catch (e) {
        const reverted = applyDiff(current.current[rowId] ?? {}, diff, true)
        current.current = { ...current.current, [rowId]: reverted }
        setWatched((prev) => ({ ...prev, [rowId]: reverted }))
        notify(e instanceof Error ? e.message : tt('İzleme tarihi kaydedilemedi.'), 'danger')
      }
    }
    const p = (queues.current.get(rowId) ?? Promise.resolve()).then(run)
    queues.current.set(rowId, p)
    return p
  }

  return { watched, saveRowWatched, reload }
}

// Bir bölüm haritasındaki değişiklik: bölüm anahtarı → eklenen / silinen tarihler (aynı tarih iki kez olabilir)
type Diff = Record<string, { add: string[]; remove: string[] }>
function minus(a: string[], b: string[]): string[] {
  const left = [...b]
  const out: string[] = []
  for (const x of a) {
    const i = left.indexOf(x)
    if (i >= 0) left.splice(i, 1)
    else out.push(x)
  }
  return out
}
function diffMaps(before: Record<string, string[]>, after: Record<string, string[]>): Diff {
  const out: Diff = {}
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[k] ?? []
    const b = after[k] ?? []
    const add = minus(b, a)
    const remove = minus(a, b)
    if (add.length || remove.length) out[k] = { add, remove }
  }
  return out
}
function applyDiff(map: Record<string, string[]>, diff: Diff, reverse: boolean): Record<string, string[]> {
  const next: Record<string, string[]> = { ...map }
  for (const [k, d] of Object.entries(diff)) {
    const add = reverse ? d.remove : d.add
    const remove = reverse ? d.add : d.remove
    const list = [...minus(next[k] ?? [], remove), ...add].sort()
    if (list.length) next[k] = list
    else delete next[k]
  }
  return next
}
