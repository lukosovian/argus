// Geliştirme aracı: kaynakta tt('…') ile yazılmış bütün metinleri toplar, locales/en.json'da eksik olanları
// i18n-missing.json'a yazar (çevrilecekler). --prune: kodda artık olmayan anahtarları sözlükten siler.
//   node scripts/i18n-keys.mjs [--prune]
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const SRC = path.resolve('src')
const keys = new Map()
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.tsx?$/.test(e.name)) scan(p)
  }
}
function scan(file) {
  const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 'tt' || n.expression.text === 'ttx') && n.arguments[0]) {
      const a = n.arguments[0]
      if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) {
        if (!keys.has(a.text)) keys.set(a.text, path.relative(SRC, file).split(path.sep).join('/'))
      } else console.warn('sabit olmayan tt():', path.relative(SRC, file), src.getLineAndCharacterOfPosition(n.getStart()).line + 1)
    }
    // ttc('bağlam', 'metin') → "bağlam::metin"
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'ttc' && n.arguments.length >= 2 && ts.isStringLiteral(n.arguments[0]) && ts.isStringLiteral(n.arguments[1])) {
      const k = `${n.arguments[0].text}::${n.arguments[1].text}`
      if (!keys.has(k)) keys.set(k, path.relative(SRC, file).split(path.sep).join('/'))
    }
    ts.forEachChild(n, visit)
  }
  visit(src)
}
walk(SRC)
const dictFile = path.join(SRC, 'locales', 'en.json')
const dict = JSON.parse(fs.readFileSync(dictFile, 'utf8'))
const missing = {}
for (const [k, f] of keys) if (!(k in dict)) (missing[f] ??= []).push(k)
fs.writeFileSync('i18n-missing.json', JSON.stringify(missing, null, 1))
const n = Object.values(missing).reduce((a, b) => a + b.length, 0)
console.log('anahtar', keys.size, 'sözlükte', Object.keys(dict).length, 'eksik', n)
if (process.argv.includes('--prune')) {
  const pruned = Object.fromEntries(Object.entries(dict).filter(([k]) => keys.has(k)))
  fs.writeFileSync(dictFile, JSON.stringify(pruned, null, 1) + '\n')
  console.log('silinen', Object.keys(dict).length - Object.keys(pruned).length)
}
