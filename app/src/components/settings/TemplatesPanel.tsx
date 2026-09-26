import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import { useBoards } from '../../hooks/useBoards'
import { useHomeSettings } from '../../hooks/useHomeSettings'
import { useTemplates } from '../../hooks/useTemplates'
import { useToast } from '../../hooks/useToast'
import { api } from '../../lib/api'
import { mergeOptionsFromValues, parseCellValue } from '../../lib/csvImport'
import {
  builtinMediaTemplate,
  cloneProperties,
  makeId,
  PROPERTY_TYPE_LABELS,
  type Board,
  type PropertyDef,
  type PropertyType,
  type PropertyValue,
  type Row,
  type Template,
} from '../../types'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../../lib/theme'
import HelpHint from '../HelpHint'
import ToggleSwitch from '../ToggleSwitch'
import Select from '../Select'

const NEW_COLUMN_TYPES: PropertyType[] = ['text', 'number', 'select', 'multiselect', 'checkbox', 'date', 'url', 'image', 'longtext']

// CSV başlığını, o an seçilmiş sütunlardan (başlık + dahil edilenler) biriyle otomatik
// eşleştirmeye çalışır — Import.tsx'teki guessMapTo ile aynı mantık, sadece TemplateBase yerine
// düz bir PropertyDef listesi üzerinde (burada hedef sütunlar zaten şablondan/kullanıcının
// seçtiklerinden geliyor, ayrıca bir şablon nesnesine ihtiyaç yok).
function guessMapToProperty(header: string, targets: PropertyDef[]): string {
  const h = header.trim().toLocaleLowerCase('tr')
  const exact = targets.find((p) => p.name.trim().toLocaleLowerCase('tr') === h)
  if (exact) return exact.id
  const partial = targets.find((p) => {
    const n = p.name.trim().toLocaleLowerCase('tr')
    return n.length > 2 && (h.includes(n) || n.includes(h))
  })
  return partial?.id ?? ''
}

// "Şablonlar" sekmesi — uygulamayla birlikte gelen tek hazır şablonun ("Medya Arşivi", bkz.
// types.ts'teki builtinMediaTemplate) yanına, artık kullanıcının kendi oluşturduğu şablonlar da
// (bkz. hooks/useTemplates.ts, sunucuda profil başına saklanır) listeleniyor. Her şablon kartının
// kendi "Şablonu Kullan" (bundan yeni bir arşiv oluştur) akışı var — artık sadece sütun seçimiyle
// kalmıyor, isteğe bağlı olarak bir CSV'yi doğrudan seçilen sütunlarla eşleştirip içe aktarabiliyor
// ve ardından eksik bilgileri TMDB'den otomatik doldurabiliyor (bkz. TemplateCard). En üstteki
// "+ Yeni Şablon" ise tam tersini yapar — ya var olan bir arşivin sütun yapısını şablon olarak
// kaydeder, ya da sıfırdan (isim + sütun listesi) yeni bir şablon tanımlar.
export default function TemplatesPanel() {
  const { boards, createBoard } = useBoards()
  const { templates, loading, createTemplate, deleteTemplate } = useTemplates()
  const { selectBoardIfNone } = useHomeSettings()
  const { notify, confirm } = useToast()
  const navigate = useNavigate()

  const [builtin] = useState<Template>(() => builtinMediaTemplate())
  const [creatingTemplate, setCreatingTemplate] = useState(false)

  // Arşiv gerçekten oluşturulduktan (ve varsa içe aktarma/TMDB doldurma bittikten) SONRA
  // çağrılıyor — ağır iş (klonlama, satır ekleme, TMDB döngüsü) artık TemplateCard'ın kendi
  // içinde, burada sadece "ana sayfada arşiv seçili değilse bunu seç + bildir + arşive git" kalıyor.
  async function handleCreated(boardId: string, boardName: string) {
    await selectBoardIfNone(boardId)
    notify(`"${boardName}" arşivi şablondan oluşturuldu.`, 'success')
    navigate(`/board/${boardId}`)
  }

  async function handleDeleteTemplate(template: Template) {
    const ok = await confirm({
      message: `"${template.name}" şablonunu silmek istediğine emin misin? Bu şablondan daha önce oluşturulmuş arşivler etkilenmez, sadece şablonun kendisi silinir.`,
      confirmLabel: 'Sil',
    })
    if (!ok) return
    await deleteTemplate(template.id)
    notify(`"${template.name}" şablonu silindi.`, 'success')
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-sm text-neutral-400 max-w-lg">
          Hazır bir sütun seti: bir şablonla yeni arşiv açınca bütün sütunlar tek seferde gelir. Var olan bir arşivin yapısını da
          şablon olarak kaydedebilirsin.
        </p>
        <button
          onClick={() => setCreatingTemplate((v) => !v)}
          style={primaryButtonStyle}
          className={`text-sm px-3 py-1.5 rounded-lg ${PRIMARY_BUTTON}`}
        >
          + Yeni Şablon
        </button>
      </div>

      {creatingTemplate && (
        <NewTemplateForm
          boards={boards}
          onCancel={() => setCreatingTemplate(false)}
          onCreated={(name) => {
            setCreatingTemplate(false)
            notify(`"${name}" şablonu oluşturuldu.`, 'success')
          }}
          createTemplate={createTemplate}
        />
      )}

      <div className="space-y-4">
        <TemplateCard template={builtin} deletable={false} createBoard={createBoard} onCreated={handleCreated} />
        {loading ? (
          <p className="text-neutral-500 text-sm">Yükleniyor...</p>
        ) : (
          templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              deletable
              createBoard={createBoard}
              onCreated={handleCreated}
              onDelete={() => handleDeleteTemplate(t)}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface CsvPlan {
  header: string
  include: boolean
  mapTo: string // '' = aktarma, yoksa hedef (başlık ya da seçilen sütunlardan biri) property id'si
}

type Phase = 'idle' | 'creating' | 'importing' | 'filling'

// Tek bir şablon kartı — ad, not, sütun rozetleri ve kendi "Şablonu Kullan" akışı. Bu akış üç
// adımdan oluşur, ilk ikisi zaten vardı, son ikisi yeni ve ikisi de isteğe bağlı/kapalı başlar:
//   1. Arşiv adı + hangi sütunların dahil edileceği (+ istersen kendi sütununu ekle) — hep vardı.
//   2. "Veri İçe Aktar" — bir CSV'yi doğrudan seçtiğin sütunlarla eşleştirip satırları oluşturur
//      (Import.tsx'in şablon moduyla aynı eşleme/görsel mantığı, lib/csvImport.ts üzerinden
//      paylaşılıyor — mantık iki yerde ayrı ayrı yazılmıyor).
//   3. İçe aktarma açıkken, altında: "Eksikleri TMDB'den doldur" — sadece "Türkçe Adı"/"Orjinal
//      Adı" gibi TMDB eşleştirmesinin arayacağı bir başlık sütunu varsa gösterilir (bkz.
//      canAutoFill); TMDB anahtarı zaten kayıtlıysa onu kullanır, yoksa burada girip kaydedilir.
// Hem hazır hem kullanıcı şablonları için aynı bileşen kullanılıyor, sadece `deletable`/`onDelete` farklı.
function TemplateCard({
  template,
  deletable,
  createBoard,
  onCreated,
  onDelete,
}: {
  template: Template
  deletable: boolean
  createBoard: (data: Omit<Board, 'id'>) => Promise<string>
  onCreated: (boardId: string, boardName: string) => Promise<void>
  onDelete?: () => void
}) {
  const { notify } = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(template.name)
  const [included, setIncluded] = useState<Record<string, boolean>>({})
  const [extraColumns, setExtraColumns] = useState<PropertyDef[]>([])
  const [newColumnName, setNewColumnName] = useState('')

  const [importEnabled, setImportEnabled] = useState(false)
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [csvPlans, setCsvPlans] = useState<CsvPlan[]>([])
  const [imageFiles, setImageFiles] = useState<Map<string, File>>(new Map())
  const [skipImages, setSkipImages] = useState(false)

  const [autoFillEnabled, setAutoFillEnabled] = useState(false)
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false)
  const [savedApiKey, setSavedApiKey] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')

  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const cancelFillRef = useRef(false)

  const titleProp = template.properties.find((p) => p.id === template.titlePropertyId) ?? template.properties[0]
  const restProps = template.properties.filter((p) => p.id !== titleProp?.id)
  const chosenRest = [...restProps.filter((p) => included[p.id]), ...extraColumns]
  const mapTargets = [titleProp, ...chosenRest]

  function openFlow() {
    setName(template.name)
    setIncluded(Object.fromEntries(restProps.map((p) => [p.id, true])))
    setExtraColumns([])
    setNewColumnName('')
    setImportEnabled(false)
    setRawRows([])
    setCsvPlans([])
    setImageFiles(new Map())
    setSkipImages(false)
    setAutoFillEnabled(false)
    setApiKeyLoaded(false)
    setOpen(true)
  }

  function toggle(id: string) {
    setIncluded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function addColumn() {
    const trimmed = newColumnName.trim()
    if (!trimmed) return
    setExtraColumns((prev) => [...prev, { id: makeId(), name: trimmed, type: 'text' }])
    setNewColumnName('')
  }

  function removeExtraColumn(id: string) {
    setExtraColumns((prev) => prev.filter((p) => p.id !== id))
  }

  function toggleImport(next: boolean) {
    setImportEnabled(next)
    if (!next) {
      setRawRows([])
      setCsvPlans([])
      setImageFiles(new Map())
      setSkipImages(false)
      setAutoFillEnabled(false)
    }
  }

  function handleCsv(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const hs = result.meta.fields ?? []
        setRawRows(result.data)
        setCsvPlans(hs.map((h) => ({ header: h, include: true, mapTo: guessMapToProperty(h, mapTargets) })))
      },
    })
  }

  function updatePlan(header: string, patch: Partial<CsvPlan>) {
    setCsvPlans((prev) => prev.map((p) => (p.header === header ? { ...p, ...patch } : p)))
  }

  function handleFolder(fileList: FileList) {
    const map = new Map<string, File>()
    Array.from(fileList).forEach((f) => map.set(f.name.toLocaleLowerCase('tr'), f))
    setImageFiles(map)
    setSkipImages(false)
  }

  async function openAutoFill(next: boolean) {
    setAutoFillEnabled(next)
    if (next && !apiKeyLoaded) {
      try {
        const { tmdbApiKey } = await api.getApiKey()
        setSavedApiKey(tmdbApiKey)
        setApiKeyInput(tmdbApiKey)
      } catch {
        // profil henüz aktif değil vb. — sorun değil, kullanıcı elle girer
      } finally {
        setApiKeyLoaded(true)
      }
    }
  }

  const titleMapped = !importEnabled || csvPlans.some((p) => p.include && p.mapTo === titleProp.id)
  const hasImageColumn = importEnabled && csvPlans.some((p) => p.include && mapTargets.find((t) => t.id === p.mapTo)?.type === 'image')
  const imagesReady = !hasImageColumn || imageFiles.size > 0 || skipImages
  // TMDB araması başlık ya da "Orjinal Adı" görevindeki sütunla yapılıyor — adı ne olursa olsun
  // bir metin sütunu varsa otomatik doldurma teklif edilebilir.
  const canAutoFillHere = mapTargets.some((p) => p.type === 'text')
  const needsApiKey = autoFillEnabled && !apiKeyInput.trim()

  const canSubmit =
    name.trim().length > 0 &&
    (!importEnabled || (rawRows.length > 0 && titleMapped && imagesReady)) &&
    !needsApiKey

  async function handleSubmit() {
    if (!canSubmit) return
    setPhase('creating')
    setProgress(null)
    try {
      const originalProps = [titleProp, ...chosenRest]
      const { properties: clonedProps, idMap } = cloneProperties(originalProps)
      const clonedTitle = clonedProps[0]

      const columnForClonedProp = new Map<string, string>()
      if (importEnabled) {
        for (const plan of csvPlans) {
          if (!plan.include || !plan.mapTo) continue
          const clonedId = idMap.get(plan.mapTo)
          if (clonedId) columnForClonedProp.set(clonedId, plan.header)
        }
      }

      // Seçim/çoklu-seçim sütunlarına CSV'den gelen değerleri, klonlanmış (taze id'li) haliyle
      // birleştiriyoruz — parseCellValue'nun aşağıda bu etiketleri bulabilmesi için şart.
      const finalProps = clonedProps.map((p) => {
        const header = columnForClonedProp.get(p.id)
        if (!header || (p.type !== 'select' && p.type !== 'multiselect')) return p
        return mergeOptionsFromValues(p, rawRows.map((r) => r[header] ?? ''))
      })

      const chosenIds = new Set(chosenRest.map((p) => p.id))
      const coverId = template.coverPropertyId && chosenIds.has(template.coverPropertyId) ? template.coverPropertyId : null
      const titleImgId =
        template.titleImagePropertyId && chosenIds.has(template.titleImagePropertyId) ? template.titleImagePropertyId : null

      const boardId = await createBoard({
        name: name.trim(),
        titlePropertyId: idMap.get(titleProp.id)!,
        coverPropertyId: coverId ? (idMap.get(coverId) ?? null) : null,
        titleImagePropertyId: titleImgId ? (idMap.get(titleImgId) ?? null) : null,
        properties: finalProps,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      if (importEnabled && rawRows.length > 0) {
        setPhase('importing')
        const uploadedPaths = new Map<string, string>()
        const rowsToInsert: Omit<Row, 'id'>[] = []
        for (let i = 0; i < rawRows.length; i++) {
          const raw = rawRows[i]
          const values: Record<string, PropertyValue> = {}
          for (const prop of finalProps) {
            const header = columnForClonedProp.get(prop.id)
            if (!header) continue
            if (prop.type === 'image') {
              const filename = (raw[header] ?? '').trim()
              if (/^https?:\/\//i.test(filename)) {
                values[prop.id] = filename
              } else if (filename) {
                const key = filename.toLocaleLowerCase('tr')
                if (uploadedPaths.has(key)) {
                  values[prop.id] = uploadedPaths.get(key)!
                } else {
                  const file = imageFiles.get(key)
                  if (file) {
                    const uploaded = await api.uploadMedya(file).catch(() => null)
                    const path = uploaded ? `/medya/${uploaded.filename}` : ''
                    uploadedPaths.set(key, path)
                    values[prop.id] = path
                  } else {
                    values[prop.id] = ''
                  }
                }
              } else {
                values[prop.id] = ''
              }
            } else {
              values[prop.id] = parseCellValue(prop, raw[header] ?? '')
            }
          }
          rowsToInsert.push({ values, createdAt: Date.now() + i, updatedAt: Date.now() })
          setProgress({ done: i + 1, total: rawRows.length })
        }
        await api.bulkAddRows(boardId, rowsToInsert)

        if (autoFillEnabled && apiKeyInput.trim()) {
          if (apiKeyInput.trim() !== savedApiKey) await api.saveApiKey(apiKeyInput.trim())
          setPhase('filling')
          cancelFillRef.current = false
          const freshRows = await api.getRows(boardId)
          let done = 0
          for (const row of freshRows) {
            if (cancelFillRef.current) break
            const titleVal = row.values[clonedTitle.id]
            if (typeof titleVal === 'string' && titleVal.trim()) {
              await api.fetchTmdb(boardId, row.id, []).catch(() => {})
            }
            done++
            setProgress({ done, total: freshRows.length })
          }
        }
      }

      await onCreated(boardId, name.trim())
      setOpen(false)
    } catch (err) {
      // Panel kapanmıyor — kullanıcı girdiklerini kaybetmeden hatayı görüp tekrar denesin.
      notify(err instanceof Error ? err.message : 'Arşiv oluşturulurken bir hata oluştu.', 'danger')
    } finally {
      setPhase('idle')
      setProgress(null)
    }
  }

  const includedCount = restProps.filter((p) => included[p.id]).length + extraColumns.length
  const busy = phase !== 'idle'

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-base font-semibold text-neutral-100">
          <span className="h-8 w-8 shrink-0 rounded-lg bg-[#00c0fa]/15 text-[#00c0fa] flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </span>
          {template.name}
        </h3>
        {deletable && onDelete && (
          <button onClick={onDelete} className="text-neutral-600 hover:text-rose-400 text-xs shrink-0">
            Sil
          </button>
        )}
      </div>
      {template.note && <p className="text-sm text-neutral-500 mt-1 mb-4">{template.note}</p>}

      <p className="text-xs text-neutral-500 mb-2">Sütunlar ({template.properties.length}):</p>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {titleProp && (
          <span className="text-xs rounded-md px-2 py-1 bg-sky-500/10 text-sky-300 border border-sky-500/30">
            {titleProp.name} · Başlık
          </span>
        )}
        {restProps.map((p) => (
          <span key={p.id} className="text-xs rounded-md px-2 py-1 bg-neutral-800 text-neutral-300 border border-neutral-700">
            {p.name} · {PROPERTY_TYPE_LABELS[p.type]}
          </span>
        ))}
      </div>

      {!open ? (
        <button onClick={openFlow} style={primaryButtonStyle} className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}>
          Şablonu Kullan
        </button>
      ) : (
        <div className="border-t border-neutral-800 pt-5 mt-1">
          <label className="block text-xs text-neutral-400 mb-1">Yeni arşivin adı</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm mb-4"
          />

          <div className="flex items-center gap-1.5 mb-2">
            <p className="text-sm text-neutral-300">İstemediğin sütunların işaretini kaldır ({includedCount} sütun seçili)</p>
            <HelpHint>
              Her sütun, arşivini oluşturduktan sonra da eklenebilir/kaldırılabilir/yeniden adlandırılabilir — burada
              seçtiklerin sadece başlangıç noktası.
            </HelpHint>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1 mb-4">
            {titleProp && (
              <label className="flex items-center gap-2 bg-neutral-800/40 rounded-lg px-2.5 py-1.5 text-sm text-neutral-400">
                <input type="checkbox" checked disabled />
                {titleProp.name} <span className="text-xs text-neutral-600">(başlık, kaldırılamaz)</span>
              </label>
            )}
            {restProps.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 bg-neutral-800/60 rounded-lg px-2.5 py-1.5 text-sm text-neutral-200 cursor-pointer"
              >
                <input type="checkbox" checked={included[p.id] ?? false} onChange={() => toggle(p.id)} />
                <span className="flex-1">{p.name}</span>
                <span className="text-xs text-neutral-500">{PROPERTY_TYPE_LABELS[p.type]}</span>
              </label>
            ))}
            {extraColumns.map((p) => (
              <div key={p.id} className="flex items-center gap-2 bg-neutral-800/60 rounded-lg px-2.5 py-1.5 text-sm text-neutral-200">
                <input type="checkbox" checked disabled />
                <span className="flex-1">{p.name}</span>
                <span className="text-xs text-neutral-500">{PROPERTY_TYPE_LABELS[p.type]}</span>
                <button onClick={() => removeExtraColumn(p.id)} className="text-neutral-500 hover:text-rose-400 text-xs px-1">
                  Kaldır
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-6">
            <input
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addColumn()}
              placeholder="Kendi sütununu ekle (ör. Notlarım)"
              className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm"
            />
            <button
              onClick={addColumn}
              disabled={!newColumnName.trim()}
              className="text-sm text-neutral-300 hover:text-neutral-50 border border-neutral-700 hover:border-neutral-500 rounded-lg px-3 py-2 disabled:opacity-40 transition"
            >
              + Sütun Ekle
            </button>
          </div>

          <div className="flex items-center justify-between gap-2.5 bg-neutral-800/40 border border-neutral-800 rounded-xl p-3.5 mb-3">
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-neutral-100 text-sm">Veri İçe Aktar</span>
              <HelpHint>
                Bir CSV dosyasından (Notion'dan ya da başka bir yerden) gelen veriyi, yukarıda seçtiğin sütunlarla
                eşleştirip arşiv oluşur oluşmaz satırları da birlikte ekler.
              </HelpHint>
              <span className="text-xs text-neutral-500">(isteğe bağlı)</span>
            </span>
            <ToggleSwitch checked={importEnabled} onChange={toggleImport} label="Veri İçe Aktar" />
          </div>

          {importEnabled && (
            <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-4 mb-3 space-y-3">
              {rawRows.length === 0 ? (
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])}
                  className="block text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-neutral-200"
                />
              ) : (
                <>
                  <p className={`text-sm ${titleMapped ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {rawRows.length} satır, {csvPlans.length} sütun bulundu —{' '}
                    {titleMapped ? `✓ "${titleProp.name}" eşlendi.` : `bir sütunu "${titleProp.name}" alanına eşlemelisin.`}
                  </p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {csvPlans.map((p) => (
                      <div key={p.header} className="flex items-center gap-2 bg-neutral-800/60 rounded-lg px-2 py-1.5">
                        <input type="checkbox" checked={p.include} onChange={(e) => updatePlan(p.header, { include: e.target.checked })} />
                        <span className="text-sm text-neutral-200 flex-1 truncate">{p.header}</span>
                        <Select
                          value={p.mapTo}
                          onChange={(v) => updatePlan(p.header, { mapTo: v })}
                          className="w-1/2 shrink-0"
                          options={[{ value: '', label: '— Aktarma —' }, ...mapTargets.map((t) => ({ value: t.id, label: t.name }))]}
                        />
                      </div>
                    ))}
                  </div>

                  {hasImageColumn && (
                    <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3">
                      <p className="text-sm text-amber-300 font-medium mb-1">Görselleri seç</p>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(e) => e.target.files && handleFolder(e.target.files)}
                        className="block text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-neutral-200"
                      />
                      {imageFiles.size > 0 ? (
                        <p className="text-sm text-emerald-400 mt-2">✓ {imageFiles.size} dosya bulundu.</p>
                      ) : (
                        <label className="flex items-center gap-2 text-sm text-neutral-400 mt-2 cursor-pointer">
                          <input type="checkbox" checked={skipImages} onChange={(e) => setSkipImages(e.target.checked)} />
                          Görselleri şimdilik atla
                        </label>
                      )}
                    </div>
                  )}

                  {canAutoFillHere && (
                    <div className="border-t border-neutral-800 pt-3 mt-1">
                      <div className="flex items-center justify-between gap-2.5">
                        <span className="flex items-center gap-1.5">
                          <span className="font-medium text-neutral-100 text-sm">Eksikleri TMDB'den doldur</span>
                          <HelpHint>
                            İçe aktarılan her kayıt için (başlığına bakarak) poster, banner, ülke, yönetmen, süre,
                            sinopsis, oyuncular gibi boş alanları TMDB'den otomatik çeker — kayıt sayısına göre biraz
                            sürebilir.
                          </HelpHint>
                          <span className="text-xs text-neutral-500">(isteğe bağlı)</span>
                        </span>
                        <ToggleSwitch checked={autoFillEnabled} onChange={openAutoFill} label="Eksikleri TMDB'den doldur" />
                      </div>
                      {autoFillEnabled && (
                        <div className="mt-2.5">
                          <label className="block text-xs text-neutral-400 mb-1">TMDB API Anahtarı</label>
                          <input
                            value={apiKeyInput}
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            placeholder="TMDB API anahtarını buraya yapıştır"
                            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm font-mono"
                          />
                          <p className="text-xs text-neutral-600 mt-1">
                            {savedApiKey
                              ? 'Kayıtlı anahtarın önceden dolduruldu, değiştirmek istersen üzerine yazabilirsin.'
                              : 'Bu anahtar kaydedilip Ayarlar → Veritabanı → API sekmesinde de görünecek.'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {busy && progress && (
            <div className="mb-3">
              <p className="text-sm text-neutral-400">
                {phase === 'importing' && `İçe aktarılıyor... ${progress.done}/${progress.total}`}
                {phase === 'filling' && `TMDB'den dolduruluyor... ${progress.done}/${progress.total}`}
              </p>
              {phase === 'filling' && (
                <button onClick={() => (cancelFillRef.current = true)} className="text-xs text-neutral-500 hover:text-neutral-300 underline mt-1">
                  Durdur (şimdiye kadar oluşturulanlar kalır)
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || busy}
              style={primaryButtonStyle}
              className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}
            >
              {phase === 'creating' ? 'Oluşturuluyor...' : busy ? 'İşleniyor...' : 'Arşivi Oluştur'}
            </button>
            <button onClick={() => setOpen(false)} disabled={busy} className="text-neutral-400 hover:text-neutral-200 text-sm px-4 py-2 disabled:opacity-40">
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type BoardLike = { id: string; name: string; titlePropertyId: string; coverPropertyId: string | null; titleImagePropertyId: string | null; properties: PropertyDef[] }

// "+ Yeni Şablon" formu — iki yoldan biriyle: var olan bir arşivin sütun yapısını kopyalayarak
// (en kolay/en doğal yol — "Medya Arşivi" de aslında böyle doğdu), ya da sıfırdan isim + sütun
// listesi yazarak. İkisi de sonunda aynı `createTemplate`'e çağrı yapar.
function NewTemplateForm({
  boards,
  createTemplate,
  onCreated,
  onCancel,
}: {
  boards: BoardLike[]
  createTemplate: (data: Omit<Template, 'id'>) => Promise<Template>
  onCreated: (name: string) => void
  onCancel: () => void
}) {
  const [mode, setMode] = useState<'arsiv' | 'sifir'>(boards.length > 0 ? 'arsiv' : 'sifir')
  const [boardId, setBoardId] = useState(boards[0]?.id ?? '')
  const [name, setName] = useState(boards[0]?.name ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const [titleColumnName, setTitleColumnName] = useState('Ad')
  const [scratchColumns, setScratchColumns] = useState<{ id: string; name: string; type: PropertyType }[]>([])

  function handleBoardChange(id: string) {
    setBoardId(id)
    const b = boards.find((x) => x.id === id)
    if (b) setName(b.name)
  }

  function addScratchColumn() {
    setScratchColumns((prev) => [...prev, { id: makeId(), name: '', type: 'text' }])
  }

  function updateScratchColumn(id: string, patch: Partial<{ name: string; type: PropertyType }>) {
    setScratchColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function removeScratchColumn(id: string) {
    setScratchColumns((prev) => prev.filter((c) => c.id !== id))
  }

  const canSubmit = mode === 'arsiv' ? Boolean(boardId) && name.trim().length > 0 : name.trim().length > 0

  async function handleSubmit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      if (mode === 'arsiv') {
        const board = boards.find((b) => b.id === boardId)
        if (!board) return
        const { properties, idMap } = cloneProperties(board.properties)
        await createTemplate({
          name: name.trim(),
          note: note.trim() || undefined,
          titlePropertyId: idMap.get(board.titlePropertyId)!,
          coverPropertyId: board.coverPropertyId ? (idMap.get(board.coverPropertyId) ?? null) : null,
          titleImagePropertyId: board.titleImagePropertyId ? (idMap.get(board.titleImagePropertyId) ?? null) : null,
          properties,
        })
      } else {
        const title: PropertyDef = { id: makeId(), name: titleColumnName.trim() || 'Ad', type: 'text' }
        const rest: PropertyDef[] = scratchColumns
          .filter((c) => c.name.trim())
          .map((c) => ({
            id: makeId(),
            name: c.name.trim(),
            type: c.type,
            options: c.type === 'select' || c.type === 'multiselect' ? [] : undefined,
          }))
        await createTemplate({
          name: name.trim(),
          note: note.trim() || undefined,
          titlePropertyId: title.id,
          coverPropertyId: null,
          titleImagePropertyId: null,
          properties: [title, ...rest],
        })
      }
      onCreated(name.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[#00c0fa]/30 bg-neutral-900/70 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        {(
          [
            ['arsiv', 'Bir arşivden oluştur'],
            ['sifir', 'Sıfırdan oluştur'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition ${
              mode === key
                ? 'bg-neutral-800 border-neutral-600 text-neutral-50'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'arsiv' ? (
        boards.length === 0 ? (
          <p className="text-sm text-neutral-500 mb-4">Henüz bir arşivin yok — önce Arşivler sekmesinden bir tane oluştur.</p>
        ) : (
          <div className="mb-4">
            <label className="block text-xs text-neutral-400 mb-1">Hangi arşivin sütun yapısı kopyalansın?</label>
            <Select
              value={boardId}
              onChange={handleBoardChange}
              options={boards.map((b) => ({ value: b.id, label: `${b.name} (${b.properties.length} sütun)` }))}
            />
          </div>
        )
      ) : (
        <div className="mb-4">
          <label className="block text-xs text-neutral-400 mb-1">Başlık sütununun adı</label>
          <input
            value={titleColumnName}
            onChange={(e) => setTitleColumnName(e.target.value)}
            placeholder="ör. Ad, Başlık, İsim..."
            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm mb-4"
          />
          <label className="block text-xs text-neutral-400 mb-1">Diğer sütunlar</label>
          <div className="space-y-1.5 mb-2">
            {scratchColumns.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <input
                  value={c.name}
                  onChange={(e) => updateScratchColumn(c.id, { name: e.target.value })}
                  placeholder="Sütun adı"
                  className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm"
                />
                <Select
                  value={c.type}
                  onChange={(v) => updateScratchColumn(c.id, { type: v as PropertyType })}
                  className="w-44 shrink-0"
                  options={NEW_COLUMN_TYPES.map((t) => ({ value: t, label: PROPERTY_TYPE_LABELS[t] }))}
                />
                <button onClick={() => removeScratchColumn(c.id)} className="text-neutral-500 hover:text-rose-400 text-xs px-1">
                  Kaldır
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addScratchColumn}
            className="text-sm text-neutral-300 hover:text-neutral-50 border border-neutral-700 hover:border-neutral-500 rounded-lg px-3 py-2 transition"
          >
            + Sütun Ekle
          </button>
        </div>
      )}

      <label className="block text-xs text-neutral-400 mb-1">Şablonun adı</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="ör. Kitaplarım, Oynadığım Oyunlar..."
        className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm mb-3"
      />
      <label className="block text-xs text-neutral-400 mb-1">Kısa bir not (isteğe bağlı)</label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Bu şablonun ne işe yaradığını kısaca yaz"
        className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm mb-4"
      />

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || busy}
          style={primaryButtonStyle}
          className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}
        >
          {busy ? 'Oluşturuluyor...' : 'Şablonu Oluştur'}
        </button>
        <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-200 text-sm px-4 py-2">
          Vazgeç
        </button>
      </div>
    </div>
  )
}
