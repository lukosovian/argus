// Toplu işlerde (Netflix aktarımı, çok kayda "İzledim…") her İzlendi için sağ altta ayrı bir puan penceresi açılmasın
// (v1.26). İş sürerken sunucunun "puan sor" haberleri yok sayılır; kullanıcının kendi "Puan ver" isteği (force) etkilenmez.
// Pencere olaylarında yakalama sırası güvenilir olmadığı için (önce kim dinlemeye başladıysa o çalışıyor) bayrakla.
let quiet = 0

export function isRatingQuiet(): boolean {
  return quiet > 0
}

export async function withQuietRating<T>(fn: () => Promise<T>): Promise<T> {
  quiet++
  try {
    return await fn()
  } finally {
    setTimeout(() => {
      quiet = Math.max(0, quiet - 1)
    }, 500)
  }
}
