// Arşiv/kayıt verisi bir yerde değişince (ör. detay penceresindeki "Benzerler"den ya da
// Keşfet'ten yeni içerik eklenince) o an açık olan diğer ekranların kendi kopyalarını sessizce
// yenilemesi için basit bir sinyal. `boardId` verilmezse tüm arşivler etkilenmiş sayılır.
//
// `kind` neyin değiştiğini söyler — her bölüm tikinde bütün kayıtlar ve arşivler baştan çekilmesin diye:
//   'rows'    → kayıtlar (satırlar) değişti
//   'board'   → arşivin kendisi (sütunlar, ad, ayarlar) değişti
//   'watched' → sadece bölüm izleme tarihleri değişti
//   'all'     → bilinmiyor / hepsi (varsayılan; eski çağrılar böyle çalışmaya devam eder)
export type DataChangeKind = 'rows' | 'board' | 'watched' | 'all'

const target = new EventTarget()

export function notifyDataChanged(boardId?: string, kind: DataChangeKind = 'all') {
  target.dispatchEvent(new CustomEvent('changed', { detail: { boardId, kind } }))
}

export function onDataChanged(handler: (boardId: string | undefined, kind: DataChangeKind) => void) {
  const listener = (e: Event) => {
    const d = (e as CustomEvent<{ boardId?: string; kind?: DataChangeKind }>).detail
    handler(d.boardId, d.kind ?? 'all')
  }
  target.addEventListener('changed', listener)
  return () => target.removeEventListener('changed', listener)
}
