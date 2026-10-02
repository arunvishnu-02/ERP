// Writes migrations/0001_init.sql from prisma/schema.prisma.
// The API applies the files in migrations/ on startup (see src/core/migrate.ts).
// For later schema changes, write the next numbered .sql file (prisma migrate diff can produce it).
import { createRequire } from 'node:module'
import fs from 'node:fs'
const require = createRequire(import.meta.url)
const w = require('@prisma/prisma-schema-wasm')
const p = 'prisma/schema.prisma'
let s = fs.readFileSync(p, 'utf8')
const fmt = w.format(JSON.stringify([[p, s]]), JSON.stringify({ textDocument: { uri: 'file:///' + p }, options: { tabSize: 2, insertSpaces: true } }))
try { const o = JSON.parse(fmt); s = Array.isArray(o) ? o[0][1] : fmt } catch { s = fmt }
fs.writeFileSync(p, s)
w.validate(JSON.stringify({ prismaSchema: [[p, s]], noColor: true }))
const { enums, models, indexes } = JSON.parse(w.get_dmmf(JSON.stringify({ prismaSchema: [[p, s]], noColor: true }))).datamodel
const BASE = { String: 'TEXT', Int: 'INTEGER', BigInt: 'BIGINT', Float: 'DOUBLE PRECISION', Boolean: 'BOOLEAN', DateTime: 'TIMESTAMP(3)', Decimal: 'DECIMAL(65,30)', Json: 'JSONB', Bytes: 'BYTEA' }
const typeOf = (f) => {
  if (f.kind === 'enum') return `"${f.type}"`
  if (f.nativeType) { const [n, a] = f.nativeType; if (n === 'Uuid') return 'UUID'; if (n === 'Date') return 'DATE'; if (n === 'Decimal') return `DECIMAL(${a.join(',')})` }
  return BASE[f.type]
}
const lit = (v) => (typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v))
const dflt = (f) => {
  const d = f.default
  if (d === undefined || d === null) return ''
  if (Array.isArray(d)) return ` DEFAULT ARRAY[${d.map(lit).join(', ')}]::${typeOf(f)}[]`
  if (typeof d === 'object') return d.name === 'now' ? ' DEFAULT CURRENT_TIMESTAMP' : ''
  return ' DEFAULT ' + lit(d)
}
const nm = (base, suffix) => (base + suffix).length <= 63 ? base + suffix : base.slice(0, 63 - suffix.length) + suffix
const out = ['-- CX CRM ERP: initial schema. Generated from prisma/schema.prisma by scripts/gen-sql.mjs', '']
for (const e of enums) out.push(`CREATE TYPE "${e.name}" AS ENUM (${e.values.map((v) => `'${v.name}'`).join(', ')});`)
out.push('')
const fks = []
for (const m of models) {
  const cols = m.fields.filter((f) => f.kind !== 'object').map((f) => `  "${f.name}" ${typeOf(f)}${f.isList ? '[]' : ''}${f.isRequired && !f.isList ? ' NOT NULL' : ''}${dflt(f)}`)
  const pk = m.primaryKey ? m.primaryKey.fields : m.fields.filter((f) => f.isId).map((f) => f.name)
  cols.push(`  CONSTRAINT "${nm(m.name, '_pkey')}" PRIMARY KEY (${pk.map((c) => `"${c}"`).join(', ')})`)
  out.push(`CREATE TABLE "${m.name}" (\n${cols.join(',\n')}\n);`, '')
  for (const f of m.fields.filter((f) => f.kind === 'object' && f.relationFromFields?.length)) {
    const od = { Cascade: 'CASCADE', SetNull: 'SET NULL', Restrict: 'RESTRICT', NoAction: 'NO ACTION' }[f.relationOnDelete] ?? (f.isRequired ? 'RESTRICT' : 'SET NULL')
    fks.push(`ALTER TABLE "${m.name}" ADD CONSTRAINT "${nm(m.name + '_' + f.relationFromFields.join('_'), '_fkey')}" FOREIGN KEY (${f.relationFromFields.map((c) => `"${c}"`).join(', ')}) REFERENCES "${f.type}"(${f.relationToFields.map((c) => `"${c}"`).join(', ')}) ON DELETE ${od} ON UPDATE CASCADE;`)
  }
}
for (const i of indexes.filter((i) => i.type !== 'id')) {
  const cols = i.fields.map((f) => f.name)
  out.push(`CREATE ${i.type === 'unique' ? 'UNIQUE ' : ''}INDEX "${nm(i.model + '_' + cols.join('_'), i.type === 'unique' ? '_key' : '_idx')}" ON "${i.model}"(${cols.map((c) => `"${c}"`).join(', ')});`)
}
out.push('', ...fks, '')
fs.mkdirSync('migrations', { recursive: true })
fs.writeFileSync('migrations/0001_init.sql', out.join('\n'))
console.log(`models ${models.length}, enums ${enums.length}, indexes ${indexes.length}, foreign keys ${fks.length}`)
