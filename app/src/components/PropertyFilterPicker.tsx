import type { Board } from '../types'
import OptionBadge from './OptionBadge'
import Select from './Select'

export default function PropertyFilterPicker({
  board,
  propertyId,
  optionIds,
  onChange,
}: {
  board: Board | undefined
  propertyId: string
  optionIds: string[]
  onChange: (propertyId: string, optionIds: string[]) => void
}) {
  const filterProps = board?.properties.filter((p) => p.type === 'select' || p.type === 'multiselect') ?? []
  const activeProp = filterProps.find((p) => p.id === propertyId)

  return (
    <div className="space-y-2">
      <Select
        value={propertyId}
        onChange={(v) => onChange(v, [])}
        options={[{ value: '', label: 'Filtre yok (hepsinden rastgele)' }, ...filterProps.map((p) => ({ value: p.id, label: p.name }))]}
      />

      {activeProp && (
        <div className="flex flex-wrap gap-1.5">
          {(activeProp.options ?? []).map((o) => (
            <OptionBadge
              key={o.id}
              label={o.label}
              colorIndex={o.colorIndex}
              image={o.image}
              selected={optionIds.includes(o.id)}
              onClick={() =>
                onChange(propertyId, optionIds.includes(o.id) ? optionIds.filter((id) => id !== o.id) : [...optionIds, o.id])
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
