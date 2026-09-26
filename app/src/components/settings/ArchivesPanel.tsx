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
import { PanelHeader, SettingsTabs } from './SettingsUi'

function ArchiveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  )
}

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
      <PanelHeader
        title="Veritabanı"
        description="Arşivlerin, hazır sütun şablonların, içe aktarma ve TMDB bağlantısı."
        extra={
          <button
            onClick={() => setHelpOpen(true)}
            aria-label="Veritabanı nasıl çalışır"
            className="h-6 w-6 shrink-0 rounded-full border border-neutral-700 text-neutral-500 hover:border-neutral-400 hover:text-neutral-300 text-sm leading-none flex items-center justify-center transition"
          >
            ?
          </button>
        }
      />
      {helpOpen && <DatabaseHelpModal onClose={() => setHelpOpen(false)} />}

      <SettingsTabs
        value={tab}
        onChange={setTab}
        tabs={
          [
            ['arsivler', 'Arşivler'],
            ['sablonlar', 'Şablonlar'],
            ['ice-aktar', 'İçe Aktar'],
            ['api', 'API'],
          ] as const
        }
      />

      {tab === 'sablonlar' ? (
        <TemplatesPanel />
      ) : tab === 'ice-aktar' ? (
        <Import />
      ) : tab === 'api' ? (
        <ApiPanel />
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-neutral-400">Bir arşive tıklayınca tablosu açılır.</p>
            <button
              onClick={() => setCreating((v) => !v)}
              style={primaryButtonStyle}
              className={`text-sm px-3 py-1.5 rounded-lg ${PRIMARY_BUTTON}`}
            >
              + Yeni Arşiv
            </button>
          </div>

          {creating && (
            <div className="bg-neutral-900/70 border border-[#00c0fa]/30 rounded-2xl p-5 mb-6">
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
                Ne seçersen seç, sütunları sonra istediğin gibi ekleyip/kaldırabilir/yeniden adlandırabilirsin. Daha fazla şablon (hazır
                sütun setiyle) için Şablonlar sekmesine bak.
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
              {boards.map((b) => {
                const onHome = settings.boardId === b.id
                return (
                  <Link
                    key={b.id}
                    to={`/board/${b.id}`}
                    className="group flex items-center gap-4 bg-neutral-900/70 border border-neutral-800 hover:border-[#00c0fa]/40 rounded-2xl p-4 transition"
                  >
                    <span className="h-11 w-11 shrink-0 rounded-xl bg-[#00c0fa]/10 text-[#00c0fa] flex items-center justify-center">
                      <ArchiveIcon />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-base font-medium text-neutral-100 truncate">{b.name}</span>
                        {onHome && (
                          <span className="shrink-0 text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/25 rounded-full px-2 py-0.5">
                            Ana sayfada
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-neutral-500 mt-0.5">{b.properties.length} sütun</span>
                    </span>
                    <button
                      onClick={(e) => handleDelete(e, b.id)}
                      className="text-neutral-600 hover:text-rose-400 text-xs opacity-0 group-hover:opacity-100 transition shrink-0"
                    >
                      Sil
                    </button>
                    <span className="text-neutral-600 group-hover:text-[#00c0fa] transition shrink-0">→</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
