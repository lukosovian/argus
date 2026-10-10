import { useState } from 'react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import { useBoards } from '../hooks/useBoards'
import { useRows } from '../hooks/useRows'
import { useHomeSettings } from '../hooks/useHomeSettings'
import { makeId, mediaTemplateProperties, titleText, PROPERTY_TYPE_LABELS, type PropertyDef, type PropertyType, type PropertyValue, type Row } from '../types'
import { buildProperty, inferColumnType, isFiveScale, mergeOptionsFromValues, parseCellValue } from '../lib/csvImport'
import { api } from '../lib/api'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import HelpHint from '../components/HelpHint'
import ToggleSwitch from '../components/ToggleSwitch'
import FileDrop from '../components/FileDrop'
import { SettingsTabs } from '../components/settings/SettingsUi'
import Select from '../components/Select'
import { tt, ttx } from '../lib/i18n'
import { COLUMN_NAMES, STATUS_NAMES, isName, nameOf } from '../lib/names'

function normalizeMatchText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLocaleLowerCase('tr')
}

function baseFilename(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(0, idx) : name
}

// Var olan bir arşive SONRADAN toplu görsel eklemek için — kullanıcı "aktarırken görselleri
// aktarmadım ama sonradan görselleri toplu aktarmak istiyorum böyle bi seçeneğim yok onu da
// ekle" dedi. Yeniden bir CSV gerektirmiyor: her görsel dosyasının adı (uzantısız), o arşivdeki
// bir kaydın başlığıyla BİREBİR eşleşirse (normalize edilip karşılaştırılır — büyük/küçük harf,
// Türkçe karakterler önemsiz) o kaydın seçilen görsel sütununa yüklenir.
function ExistingBoardImagesPanel() {
  const { boards } = useBoards()
  const [boardId, setBoardId] = useState('')
  const board = boards.find((b) => b.id === boardId) ?? null
  const { rows, saveRow, reload } = useRows(boardId || undefined)
  const [propertyId, setPropertyId] = useState('')
  const [imageFiles, setImageFiles] = useState<Map<string, File>>(new Map())
  const [overwrite, setOverwrite] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ matched: number; unmatched: string[] } | null>(null)

  const imageProps = board?.properties.filter((p) => p.type === 'image') ?? []

  function handleFolder(fileList: FileList) {
    const map = new Map<string, File>()
    Array.from(fileList).forEach((f) => map.set(f.name, f))
    setImageFiles(map)
    setResult(null)
  }

  async function handleMatch() {
    if (!board || !propertyId || imageFiles.size === 0) return
    const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
    if (!titleProp) return
    setImporting(true)
    setProgress(0)
    const filesByNormName = new Map<string, File>()
    for (const [name, file] of imageFiles) filesByNormName.set(normalizeMatchText(baseFilename(name)), file)
    const usedKeys = new Set<string>()
    let matched = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      setProgress(i + 1)
      const current = row.values[propertyId]
      if (!overwrite && current) continue
      const title = titleText(titleProp, row.values[titleProp.id])
      if (!title) continue
      const key = normalizeMatchText(title)
      const file = filesByNormName.get(key)
      if (!file) continue
      const uploaded = await api.uploadMedya(file).catch(() => null)
      if (!uploaded) continue
      await saveRow({ values: { ...row.values, [propertyId]: `/medya/${uploaded.filename}` }, createdAt: row.createdAt, updatedAt: Date.now() }, row.id)
      usedKeys.add(key)
      matched++
    }

    const unmatched = [...filesByNormName.keys()].filter((k) => !usedKeys.has(k))
    setResult({ matched, unmatched })
    setImporting(false)
    await reload()
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-5">
      <p className="text-sm text-neutral-400">
        {tt('Var olan bir arşivdeki kayıtlara toplu görsel ekler — görsel dosyasının adı (uzantısız), kaydın başlığıyla birebir eşleşirse o kayda yüklenir. Yeni bir CSV\'ye gerek yok, sadece görsel klasörünü seçmen yeterli.')}
      </p>
      <div>
        <label className="block text-xs text-neutral-400 mb-1">{tt('Hangi arşive eklensin')}</label>
        <Select
          value={boardId}
          onChange={(v) => {
            setBoardId(v)
            setPropertyId('')
            setResult(null)
          }}
          options={[{ value: '', label: tt('Seçilmedi') }, ...boards.map((b) => ({ value: b.id, label: b.name }))]}
        />
      </div>
      {board && (
        <div>
          <label className="block text-xs text-neutral-400 mb-1">{tt('Hangi görsel sütununa eklensin')}</label>
          <Select
            value={propertyId}
            onChange={setPropertyId}
            options={[{ value: '', label: tt('Seçilmedi') }, ...imageProps.map((p) => ({ value: p.id, label: p.name }))]}
          />
          {imageProps.length === 0 && <p className="text-xs text-amber-400 mt-1">{tt('Bu arşivde görsel tipinde bir sütun yok.')}</p>}
        </div>
      )}
      {board && propertyId && (
        <>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">{tt('Görsel klasörünü seç')}</label>
            <FileDrop
              accept="image/*"
              multiple
              title={tt('Görselleri seç ya da buraya sürükle')}
              hint={tt('Klasördeki görsellerin hepsini seçmek için Ctrl+A')}
              onFiles={(files) => handleFolder(files)}
            />
            {imageFiles.size > 0 && <p className="text-sm text-emerald-400 mt-2">{ttx('✓ {0} dosya bulundu.', imageFiles.size)}</p>}
            <p className="text-xs text-neutral-600 mt-1">
              {tt('Ör. "Breaking Bad.jpg" adlı dosya, başlığı "Breaking Bad" olan kayda eşleşir.')}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-400 cursor-pointer">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            {tt('Zaten görseli olan kayıtların üzerine de yaz')}
          </label>
          {importing ? (
            <p className="text-sm text-neutral-400">
              {ttx('Eşleştiriliyor... {0}/{1}', progress, rows.length)}
            </p>
          ) : (
            <button
              onClick={handleMatch}
              disabled={imageFiles.size === 0}
              style={primaryButtonStyle}
              className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}
            >
              {tt('Eşleştir ve Yükle')}
            </button>
          )}
          {result && (
            <div className="text-sm">
              <p className="text-emerald-400">{ttx('{0} kayda görsel eklendi.', result.matched)}</p>
              {result.unmatched.length > 0 && (
                <p className="text-amber-400 mt-1">
                  {ttx('{0} dosya hiçbir kayıtla eşleşmedi (dosya adı ile başlık birebir uyuşmuyor olabilir).', result.unmatched.length)}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface ColumnPlan {
  header: string
  include: boolean
  type: PropertyType
  // Şablon modunda: hangi şablon sütununa eşleniyor. '__new__' = yeni sütun olarak eklensin
  // (eski davranış, `type` alanı kullanılır), '' = henüz eşlenmemiş.
  mapTo: string
}

const TYPES: PropertyType[] = ['text', 'number', 'select', 'multiselect', 'checkbox', 'date', 'multidate', 'url', 'image']

type TemplateBase = ReturnType<typeof mediaTemplateProperties>

// Film / Dizi gibi "ne tür yapım" değerleri (ARGUS'ta Kategori) — türlerden (Dram, Aksiyon… → Tür) ayırmak için
const KIND_WORDS = new Set(['film', 'dizi', 'mini dizi', 'anime', 'belgesel', 'kısa film', 'yarışma', 'gösteri', 'reality show', 'movie', 'series', 'tv series', 'tv show', 'show', 'documentary', 'miniseries', 'mini series', 'short', 'short film', 'animasyon film', 'program'])
function looksLikeKinds(values: string[]) {
  const nonEmpty = values.map((v) => v.trim().toLocaleLowerCase('tr')).filter(Boolean)
  if (!nonEmpty.length || nonEmpty.some((v) => v.includes(','))) return false
  return nonEmpty.filter((v) => KIND_WORDS.has(v)).length / nonEmpty.length >= 0.7
}
function commaShare(values: string[]) {
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean)
  return nonEmpty.length ? nonEmpty.filter((v) => v.includes(',')).length / nonEmpty.length : 0
}

// CSV sütununu şablonun alanlarından birine eşlemeye çalışır — önce adına (Türkçe/İngilizce, Notion'da sık
// kullanılan adlar), belirsizse içeriğine bakarak. Yeni bir kullanıcının Notion listesiyle yapılan denemede
// "Kategoriler" (Dram, Bilim Kurgu…) sütunu ARGUS'un "Kategori"sine (Film/Dizi) gidiyor, "Yıl" kayboluyor,
// "Oluşturulma Zamanı" gereksiz yere aktarılıyordu. Tahmin tutmazsa kullanıcı listeden değiştirir.
function guessMapTo(header: string, values: string[], template: TemplateBase): string {
  const h = header.trim().toLocaleLowerCase('tr')
  const all = [template.title, ...template.rest]
  // Şablon sütunları seçili dilde açılıyor (bkz. lib/names.ts) — adla değil görev anahtarıyla bulunur
  const byName = (k: keyof typeof COLUMN_NAMES) => all.find((p) => isName(p.name, COLUMN_NAMES[k]))?.id
  const exact = all.find((p) => p.name.trim().toLocaleLowerCase('tr') === h)
  const kinds = looksLikeKinds(values)
  if (exact) {
    // "Kategori" adlı sütunda türler yazıyorsa Tür'e, "Tür" adlı sütunda Film/Dizi yazıyorsa Kategori'ye
    if (isName(exact.name, COLUMN_NAMES.kategori) && !kinds && commaShare(values) > 0) return byName('tur') ?? exact.id
    if (isName(exact.name, COLUMN_NAMES.tur) && kinds) return byName('kategori') ?? exact.id
    return exact.id
  }
  const rules: [RegExp, keyof typeof COLUMN_NAMES | (() => string | undefined)][] = [
    [/oluşturul|olusturul|created|last edited|düzenlenme|son düzenleme/, () => ''],
    [/orijinal|orjinal|original/, 'orjinalAdi'],
    [/^(başlık|baslik|ad|adı|isim|name|title|film adı|dizi adı|yapım adı|türkçe ad)/, 'baslik'],
    [/durum|status/, 'durum'],
    [/puan|rating|score|yıldız|yildiz|değerlendirme/, 'puan'],
    [/izledi|izleme tarihi|izlenme|watched|watch date/, 'izlemeTarihi'],
    [/vizyon|^yıl$|^yil$|year|çıkış|cikis|release/, 'vizyon'],
    [/yönetmen|yonetmen|director|yaratıcı|creator/, 'yonetmen'],
    [/oyuncu|cast|actor|başrol/, 'oyuncular'],
    [/ülke|ulke|country/, 'ulke'],
    [/süre|sure|runtime|duration|dakika|minutes/, 'sure'],
    [/özet|ozet|sinopsis|synopsis|overview|konu|summary|plot/, 'sinopsis'],
    [/fragman|trailer|video/, 'video'],
    [/tür|genre|kategoriler|categories/, () => byName(kinds ? 'kategori' : 'tur')],
    [/^tip$|^type$|kategori|category|film\s*\/\s*dizi|biçim/,() => byName(kinds || commaShare(values) === 0 ? 'kategori' : 'tur')],
  ]
  for (const [re, target] of rules) {
    if (!re.test(h)) continue
    const id = typeof target === 'string' ? byName(target) : target()
    if (id !== undefined) return id
  }
  const partial = all.find((p) => {
    const n = p.name.trim().toLocaleLowerCase('tr')
    return n.length > 2 && (h.includes(n) || n.includes(h))
  })
  return partial?.id ?? '__new__'
}

// Aynı şablon alanına iki sütun eşlenmesin — ilki kalır, sonrakiler yeni sütun olur
function dedupePlans(plans: ColumnPlan[]): ColumnPlan[] {
  const used = new Set<string>()
  return plans.map((p) => {
    if (!p.mapTo || p.mapTo === '__new__') return p
    if (used.has(p.mapTo)) return { ...p, mapTo: '__new__' }
    used.add(p.mapTo)
    return p
  })
}

// Şablon alanlarının yanında ne işe yaradıkları (eşleştirme listesinde)
// (Şablon seçili dilde açıldığı için sütun adıyla değil görev anahtarıyla eşlenir)
const FIELD_HINT_KEYS: Partial<Record<keyof typeof COLUMN_NAMES, string>> = {
  baslik: tt('kaydın adı'),
  orjinalAdi: tt('TMDB aramasında kullanılır'),
  durum: tt('İzlendi / İzlenecek / İzleniyor / Yarım'),
  kategori: tt('Film / Dizi / Mini Dizi…'),
  tur: tt('Dram, Aksiyon, Komedi…'),
  puan: tt('10 üzerinden — ⭐ yıldızlar, 8/10 çevrilir'),
  vizyon: tt('çıkış tarihi ya da yılı'),
  izlemeTarihi: tt('ne zaman izlediğin (aralık olabilir)'),
  ulke: tt('yapım ülkesi'),
  sure: tt('dakika'),
}
const FIELD_HINTS = new Proxy({} as Record<string, string | undefined>, {
  get: (_, name: string) => {
    const key = (Object.keys(COLUMN_NAMES) as (keyof typeof COLUMN_NAMES)[]).find((k) => isName(name, COLUMN_NAMES[k]))
    return key ? FIELD_HINT_KEYS[key] : undefined
  },
})

// Notion'daki durum adlarını ARGUS'un durumlarına çevirme tahmini
// Seçili dildeki Durum seçenekleri (şablon da bu dilde açılıyor)
const statusTargets = () => [nameOf(STATUS_NAMES.izlendi), nameOf(STATUS_NAMES.izleniyor), nameOf(STATUS_NAMES.yarim), nameOf(STATUS_NAMES.izlenecek)]
function guessStatus(value: string): string {
  const v = value.toLocaleLowerCase('tr')
  if (/bitti|izlendi|izledim|watched|done|complete|tamam|seen|finished/.test(v)) return nameOf(STATUS_NAMES.izlendi)
  if (/izliyorum|izleniyor|watching|devam|in progress|ongoing|current/.test(v)) return nameOf(STATUS_NAMES.izleniyor)
  if (/bıraktım|biraktim|yarım|yarim|dropped|hold|beklemede|abandon|yarıda/.test(v)) return nameOf(STATUS_NAMES.yarim)
  if (/listemde|izlenecek|izleyeceğim|plan|to watch|want|istek|sırada|sirada|watchlist|not started|başlanmadı/.test(v)) return nameOf(STATUS_NAMES.izlenecek)
  return '__keep__'
}

// Notion dosya adlarının sonundaki kimlik ("Film ve Dizilerim 3f2a9c1e…", "…_all")
function cleanBoardName(name: string) {
  return name
    .replace(/\.csv$/i, '')
    .replace(/_all$/i, '')
    .replace(/\s+[0-9a-f]{8,32}$/i, '')
    .trim()
}

export default function Import() {
  const { createBoard, deleteBoard } = useBoards()
  const { selectBoardIfNone } = useHomeSettings()

  const [mode, setMode] = useState<'yeni' | 'gorsel'>('yeni')
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [plans, setPlans] = useState<ColumnPlan[]>([])
  const [titleHeader, setTitleHeader] = useState('')
  const [boardName, setBoardName] = useState(tt('İçe Aktarım'))
  const [imageFiles, setImageFiles] = useState<Map<string, File>>(new Map())
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [doneBoardId, setDoneBoardId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [skipImages, setSkipImages] = useState(false)

  // "Medya Arşivi" şablonuyla içe aktar — ARGUS'un kullandığı TÜM sütunlarla (Banner/Poster/
  // KAPAK ADI/Puan/Oyuncular vb.) hazır bir arşiv oluşturur, CSV sütunlarını bunlarla eşleştirirsin.
  // `templateBase` sabit id'ler üretsin diye sadece bir kere (şablon ilk açıldığında) kuruluyor.
  // Varsayılan açık: kapalıyken vitrin, istatistik, takvim, TMDB gibi özellikler sütunları tanımıyor (yeni kullanıcı
  // denemesinde anahtarın kapalı gelmesi en çok sorun çıkaran şeylerdendi).
  const [useTemplate, setUseTemplate] = useState(true)
  // Durum sütunundaki her değerin ARGUS'taki karşılığı ('__keep__' = kendi adıyla kalsın)
  const [statusMap, setStatusMap] = useState<Record<string, string>>({})
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
    setPlans((prev) => dedupePlans(prev.map((p) => (p.mapTo ? p : { ...p, mapTo: guessMapTo(p.header, rawRows.map((r) => r[p.header] ?? ''), t) }))))
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
        const inferredPlans: ColumnPlan[] = dedupePlans(
          hs.map((h) => {
            const vals = data.map((r) => r[h] ?? '')
            const mapTo = t ? guessMapTo(h, vals, t) : ''
            return { header: h, include: mapTo !== '', type: inferColumnType(h, vals), mapTo }
          }),
        )
        setPlans(inferredPlans)
        setStatusMap({})
        const guessTitle =
          hs.find((h) => /ad[ıi]|isim|^name$|başlık/i.test(h)) ?? hs.find((_h, i) => inferredPlans[i].type === 'text') ?? hs[0]
        setTitleHeader(guessTitle ?? '')
        setBoardName(cleanBoardName(file.name) || tt('İçe Aktarım'))
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

  // Durum alanına eşlenen sütunun farklı değerleri ve (tahminle doldurulmuş) karşılıkları
  const statusProp = templateBase?.rest.find((p) => isName(p.name, COLUMN_NAMES.durum))
  const statusPlan = useTemplate && statusProp ? plans.find((p) => p.include && p.mapTo === statusProp.id) : undefined
  const statusValues = statusPlan
    ? [...new Map(rawRows.map((r) => (r[statusPlan.header] ?? '').trim()).filter(Boolean).map((v) => [v, 0])).keys()].map((v) => ({
        value: v,
        count: rawRows.filter((r) => (r[statusPlan.header] ?? '').trim() === v).length,
        target: statusMap[v] ?? (statusTargets().includes(v) ? v : guessStatus(v)),
      }))
    : []

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
      const parseCtx = new Map<string, Parameters<typeof parseCellValue>[2]>()
      // Durum değerlerinin karşılıkları ("Bitti" → "İzlendi"); "kendi adıyla kalsın" olanlar olduğu gibi
      const statusRename = new Map(statusValues.filter((s) => s.target !== '__keep__').map((s) => [s.value, s.target]))

      if (useTemplate && templateBase) {
        const titlePlan = included.find((p) => p.mapTo === templateBase.title.id)
        if (!titlePlan) throw new Error(tt('Bir CSV sütununu "{0}" alanına eşlemelisin.', templateBase.title.name))
        titleProperty = templateBase.title
        columnForProperty.set(titleProperty.id, titlePlan.header)

        // Şablonun BÜTÜN alanları oluşturulur (eşlenmeyenler boş) — "tam sütun seti" açıklaması böyle; Poster,
        // Banner, Sinopsis… baştan olunca Genel Güncelleme ilk seferde bütün kayıtları doldurur, ana sayfa
        // kartlarının görseli (Banner) de hazır olur.
        restProperties = []
        for (const templateProp of templateBase.rest) {
          const p = included.find((x) => x.mapTo === templateProp.id)
          if (!p) {
            restProperties.push(templateProp)
            continue
          }
          const rename = templateProp.id === statusProp?.id ? statusRename : undefined
          const merged = mergeOptionsFromValues(templateProp, columnValues(p.header), rename)
          restProperties.push(merged)
          columnForProperty.set(merged.id, p.header)
          parseCtx.set(merged.id, {
            rename,
            fiveScale: merged.type === 'rating' ? isFiveScale(columnValues(p.header)) : false,
            yearOnly: merged.name === 'Vizyon Tarihi',
          })
        }
        for (const p of included) {
          if (p.mapTo !== '__new__') continue
          const prop = buildProperty(p.header, p.type, columnValues(p.header))
          restProperties.push(prop)
          columnForProperty.set(prop.id, p.header)
        }
      } else {
        const titlePlan = included.find((p) => p.header === titleHeader)
        if (!titlePlan) throw new Error(tt('Başlık (ad) sütunu seçmelisin.'))
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
        name: boardName.trim() || tt('Notion İçe Aktarımı'),
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
            values[prop.id] = parseCellValue(prop, raw[header] ?? '', parseCtx.get(prop.id))
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
      setError(err instanceof Error ? err.message : tt('İçe aktarım sırasında bir hata oluştu.'))
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
          <p className="text-emerald-400 font-medium">{ttx('{0} kayıt yeni bir arşive aktarıldı 🎉', rawRows.length)}</p>
          <p className="text-sm text-neutral-400 mt-3 max-w-md mx-auto">
            {tt('Sırada: arşivi açıp üstteki')}{' '}<span className="text-neutral-200">{tt('Genel Güncelleme')}</span>{' '}{tt('ile eksikleri TMDB\'den doldur. Önerimiz bütün alanların gelmesi — posterler, logolar, fragmanlar ve oyuncularla ARGUS hem daha iyi çalışır hem çok daha güzel görünür. Tablonda olmayan bir sütun varsa (ör. Kapak Adı) doldurmadan önce sana sorulur.')}
          </p>
          <Link
            to={`/board/${doneBoardId}`}
            style={primaryButtonStyle}
            className={`inline-block mt-4 text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}
          >
            {tt('Arşivi Aç')}
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
        {tt('İçe Aktar')}
        <HelpHint>
          <p className="mb-2">
            {tt('Bu bir Notion export\'u (Notion\'ın sağ üstündeki')}{' '}<strong>"..."</strong>{' '}{tt('menüsünden')}{' '}
            <strong>{tt('Export → CSV')}</strong>{tt(') olabilir, ya da başka bir yerden gelen herhangi bir CSV dosyası — hangisi olursa olsun, dosyayı aşağıdan seçince sütunları kendisi tanır, sen istersen düzeltirsin.')}
          </p>
          <p className="mb-2">
            {tt('Notion zip\'inin içinde birbirine çok benzeyen iki CSV olabilir (ör. "Database ...csv" ve "Database ..._all.csv") — aynı veri, sadece birini seç (emin değilsen "_all" ile bitenini tercih et).')}
          </p>
          <p>
            {tt('Görseller aynı klasörde ayrı dosyalar hâlinde durur, onları aşağıda ayrıca seçeceksin — hepsini (CSV + görseller) tek seferde tamamla, yarım bırakıp tekrar basarsan ikinci bir kopya arşiv oluşur.')}
          </p>
        </HelpHint>
      </h1>
      <p className="text-sm text-neutral-500 mb-6">
        {tt('Bir CSV dosyasından (Notion\'dan ya da başka bir yerden) yeni bir arşiv oluştur, ya da var olan bir arşive sonradan toplu görsel ekle.')}
      </p>

      <SettingsTabs
        value={mode}
        onChange={setMode}
        tabs={
          [
            ['yeni', tt('Yeni Arşiv')],
            ['gorsel', tt('Var Olan Arşive Görsel Ekle')],
          ] as const
        }
      />

      {mode === 'gorsel' ? (
        <ExistingBoardImagesPanel />
      ) : (
        <>
      <div className="flex items-center justify-between gap-2.5 bg-neutral-900 border border-neutral-800 rounded-xl p-4 mb-6">
        <span className="flex items-center gap-1.5 flex-1">
          <span className="font-medium text-neutral-100 text-sm">{tt('Medya Arşivi şablonuyla eşleştir')}</span>
          <HelpHint>
            {tt('Yeni arşiv, ARGUS\'un vitrin, "Kim İzliyor", İstatistikler, TMDB otomatik doldurma gibi tüm özelliklerinin kullandığı tam sütun setiyle (Banner, Poster, Puan, Oyuncular, Yaş Sınırı...) oluşturulur — aynı şablonu Ayarlar → Veritabanı → Şablonlar\'da da görebilirsin. CSV sütunlarını aşağıda bu sütunlarla eşleştirirsin, eşlemediklerin ya da "yeni sütun olarak ekle" dediklerin olduğu gibi eklenir.')}
          </HelpHint>
        </span>
        <ToggleSwitch checked={useTemplate} onChange={handleToggleTemplate} label={tt('Medya Arşivi şablonuyla eşleştir')} />
      </div>

      {rawRows.length === 0 ? (
        <FileDrop
          accept=".csv"
          title={tt('CSV dosyasını seç ya da buraya sürükle')}
          hint={tt('Notion\'dan, Excel\'den ya da başka bir yerden dışa aktardığın .csv dosyası')}
          onFiles={(files) => handleCsv(files[0])}
        />
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">{tt('CSV yüklendi.')}</p>
            <button onClick={resetImport} className="text-sm text-neutral-500 hover:text-neutral-300 underline">
              {tt('Vazgeç, farklı dosya seç')}
            </button>
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">{tt('Yeni arşivin adı')}</label>
            <input value={boardName} onChange={(e) => setBoardName(e.target.value)} className={inputClass} />
          </div>

          {!useTemplate && (
            <div>
              <label className="block text-xs text-neutral-400 mb-1">{tt('Hangi sütun başlık (kart adı) olsun?')}</label>
              <Select value={titleHeader} onChange={setTitleHeader} options={plans.map((p) => ({ value: p.header, label: p.header }))} />
            </div>
          )}

          {hasImageColumn && (
            <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4">
              <label className="block text-sm text-amber-300 font-medium mb-1">
                {tt('2. Adım (önemli): Görselleri seç')}
              </label>
              <p className="text-sm text-neutral-400 mb-2">
                {tt('Aşağıya tıklayınca açılan pencerede görsellerin olduğu klasöre gir — sadece görseller listelenecek. Hepsini seçmek için')}{' '}<strong>{tt('Ctrl+A')}</strong>{' '}{tt('yap, sonra "Aç"a bas.')}
              </p>
              <FileDrop
                accept="image/*"
                multiple
                title={tt('Görselleri seç ya da buraya sürükle')}
                hint={tt('Klasördeki görsellerin hepsini seçmek için Ctrl+A')}
                onFiles={(files) => {
                  handleFolder(files)
                  setSkipImages(false)
                }}
              />
              {imageFiles.size > 0 ? (
                <p className="text-sm text-emerald-400 mt-2">{ttx('✓ {0} dosya bulundu, görseller eşleştirilecek.', imageFiles.size)}</p>
              ) : (
                <label className="flex items-center gap-2 text-sm text-neutral-400 mt-3 cursor-pointer">
                  <input type="checkbox" checked={skipImages} onChange={(e) => setSkipImages(e.target.checked)} />
                  {tt('Görselleri şimdilik atla, sadece verileri aktar (sonra tek tek kayıt düzenleyerek ekleyebilirsin)')}
                </label>
              )}
            </div>
          )}

          <div>
            {useTemplate ? (
              <>
                <p className="text-sm text-neutral-400 mb-2">
                  {ttx('{0} satır bulundu — {1} sütun tespit edildi. Her sütun için hangi şablon alanına gideceğini seç (adı benzer olanlar otomatik eşlendi), istemediğini "Aktarma" yap.', rawRows.length, plans.length)}{' '}
                  <span className={templateTitleMapped ? 'text-emerald-400' : 'text-amber-400'}>
                    {templateTitleMapped
                      ? tt('✓ Başlık (Türkçe Adı) eşlendi.')
                      : tt('Bir sütunu "{0}" alanına eşlemelisin.', templateBase?.title.name)}
                  </span>
                </p>
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {plans.map((p) => {
                    const target = templateOptions.find((tp) => tp.id === p.mapTo)
                    const vals = rawRows.map((r) => r[p.header] ?? '')
                    const sample = vals.map((v) => v.trim()).filter(Boolean).slice(0, 2).join(' · ')
                    const warn =
                      p.include && isName(target?.name, COLUMN_NAMES.kategori) && commaShare(vals) > 0
                        ? tt('Bu sütunda virgüllü değerler (türler?) var — Kategori sadece Film / Dizi gibi yapım türü içindir, türler "Tür" alanına gitmeli.')
                        : p.include && isName(target?.name, COLUMN_NAMES.tur) && looksLikeKinds(vals)
                          ? tt('Bu sütunda Film / Dizi gibi değerler var — bunlar "Kategori" alanına gitmeli.')
                          : ''
                    return (
                      <div key={p.header} className="bg-neutral-800/60 rounded-lg px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={p.include}
                            onChange={(e) => updatePlan(p.header, { include: e.target.checked, mapTo: e.target.checked && !p.mapTo ? '__new__' : p.mapTo })}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-neutral-200 truncate">{p.header}</span>
                            {sample && <span className="block text-[11px] text-neutral-500 truncate">{ttx('ör. {0}', sample)}</span>}
                          </span>
                          <Select
                            value={p.include ? p.mapTo : ''}
                            onChange={(v) => updatePlan(p.header, { mapTo: v, include: v !== '' })}
                            className="w-[48%] shrink-0"
                            options={[
                              { value: '', label: tt('— Aktarma —') },
                              { value: '__new__', label: tt('+ Yeni sütun olarak ekle') },
                              ...templateOptions.map((tp) => ({ value: tp.id, label: FIELD_HINTS[tp.name] ? `${tp.name} (${FIELD_HINTS[tp.name]})` : tp.name })),
                            ]}
                          />
                        </div>
                        {warn && <p className="text-[11px] text-amber-400 mt-1 pl-6">{warn}</p>}
                      </div>
                    )
                  })}
                </div>
                {statusValues.length > 0 && (
                  <div className="mt-4 rounded-lg border border-neutral-800 p-3">
                    <p className="text-sm text-neutral-200">{ttx('"{0}" değerleri ARGUS\'ta ne anlama geliyor?', statusPlan?.header)}</p>
                    <p className="text-xs text-neutral-500 mt-0.5 mb-2">
                      {tt('İstatistikler, Ne İzlesem, Takvim ve Koleksiyon bir yapımı izleyip izlemediğini bu durumlara bakarak anlar. "Kendi adıyla kalsın" dersen etiket olarak durur ama izlendi / izlenecek sayılmaz.')}
                    </p>
                    <div className="space-y-1.5">
                      {statusValues.map((sv) => (
                        <div key={sv.value} className="flex items-center gap-2">
                          <span className="flex-1 min-w-0 truncate text-sm text-neutral-300">
                            {sv.value} <span className="text-neutral-600 text-xs">({sv.count})</span>
                          </span>
                          <span className="text-neutral-600 text-xs">→</span>
                          <Select
                            value={sv.target}
                            onChange={(v) => setStatusMap((m) => ({ ...m, [sv.value]: v }))}
                            className="w-[48%] shrink-0"
                            options={[
                              ...statusTargets().map((t) => ({ value: t, label: t })),
                              { value: '__keep__', label: tt('Kendi adıyla kalsın ("{0}")', sv.value) },
                            ]}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-neutral-400 mb-2">
                  {ttx('{0} satır bulundu — {1} sütun tespit edildi. Tipleri gerekirse düzelt, istemediğin sütunun kutucuğunu kaldır.', rawRows.length, plans.length)}
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
            <p className="text-sm text-neutral-400">{ttx('İşleniyor... {0}/{1}', progress, rawRows.length)}</p>
          ) : (
            <div>
              <button
                onClick={handleImport}
                disabled={!canImport || !imagesReady}
                style={primaryButtonStyle}
                className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}
              >
                {ttx('{0} Kaydı İçe Aktar', rawRows.length)}
              </button>
              {!imagesReady && (
                <p className="text-xs text-amber-400 mt-2">
                  {tt('Önce yukarıdan görselleri seç ya da "görselleri şimdilik atla" kutucuğunu işaretle.')}
                </p>
              )}
            </div>
          )}
        </div>
      )}
        </>
      )}
    </div>
  )
}
