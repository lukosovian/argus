import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useBoards } from '../../hooks/useBoards'
import { useHomeSettings } from '../../hooks/useHomeSettings'
import { useTemplates } from '../../hooks/useTemplates'
import { useToast } from '../../hooks/useToast'
import { builtinMediaTemplate, emptyBoard, instantiateTemplate } from '../../types'
import Import from '../../pages/Import'
import TemplatesPanel from './TemplatesPanel'
import ApiPanel from './ApiPanel'
import DatabaseHelpModal from './DatabaseHelpModal'
import Select from '../Select'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../../lib/theme'

const BLANK = '__blank__'
const BUILTIN = '__builtin__'

// "Veritabanı" sekmesinin içeriği — eskiden Boards.tsx'in tamamıydı, şimdi kendi küçük
// alt-sekmesiyle (Arşivler | Şablonlar | İçe Aktar | API) Ayarlar sayfasının sağ tarafına
// gömülüyor. İçe Aktar artık kendi rotasında (`/aktar`) değil, doğrudan burada — pp menüsündeki
// eski link kaldırıldı. Şablonlar (hazır "Medya Arşivi" sütun setiyle yeni arşiv oluşturma) ve
// API (TMDB anahtarı) sekmeleri, uygulamayı ilk kez açan biri de kolayca anlasın diye eklendi.
export default function ArchivesPanel() {
  const { boards, loading, createBoard, deleteBoard } = useBoards()
  const { templates: customTemplates } = useTemplates()
  const { settings, saveSettings, selectBoardIfNone } = useHomeSettings()
  const { confirm } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'arsivler' | 'sablonlar' | 'ice-aktar' | 'api'>('arsivler')
  const [helpOpen, setHelpOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  // Boş | hazır "Medya Arşivi" şablonu | kullanıcının kendi oluşturduğu şablonlardan biri —
  // eskiden tek bir "şablon kullan" onay kutusuydu, artık Şablonlar sekmesi çoğullaştığı için
  // gerçek bir seçim listesi (bkz. TemplatesPanel.tsx'teki aynı iki kavram: emptyBoard/instantiateTemplate).
  const [templateChoice, setTemplateChoice] = useState<string>(BUILTIN)
  const [busy, setBusy] = useState(false)

  async function handleCreate() {
    if (!name.trim()) return
    setBusy(true)
    let data
    if (templateChoice === BLANK) {
      data = emptyBoard(name.trim())
    } else if (templateChoice === BUILTIN) {
      data = instantiateTemplate(builtinMediaTemplate(), name.trim())
    } else {
      const template = customTemplates.find((t) => t.id === templateChoice)
      data = template ? instantiateTemplate(template, name.trim()) : emptyBoard(name.trim())
    }
    const id = await createBoard(data)
    await selectBoardIfNone(id)
    setBusy(false)
    setCreating(false)
    setName('')
    navigate(`/board/${id}`)
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    const ok = await confirm({
      message: 'Bu arşivi ve içindeki tüm kayıtları silmek istediğine emin misin?',
      confirmLabel: 'Sil',
    })
    if (!ok) return
    await deleteBoard(id)
    // Bu arşiv ana sayfada seçiliyse, ona bağlı sayfalar/vitrin filtresi artık anlamsız — temizle.
    if (settings.boardId === id) {
      await saveSettings({
        ...settings,
        boardId: null,
        sections: [],
        navOrder: [],
        bodyOrder: [],
        showcaseFilter: { propertyId: null, optionIds: [] },
      })
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-neutral-50">Veritabanı</h2>
        <button
          onClick={() => setHelpOpen(true)}
          aria-label="Veritabanı nasıl çalışır"
          className="h-6 w-6 shrink-0 rounded-full border border-neutral-700 text-neutral-500 hover:border-neutral-400 hover:text-neutral-300 text-sm leading-none flex items-center justify-center transition"
        >
          ?
        </button>
      </div>
      {helpOpen && <DatabaseHelpModal onClose={() => setHelpOpen(false)} />}

      <div className="flex items-center gap-2 mb-5 border-b border-neutral-800">
        {(
          [
            ['arsivler', 'Arşivler'],
            ['sablonlar', 'Şablonlar'],
            ['ice-aktar', 'İçe Aktar'],
            ['api', 'API'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`text-sm px-3 py-2 border-b-2 -mb-px transition ${
              tab === key ? 'border-sky-500 text-neutral-50' : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'sablonlar' ? (
        <TemplatesPanel />
      ) : tab === 'ice-aktar' ? (
        <Import />
      ) : tab === 'api' ? (
        <ApiPanel />
      ) : (
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-neutral-50">Arşivler</h2>
            <button
              onClick={() => setCreating((v) => !v)}
              style={primaryButtonStyle}
              className={`text-sm px-3 py-1.5 rounded-lg ${PRIMARY_BUTTON}`}
            >
              + Yeni Arşiv
            </button>
          </div>

          {creating && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
              <label className="block text-xs text-neutral-400 mb-1">Arşivin adı</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="ör. Medya Arşivim, Kitaplarım, Oynadığım Oyunlar..."
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm mb-3"
              />
              <label className="block text-xs text-neutral-400 mb-1">Nasıl başlasın?</label>
              <div className="mb-4">
                <Select
                  value={templateChoice}
                  onChange={setTemplateChoice}
                  options={[
                    { value: BLANK, label: 'Boş arşiv (hiç sütun yok, sıfırdan başla)' },
                    { value: BUILTIN, label: 'Medya Arşivi şablonu (Kategori, Durum, Yönetmen, Tür, Ülke...)' },
                    ...customTemplates.map((t) => ({ value: t.id, label: `${t.name} şablonu` })),
                  ]}
                />
              </div>
              <p className="text-xs text-neutral-600 -mt-2 mb-4">
                Ne seçersen seç, sütunları sonra istediğin gibi ekleyip/kaldırabilir/yeniden adlandırabilirsin. Daha
                fazla şablon (hazır sütun setiyle) için Şablonlar sekmesine bak.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!name.trim() || busy}
                  style={primaryButtonStyle}
                  className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}
                >
                  {busy ? 'Oluşturuluyor...' : 'Oluştur'}
                </button>
                <button onClick={() => setCreating(false)} className="text-neutral-400 hover:text-neutral-200 text-sm px-4 py-2">
                  Vazgeç
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-neutral-500 text-sm">Yükleniyor...</p>
          ) : boards.length === 0 ? (
            <p className="text-neutral-500 text-sm">Henüz bir arşivin yok. Yukarıdan yeni bir tane oluştur.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {boards.map((b) => (
                <Link
                  key={b.id}
                  to={`/board/${b.id}`}
                  className="group bg-neutral-900 border border-neutral-800 hover:border-neutral-600 rounded-xl p-5 transition"
                >
                  <div className="flex items-start justify-between">
                    <p className="text-base font-medium text-neutral-100">{b.name}</p>
                    <button
                      onClick={(e) => handleDelete(e, b.id)}
                      className="text-neutral-600 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100 transition"
                    >
                      Sil
                    </button>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">{b.properties.length} sütun</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
