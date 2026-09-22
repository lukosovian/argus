export function parseYouTubeUrl(raw: string): { id: string; start: number } | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
  let id: string | null = null
  if (host === 'youtu.be') {
    id = url.pathname.slice(1)
  } else if (host === 'youtube.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/embed/')[1]
    else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/shorts/')[1]
  }
  if (!id) return null

  const rawStart = url.searchParams.get('t') ?? url.searchParams.get('start') ?? '0'
  const start = parseInt(rawStart.replace(/[^0-9]/g, ''), 10) || 0
  return { id, start }
}
