// Geliştirme aracı: tt()/ttx() dışında kalan, Türkçe kelime içeren metinleri (literal, şablon, JSX metni)
// listeler. Türkçe kelime listesi sözlüğün Türkçe anahtarlarından çıkarılır (İngilizce karşılıklarda geçenler hariç).
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const SRC = path.resolve('src')
const en = JSON.parse(fs.readFileSync('src/locales/en.json', 'utf8'))
const tok = (s) => s.toLowerCase().match(/\p{L}{3,}/gu) ?? []
const enTok = new Set(Object.values(en).flatMap(tok))
const vocab = new Set(Object.keys(en).flatMap(tok).filter((w) => !enTok.has(w)))
const TR = /[çğışöüÇĞİŞÖÜ]/
const SKIP = new Set(['lib/turkce.ts', 'lib/csvImport.ts', 'lib/names.ts', 'lib/i18n.ts'])
const out = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.tsx?$/.test(e.name) && !SKIP.has(path.relative(SRC, p).split(path.sep).join('/'))) scan(p)
  }
}
const inTt = (n) => {
  for (let p = n.parent; p; p = p.parent) if (ts.isCallExpression(p) && /^ttx?$/.test(p.expression.getText())) return p.arguments[0] === n || p.arguments.includes(n) ? 'arg' : 'inside'
  return null
}
function scan(file) {
  const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const rel = path.relative(SRC, file).split(path.sep).join('/')
  const visit = (n) => {
    let text = null
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text
    else if (ts.isTemplateExpression(n)) text = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' ')
    else if (ts.isJsxText(n)) text = n.text
    if (text !== null && text.trim()) {
      const p = n.parent
      const isTtKey = ts.isCallExpression(p) && /^ttx?$/.test(p.expression.getText()) && p.arguments[0] === n
      const skipCtx =
        isTtKey ||
        ts.isImportDeclaration(p) ||
        ts.isLiteralTypeNode(p) ||
        (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind)) ||
        ts.isCaseClause(p) ||
        (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isJsxAttribute(p) && ['className', 'key', 'id', 'href', 'src', 'to'].includes(p.name.getText()))
      const words = tok(text).filter((w) => vocab.has(w) || TR.test(w))
      if (!skipCtx && words.length) out.push(`${rel}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}  ${JSON.stringify(text.trim()).slice(0, 110)}  {${[...new Set(words)].slice(0, 4).join(',')}}`)
    }
    ts.forEachChild(n, visit)
  }
  visit(src)
}
walk(SRC)
fs.writeFileSync('i18n-leftovers.txt', out.join('\n'))
console.log(out.length)
