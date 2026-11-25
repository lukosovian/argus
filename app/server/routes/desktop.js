// Masaüstü uygulamasının (Electron, desktop/main.cjs) kendi istekleri.
import { resolveRole, resolveStatusOption } from '../roles.js'
import { stt } from '../lang.js'
import { loadBoardAndRows, localDay, profileBoardsFile, profileEpisodesFile, profileHomeSettingsFile, profileWatchedFile, readJsonShared } from '../storage.js'
import { app } from '../app.js'
import { hideForKid } from '../kid.js'
import { profileRecentWatchFile } from '../watchLogic.js'

// Tepsi menüsündeki "Kaldığın yerden" (v1.26, A2): İzleniyor durumundaki dizilerden en son izlediğin 3'ü ve her
// birinde sıradaki (yayınlanmış, henüz işaretlenmemiş) bölüm. Tepsiden tek tıkla o bölüm bugünün tarihiyle işaretlenir
// (bölüm işaretleme her zamanki yoldan: PATCH /watched/:rowId/diff — otomatik durum, son izlenenler aynen çalışır).
export function continueItems(profileId, limit = 3) {
  const home = readJsonShared(profileHomeSettingsFile(profileId), {}) ?? {}
  const boards = readJsonShared(profileBoardsFile(profileId), [])
  const boardId = boards.some((b) => b.id === home.boardId) ? home.boardId : boards[0]?.id
  if (!boardId) return []
  const loaded = loadBoardAndRows(profileId, boardId)
  if (!loaded) return []
  const { board } = loaded
  const durum = resolveRole(board, 'durum')
  const izleniyor = resolveStatusOption(board, 'izleniyor')
  if (!durum || !izleniyor) return []
  const tp = board.properties.find((p) => p.id === board.titlePropertyId)
  const episodes = readJsonShared(profileEpisodesFile(profileId), {})
  const watched = readJsonShared(profileWatchedFile(profileId), {})
  const recent = readJsonShared(profileRecentWatchFile(profileId), [])
  const order = new Map((Array.isArray(recent) ? recent : []).map((x, i) => [x?.rowId, i]))
  const today = localDay()
  const out = []
  for (const row of hideForKid(profileId, boardId, loaded.rows)) {
    if (row.values?.[durum.id] !== izleniyor) continue
    const seasons = Array.isArray(episodes[row.id]) ? episodes[row.id] : []
    const list = []
    for (const s of [...seasons].filter((x) => x.seasonNumber >= 1).sort((a, b) => a.seasonNumber - b.seasonNumber))
      for (const e of [...(s.episodes ?? [])].sort((a, b) => a.episodeNumber - b.episodeNumber)) list.push({ s: s.seasonNumber, e: e.episodeNumber, name: e.name ?? '', air: e.airDate ?? '' })
    const seen = watched[row.id] ?? {}
    const has = (x) => Array.isArray(seen[`${x.s}-${x.e}`]) && seen[`${x.s}-${x.e}`].length > 0
    // Kaldığın yer: işaretlenmiş en ileri bölümden sonraki ilk yayınlanmış, işaretlenmemiş bölüm. Hiç bölüm
    // işaretlenmemiş dizide "S1B1" demek anlamsız olurdu (bölüm bölüm takip edilmiyor) — atlanır.
    let last = -1
    list.forEach((x, i) => {
      if (has(x)) last = i
    })
    if (last < 0) continue
    const next = list.slice(last + 1).find((x) => x.air && x.air <= today && !has(x))
    if (!next) continue
    out.push({
      boardId,
      rowId: row.id,
      title: String((tp && row.values?.[tp.id]) || stt('Dizi')),
      season: next.s,
      episode: next.e,
      name: next.name,
      rank: order.has(row.id) ? order.get(row.id) : 1e6 - (row.updatedAt ?? 0) / 1e9,
    })
  }
  return out
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ rank: _r, ...x }) => x)
}

app.get('/api/profiles/:profileId/tepsi-devam', (req, res) => {
  res.json({ items: continueItems(req.params.profileId), today: localDay() })
})
