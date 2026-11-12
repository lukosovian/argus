import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBoards } from '../../hooks/useBoards'
import { useHomeSettings } from '../../hooks/useHomeSettings'
import { useTemplates } from '../../hooks/useTemplates'
import { useToast } from '../../hooks/useToast'
import { builtinMediaTemplate, emptyBoard, instantiateTemplate } from '../../types'
import Import from '../../pages/Import'
import TemplatesPanel from './TemplatesPanel'
import ApiPanel from './ApiPanel'
import BackupPanel from './BackupPanel'
import { MOBILE } from '../../lib/mobile/ui'
import DatabaseHelpModal from './DatabaseHelpModal'
import Select from '../Select'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../../lib/theme'
import { PanelHeader, SettingsTabs } from './SettingsUi'
import { tt } from '../../lib/i18n'
import EmptyState from '../EmptyState'
import { LineSkeleton } from '../Skeleton'
import ArchiveCard from './ArchiveCard'

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
  // Ayar aramasından gelince (?alt=yedek gibi) doğrudan o alt sekme açılır
  const [tab, setTab] = useState<'arsivler' | 'sablonlar' | 'ice-aktar' | 'api' | 'yedek'>(() => {
    const a = new URLSearchParams(window.location.search).get('alt')
    return a === 'sablonlar' || a === 'ice-aktar' || a === 'api' || a === 'yedek' ? a : 'arsivler'
  })
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
      message: tt('Bu arşivi ve içindeki tüm kayıtları silmek istediğine emin misin?'),
      confirmLabel: tt('Sil'),
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
        title={tt('Veritabanı')}
        description={tt('Arşivlerin, hazır sütun şablonların, içe aktarma ve TMDB bağlantısı.')}
        extra={
          <button
            onClick={() => setHelpOpen(true)}
            aria-label={tt('Veritabanı nasıl çalışır')}
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
          // İçe aktarma ve yedekleme PC'deki dosyalarla çalışıyor — telefonda gösterilmez
          (
            [
              ['arsivler', tt('Arşivler')],
              ['sablonlar', tt('Şablonlar')],
              ['ice-aktar', tt('İçe Aktar')],
              ['api', 'API'],
              ['yedek', tt('Yedekleme')],
            ] as const
          ).filter(([k]) => !MOBILE || (k !== 'ice-aktar' && k !== 'yedek'))
        }
      />

      {tab === 'sablonlar' ? (
        <TemplatesPanel />
      ) : tab === 'ice-aktar' ? (
        <Import />
      ) : tab === 'api' ? (
        <ApiPanel />
      ) : tab === 'yedek' ? (
        <BackupPanel />
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-neutral-400">{tt('Bir arşive tıklayınca tablosu açılır.')}</p>
            <button
              onClick={() => setCreating((v) => !v)}
              style={primaryButtonStyle}
              className={`text-sm px-3 py-1.5 rounded-lg ${PRIMARY_BUTTON}`}
            >
              {tt('+ Yeni Arşiv')}
            </button>
          </div>

          {creating && (
            <div className="bg-neutral-900/70 border border-[#00c0fa]/30 rounded-2xl p-5 mb-6">
              <label className="block text-xs text-neutral-400 mb-1">{tt('Arşivin adı')}</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder={tt('ör. Medya Arşivim, Kitaplarım, Oynadığım Oyunlar...')}
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 text-sm mb-3"
              />
              <label className="block text-xs text-neutral-400 mb-1">{tt('Nasıl başlasın?')}</label>
              <div className="mb-4">
                <Select
                  value={templateChoice}
                  onChange={setTemplateChoice}
                  options={[
                    { value: BLANK, label: tt('Boş arşiv (hiç sütun yok, sıfırdan başla)') },
                    { value: BUILTIN, label: tt('Medya Arşivi şablonu (Kategori, Durum, Yönetmen, Tür, Ülke...)') },
                    ...customTemplates.map((t) => ({ value: t.id, label: tt('{0} şablonu', t.name) })),
                  ]}
                />
              </div>
              <p className="text-xs text-neutral-600 -mt-2 mb-4">
                {tt('Ne seçersen seç, sütunları sonra istediğin gibi ekleyip/kaldırabilir/yeniden adlandırabilirsin. Daha fazla şablon (hazır sütun setiyle) için Şablonlar sekmesine bak.')}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!name.trim() || busy}
                  style={primaryButtonStyle}
                  className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}
                >
                  {busy ? tt('Oluşturuluyor...') : tt('Oluştur')}
                </button>
                <button onClick={() => setCreating(false)} className="text-neutral-400 hover:text-neutral-200 text-sm px-4 py-2">
                  {tt('Vazgeç')}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <LineSkeleton />
          ) : boards.length === 0 ? (
            <EmptyState compact art="arsiv" title={tt('Henüz bir arşivin yok. Yukarıdan yeni bir tane oluştur.')} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {boards.map((b) => (
                <ArchiveCard key={b.id} board={b} onHome={settings.boardId === b.id} onDelete={(e) => handleDelete(e, b.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
