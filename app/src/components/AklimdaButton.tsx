import { useState, type ReactNode } from 'react'
import type { AklimdaTmdb } from '../lib/api'
import { useAklimda } from '../hooks/useAklimda'
import { useToast } from '../hooks/useToast'
import { tt } from '../lib/i18n'
import Icon from './Icon'

// Detay penceresinde ve TMDB önizlemesinde "Aklımda" düğmesi: tek tıkla eklenir/çıkarılır.
export type AklimdaTarget = { kind: 'row'; boardId: string; rowId: string } | { kind: 'tmdb'; tmdb: AklimdaTmdb }

// children: yanına dizilecek başka düğmeler (ör. detay penceresindeki "Paylaş")
export default function AklimdaButton({ target, title, children }: { target: AklimdaTarget; title: string; children?: ReactNode }) {
  const akl = useAklimda()
  const { notify } = useToast()
  const key = target.kind === 'row' ? (akl.items[target.rowId] ? target.rowId : null) : akl.keyForTmdb(target.tmdb.mediaType, target.tmdb.id)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    try {
      if (key) {
        await akl.remove(key)
        notify(tt('"{0}" aklından çıkarıldı.', title))
      } else {
        if (target.kind === 'row') await akl.addRow(target.boardId, target.rowId)
        else await akl.addTmdb(target.tmdb)
        notify(tt('"{0}" aklına not edildi.', title), 'success')
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : tt('Kaydedilemedi.'), 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={toggle}
        disabled={busy}
        title={key ? tt('Aklımdan çıkar') : tt('Bir ara bakmak için not et — Aklımda sayfasında ve ana sayfada görünür')}
        className={`inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 border transition disabled:opacity-60 ${
          key ? 'border-violet-400/70 text-violet-200 bg-violet-500/20 hover:bg-violet-500/30' : 'border-neutral-600 text-neutral-300 bg-black/20 hover:border-violet-400/70 hover:text-violet-200'
        }`}
      >
        <Icon name="bookmark" className={`h-[1em] w-[1em] ${key ? 'text-violet-300' : ''}`} />
        {key ? tt('Aklımda') : tt('Aklımda tut')}
      </button>
      {children}
    </div>
  )
}
