// Geliştirme aracı: sunucudaki stt('…') anahtarlarını toplar; server/locales/en.json'da eksik olanları
// i18n-batch-s.json'a yazar (node scripts/i18n-batch.mjs ile değil, aşağıdaki merge ile birleştirilir).
//   node scripts/i18n-server-keys.mjs            → eksikleri numaralı yazar
//   node scripts/i18n-server-keys.mjs merge f.json → çevirileri (aynı sırayla) ekler
import fs from 'node:fs'
import ts from 'typescript'
const files = fs.readdirSync('server').filter((f) => f.endsWith('.js')).map((f) => `server/${f}`)
const dictFile = 'server/locales/en.json'
const dict = JSON.parse(fs.readFileSync(dictFile, 'utf8'))
const keys = []
for (const f of files) {
  const src = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const v = (n) => {
    if (ts.isCallExpression(n) && n.expression.getText() === 'stt' && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && !keys.includes(n.arguments[0].text)) keys.push(n.arguments[0].text)
    ts.forEachChild(n, v)
  }
  v(src)
}
const missing = keys.filter((k) => !(k in dict))
if (process.argv[2] === 'merge') {
  const en = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
  if (en.length !== missing.length) throw new Error(`sayı tutmuyor ${missing.length} / ${en.length}`)
  missing.forEach((k, i) => (dict[k] = en[i]))
  fs.writeFileSync(dictFile, JSON.stringify(dict, null, 1) + '\n')
  console.log('eklendi', en.length)
} else {
  missing.forEach((k, i) => console.log(i + '\t' + JSON.stringify(k)))
  console.log(`(${missing.length} / ${keys.length})`)
}
