// Geliştirme aracı: çeviri partileri.
//   node scripts/i18n-batch.mjs show <parti> <dosya-deseni…>   → eksik anahtarları numaralı yazar, partiyi kaydeder
//   node scripts/i18n-batch.mjs merge <parti> <çeviriler.json>  → çevirileri (aynı sırayla dizi) sözlüğe ekler
import fs from 'node:fs'
import path from 'node:path'

const [cmd, name, ...rest] = process.argv.slice(2)
const dictFile = path.resolve('src/locales/en.json')
const batchFile = path.resolve(`i18n-batch-${name}.json`)
if (cmd === 'show') {
  const missing = JSON.parse(fs.readFileSync('i18n-missing.json', 'utf8'))
  const pats = rest.map((r) => new RegExp(r))
  const keys = []
  for (const [f, ks] of Object.entries(missing)) if (pats.some((p) => p.test(f))) for (const k of ks) keys.push([f, k])
  fs.writeFileSync(batchFile, JSON.stringify(keys.map(([, k]) => k)))
  let last = ''
  keys.forEach(([f, k], i) => {
    if (f !== last) console.log(`## ${(last = f)}`)
    console.log(`${i}\t${JSON.stringify(k)}`)
  })
  console.log(`(${keys.length})`)
} else if (cmd === 'merge') {
  const keys = JSON.parse(fs.readFileSync(batchFile, 'utf8'))
  const en = JSON.parse(fs.readFileSync(path.resolve(rest[0]), 'utf8'))
  if (en.length !== keys.length) throw new Error(`sayı tutmuyor: ${keys.length} anahtar, ${en.length} çeviri`)
  const dict = JSON.parse(fs.readFileSync(dictFile, 'utf8'))
  const ph = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join()
  keys.forEach((k, i) => {
    const v = en[i]
    // Yer tutucular aynı olmalı (çoğul biçimlerin her biri)
    for (const part of v.split('|')) if (ph(part) !== ph(k) && !(v.includes('|') && ph(part) === '')) console.warn(`yer tutucu farkı #${i}: ${k} → ${v}`)
    dict[k] = v
  })
  fs.writeFileSync(dictFile, JSON.stringify(dict, null, 1) + '\n')
  console.log('eklendi', keys.length, 'toplam', Object.keys(dict).length)
}
// node scripts/i18n-batch.mjs add - <dosya.json>  → { "Türkçe": "English" } nesnesini sözlüğe ekler
if (cmd === 'add') {
  const add = JSON.parse(fs.readFileSync(path.resolve(rest[0]), 'utf8'))
  const dict = JSON.parse(fs.readFileSync(dictFile, 'utf8'))
  Object.assign(dict, add)
  fs.writeFileSync(dictFile, JSON.stringify(dict, null, 1) + '\n')
  console.log('eklendi', Object.keys(add).length)
}
