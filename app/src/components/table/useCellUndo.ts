import { useEffect, useRef } from 'react'
import type { PropertyValue } from '../../types'
import { MOBILE } from '../../lib/mobile/ui'
import { isModalOpen, isTypingTarget } from './keys'

// Tabloda Ctrl+Z / Ctrl+Y (v1.26, G5): son hücre değişikliklerini geri al / yeniden yap. Aynı anda yapılan değişiklikler
// (seçili kayıtların hepsine uygulanan bir hücre, yapıştırma, "İzledim…", panoda sürükleme) tek adım sayılır. Bir yazı
// kutusunun içindeyken tarayıcının kendi geri alması çalışır (bu kısayol susar).
export interface CellChange {
  rowId: string
  propertyId: string
  before: PropertyValue | undefined
  after: PropertyValue
}
export interface UndoStep {
  changes: CellChange[]
  // Bildirimde görünen kısa açıklama (yoksa ilk değişiklikten üretilir)
  label?: string
}

const LIMIT = 60

export function useCellUndo({
  resetKey,
  apply,
  onDone,
}: {
  // Değişince (başka arşiv) geçmiş sıfırlanır
  resetKey: string | undefined
  // Değerleri yazar (geri alma / yeniden yapma) — kaç tanesinin yazılamadığını döner
  apply: (items: { rowId: string; propertyId: string; value: PropertyValue | null }[]) => Promise<number>
  onDone: (step: UndoStep, kind: 'undo' | 'redo', failed: number) => void
}) {
  const undoStack = useRef<UndoStep[]>([])
  const redoStack = useRef<UndoStep[]>([])
  // Aynı anda (aynı olay içinde) gelen kayıtlar tek adımda birleşsin
  const open = useRef<UndoStep | null>(null)
  const busy = useRef(false)
  // Kendi yazdığımız geri alma değerleri yeni adım olarak kaydedilmesin
  const replaying = useRef(false)
  const applyRef = useRef(apply)
  const doneRef = useRef(onDone)
  applyRef.current = apply
  doneRef.current = onDone

  useEffect(() => {
    undoStack.current = []
    redoStack.current = []
    open.current = null
  }, [resetKey])

  function record(changes: CellChange[], label?: string) {
    if (replaying.current) return
    const real = changes.filter((c) => JSON.stringify(c.before ?? null) !== JSON.stringify(c.after ?? null))
    if (real.length === 0) return
    redoStack.current = []
    if (open.current) {
      // Aynı hücre bu adımda ikinci kez değişirse ilk "önceki" değer kalır
      for (const c of real) {
        const same = open.current.changes.find((x) => x.rowId === c.rowId && x.propertyId === c.propertyId)
        if (same) same.after = c.after
        else open.current.changes.push(c)
      }
      if (label && !open.current.label) open.current.label = label
      return
    }
    const step: UndoStep = { changes: [...real], label }
    open.current = step
    undoStack.current.push(step)
    if (undoStack.current.length > LIMIT) undoStack.current.shift()
    setTimeout(() => {
      if (open.current === step) open.current = null
    }, 0)
  }

  async function run(kind: 'undo' | 'redo') {
    if (busy.current) return
    const from = kind === 'undo' ? undoStack.current : redoStack.current
    const to = kind === 'undo' ? redoStack.current : undoStack.current
    const step = from.pop()
    if (!step) return
    open.current = null
    busy.current = true
    replaying.current = true
    try {
      const failed = await applyRef.current(
        step.changes.map((c) => ({ rowId: c.rowId, propertyId: c.propertyId, value: ((kind === 'undo' ? c.before : c.after) ?? null) as PropertyValue | null })),
      )
      to.push(step)
      doneRef.current(step, kind, failed)
    } finally {
      replaying.current = false
      busy.current = false
    }
  }

  useEffect(() => {
    if (MOBILE) return
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const k = e.key.toLowerCase()
      const isUndo = k === 'z' && !e.shiftKey
      const isRedo = k === 'y' || (k === 'z' && e.shiftKey)
      if (!isUndo && !isRedo) return
      // Yazı kutusundayken tarayıcının kendi geri alması
      if (e.defaultPrevented || isTypingTarget(e.target) || isModalOpen()) return
      const stack = isUndo ? undoStack.current : redoStack.current
      if (stack.length === 0) return
      e.preventDefault()
      void run(isUndo ? 'undo' : 'redo')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { record, undo: () => run('undo'), redo: () => run('redo') }
}
