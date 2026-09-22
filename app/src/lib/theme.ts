import type { CSSProperties } from 'react'

// ARGUS'un marka renkleri — logodaki mavi gradyanla aynı (bkz. logoblue.png/logoblue-yatay.png).
// Tek yerden yönetilsin diye burada: uygulamadaki "birincil" (en önemli aksiyon) butonlar
// hep bu dolgu, ikincil/aktif göstergeler ise çoğunlukla bir çerçeve/kenarlık olarak kullanır.
export const BRAND_FROM = '#015eea'
export const BRAND_TO = '#00c0fa'
export const BRAND_GRADIENT = `linear-gradient(90deg, ${BRAND_FROM}, ${BRAND_TO})`
// Düz metin (başlık/etiket) için marka rengi — degradenin iki ucu koyu zemin üstünde okunaklı
// olsun diye tek bir orta-açık ton seçildi, degrade yerine düz renk (küçük yazılarda gradyan
// metin göze pürüzlü/okunması zor görünür).
export const BRAND_TEXT = '#3fa9ff'

// Önceden düz beyaz dolgu (`bg-white text-neutral-900 hover:bg-neutral-200`) olan tüm
// "birincil" butonların ortak yeni görünümü — boyut/padding (px-4 py-2 vb.) her kullanım
// yerinde ayrı ayrı eklenmeye devam ediyor, sadece renk/doku burada tek elden yönetiliyor.
// Not: `rounded-*` bilerek burada değil, her kullanım yerinde ayrı veriliyor (bazı yerler
// rounded-lg, bazıları rounded-md kullanıyor) — tek bir sabitte ikisi birden çakışmasın diye.
export const PRIMARY_BUTTON =
  'text-white font-medium transition hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100'

export const primaryButtonStyle: CSSProperties = { background: BRAND_GRADIENT }

// Çerçeve/kenarlık olarak kullanılacak yerler için (ör. aktif nav sekmesi, seçili bir
// buton) — içi şeffafa yakın koyu, kenarı gradyan. `background` ile `border` birlikte
// tek bir CSS özelliğinde iki katman (padding-box + border-box) kullanılıyor.
export function gradientBorderStyle(fillColor = 'rgba(23,23,23,0.9)'): CSSProperties {
  return {
    background: `linear-gradient(${fillColor}, ${fillColor}) padding-box, ${BRAND_GRADIENT} border-box`,
    border: '1.5px solid transparent',
  }
}
