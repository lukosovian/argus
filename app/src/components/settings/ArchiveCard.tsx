import { Link } from 'react-router-dom'
import type { Board } from '../../types'
import { useRows } from '../../hooks/useRows'
import { resolveRole } from '../../lib/roles'
import { STATUS_STYLE, statusKeyOf } from '../../lib/statusTone'
import { tt, ttx } from '../../lib/i18n'

// Ayarlar › Arşivler'deki arşiv kartı (v1.23.3, öneri Y1): üstte arşive son eklenenlerin görselleri, altında
// kayıt/sütun sayısı ve durumların dağılımı. Kayıtlar gelmeden de (ya da arşiv boşken) sade hâli görünür.
export default function ArchiveCard({ board, onHome, onDelete }: { board: Board; onHome: boolean; onDelete: (e: React.MouseEvent) => void }) {
  const { rows } = useRows(board.id)
  const banner = resolveRole(board, 'banner')
  const poster = resolveRole(board, 'poster')
  const cover = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
  const durum = resolveRole(board, 'durum')
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)

  const recent = [...rows].sort((a, b) => b.createdAt - a.createdAt)
  const images = recent
    .map((r) => [cover, banner, poster].map((p) => (p ? (r.values[p.id] as string) : '')).find(Boolean) ?? '')
    .filter(Boolean)
    .slice(0, 8)

  const parts: { label: string; count: number; color: string }[] = []
  if (durum) {
    for (const o of durum.options ?? []) {
      const n = rows.filter((r) => r.values[durum.id] === o.id).length
      if (!n) continue
      const k = statusKeyOf(o.label)
      parts.push({ label: o.label, count: n, color: k ? STATUS_STYLE[k].hex : '#737373' })
    }
  }
  const total = parts.reduce((s, p) => s + p.count, 0)
  const last = recent[0] && titleProp ? String(recent[0].values[titleProp.id] ?? '') : ''

  return (
    <Link
      to={`/board/${board.id}`}
      className="group block overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/70 hover:border-[#00c0fa]/40 transition"
    >
      {images.length > 0 && (
        <span className="relative grid h-24 grid-cols-8 overflow-hidden">
          {images.map((src, i) => (
            <img key={i} src={src} alt="" loading="lazy" className="h-24 w-full object-cover transition duration-500 group-hover:scale-105" />
          ))}
          <span className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/40 to-transparent" />
        </span>
      )}
      <span className={`relative block px-4 pb-4 ${images.length ? '-mt-7' : 'pt-4'}`}>
        <span className="flex items-center gap-2">
          <span className="text-lg font-bold text-neutral-50 truncate">{board.name}</span>
          {onHome && (
            <span className="shrink-0 text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/25 rounded-full px-2 py-0.5">
              {tt('Ana sayfada')}
            </span>
          )}
          <button
            onClick={onDelete}
            className="ml-auto text-neutral-600 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100 transition shrink-0"
          >
            {tt('Sil')}
          </button>
          <span className="text-neutral-600 group-hover:text-[#00c0fa] transition shrink-0">→</span>
        </span>
        <span className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-neutral-400">
          {rows.length > 0 && <span className="rounded-full border border-neutral-800 px-2 py-0.5">{ttx('{0} kayıt', rows.length)}</span>}
          <span className="rounded-full border border-neutral-800 px-2 py-0.5">{ttx('{0} sütun', board.properties.length)}</span>
        </span>
        {total > 0 && (
          <span className="mt-3 flex h-1.5 gap-[2px] overflow-hidden rounded-full" title={parts.map((p) => `${p.label}: ${p.count}`).join(' · ')}>
            {parts.map((p) => (
              <span key={p.label} style={{ width: `${(p.count / total) * 100}%`, background: p.color }} />
            ))}
          </span>
        )}
        {last && <span className="mt-2 block truncate text-[11px] text-neutral-500">{tt('Son eklenen: {0}', last)}</span>}
      </span>
    </Link>
  )
}
