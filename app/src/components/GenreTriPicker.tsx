import { tt } from '../lib/i18n'
// TMDB tür seçimi (Keşfet, Ne İzlesem'in TMDB modu): bir tık ✓ gelsin, ikinci tık ✕ gelmesin,
// üçüncü tık seçimi kaldırır — arşivdeki filtrelerle (MultiFilterEditor) aynı mantık.
export default function GenreTriPicker({
  genres,
  include,
  exclude,
  onChange,
}: {
  genres: { id: number; name: string }[]
  include: number[]
  exclude: number[]
  onChange: (include: number[], exclude: number[]) => void
}) {
  function cycle(id: number) {
    if (include.includes(id)) onChange(include.filter((g) => g !== id), [...exclude, id])
    else if (exclude.includes(id)) onChange(include, exclude.filter((g) => g !== id))
    else onChange([...include, id], exclude)
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {genres.map((g) => {
        const state = include.includes(g.id) ? 'in' : exclude.includes(g.id) ? 'out' : 'none'
        return (
          <button
            key={g.id}
            onClick={() => cycle(g.id)}
            title={state === 'in' ? tt('Gelsin — tekrar tıkla: gelmesin') : state === 'out' ? tt('Gelmesin — tekrar tıkla: seçimi kaldır') : tt('Tıkla: gelsin')}
            className={`text-xs rounded-full px-2.5 py-1 border transition ${
              state === 'in'
                ? 'border-emerald-400 text-emerald-300 bg-emerald-500/10'
                : state === 'out'
                  ? 'border-red-500/70 text-red-300 bg-red-500/10 line-through decoration-red-400/70'
                  : 'border-neutral-700 text-neutral-400 hover:text-neutral-50 hover:border-neutral-500'
            }`}
          >
            {state === 'in' ? '✓ ' : state === 'out' ? '✕ ' : ''}
            {g.name}
          </button>
        )
      })}
    </div>
  )
}
