// Arşiv/kayıt verisi bir yerde değişince (ör. detay penceresindeki "Benzerler"den ya da
// Keşfet'ten yeni içerik eklenince) o an açık olan diğer ekranların kendi kopyalarını sessizce
// yenilemesi için basit bir sinyal. `boardId` verilmezse tüm arşivler etkilenmiş sayılır.
const target = new EventTarget()

export function notifyDataChanged(boardId?: string) {
  target.dispatchEvent(new CustomEvent('changed', { detail: { boardId } }))
}

export function onDataChanged(handler: (boardId: string | undefined) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<{ boardId?: string }>).detail.boardId)
  target.addEventListener('changed', listener)
  return () => target.removeEventListener('changed', listener)
}
