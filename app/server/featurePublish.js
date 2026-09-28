import { execFile } from 'node:child_process'
import path from 'node:path'

// Geliştirici bilgisayarında özellik anahtarı (features.json) değişince onu tek başına Git'e gönderir —
// kullanıcı "Yıllık Özet'i açıp kapatınca bir de sana 'gönder' demem gerekiyor" dedi. Sadece o dosya
// commit'lenir (üzerinde çalışılan diğer kodlara dokunulmaz). Gönderilmemiş başka commit'ler varsa hiç
// göndermez (yarım işler yanlışlıkla gitmesin); gönderemezse commit'i geri alır, dosya değişmiş halde kalır.
function git(root, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: root, timeout: 30000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr) }))
      else resolve(String(stdout).trim())
    })
  })
}

export async function publishFile(root, file, message) {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  try {
    await git(root, ['fetch', '--quiet'])
  } catch {
    return { pushed: false, reason: 'İnternete ya da Git\'e ulaşılamadı.' }
  }
  let ahead = 0
  let behind = 0
  try {
    ahead = Number(await git(root, ['rev-list', '--count', '@{u}..HEAD']))
    behind = Number(await git(root, ['rev-list', '--count', 'HEAD..@{u}']))
  } catch {
    return { pushed: false, reason: 'Git dalı uzak depoya bağlı değil.' }
  }
  if (ahead > 0) return { pushed: false, reason: 'Henüz gönderilmemiş başka değişiklikler var; önce onların gönderilmesi gerekiyor.' }
  // Kodda kaydedilmemiş değişiklik varsa da gönderme: ayar gidip onu kullanan kod gitmemiş olabilir
  // (ör. yeni bir sayfa açılır ama diğer bilgisayarlarda o sayfanın kodu yoktur).
  const dirty = (await git(root, ['status', '--porcelain', '--', 'app/src', 'app/server', 'app/public', 'app/package.json']).catch(() => ''))
    .split('\n')
    .filter((l) => l.trim() && !l.endsWith(rel))
  if (dirty.length) return { pushed: false, reason: 'Henüz gönderilmemiş kod değişiklikleri var; önce onların gönderilmesi gerekiyor.' }
  if (behind > 0) return { pushed: false, reason: 'Uzak depoda bu bilgisayarda olmayan değişiklikler var.' }
  const changed = await git(root, ['status', '--porcelain', '--', rel])
  if (!changed) return { pushed: true, unchanged: true }
  try {
    await git(root, ['add', '--', rel])
    // Yol verilince sadece o dosya commit'lenir; hazırlanmış (staged) başka değişiklikler olduğu gibi kalır
    await git(root, ['commit', '--quiet', '-m', message, '--', rel])
  } catch {
    return { pushed: false, reason: 'Değişiklik kaydedilemedi (git commit).' }
  }
  try {
    await git(root, ['push', '--quiet'])
    return { pushed: true }
  } catch {
    await git(root, ['reset', '--soft', 'HEAD~1']).catch(() => {})
    await git(root, ['reset', '--quiet', '--', rel]).catch(() => {})
    return { pushed: false, reason: 'Gönderilemedi (internet bağlantısını kontrol et).' }
  }
}
