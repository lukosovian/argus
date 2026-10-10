import { useState } from 'react'
import { PRIMARY_BUTTON, primaryButtonStyle } from '../lib/theme'
import Select from './Select'
import { tt, ttx } from '../lib/i18n'

export interface FillField {
  key: string
  label: string
  // Tabloda bu alana uygun (aynı türde) var olan sütunlar — adı farklı olabilir (ör. Sinopsis yerine "Özet").
  candidates?: { id: string; name: string }[]
}

// Genel Güncelleme'den (TMDB'den toplu doldurma) önce çıkan bilgilendirme. Kullanıcı "kendi
// verilerini içe aktaran biri API ile doldururken bilgilendirelim: hepsi gelsin, uygulama daha
// iyi çalışır, daha iyi görünür; tablosunda ör. Kapak Adı yoksa o da gelsin mi diye soralım" dedi.
// İki liste: tabloda sütunu hiç olmayan alanlar (gelsin derse sütun eklenir) ve dişli menüsünden
// kapatılmış alanlar (açılsın mı). İkisinde de varsayılan "gelsin".
export default function TmdbFillAdviceModal({
  count,
  overwrite,
  missing,
  closed,
  onDone,
}: {
  count: number
  overwrite: boolean
  missing: FillField[]
  closed: FillField[]
  // null: vazgeçti. Aksi halde bu seferlik ve sonrası için hariç tutulacak alanlar + "bir daha sorma".
  onDone: (r: { skip: string[]; mute: boolean; columns: Record<string, string> } | null) => void
}) {
  const [wanted, setWanted] = useState<Set<string>>(() => new Set([...missing, ...closed].map((f) => f.key)))
  const [mute, setMute] = useState(false)
  // Eksik alan için "şu var olan sütuna yaz" seçimi (boş = yeni sütun açılsın).
  const [columns, setColumns] = useState<Record<string, string>>({})

  function toggle(key: string) {
    setWanted((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const all = [...missing, ...closed]
  const skip = all.filter((f) => !wanted.has(f.key)).map((f) => f.key)

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-sm flex items-start justify-center px-4 py-10 overflow-y-auto" onClick={() => onDone(null)}>
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-semibold text-neutral-50">{tt('TMDB\'den doldurmadan önce')}</h2>
          <p className="text-sm text-neutral-400 mt-1.5">
            {ttx('{0} TMDB\'den doldurulacak. Kayıt sayısına göre biraz sürebilir, istediğin an "Durdur"a basabilirsin.', overwrite ? tt('{0} kaydın tamamı', count) : tt('Eksik görünen {0} kayıt', count))}
          </p>
          {overwrite && (
            <p className="text-sm text-amber-400 mt-1.5">{tt('"Dolu alanları da güncelle" açık — dolu alanların üzerine de TMDB\'nin verisi yazılacak.')}</p>
          )}
        </div>

        <div className="rounded-xl border border-[#00c0fa]/25 bg-[#00c0fa]/5 p-3.5 text-sm text-neutral-300 leading-relaxed">
          💡 <span className="font-medium text-neutral-100">{tt('Önerimiz: hepsi gelsin.')}</span>{' '}{tt('Vitrin, detay penceresi, Ne İzlesem, İstatistikler ve Sağlık Kontrolü bu bilgilerle çalışıyor — alanların hepsi dolu olunca ARGUS hem daha iyi çalışır hem çok daha güzel görünür (büyük görseller, logolar, fragmanlar, oyuncu fotoğrafları...).')}
        </div>

        {missing.length > 0 && (
          <div>
            <FieldGroup
              title={tt('Bu alanların sütununu bulamadım — onlar da gelsin mi?')}
              hint={tt('İşaretli kalanlar doldurulur. Tablonda aynı bilgi başka adla duruyorsa aşağıdan o sütunu seç; seçmezsen yeni sütun açılır.')}
              fields={missing}
              wanted={wanted}
              onToggle={toggle}
            />
            {missing.some((f) => wanted.has(f.key) && (f.candidates?.length ?? 0) > 0) && (
              <div className="mt-3 space-y-1.5">
                {missing
                  .filter((f) => wanted.has(f.key) && (f.candidates?.length ?? 0) > 0)
                  .map((f) => (
                    <div key={f.key} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0 text-neutral-300 truncate">{f.label}</span>
                      <span className="text-neutral-500">→</span>
                      <Select
                        value={columns[f.key] ?? ''}
                        onChange={(v) => setColumns((c) => ({ ...c, [f.key]: v }))}
                        options={[
                          { value: '', label: tt('+ Yeni sütun açılsın') },
                          ...f.candidates!.map((c) => ({ value: c.id, label: tt('"{0}" sütununa yaz', c.name) })),
                        ]}
                        className="flex-1 min-w-0"
                      />
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
        {closed.length > 0 && (
          <FieldGroup
            title={tt('Bunları kapatmışsın — açılsın mı?')}
            hint={tt('Dişli menüsünden (API\'den hangi alanlar çekilsin) kapattığın alanlar.')}
            fields={closed}
            wanted={wanted}
            onToggle={toggle}
          />
        )}

        <label className="flex items-center gap-2 text-xs text-neutral-500 cursor-pointer">
          <input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} />
          {tt('Bu arşivde bir daha sorma')}
        </label>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button onClick={() => onDone(null)} className="text-sm text-neutral-400 hover:text-neutral-100 px-3 py-2 transition">
            {tt('Vazgeç')}
          </button>
          <button
            onClick={() =>
              onDone({ skip, mute, columns: Object.fromEntries(Object.entries(columns).filter(([k, v]) => v && wanted.has(k))) })
            }
            style={primaryButtonStyle}
            className={`text-sm px-4 py-2 rounded-lg ${PRIMARY_BUTTON}`}
          >
            {skip.length === 0 ? tt('Hepsiyle doldur') : tt('Doldur ({0} alan hariç)', skip.length)}
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldGroup({
  title,
  hint,
  fields,
  wanted,
  onToggle,
}: {
  title: string
  hint: string
  fields: FillField[]
  wanted: Set<string>
  onToggle: (key: string) => void
}) {
  return (
    <div>
      <p className="text-sm font-medium text-neutral-100">{title}</p>
      <p className="text-xs text-neutral-500 mt-0.5 mb-2">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((f) => {
          const on = wanted.has(f.key)
          return (
            <button
              key={f.key}
              onClick={() => onToggle(f.key)}
              className={`text-xs rounded-full px-2.5 py-1 border transition ${
                on
                  ? 'border-emerald-400 text-emerald-300 bg-emerald-500/10'
                  : 'border-neutral-700 text-neutral-500 line-through hover:text-neutral-300'
              }`}
            >
              {on ? '✓ ' : ''}
              {f.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
