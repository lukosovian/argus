import { useState } from 'react'
import { BUILTIN_MOODS, makeId, resolveBuiltinMoods, type Board, type Mood, type MoodRowSettings } from '../types'
import PropertyFilterPicker from './PropertyFilterPicker'
import ToggleSwitch from './ToggleSwitch'
import { api } from '../lib/api'
import { useToast } from '../hooks/useToast'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'

// "+ Mod Ekle" düğmesinin ikonu — yuvarlak bir gülen yüz, sağ kenarında (çemberin tam
// üzerinde, dikey ortalanmış) dolu bir "+" rozeti. Kullanıcı önce "artının dik çizgisi
// yuvarlağın çemberinin sağında olsun ortalasın" dedi, sonra "hiç güzel yapamamışsın... büyüt
// biraz" — ilk sürüm 16px'te (h-4 w-4) gözle/gülümsemeyle/rozetle aynı anda çok fazla ince
// detay barındırıyordu, o boyutta hepsi bulanık bir leke gibi görünüyordu. Büyütüldü (h-6 w-6,
// ~1.5x) VE çizgiler kalınlaştırıldı, rozetin içindeki "+" beyaza çevrildi (dolu rengin
// üzerinde daha net okunsun diye) — yüz çemberinin merkezi (11,13) yarıçap 10 olduğu için sağ
// kenar noktası tam (21,13), rozet tam oraya ortalanıyor.
function AddMoodIcon() {
  return (
    <svg viewBox="0 0 28 26" className="h-6 w-6">
      <circle cx="11" cy="13" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="7.5" cy="10.5" r="1.3" fill="currentColor" />
      <circle cx="14.5" cy="10.5" r="1.3" fill="currentColor" />
      <path d="M7 15c1.3 2 3 2.8 4 2.8s2.7-.8 4-2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="21" cy="13" r="6.5" fill="currentColor" />
      <path d="M21 9.8v6.4M17.8 13h6.4" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function moveInArray<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const next = index + dir
  if (index < 0 || next < 0 || next >= arr.length) return arr
  const copy = [...arr]
  ;[copy[index], copy[next]] = [copy[next], copy[index]]
  return copy
}

// Modun görseli her zaman medya/ klasörüne gerçek bir PNG dosyası olarak yüklenir —
// PropertyValueInput'taki ImageValueInput ile aynı yükleme mekanizması, sadece burada
// URL/dosya-adı yazma ya da medya/ klasöründen seçme seçeneği yok, sadece "PNG yükle".
function MoodImageInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)

  async function handleUpload(file: File) {
    setBusy(true)
    try {
      const { filename } = await api.uploadMedya(file)
      onChange(`/medya/${filename}`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Görsel yüklenemedi', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img src={value} alt="" className="h-16 w-16 object-contain rounded-md bg-neutral-900 border border-neutral-700" />
      ) : (
        <div className="h-16 w-16 rounded-md border border-dashed border-neutral-700 flex items-center justify-center text-[10px] text-neutral-600 text-center px-1">
          Görsel yok
        </div>
      )}
      <label className="text-xs text-sky-400 hover:underline cursor-pointer">
        {busy ? 'Yükleniyor...' : value ? 'Değiştir' : 'PNG yükle'}
        <input
          type="file"
          accept="image/png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleUpload(file)
          }}
        />
      </label>
    </div>
  )
}

// "İzlenecekler" havuzundan, kullanıcının kendi tanımladığı modlara (duygu durumlarına) göre
// ana sayfada BİRDEN FAZLA satır gösteren ayar ekranı — her mod kendi satırını oluşturur (bkz.
// MoodRow.tsx), pill/seçici YOK artık; sıralama doğrudan bu listedeki ↑/↓ ile değişir.
export default function MoodRowEditor({
  board,
  settings,
  onChange,
}: {
  board: Board | undefined
  settings: MoodRowSettings
  onChange: (next: MoodRowSettings) => void
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [editingMoodId, setEditingMoodId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [optionIds, setOptionIds] = useState<string[]>([])

  function resetForm() {
    setFormOpen(false)
    setEditingMoodId(null)
    setName('')
    setImage('')
    setPropertyId('')
    setOptionIds([])
  }

  function startAdd() {
    resetForm()
    setFormOpen(true)
  }

  // "Hazır modlarımızdan ekle" — kullanıcı "sildikten sonra da mod ekleye basınca default
  // modlarımızı görelim sadece silineni değil hepsini" dedi: + Mod Ekle her zaman, o an
  // listede OLMAYAN tüm varsayılan modları (isme göre, silinmiş olan dahil) gösterir; birine
  // tıklayınca board'un GÜNCEL "Tür" seçeneklerine göre yeniden çözülüp (bkz. resolveBuiltinMoods
  // — silindiğinden beri arşive yeni türler eklenmiş olabilir) doğrudan eklenir, form hiç
  // açılmaz.
  function quickAddBuiltin(name: string) {
    if (!board) return
    const resolved = resolveBuiltinMoods(board).find((m) => m.name === name)
    if (!resolved) return
    onChange({ ...settings, moods: [...settings.moods, resolved] })
    resetForm()
  }

  function startEdit(mood: Mood) {
    setEditingMoodId(mood.id)
    setName(mood.name)
    setImage(mood.image)
    setPropertyId(mood.propertyId ?? '')
    setOptionIds(mood.optionIds)
    setFormOpen(true)
  }

  function handleSubmit() {
    if (!name.trim() || !image || !propertyId || optionIds.length === 0) return
    if (editingMoodId) {
      onChange({
        ...settings,
        moods: settings.moods.map((m) =>
          m.id === editingMoodId ? { id: editingMoodId, name: name.trim(), image, propertyId, optionIds } : m,
        ),
      })
    } else {
      onChange({
        ...settings,
        moods: [...settings.moods, { id: makeId(), name: name.trim(), image, propertyId, optionIds }],
      })
    }
    resetForm()
  }

  function removeMood(id: string) {
    onChange({ ...settings, moods: settings.moods.filter((m) => m.id !== id) })
  }

  // Silmeden geçici olarak kapatabilme — kullanıcı "açıp kapatabilsin" dedi (ör. uygulamayla
  // gelen 10 varsayılan moddan bazılarını silmeden sadece devre dışı bırakmak için).
  function toggleMoodEnabled(id: string) {
    onChange({
      ...settings,
      moods: settings.moods.map((m) => (m.id === id ? { ...m, enabled: !(m.enabled ?? true) } : m)),
    })
  }

  function moveMood(id: string, dir: -1 | 1) {
    const idx = settings.moods.findIndex((m) => m.id === id)
    onChange({ ...settings, moods: moveInArray(settings.moods, idx, dir) })
  }

  // Listede olmayan (silinmiş dahil) varsayılan modlar — quickAddBuiltin picker'ında gösterilir.
  const existingNames = new Set(settings.moods.map((m) => m.name.toLocaleLowerCase('tr')))
  const availableBuiltins = BUILTIN_MOODS.filter((t) => !existingNames.has(t.name.toLocaleLowerCase('tr')))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-neutral-300">İzlenecek listemden, ruh halime göre bir satır göster</span>
        <ToggleSwitch
          checked={settings.enabled}
          onChange={(v) => onChange({ ...settings, enabled: v })}
          label="Mod satırını göster"
        />
      </div>

      {settings.enabled && !board && <p className="text-xs text-neutral-600 pl-1">Önce yukarıdan bir arşiv seç.</p>}

      {settings.enabled && board && (
        <div className="pl-1 space-y-3">
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Satırın başlığı</label>
            <input
              value={settings.title}
              onChange={(e) => onChange({ ...settings, title: e.target.value })}
              placeholder="ör. Bunları da İzle"
              className="w-full rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-neutral-100 text-sm outline-none focus:border-neutral-500"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-1">Kaçıncı satırda görünsün (1 = en üstte)</label>
            <input
              type="number"
              min={1}
              value={settings.position}
              onChange={(e) => onChange({ ...settings, position: Math.max(1, Number(e.target.value) || 1) })}
              className="w-24 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-neutral-100 text-sm outline-none focus:border-neutral-500"
            />
          </div>

          <div className="flex items-start justify-between gap-3 mb-2">
            <label className="block text-xs text-neutral-400">
              Modlar (hepsi TEK bir satırda yan yana görünür — her modun görseli, o moda uyan bir içeriğin dikey
              kartıyla yan yana durur; içerik 24 saatte bir değişir)
            </label>
            {!formOpen && (
              <button
                onClick={startAdd}
                className="inline-flex items-center gap-1.5 text-sm text-sky-400 hover:text-sky-300 border border-sky-500/30 hover:border-sky-400/60 rounded-lg pl-1.5 pr-3 py-1 shrink-0 transition"
              >
                <AddMoodIcon />
                Mod Ekle
              </button>
            )}
          </div>

          {settings.moods.length > 0 && (
            <div className="space-y-1 mb-2">
              {settings.moods.map((m, i) => {
                const enabled = m.enabled ?? true
                return (
                <div
                  key={m.id}
                  className={`flex items-center gap-1.5 text-xs bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-neutral-300 transition ${
                    enabled ? '' : 'opacity-50'
                  }`}
                >
                  <ToggleSwitch checked={enabled} onChange={() => toggleMoodEnabled(m.id)} label={`${m.name} modunu göster`} />
                  {m.image ? (
                    <img src={m.image} alt="" className="h-6 w-6 object-contain shrink-0" />
                  ) : (
                    <span className="h-6 w-6 shrink-0 rounded bg-neutral-900" />
                  )}
                  <button onClick={() => startEdit(m)} className="flex-1 min-w-0 text-left hover:text-neutral-50 transition">
                    <span className="block truncate">{m.name}</span>
                    {/* Uygulamayla gelen bir mod, o arşivde henüz eşleşen bir tür bulamadığında
                        boş bir filtreyle (optionIds=[]) üretilir — silinmiş/kapatılmış değil,
                        sadece henüz uygun bir filtresi yok. Kullanıcı "sen hepsini getir uygun
                        filtre olmadığı için görünmez falan de" dedi. */}
                    {m.optionIds.length === 0 && (
                      <span className="block text-[10px] text-amber-500/80 truncate">uygun tür bulunamadı, düzenle</span>
                    )}
                  </button>
                  <button
                    onClick={() => startEdit(m)}
                    className="h-6 w-6 flex items-center justify-center rounded text-neutral-500 hover:text-neutral-50 hover:bg-neutral-700 transition"
                    title="Düzenle"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => moveMood(m.id, -1)}
                    disabled={i === 0}
                    className="h-6 w-6 flex items-center justify-center rounded text-neutral-500 hover:text-neutral-50 hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
                    title="Yukarı taşı"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveMood(m.id, 1)}
                    disabled={i === settings.moods.length - 1}
                    className="h-6 w-6 flex items-center justify-center rounded text-neutral-500 hover:text-neutral-50 hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
                    title="Aşağı taşı"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeMood(m.id)}
                    className="h-6 w-6 flex items-center justify-center rounded text-neutral-500 hover:text-rose-400 hover:bg-neutral-700 transition"
                    title="Sil"
                  >
                    ×
                  </button>
                </div>
                )
              })}
            </div>
          )}

          {formOpen && (
            <div className="bg-neutral-800/60 border border-neutral-700 rounded-lg p-3 space-y-3">
              {/* Sadece YENİ mod eklerken (düzenlerken değil) — silinmiş/hiç eklenmemiş
                  varsayılan modlardan birini tek tıkla geri getirir, formu hiç doldurmadan. */}
              {!editingMoodId && availableBuiltins.length > 0 && (
                <div>
                  <label className="block text-[11px] text-neutral-400 mb-1.5">
                    Hazır modlarımızdan ekle (tıklayınca doğrudan eklenir)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableBuiltins.map((tpl) => (
                      <button
                        key={tpl.name}
                        onClick={() => quickAddBuiltin(tpl.name)}
                        className="flex items-center gap-1.5 text-xs bg-neutral-800 border border-neutral-700 hover:border-sky-500/50 rounded-full pl-1 pr-2.5 py-1 text-neutral-300 hover:text-neutral-50 transition"
                      >
                        <img src={tpl.image} alt="" className="h-5 w-5 object-contain rounded-full bg-neutral-900" />
                        {tpl.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-neutral-600 mt-1.5">ya da aşağıdan sıfırdan kendi modunu oluştur</p>
                </div>
              )}
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Modun adı</label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ör. Enerjik"
                  className="w-full rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-neutral-100 text-sm outline-none focus:border-neutral-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Modun görseli (PNG)</label>
                <MoodImageInput value={image} onChange={setImage} />
                {/* Kendi görsel yüklemek istemeyen (ör. bizim ikonlardan birini kendi modunda
                    da kullanmak isteyen — "adam belki aynı görseli kendi modunda da kullanmak
                    ister") için hazır görsellerimiz de burada seçilebiliyor. */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {BUILTIN_MOODS.map((tpl) => (
                    <button
                      key={tpl.name}
                      type="button"
                      onClick={() => setImage(tpl.image)}
                      title={`${tpl.name} görselini kullan`}
                      className={`h-8 w-8 rounded-md p-0.5 border transition ${
                        image === tpl.image ? 'border-sky-400' : 'border-transparent hover:border-neutral-600'
                      }`}
                    >
                      <img src={tpl.image} alt={tpl.name} className="h-full w-full object-contain rounded bg-neutral-900" />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Neye göre filtrelensin</label>
                <PropertyFilterPicker
                  board={board}
                  propertyId={propertyId}
                  optionIds={optionIds}
                  onChange={(pid, opts) => {
                    setPropertyId(pid)
                    setOptionIds(opts)
                  }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={!name.trim() || !image || !propertyId || optionIds.length === 0}
                  style={primaryButtonStyle}
                  className={`text-xs rounded-md px-3 py-1.5 ${PRIMARY_BUTTON}`}
                >
                  {editingMoodId ? 'Kaydet' : 'Ekle'}
                </button>
                <button onClick={resetForm} className="text-xs text-neutral-400 hover:text-neutral-200 px-3 py-1.5">
                  Vazgeç
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
