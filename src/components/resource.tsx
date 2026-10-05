'use client'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Pencil, Plus, Search, Sheet, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useUrlParam } from '@/lib/url'
import { day } from '@/lib/format'
import { ConfirmDialog, FormDialog, type Field } from './form'
import { Button, Card, Chips, cn, Empty, Input, Loading, Table, Td, Th, type TabOption } from './ui'

export interface Column<T = any> {
  header: string
  cell: (row: T) => React.ReactNode
  /** Plain value for the Excel export. Columns without it are left out of the export. */
  text?: (row: T) => string | number | null | undefined
  right?: boolean
  className?: string
  /** Left out of the table and included only in the export. */
  exportOnly?: boolean
}
export interface ResourceCtx { reload: () => void }
export interface ResourceProps {
  path: string
  module: string
  noun: string
  columns: Column[]
  fields?: Field[]
  search?: string
  filter?: { param: string; options: TabOption[] }
  query?: Record<string, string | undefined>
  defaults?: Record<string, any>
  toForm?: (row: any) => Record<string, any>
  toBody?: (values: Record<string, any>) => Record<string, any>
  rowActions?: (row: any, ctx: ResourceCtx) => React.ReactNode
  onOpen?: (row: any) => void
  onCreate?: () => void
  toolbar?: (ctx: ResourceCtx) => React.ReactNode
  canCreate?: boolean
  canEdit?: boolean
  canDelete?: boolean
  exportName?: string
  reloadKey?: unknown
  pageSize?: number
  empty?: string
  afterSave?: () => void
}

/** An ISO time as the value a datetime-local input expects, in the browser's own timezone. */
export const toLocalInput = (iso?: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v))
  return p.toString()
}

export async function exportXlsx(name: string, columns: Column[], rows: any[]) {
  const cols = columns.filter((c) => c.text)
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const data = [
    cols.map((c) => ({ value: c.header, fontWeight: 'bold' as const })),
    ...rows.map((r) => cols.map((c) => { const v = c.text!(r); return typeof v === 'number' ? { value: v, type: Number } : { value: v === null || v === undefined ? '' : String(v), type: String } })),
  ]
  await writeExcelFile(data as any).toFile(`${name}.xlsx`)
}

/** Sends the rows to a new Google Sheet in the company Drive folder, then offers to open it. */
export async function sendToSheets(name: string, module: string, columns: Column[], rows: any[]) {
  const cols = columns.filter((c) => c.text)
  const title = `${name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())}, ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
  const values = [cols.map((c) => c.header), ...rows.map((r) => cols.map((c) => { const v = c.text!(r); return typeof v === 'number' ? v : v === null || v === undefined ? '' : String(v) }))]
  const r = await api<{ url: string }>('/google/sheets', { body: { title, module, rows: values } })
  toast.success('Sent to Google Sheets', { action: { label: 'Open', onClick: () => window.open(r.url, '_blank', 'noopener') }, duration: 15000 })
}

/** Export to an Excel file, or to Google Sheets when the company has connected Google. `load` gives the rows to send. */
export function ExportButton({ name, module, columns, load, size, className }: { name: string; module: string; columns: Column[]; load: () => Promise<any[]> | any[]; size?: 'sm' | 'md'; className?: string }) {
  const { can, lookups } = useAuth()
  const [busy, setBusy] = useState(false)
  if (!can(module, 'EXPORT')) return null
  const run = async (to: 'excel' | 'sheets') => {
    setBusy(true)
    try {
      const rows = await load()
      if (to === 'excel') await exportXlsx(name, columns, rows)
      else await sendToSheets(name, module, columns, rows)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Export failed') } finally { setBusy(false) }
  }
  if (!lookups.google?.drive) return <Button size={size} className={className} loading={busy} onClick={() => run('excel')}><Download size={15} />Export</Button>
  return (
    <Menu.Root>
      <Menu.Trigger asChild><Button size={size} className={className} loading={busy}><Download size={15} />Export</Button></Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-50 w-52 rounded-xl border border-line bg-surface p-1 text-sm shadow-xl">
          <Menu.Item onSelect={() => run('excel')} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-accent-soft"><FileSpreadsheet size={16} className="text-muted" />Excel file</Menu.Item>
          <Menu.Item onSelect={() => run('sheets')} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-accent-soft"><Sheet size={16} className="text-muted" />Google Sheets</Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** A full list screen for one kind of record: search, filter, table, pages, add, edit, delete and export. */
export function Resource(p: ResourceProps) {
  const { can } = useAuth()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filter, setFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [form, setForm] = useState<{ row?: any } | null>(null)
  const [del, setDel] = useState<any>(null)
  const limit = p.pageSize ?? 25
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setOffset(0) }, 250); return () => clearTimeout(t) }, [q])

  const params = useMemo(() => ({ ...p.query, q: debounced, ...(p.filter && filter ? { [p.filter.param]: filter } : {}) }), [p.query, debounced, filter, p.filter])
  const { data, loading, error, reload } = useApi<{ items: any[]; total: number }>(`${p.path}?${qs({ ...params, limit, offset })}`)
  useEffect(() => { if (p.reloadKey !== undefined) reload() }, [p.reloadKey, reload])

  const mayCreate = (p.canCreate ?? true) && can(p.module, 'CREATE') && (!!p.fields || !!p.onCreate)
  const mayEdit = (p.canEdit ?? true) && can(p.module, 'EDIT') && !!p.fields
  const mayDelete = (p.canDelete ?? true) && can(p.module, 'DELETE')
  const ctx = { reload }
  // the New menu sends people here with ?new=<noun>
  useUrlParam('new', (v) => { if (v === p.noun) { if (p.onCreate) p.onCreate(); else setForm({}) } }, mayCreate)
  const toForm = (row: any) => {
    if (p.toForm) return p.toForm(row)
    const v: Record<string, any> = {}
    for (const f of p.fields ?? []) v[f.name] = f.type === 'date' ? day(row[f.name]) : f.type === 'datetime-local' ? toLocalInput(row[f.name]) : row[f.name] ?? ''
    return v
  }
  async function save(values: Record<string, any>) {
    for (const f of p.fields ?? []) if (f.type === 'datetime-local' && values[f.name]) values[f.name] = new Date(values[f.name]).toISOString()
    const body = p.toBody ? p.toBody(values) : values
    if (form?.row) await api(`${p.path}/${form.row.id}`, { method: 'PATCH', body })
    else await api(p.path, { body })
    toast.success(form?.row ? 'Changes saved' : `${p.noun[0].toUpperCase()}${p.noun.slice(1)} added`)
    reload()
    p.afterSave?.()
  }
  const loadAll = async () => (await api<{ items: any[] }>(`${p.path}?${qs({ ...params, all: '1' })}`)).items
  const actions = mayEdit || mayDelete || p.rowActions
  const shown = p.columns.filter((c) => !c.exportOnly)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {p.filter && <Chips value={filter} onChange={(v) => { setFilter(v); setOffset(0) }} options={p.filter.options} />}
        <div className="flex-1" />
        {p.search && (
          <div className="relative w-full sm:w-64">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <Input className="pl-8" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={p.search} aria-label={p.search} />
          </div>
        )}
        {p.toolbar?.(ctx)}
        {p.exportName && <ExportButton name={p.exportName} module={p.module} columns={p.columns} load={loadAll} />}
        {mayCreate && <Button variant="primary" onClick={() => (p.onCreate ? p.onCreate() : setForm({}))}><Plus size={16} />Add {p.noun}</Button>}
      </div>
      <Card className="overflow-hidden">
        {error ? <Empty>{error.message}</Empty> : !data && loading ? <Loading /> : !data?.items.length ? (
          <Empty>{debounced || filter ? `No ${p.noun}s match.` : p.empty ?? `No ${p.noun}s yet.${mayCreate ? ` Add the first one.` : ''}`}</Empty>
        ) : (
          <Table>
            <thead><tr>{shown.map((c) => <Th key={c.header} right={c.right}>{c.header}</Th>)}{actions ? <Th /> : null}</tr></thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} className={cn('hover:bg-surface-2/50', p.onOpen && 'cursor-pointer')} onClick={p.onOpen ? () => p.onOpen!(row) : undefined}>
                  {shown.map((c) => <Td key={c.header} right={c.right} className={c.className}>{c.cell(row)}</Td>)}
                  {actions ? (
                    <Td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {p.rowActions?.(row, ctx)}
                        {mayEdit && <Button size="icon" variant="ghost" aria-label={`Edit ${p.noun}`} onClick={() => setForm({ row })}><Pencil size={15} /></Button>}
                        {mayDelete && <Button size="icon" variant="ghost" aria-label={`Delete ${p.noun}`} onClick={() => setDel(row)}><Trash2 size={15} /></Button>}
                      </div>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && data.total > limit && (
          <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-[13px] text-muted">
            <span className="num">{offset + 1} to {Math.min(offset + limit, data.total)} of {data.total}</span>
            <span className="flex gap-1">
              <Button size="icon" variant="ghost" aria-label="Previous page" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - limit))}><ChevronLeft size={16} /></Button>
              <Button size="icon" variant="ghost" aria-label="Next page" disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)}><ChevronRight size={16} /></Button>
            </span>
          </div>
        )}
      </Card>
      {p.fields && <FormDialog open={!!form} onClose={() => setForm(null)} title={form?.row ? `Edit ${p.noun}` : `Add ${p.noun}`} fields={p.fields} initial={form?.row ? toForm(form.row) : p.defaults} onSubmit={save} submitLabel={form?.row ? 'Save changes' : `Add ${p.noun}`} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={`Delete this ${p.noun}?`} confirmLabel={`Delete ${p.noun}`} danger onConfirm={async () => { await api(`${p.path}/${del.id}`, { method: 'DELETE' }); toast.success(`${p.noun[0].toUpperCase()}${p.noun.slice(1)} deleted`); reload(); p.afterSave?.() }}>
        This cannot be undone.
      </ConfirmDialog>
    </div>
  )
}
