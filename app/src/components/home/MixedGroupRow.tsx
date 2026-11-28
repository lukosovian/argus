import { useMemo, useState } from 'react'
import type { Board, Row } from '../../types'
import { titleText } from '../../types'
import { resolveRole } from '../../lib/roles'
import { tt } from '../../lib/i18n'

// "Dünyanın dört bir yanından" (öneri A1): rastgele doldurulan satırlardan 3'ten az yapımı olanlar (Hollanda,
// Kenya, Pembe Dizi…) tek tek ekranı boş bırakmasın diye aynı sütundakiler tek bir satırda toplanır. Her kartın
// köşesinde değerin adı (ülkeyse gerçek bayrağıyla — flag-icons; bulunamazsa bayraksız), altta değerlere göre süzen haplar.

export interface MixedGroup {
  optionId: string
  label: string
  // flag-icons kodu ("tr", "nl"…); yoksa bayrak gösterilmez
  flag: string | null
  rows: Row[]
}

function Flag({ code }: { code: string }) {
  return <span className={`fi fi-${code} shrink-0 rounded-[2px]`} style={{ width: 18, height: 13, backgroundSize: 'cover' }} />
}

export default function MixedGroupRow({
  board,
  title,
  subtitle,
  groups,
  onOpenDetail,
  titleClass,
}: {
  board: Board
  title: string
  subtitle: string
  groups: MixedGroup[]
  onOpenDetail: (row: Row) => void
  titleClass: string
}) {
  const [active, setActive] = useState<string | null>(null)
  const coverProp = board.properties.find((p) => p.id === board.coverPropertyId && p.type === 'image')
  const bannerProp = resolveRole(board, 'banner')
  const posterProp = resolveRole(board, 'poster')
  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  const logoProp = board.properties.find((p) => p.id === board.titleImagePropertyId && p.type === 'image')

  // Her kayıt bir kez (çoklu seçimde iki değere birden düşebilir) — kartın etiketi ilk düştüğü değer
  const cards = useMemo(() => {
    const seen = new Set<string>()
    const out: { row: Row; group: MixedGroup }[] = []
    for (const g of groups)
      for (const r of g.rows) {
        if (active ? g.optionId !== active : seen.has(r.id)) continue
        seen.add(r.id)
        out.push({ row: r, group: g })
      }
    return out
  }, [groups, active])

  if (groups.length === 0) return null
  const str = (r: Row, id?: string) => (id && typeof r.values[id] === 'string' ? (r.values[id] as string) : '')

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <h2 className={titleClass}>{title}</h2>
        <span className="text-xs text-neutral-500">{subtitle}</span>
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto -mx-4 px-4 pt-1 pb-1">
        {cards.map(({ row, group }) => {
          const name = titleProp ? titleText(titleProp, row.values[titleProp.id]) : ''
          const image = str(row, coverProp?.id) || str(row, bannerProp?.id) || str(row, posterProp?.id)
          const logo = str(row, logoProp?.id)
          return (
            <button
              key={row.id}
              onClick={() => onOpenDetail(row)}
              title={name}
              className="group relative w-[256px] shrink-0 aspect-video overflow-hidden rounded-[10px] bg-neutral-800 text-left shadow-lg shadow-black/30 transition duration-300 hover:-translate-y-1"
            >
              {image && <img src={image} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
              <span className="absolute left-2 top-2 z-[2] inline-flex max-w-[80%] items-center gap-1.5 rounded-full border border-white/15 bg-black/60 py-[3px] pl-1 pr-2 text-[11px] font-bold text-white backdrop-blur-md">
                {group.flag ? <Flag code={group.flag} /> : <span className="w-0.5" />}
                <span className="truncate">{group.label}</span>
              </span>
              {logo ? (
                <img
                  src={logo}
                  alt={name}
                  loading="lazy"
                  decoding="async"
                  className="absolute left-2.5 bottom-2 z-[2] max-h-[34px] max-w-[62%] object-contain object-left-bottom"
                  style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.8))' }}
                />
              ) : (
                <span className="absolute left-2.5 right-2.5 bottom-2 z-[2] truncate text-sm font-semibold text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>
                  {name}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {groups.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setActive(null)}
            className={`rounded-full border px-3 py-1 text-xs transition ${active === null ? 'border-transparent bg-neutral-50 text-neutral-950' : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-100'}`}
          >
            {tt('Hepsi')}
          </button>
          {groups.map((g) => (
            <button
              key={g.optionId}
              onClick={() => setActive((a) => (a === g.optionId ? null : g.optionId))}
              className={`inline-flex items-center gap-1.5 rounded-full border py-1 pr-2.5 text-xs transition ${g.flag ? 'pl-1.5' : 'pl-2.5'} ${
                active === g.optionId ? 'border-transparent bg-neutral-50 text-neutral-950' : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-100'
              }`}
            >
              {g.flag && <Flag code={g.flag} />}
              {g.label}
              <span className="opacity-60">{g.rows.length}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
