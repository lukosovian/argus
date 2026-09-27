// Uzun süren bir iş (ör. Genel Güncelleme) sürerken "Şimdi Güncelle" sorusu çıkmasın diye basit
// bir sayaç. Kullanıcı "genel güncelleme yaparken gelen güncellemeye şimdi güncelle dese ne olur"
// diye sordu: sayfa yenilenip iş yarıda kalıyordu — artık iş bitene kadar soru bekletiliyor.
let busyCount = 0

export function beginBusy(): () => void {
  busyCount++
  let done = false
  return () => {
    if (done) return
    done = true
    busyCount = Math.max(0, busyCount - 1)
  }
}

export function isBusy(): boolean {
  return busyCount > 0
}
