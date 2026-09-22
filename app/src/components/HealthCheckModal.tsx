import { useEffect, useState } from 'react'
import type { Board, Row } from '../types'
import { titleText } from '../types'
import { api } from '../lib/api'

const MAX_SHOWN = 40

// Ayarlar/Yardım'daki gibi bir "?" değil, arşivin kendi içindeki sorunlu kayıtları TEK YERDE
// listeleyen bir panel — kullanıcı "sağlık kontrolü" önerisini onayladı: eksik kapak görseli,
// eksik görünen (poster/sinopsis/ülke/yönetmen/fragmandan biri boş) ve diskte artık var olmayan
// bir dosyaya işaret eden (elden silinmiş) görsel bağlantıları. İlk ikisi board+rows'tan saf
// istemci tarafında hesaplanabiliyor (BoardView zaten bunları TMDB toplu güncelleme için
// hesaplıyor, aynı listeler buraya prop olarak geliyor) — üçüncüsü sadece sunucu diski
// kontrol edebildiği için modal açılınca ayrı bir istek atılıyor.
export default function HealthCheckModal({
  board,
  rows,
  missingImageRows,
  incompleteRows,
  onOpenRow,
  onClose,
}: {
  board: Board
  rows: Row[]
  missingImageRows: Row[]
  incompleteRows: Row[]
  onOpenRow: (row: Row) => void
  onClose: () => void
}) {
  const [brokenLoading, setBrokenLoading] = useState(true)
  const [brokenImages, setBrokenImages] = useState<{ rowId: string; propertyName: string; value: string }[]>([])

  useEffect(() => {
    let cancelled = false
    setBrokenLoading(true)
    api
      .getBoardHealth(board.id)
      .then((res) => {
        if (!cancelled) setBrokenImages(res.brokenImages)
      })
      .catch(() => {
        if (!cancelled) setBrokenImages([])
      })
      .finally(() => {
        if (!cancelled) setBrokenLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [board.id])

  const titleProp = board.properties.find((p) => p.id === board.titlePropertyId)
  function rowTitle(row: Row): string {
    return titleProp ? titleText(titleProp, row.values[titleProp.id]) || 'İsimsiz' : 'İsimsiz'
  }
  function rowById(id: string): Row | undefined {
    return rows.find((r) => r.id === id)
  }

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-sm flex items-start justify-center px-4 py-10 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-neutral-50">Sağlık Kontrolü</h2>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="h-8 w-8 shrink-0 rounded-lg bg-neutral-800 border border-neutral-700 hover:border-neutral-500 flex items-center justify-center text-neutral-400 hover:text-neutral-50 text-lg leading-none transition"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-neutral-500 mb-6">
          Bu arşivdeki dikkat edilmesi gereken kayıtlar — bir kayda tıklayınca detayı açılır.
        </p>

        <div className="space-y-7">
          <HealthSection
            title="Kapak görseli olmayan kayıtlar"
            hint="Board'daki hiçbir görsel sütununda (Poster, Banner, Kapak Adı...) değeri yok."
            items={missingImageRows}
            renderLabel={rowTitle}
            onOpenRow={onOpenRow}
          />
          <HealthSection
            title="Eksik görünen kayıtlar"
            hint="Poster, sinopsis, ülke, yönetmen ya da fragmandan biri boş — API ile doldurulabilir."
            items={incompleteRows}
            renderLabel={rowTitle}
            onOpenRow={onOpenRow}
          />
          <div>
            <h3 className="text-sm font-semibold text-neutral-50 mb-0.5">Bozuk görsel bağlantısı olan kayıtlar</h3>
            <p className="text-xs text-neutral-500 mb-2">Sütunda bir görsel gösteriliyor ama dosya diskten silinmiş.</p>
            {brokenLoading ? (
              <p className="text-sm text-neutral-500">Kontrol ediliyor...</p>
            ) : brokenImages.length === 0 ? (
              <p className="text-sm text-neutral-600">Sorun bulunamadı.</p>
            ) : (
              <ul className="space-y-1">
                {brokenImages.slice(0, MAX_SHOWN).map((b, i) => {
                  const row = rowById(b.rowId)
                  return (
                    <li key={i}>
                      <button
                        onClick={() => row && onOpenRow(row)}
                        disabled={!row}
                        className="w-full text-left text-sm text-neutral-300 hover:text-[#00c0fa] hover:bg-neutral-800 rounded-lg px-2.5 py-1.5 transition disabled:opacity-50 disabled:hover:bg-transparent flex items-center justify-between gap-3"
                      >
                        <span className="truncate">{row ? rowTitle(row) : 'Kayıt bulunamadı'}</span>
                        <span className="text-xs text-neutral-600 shrink-0">{b.propertyName}</span>
                      </button>
                    </li>
                  )
                })}
                {brokenImages.length > MAX_SHOWN && (
                  <li className="text-xs text-neutral-600 px-2.5 pt-1">+{brokenImages.length - MAX_SHOWN} kayıt daha</li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function HealthSection({
  title,
  hint,
  items,
  renderLabel,
  onOpenRow,
}: {
  title: string
  hint: string
  items: Row[]
  renderLabel: (row: Row) => string
  onOpenRow: (row: Row) => void
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-neutral-50 mb-0.5">
        {title} <span className="text-neutral-600 font-normal">({items.length})</span>
      </h3>
      <p className="text-xs text-neutral-500 mb-2">{hint}</p>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-600">Sorun bulunamadı.</p>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, MAX_SHOWN).map((row) => (
            <li key={row.id}>
              <button
                onClick={() => onOpenRow(row)}
                className="w-full text-left text-sm text-neutral-300 hover:text-[#00c0fa] hover:bg-neutral-800 rounded-lg px-2.5 py-1.5 transition truncate"
              >
                {renderLabel(row)}
              </button>
            </li>
          ))}
          {items.length > MAX_SHOWN && <li className="text-xs text-neutral-600 px-2.5 pt-1">+{items.length - MAX_SHOWN} kayıt daha</li>}
        </ul>
      )}
    </div>
  )
}
