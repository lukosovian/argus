// Bildirimler (bkz. server/notifications.js) — üst menüdeki zil bunları gösterir.
export interface AppNotification {
  id: string
  t: number
  read: boolean
  type: 'watched' | 'newSeason' | 'announce' | string
  title: string
  text: string
  boardId?: string
  rowId?: string
}

// Dizinin TMDB durumu (tmdb.json'da saklanan) — "Dizi bitti / Yeni sezon: 12 Mart" etiketi için.
export interface ShowInfo {
  status: string
  next: { season: number; episode: number; airDate: string } | null
  last: { season: number; episode: number; airDate: string } | null
  checkedAt: number
}

// Yeni bir bildirim oluşmuş olabilir (ör. bölüm işaretleyince dizi İzlendi oldu) — zil hemen baksın.
export function pingNotifications() {
  window.dispatchEvent(new Event('argus-notifications'))
}
