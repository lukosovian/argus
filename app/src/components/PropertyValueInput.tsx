import { useEffect, useMemo, useState } from 'react'
import type { PropertyDef, PropertyValue } from '../types'
import { ratingAverage } from '../types'
import OptionBadge from './OptionBadge'
import DateChipEditor from './DateChipEditor'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'

const inputClass =
  'w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm'

export default function PropertyValueInput({
  property,
  value,
  onChange,
  onAddOption,
  onAddCriterion,
}: {
  property: PropertyDef
  value: PropertyValue
  onChange: (v: PropertyValue) => void
  onAddOption?: (label: string) => string
  onAddCriterion?: (name: string) => string
}) {
  const [newOption, setNewOption] = useState('')
  const [newCriterion, setNewCriterion] = useState('')
  // Oyuncular gibi binlerce seçeneği olan bir sütunda seçili rozetleri göstermek için bile
  // her render'da `.find()` ile doğrusal arama yapmak yavaştı — id->seçenek Map'i kullanılır.
  const optionMap = useMemo(() => new Map((property.options ?? []).map((o) => [o.id, o])), [property.options])

  if (property.type === 'text') {
    return <input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={inputClass} />
  }

  if (property.type === 'longtext') {
    return (
      <textarea
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Bir iki cümlelik kısa bir özet..."
        className={`${inputClass} resize-none`}
      />
    )
  }

  if (property.type === 'url') {
    return (
      <input
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://..."
        className={inputClass}
      />
    )
  }

  if (property.type === 'number') {
    return (
      <input
        type="number"
        value={value === null || value === undefined ? '' : (value as number)}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className={inputClass}
      />
    )
  }

  if (property.type === 'date') {
    return <input type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={inputClass} />
  }

  if (property.type === 'multidate') {
    const dates = Array.isArray(value) ? (value as string[]) : []
    return <DateChipEditor dates={dates} onChange={onChange} />
  }

  if (property.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        Evet
      </label>
    )
  }

  if (property.type === 'image') {
    return <ImageValueInput value={(value as string) ?? ''} onChange={onChange} />
  }

  if (property.type === 'rating') {
    const criteria = property.criteria ?? []
    const scores = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, number>) : {}
    const avg = ratingAverage(value, property)

    function setScore(criterionId: string, score: number) {
      onChange({ ...scores, [criterionId]: score })
    }

    function addCriterion() {
      const name = newCriterion.trim()
      if (!name || !onAddCriterion) return
      onAddCriterion(name)
      setNewCriterion('')
    }

    return (
      <div className="space-y-3">
        {criteria.length === 0 && (
          <p className="text-xs text-neutral-500">Henüz kriter yok — aşağıdan ekle (ör. Senaryo, Oyunculuk).</p>
        )}
        {criteria.map((c) => (
          <div key={c.id}>
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="text-xs text-neutral-300 truncate" title={c.name}>
                {c.name}
              </span>
              <span className="text-xs font-semibold text-neutral-50 shrink-0">{scores[c.id] ?? '—'}</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={scores[c.id] ?? 0}
              onChange={(e) => setScore(c.id, Number(e.target.value))}
              className="w-full accent-white"
            />
          </div>
        ))}
        {onAddCriterion && (
          <div className="flex gap-1.5 pt-2 border-t border-neutral-800">
            <input
              value={newCriterion}
              onChange={(e) => setNewCriterion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                addCriterion()
              }}
              placeholder="Yeni kriter..."
              className={`${inputClass} text-xs py-1.5`}
            />
            <button
              type="button"
              onClick={addCriterion}
              className="text-xs bg-neutral-800 border border-neutral-700 rounded-lg px-3 text-neutral-300 hover:text-neutral-50 transition shrink-0"
            >
              Ekle
            </button>
          </div>
        )}
        {avg !== null && (
          <p className="text-xs text-neutral-400 pt-2 border-t border-neutral-800">
            Ortalama: <span className="font-semibold text-neutral-50">{avg.toFixed(1)}</span> / 10
          </p>
        )}
      </div>
    )
  }

  if (property.type === 'select' || property.type === 'multiselect') {
    const isMulti = property.type === 'multiselect'
    const selectedSingle = isMulti ? '' : ((value as string) ?? '')
    const selectedMulti = isMulti && Array.isArray(value) ? (value as string[]) : []
    const selectedIds = isMulti ? selectedMulti : selectedSingle ? [selectedSingle] : []
    const options = property.options ?? []
    const query = newOption.trim().toLocaleLowerCase('tr')
    // Oyuncular gibi binlerce seçeneği olan bir sütunda arama kutusu boşken hepsini birden
    // rozet olarak basmak (binlerce DOM elemanı) tarayıcıyı kilitliyordu — bir eşiğin
    // üstünde, kullanıcı bir şey yazana kadar liste boş kalır (BoardView'ın filtre
    // seçicisindeki aynı yaklaşım).
    const matches = query
      ? options.filter((o) => o.label.toLocaleLowerCase('tr').includes(query))
      : options.length > 100
        ? []
        : options
    const exactMatch = options.some((o) => o.label.toLocaleLowerCase('tr') === query)

    function pick(id: string) {
      if (isMulti) {
        onChange(selectedMulti.includes(id) ? selectedMulti.filter((s) => s !== id) : [...selectedMulti, id])
      } else {
        onChange(selectedSingle === id ? '' : id)
      }
      setNewOption('')
    }

    function handleCreate() {
      const label = newOption.trim()
      if (!label || !onAddOption) return
      const id = onAddOption(label)
      pick(id)
    }

    return (
      <div className="space-y-2">
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedIds.map((id) => {
              const o = optionMap.get(id)
              if (!o) return null
              return (
                <OptionBadge key={id} label={o.label} colorIndex={o.colorIndex} image={o.image} selected onClick={() => pick(id)} />
              )
            })}
          </div>
        )}
        <input
          autoFocus
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            if (matches[0] && query) pick(matches[0].id)
            else handleCreate()
          }}
          placeholder="Ara ya da yeni seçenek yaz..."
          className={`${inputClass} text-sm`}
        />
        {(matches.length > 0 || (query && !exactMatch && onAddOption)) && (
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {matches.map((o) => (
              <OptionBadge
                key={o.id}
                label={o.label}
                colorIndex={o.colorIndex}
                image={o.image}
                selected={selectedIds.includes(o.id)}
                onClick={() => pick(o.id)}
              />
            ))}
            {query && !exactMatch && onAddOption && (
              <button
                type="button"
                onClick={handleCreate}
                className="text-xs bg-neutral-800 border border-dashed border-neutral-600 rounded-full px-2.5 py-1 text-neutral-300 hover:text-neutral-50 transition"
              >
                + "{newOption.trim()}" ekle
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return null
}

// medya/ klasörüne gerçek dosya olarak yükler (ya da klasördeki mevcut bir dosyadan seçtirir)
// ve değere sadece "/medya/dosyaadi.jpg" gibi bir yol yazar.
function ImageValueInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    if (!showPicker) return
    api.getMedyaFiles().then(setFiles).catch(() => setFiles([]))
  }, [showPicker])

  async function handleUpload(file: File) {
    setBusy(true)
    try {
      const { filename } = await api.uploadMedya(file)
      onChange(`/medya/${filename}`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Dosya yüklenemedi', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {value && (
        <img src={value} alt="" className="h-24 w-16 object-cover rounded-md border border-neutral-700" />
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Görsel/video URL'si ya da medya/ içindeki dosya adı..."
        className={inputClass}
      />
      <div className="flex items-center gap-3">
        <label className="inline-block text-xs text-neutral-400 hover:text-neutral-200 cursor-pointer">
          {busy ? 'Yükleniyor...' : 'bilgisayardan seç (medya/ klasörüne kaydedilir)'}
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          className="text-xs text-neutral-400 hover:text-neutral-200"
        >
          medya/ klasöründen seç
        </button>
      </div>
      {showPicker && (
        <div className="max-h-40 overflow-y-auto border border-neutral-700 rounded-lg divide-y divide-neutral-800">
          {files.length === 0 && <p className="text-xs text-neutral-500 px-2 py-2">medya/ klasörü boş.</p>}
          {files.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                onChange(`/medya/${f}`)
                setShowPicker(false)
              }}
              className="block w-full text-left text-xs text-neutral-300 hover:bg-neutral-800 px-2 py-1.5 truncate"
            >
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
