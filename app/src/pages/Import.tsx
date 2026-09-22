import { useState } from 'react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import { useBoards } from '../hooks/useBoards'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { makeId, mediaTemplateProperties, PROPERTY_TYPE_LABELS, type PropertyDef, type PropertyType, type PropertyValue, type Row } from '../types'
import { buildProperty, inferColumnType, mergeOptionsFromValues, parseCellValue } from '../lib/csvImport'
import { api } from '../lib/api'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import HelpHint from '../components/HelpHint'
import ToggleSwitch from '../components/ToggleSwitch'
import Select from '../components/Select'

interface ColumnPlan {
  header: string
  include: boolean
  type: PropertyType
  // Şablon modunda: hangi şablon sütununa eşleniyor. '__new__' = yeni sütun olarak eklensin
  // (eski davranış, `type` alanı kullanılır), '' = henüz eşlenmemiş.
  mapTo: string
}

const TYPES: PropertyType[] = ['text', 'number', 'select', 'multiselect', 'checkbox', 'date', 'url', 'image']

type TemplateBase = ReturnType<typeof mediaTemplateProperties>

// CSV başlığını şablonun sütun adlarından biriyle otomatik eşleştirmeye çalışır — kullanıcının
// kendi arşivinden (ya da aynı kalıpta bir arkadaş export'undan) gelen CSV'lerde sütun adları
// zaten büyük ölçüde birebir aynı olduğu için (Türkçe Adı, Durum, Tür, Ülke...) bu çoğu zaman
// hiç elle düzeltme gerektirmeden doğru eşleşiyor; tahmin tutmazsa kullanıcı dropdown'dan değiştirir.
function guessMapTo(header: string, template: TemplateBase): string {
  const h = header.trim().toLocaleLowerCase('tr')
  const all = [template.title, ...template.rest]
  const exact = all.find((p) => p.name.trim().toLocaleLowerCase('tr') === h)
  if (exact) return exact.id
  const partial = all.find((p) => {
    const n = p.name.trim().toLocaleLowerCase('tr')
    return n.length > 2 && (h.includes(n) || n.includes(h))
  })
  return partial?.id ?? '__new__'
}

export default function Import() {
  const { createBoard, deleteBoard } = useBoards()
  const { selectBoardIfNone } = useHomeSettings()

  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [plans, setPlans] = useState<ColumnPlan[]>([])
  const [titleHeader, setTitleHeader] = useState('')
  const [boardName, setBoardName] = useState('İçe Aktarım')
  const [imageFiles, setImageFiles] = useState<Map<string, File>>(new Map())
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [doneBoardId, setDoneBoardId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [skipImages, setSkipImages] = useState(false)

  // "Medya Arşivi" şablonuyla içe aktar — ARGUS'un kullandığı TÜM sütunlarla (Banner/Poster/
  // KAPAK ADI/Puan/Oyuncular vb.) hazır bir arşiv oluşturur, CSV sütunlarını bunlarla eşleştirirsin.
  // `templateBase` sabit id'ler üretsin diye sadece bir kere (şablon ilk açıldığında) kuruluyor.
  const [useTemplate, setUseTemplate] = useState(false)
  const [templateBase, setTemplateBase] = useState<TemplateBase | null>(null)

  function ensureTemplate(): TemplateBase {
    if (templateBase) return templateBase
    const t = mediaTemplateProperties()
    setTemplateBase(t)
    return t
  }

  function handleToggleTemplate(next: boolean) {
    setUseTemplate(next)
    if (!next) return
    const t = ensureTemplate()
    setPlans((prev) => prev.map((p) => (p.mapTo ? p : { ...p, mapTo: guessMapTo(p.header, t) })))
  }

  function handleCsv(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const hs = result.meta.fields ?? []
        const data = result.data
        setRawRows(data)
        const t = useTemplate ? ensureTemplate() : templateBase
        const inferredPlans: ColumnPlan[] = hs.map((h) => ({
          header: h,
          include: true,
          type: inferColumnType(h, data.map((r) => r[h] ?? '')),
          mapTo: t ? guessMapTo(h, t) : '',
        }))
        setPlans(inferredPlans)
        const guessTitle =
          hs.find((h) => /ad[ıi]|isim|^name$|başlık/i.test(h)) ?? hs.find((_h, i) => inferredPlans[i].type === 'text') ?? hs[0]
        setTitleHeader(guessTitle ?? '')
        setBoardName(file.name.replace(/\.csv$/i, '') || 'İçe Aktarım')
      },
    })
  }

  function handleFolder(fileList: FileList) {
    const map = new Map<string, File>()
    Array.from(fileList).forEach((f) => map.set(f.name.toLocaleLowerCase('tr'), f))
    setImageFiles(map)
  }

  function updatePlan(header: string, patch: Partial<ColumnPlan>) {
    setPlans((prev) => prev.map((p) => (p.header === header ? { ...p, ...patch } : p)))
  }

  const hasImageColumn = useTemplate
    ? plans.some((p) => p.include && p.mapTo && p.mapTo !== '__new__' && templateBase && [...templateBase.rest, templateBase.title].find((tp) => tp.id === p.mapTo)?.type === 'image') ||
      plans.some((p) => p.include && p.mapTo === '__new__' && p.type === 'image')
    : plans.some((p) => p.include && p.type === 'image')
  const imagesReady = !hasImageColumn || imageFiles.size > 0 || skipImages

  const templateTitleMapped = useTemplate && templateBase ? plans.some((p) => p.include && p.mapTo === templateBase.title.id) : true
  const canImport = useTemplate ? templateTitleMapped : Boolean(titleHeader)

  async function handleImport() {
    if (!canImport || !imagesReady) return
    setImporting(true)
    setError('')
    setProgress(0)

    let createdBoardId: string | null = null
    try {
      const included = plans.filter((p) => p.include)
      const columnValues = (header: string) => rawRows.map((r) => r[header] ?? '')

      let titleProperty: PropertyDef
      let restProperties: PropertyDef[]
      // Hangi property id'sinin değerini hangi CSV başlığından okuyacağımız — iki modda da
      // (şablonlu/şablonsuz) aynı satır-ekleme döngüsü bunu kullanıyor.
      const columnForProperty = new Map<string, string>()

      if (useTemplate && templateBase) {
        const titlePlan = included.find((p) => p.mapTo === templateBase.title.id)
        if (!titlePlan) throw new Error(`Bir CSV sütununu "${templateBase.title.name}" alanına eşlemelisin.`)
        titleProperty = templateBase.title
        columnForProperty.set(titleProperty.id, titlePlan.header)

        restProperties = []
        const usedTemplateIds = new Set<string>()
        for (const p of included) {
          if (p.mapTo === titleProperty.id || p.mapTo === '__new__' || !p.mapTo) continue
          const templateProp = templateBase.rest.find((tp) => tp.id === p.mapTo)
          if (!templateProp || usedTemplateIds.has(templateProp.id)) continue
          usedTemplateIds.add(templateProp.id)
          const merged = mergeOptionsFromValues(templateProp, columnValues(p.header))
          restProperties.push(merged)
          columnForProperty.set(merged.id, p.header)
        }
        for (const p of included) {
          if (p.mapTo !== '__new__') continue
          const prop = buildProperty(p.header, p.type, columnValues(p.header))
          restProperties.push(prop)
          columnForProperty.set(prop.id, p.header)
        }
      } else {
        const titlePlan = included.find((p) => p.header === titleHeader)
        if (!titlePlan) throw new Error('Başlık (ad) sütunu seçmelisin.')
        const restPlans = included.filter((p) => p.header !== titleHeader)
        titleProperty = { id: makeId(), name: titlePlan.header, type: 'text' }
        columnForProperty.set(titleProperty.id, titlePlan.header)
        restProperties = restPlans.map((p) => buildProperty(p.header, p.type, columnValues(p.header)))
        restProperties.forEach((prop, i) => columnForProperty.set(prop.id, restPlans[i].header))
      }

      const coverProperty =
        (useTemplate && templateBase ? restProperties.find((p) => p.id === templateBase.coverPropertyId) : undefined) ??
        restProperties.find((p) => p.type === 'image') ??
        null
      const titleImagePropertyId =
        useTemplate && templateBase ? (restProperties.find((p) => p.id === templateBase.titleImagePropertyId)?.id ?? null) : null

      const boardId = await createBoard({
        name: boardName.trim() || 'Notion İçe Aktarımı',
        titlePropertyId: titleProperty.id,
        coverPropertyId: coverProperty?.id ?? null,
        titleImagePropertyId,
        properties: [titleProperty, ...restProperties],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      createdBoardId = boardId

      // Aynı dosyayı birden çok satırda kullanan kayıtlar için tekrar tekrar
      // yüklemeyi önlemek üzere dosya adı -> sunucudaki yol eşlemesini önbelleğe alıyoruz.
      const uploadedPaths = new Map<string, string>()

      const rowsToInsert: Omit<Row, 'id'>[] = []
      for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i]
        const values: Record<string, PropertyValue> = {}
        const titleColHeader = columnForProperty.get(titleProperty.id)
        values[titleProperty.id] = titleColHeader ? (raw[titleColHeader] ?? '').trim() : ''

        for (const prop of restProperties) {
          const header = columnForProperty.get(prop.id)
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
                if (!file) {
                  values[prop.id] = ''
                } else {
                  const uploaded = await api.uploadMedya(file).catch(() => null)
                  const path = uploaded ? `/medya/${uploaded.filename}` : ''
                  uploadedPaths.set(key, path)
                  values[prop.id] = path
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
        setProgress(i + 1)
      }

      await api.bulkAddRows(boardId, rowsToInsert)
      await selectBoardIfNone(boardId)
      setDoneBoardId(boardId)
    } catch (err) {
      if (createdBoardId) await deleteBoard(createdBoardId).catch(() => {})
      setError(err instanceof Error ? err.message : 'İçe aktarım sırasında bir hata oluştu.')
    } finally {
      setImporting(false)
    }
  }

  const inputClass =
    'w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm'

  if (doneBoardId) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-emerald-600/10 border border-emerald-600/30 rounded-xl p-6 text-center">
          <p className="text-emerald-400 font-medium">{rawRows.length} kayıt yeni bir arşive aktarıldı 🎉</p>
          <Link
            to={`/board/${doneBoardId}`}
            style={primaryButtonStyle}
            className={`inline-block mt-4 text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}
          >
            Arşivi Aç
          </Link>
        </div>
      </div>
    )
  }

  function resetImport() {
    setRawRows([])
    setPlans([])
    setTitleHeader('')
    setImageFiles(new Map())
    setSkipImages(false)
    setError('')
  }

  const templateOptions = templateBase ? [templateBase.title, ...templateBase.rest] : []

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold text-neutral-50 mb-2 flex items-center gap-2">
        İçe Aktar
        <HelpHint>
          <p className="mb-2">
            Bu bir Notion export'u (Notion'ın sağ üstündeki <strong>"..."</strong> menüsünden{' '}
            <strong>Export → CSV</strong>) olabilir, ya da başka bir yerden gelen herhangi bir CSV dosyası — hangisi
            olursa olsun, dosyayı aşağıdan seçince sütunları kendisi tanır, sen istersen düzeltirsin.
          </p>
          <p className="mb-2">
            Notion zip'inin içinde birbirine çok benzeyen iki CSV olabilir (ör. "Database ...csv" ve
            "Database ..._all.csv") — aynı veri, sadece birini seç (emin değilsen "_all" ile bitenini tercih et).
          </p>
          <p>
            Görseller aynı klasörde ayrı dosyalar hâlinde durur, onları aşağıda ayrıca seçeceksin — hepsini (CSV +
            görseller) tek seferde tamamla, yarım bırakıp tekrar basarsan ikinci bir kopya arşiv oluşur.
          </p>
        </HelpHint>
      </h1>
      <p className="text-sm text-neutral-500 mb-6">
        Bir CSV dosyasından (Notion'dan ya da başka bir yerden) yeni bir arşiv oluştur.
      </p>

      <div className="flex items-center justify-between gap-2.5 bg-neutral-900 border border-neutral-800 rounded-xl p-4 mb-6">
        <span className="flex items-center gap-1.5 flex-1">
          <span className="font-medium text-neutral-100 text-sm">Medya Arşivi şablonuyla eşleştir</span>
          <HelpHint>
            Yeni arşiv, ARGUS'un vitrin, "Kim İzliyor", İstatistikler, TMDB otomatik doldurma gibi tüm özelliklerinin
            kullandığı tam sütun setiyle (Banner, Poster, Puan, Oyuncular, Yaş Sınırı...) oluşturulur — aynı şablonu
            Ayarlar → Veritabanı → Şablonlar'da da görebilirsin. CSV sütunlarını aşağıda bu sütunlarla eşleştirirsin,
            eşlemediklerin ya da "yeni sütun olarak ekle" dediklerin olduğu gibi eklenir.
          </HelpHint>
        </span>
        <ToggleSwitch checked={useTemplate} onChange={handleToggleTemplate} label="Medya Arşivi şablonuyla eşleştir" />
      </div>

      {rawRows.length === 0 ? (
        <input
          type="file"
          accept=".csv"
          onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])}
          className="block text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-neutral-200"
        />
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">CSV yüklendi.</p>
            <button onClick={resetImport} className="text-sm text-neutral-500 hover:text-neutral-300 underline">
              Vazgeç, farklı dosya seç
            </button>
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Yeni arşivin adı</label>
            <input value={boardName} onChange={(e) => setBoardName(e.target.value)} className={inputClass} />
          </div>

          {!useTemplate && (
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Hangi sütun başlık (kart adı) olsun?</label>
              <Select value={titleHeader} onChange={setTitleHeader} options={plans.map((p) => ({ value: p.header, label: p.header }))} />
            </div>
          )}

          {hasImageColumn && (
            <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4">
              <label className="block text-sm text-amber-300 font-medium mb-1">
                2. Adım (önemli): Görselleri seç
              </label>
              <p className="text-sm text-neutral-400 mb-2">
                Aşağıya tıklayınca açılan pencerede görsellerin olduğu klasöre gir — sadece görseller listelenecek.
                Hepsini seçmek için <strong>Ctrl+A</strong> yap, sonra "Aç"a bas.
              </p>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files) {
                    handleFolder(e.target.files)
                    setSkipImages(false)
                  }
                }}
                className="block text-sm text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-neutral-200"
              />
              {imageFiles.size > 0 ? (
                <p className="text-sm text-emerald-400 mt-2">✓ {imageFiles.size} dosya bulundu, görseller eşleştirilecek.</p>
              ) : (
                <label className="flex items-center gap-2 text-sm text-neutral-400 mt-3 cursor-pointer">
                  <input type="checkbox" checked={skipImages} onChange={(e) => setSkipImages(e.target.checked)} />
                  Görselleri şimdilik atla, sadece verileri aktar (sonra tek tek kayıt düzenleyerek ekleyebilirsin)
                </label>
              )}
            </div>
          )}

          <div>
            {useTemplate ? (
              <>
                <p className="text-sm text-neutral-400 mb-2">
                  {rawRows.length} satır bulundu — {plans.length} sütun tespit edildi. Her sütun için hangi şablon
                  alanına gideceğini seç (adı benzer olanlar otomatik eşlendi), istemediğini "Aktarma" yap.{' '}
                  <span className={templateTitleMapped ? 'text-emerald-400' : 'text-amber-400'}>
                    {templateTitleMapped
                      ? '✓ Başlık (Türkçe Adı) eşlendi.'
                      : `Bir sütunu "${templateBase?.title.name}" alanına eşlemelisin.`}
                  </span>
                </p>
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {plans.map((p) => (
                    <div key={p.header} className="flex items-center gap-2 bg-neutral-800/60 rounded-lg px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={p.include}
                        onChange={(e) => updatePlan(p.header, { include: e.target.checked })}
                      />
                      <span className="text-sm text-neutral-200 flex-1 truncate">{p.header}</span>
                      <Select
                        value={p.mapTo}
                        onChange={(v) => updatePlan(p.header, { mapTo: v })}
                        className="w-[45%] shrink-0"
                        options={[
                          { value: '', label: '— Aktarma —' },
                          { value: '__new__', label: '+ Yeni sütun olarak ekle' },
                          ...templateOptions.map((tp) => ({ value: tp.id, label: tp.name })),
                        ]}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-neutral-400 mb-2">
                  {rawRows.length} satır bulundu — {plans.length} sütun tespit edildi. Tipleri gerekirse düzelt,
                  istemediğin sütunun kutucuğunu kaldır.
                </p>
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {plans.map((p) => (
                    <div key={p.header} className="flex items-center gap-2 bg-neutral-800/60 rounded-lg px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={p.include}
                        disabled={p.header === titleHeader}
                        onChange={(e) => updatePlan(p.header, { include: e.target.checked })}
                      />
                      <span className="text-sm text-neutral-200 flex-1 truncate">{p.header}</span>
                      <Select
                        value={p.type}
                        disabled={p.header === titleHeader}
                        onChange={(v) => updatePlan(p.header, { type: v as PropertyType })}
                        className="w-40 shrink-0"
                        options={TYPES.map((t) => ({ value: t, label: PROPERTY_TYPE_LABELS[t] }))}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {error && <p className="text-rose-400 text-sm">{error}</p>}

          {importing ? (
            <p className="text-sm text-neutral-400">İşleniyor... {progress}/{rawRows.length}</p>
          ) : (
            <div>
              <button
                onClick={handleImport}
                disabled={!canImport || !imagesReady}
                style={primaryButtonStyle}
                className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}
              >
                {rawRows.length} Kaydı İçe Aktar
              </button>
              {!imagesReady && (
                <p className="text-xs text-amber-400 mt-2">
                  Önce yukarıdan görselleri seç ya da "görselleri şimdilik atla" kutucuğunu işaretle.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
