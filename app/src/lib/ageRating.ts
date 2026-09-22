// "Yaş Sınırı" alanı TMDB'den geldiği kaynağa göre karışık formatlarda gelebiliyor (Türkiye
// sertifikası varsa "13+"/"18+" gibi, yoksa ABD sinema (PG-13, R...) ya da ABD TV (TV-MA,
// TV-14...) kodlarına düşülüyor — bkz. server/index.js'teki getMovieCertification/
// getTvCertification, önce TR sonra US deniyor). Burada bu ham değer, kaynağı ne olursa olsun
// hep aynı sabit Türkçe kademelerden birine eşleniyor ki detay penceresinde tutarlı bir
// rozet + açıklama gösterilebilsin.
export interface AgeTier {
  id: string
  label: string
  description: string
  color: string
}

const TIERS: Record<string, AgeTier> = {
  genel: { id: 'genel', label: 'Genel İzleyici Kitlesi', description: 'Her yaştan izleyici için uygundur.', color: '#199e70' },
  '6': { id: '6', label: '6+', description: '6 yaş ve üzeri izleyiciler için uygundur.', color: '#3987e5' },
  '7': { id: '7', label: '7+', description: '7 yaş ve üzeri izleyiciler için uygundur.', color: '#3987e5' },
  '10': { id: '10', label: '10+', description: '10 yaş ve üzeri izleyiciler için uygundur.', color: '#c98500' },
  '13': { id: '13', label: '13+', description: '13 yaş ve üzeri izleyiciler için uygundur, ebeveyn rehberliği önerilir.', color: '#d95926' },
  '16': { id: '16', label: '16+', description: '16 yaş ve üzeri izleyiciler için uygundur.', color: '#d95926' },
  '18': { id: '18', label: '18+', description: 'Sadece yetişkin izleyiciler içindir.', color: '#e66767' },
  nr: { id: 'nr', label: 'Derecelendirilmemiş', description: 'Bu içerik için bir yaş sınırı bilgisi bulunmuyor.', color: '#5b5b58' },
}

const RAW_TO_TIER: Record<string, string> = {
  // Türkiye sertifikası (TMDB'nin TR ülke verisinde genelde bu biçimde geliyor)
  'genel izleyici kitlesi': 'genel',
  'genel izleyici': 'genel',
  '6+': '6',
  '6a': '6',
  '7+': '7',
  '7a': '7',
  '10+': '10',
  '10a': '10',
  '13+': '13',
  '13a': '13',
  '15+': '16',
  '16+': '16',
  '18+': '18',
  // ABD sinema (MPAA)
  g: 'genel',
  pg: '7',
  'pg-13': '13',
  r: '16',
  'nc-17': '18',
  nr: 'nr',
  // ABD TV
  'tv-y': 'genel',
  'tv-y7': '7',
  'tv-g': 'genel',
  'tv-pg': '10',
  'tv-14': '13',
  'tv-ma': '18',
}

export function normalizeAgeRating(raw: string): AgeTier | null {
  const key = raw.trim().toLocaleLowerCase('tr')
  const tierId = RAW_TO_TIER[key]
  return tierId ? TIERS[tierId] : null
}
