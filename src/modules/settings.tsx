'use client'
// Company details, users, roles and permissions, structure, lists, email, website form and the audit log.
import { Copy, KeyRound, Pencil, Plus, Trash2, UserCheck, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog, FormDialog, InlineForm, type Field } from '@/components/form'
import { Resource } from '@/components/resource'
import { Badge, Button, Card, Chips, cn, Empty, Input, Loading, Panel, Select, Status, Table, Tabs, Td, Th, Two } from '@/components/ui'
import { api, useApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { fmtDateTime, gstOff, human, personName } from '@/lib/format'
import { act, stateOptions, userOptions } from './common'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => ({ value: String(i + 1), label: m }))

/** The logo printed on quotations, invoices and HR letters. Kept small so it loads fast on customers' phones. */
function Logo() {
  const { lookups, reloadLookups } = useAuth()
  const logo = lookups.organization.settings?.logo
  const [busy, setBusy] = useState(false)
  const save = async (value: string | null) => {
    setBusy(true)
    try { await api('/settings/organization', { method: 'PATCH', body: { logo: value } }); await reloadLookups(); toast.success(value ? 'Logo saved' : 'Logo removed') } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const pick = (f?: File | null) => {
    if (!f) return
    if (f.size > 300_000) return toast.error('Use a logo smaller than 300 KB')
    const r = new FileReader()
    r.onload = () => save(String(r.result))
    r.readAsDataURL(f)
  }
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-line pb-4">
      <div className="grid h-16 w-56 place-items-center rounded-lg border border-dashed border-line bg-white px-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="Company logo" className="max-h-12 max-w-full object-contain" /> : <span className="text-xs text-muted">No logo yet</span>}
      </div>
      <div className="space-y-1.5">
        <div className="text-[13px] font-medium">Logo on documents</div>
        <div className="flex gap-2">
          <label className={cn('inline-flex h-7 cursor-pointer items-center rounded-md border border-line bg-surface px-2.5 text-[13px] font-medium hover:bg-surface-2', busy && 'pointer-events-none opacity-50')}>
            {logo ? 'Change logo' : 'Upload logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {logo && <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(null)}>Remove</Button>}
        </div>
        <p className="text-xs text-muted">The wide logo with the company name works best. PNG, JPG or SVG, under 300 KB.</p>
      </div>
    </div>
  )
}

function Company() {
  const { lookups, reloadLookups, can } = useAuth()
  const o = lookups.organization
  const s = o.settings ?? {}
  const gst = (v: any) => !!v.gstRegistered
  const fields: Field[] = [
    { name: 'name', label: 'Company name', required: true }, { name: 'legalName', label: 'Legal name, if different' },
    { name: 'tagline', label: 'Tagline', placeholder: 'Your Gateway to Digital Realm', help: 'Shown under the name when there is no logo.' }, { name: 'signatory', label: 'Who signs documents', placeholder: 'Arun G, Founder & Director' },
    { name: 'gstRegistered', label: 'GST', type: 'checkbox', placeholder: 'We are registered for GST', full: true, help: 'Switch off if you are not registered. Quotations and invoices then show no GSTIN, GST rate or GST amount.' },
    { name: 'gstin', label: 'GSTIN', show: gst }, { name: 'pan', label: 'PAN' },
    { name: 'email', label: 'Email shown on documents', type: 'email' }, { name: 'phone', label: 'Phone' }, { name: 'website', label: 'Website', placeholder: 'www.ciphermutex.com' },
    { name: 'addressLine1', label: 'Address line 1' }, { name: 'addressLine2', label: 'Address line 2' },
    { name: 'city', label: 'City' }, { name: 'stateCode', label: 'State', type: 'select', options: stateOptions(lookups), required: true, help: s.gstRegistered === false ? undefined : 'Decides CGST and SGST or IGST on each document.' }, { name: 'pincode', label: 'PIN code' },
    { name: 'financialYearStartMonth', label: 'Financial year starts in', type: 'select', options: MONTHS, required: true },
    { name: 'docPrefix', label: 'Document number prefix', help: `Numbers look like ${s.docPrefix || 'CX'}/INV/2026-27/0001.` }, { name: 'paymentTermsDays', label: 'Days to pay an invoice', type: 'number' },
    { name: 'upiId', label: 'UPI ID', placeholder: 'yourname@sbi', help: 'Invoices show a QR code that fills in this UPI ID and the amount.' },
    { name: 'bankDetails', label: 'Bank details printed on invoices', type: 'textarea', placeholder: 'Account name, account number, IFSC, bank and branch' },
    { name: 'quotationTerms', label: 'Terms printed on quotations', type: 'textarea' }, { name: 'invoiceTerms', label: 'Terms printed on invoices', type: 'textarea' },
  ]
  const initial = Object.fromEntries(fields.map((f) => [f.name, f.name in s ? s[f.name] ?? '' : o[f.name] ?? '']))
  initial.financialYearStartMonth = String(o.financialYearStartMonth ?? 4)
  initial.docPrefix = s.docPrefix ?? 'CX'
  initial.gstRegistered = s.gstRegistered !== false
  if (!can('SETTINGS', 'EDIT')) return <Card className="p-4 text-sm text-muted">You can view settings but not change them.</Card>
  return (
    <Card className="max-w-3xl space-y-4 p-5">
      <Logo />
      <InlineForm fields={fields} initial={initial} onSubmit={async (v) => { await api('/settings/organization', { method: 'PATCH', body: { ...v, financialYearStartMonth: Number(v.financialYearStartMonth), ...(v.gstRegistered ? {} : { gstin: '' }) } }); await reloadLookups(); toast.success('Company details saved') }} />
    </Card>
  )
}

function Users() {
  const { lookups, reloadLookups, can, me } = useAuth()
  const { data, reload } = useApi<{ items: any[] }>('/settings/users')
  const [form, setForm] = useState<{ row?: any } | null>(null)
  const [reset, setReset] = useState<any>(null)
  const roles = lookups.roles.map((r: any) => ({ value: r.id, label: r.name }))
  const depts = lookups.departments.map((d: any) => ({ value: d.id, label: d.name }))
  const fields: Field[] = [
    { name: 'firstName', label: 'First name', required: true }, { name: 'lastName', label: 'Last name' }, { name: 'email', label: 'Work email, used to sign in', type: 'email', required: true }, { name: 'phone', label: 'Phone' },
    ...(form?.row ? [] : [{ name: 'password', label: 'Temporary password', required: true, help: 'At least 8 characters. They choose their own when they first sign in.' } as Field, { name: 'designation', label: 'Designation', placeholder: 'Senior developer' } as Field]),
    { name: 'departmentId', label: 'Department', type: 'select', options: depts }, { name: 'managerId', label: 'Reports to', type: 'select', options: userOptions(lookups).filter((u: any) => u.value !== form?.row?.id), help: 'Used for the Team access scope.' },
    { name: 'roleIds', label: 'Roles', type: 'multi', options: roles },
  ]
  const after = async () => { reload(); await reloadLookups() }
  const setStatus = async (u: any, status: string) => { if (await act(() => api(`/settings/users/${u.id}`, { method: 'PATCH', body: { status } }), status === 'ACTIVE' ? 'User can sign in again' : 'User suspended')) after() }
  if (!data) return <Loading />
  const edit = can('SETTINGS', 'EDIT')
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">{data.items.filter((u) => u.status === 'ACTIVE').length} people can sign in.</p>
        {can('SETTINGS', 'CREATE') && <Button variant="primary" onClick={() => setForm({})}><Plus size={16} />Add user</Button>}
      </div>
      <Card className="overflow-hidden">
        <Table>
          <thead><tr><Th>User</Th><Th>Roles</Th><Th>Department</Th><Th>Last signed in</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>{data.items.map((u) => (
            <tr key={u.id}>
              <Td><Two top={<>{personName(u)}{u.id === me.id ? <span className="ml-1.5 text-xs font-normal text-muted">you</span> : null}</>} bottom={u.email} /></Td>
              <Td><div className="flex flex-wrap gap-1">{u.roles.map((r: any) => <Badge key={r.role.id} tone={r.role.key === 'SUPER_ADMIN' ? 'accent' : 'mute'}>{r.role.name}</Badge>)}</div></Td>
              <Td><Two top={<span className="font-normal">{u.department?.name ?? ''}</span>} bottom={u.employee?.designation} /></Td>
              <Td className="whitespace-nowrap text-muted">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Never'}</Td><Td><Status value={u.status} /></Td>
              <Td>{edit && <div className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" aria-label="Edit user" onClick={() => setForm({ row: u })}><Pencil size={15} /></Button>
                <Button size="icon" variant="ghost" aria-label="Reset password" onClick={() => setReset(u)}><KeyRound size={15} /></Button>
                {u.id !== me.id && (u.status === 'ACTIVE' ? <Button size="icon" variant="ghost" aria-label="Suspend user" onClick={() => setStatus(u, 'SUSPENDED')}><UserX size={15} /></Button> : <Button size="icon" variant="ghost" aria-label="Let user sign in again" onClick={() => setStatus(u, 'ACTIVE')}><UserCheck size={15} /></Button>)}
              </div>}</Td>
            </tr>
          ))}</tbody>
        </Table>
      </Card>
      <FormDialog open={!!form} onClose={() => setForm(null)} title={form?.row ? 'Edit user' : 'Add user'} fields={fields} submitLabel={form?.row ? 'Save changes' : 'Add user'}
        initial={form?.row ? { firstName: form.row.firstName, lastName: form.row.lastName ?? '', email: form.row.email, phone: form.row.phone ?? '', departmentId: form.row.departmentId ?? '', managerId: form.row.managerId ?? '', roleIds: form.row.roles.map((r: any) => r.role.id) } : { roleIds: [] }}
        onSubmit={async (v) => {
          if (form?.row) await api(`/settings/users/${form.row.id}`, { method: 'PATCH', body: v })
          else await api('/settings/users', { body: v })
          toast.success(form?.row ? 'Changes saved' : 'User added. Share the email and temporary password with them.')
          await after()
        }} />
      <FormDialog open={!!reset} onClose={() => setReset(null)} title={`Reset password for ${personName(reset)}`} submitLabel="Reset password" size="sm"
        intro={<p className="text-sm text-muted">They are signed out everywhere and must choose a new password when they sign in with this one.</p>}
        fields={[{ name: 'password', label: 'New temporary password, at least 8 characters', required: true, full: true }]}
        onSubmit={async (v) => { await api(`/settings/users/${reset.id}/reset-password`, { body: v }); toast.success('Password reset') }} />
    </div>
  )
}

const MODULES: [string, string][] = [['DASHBOARD', 'Dashboard'], ['LEADS', 'Leads'], ['CUSTOMERS', 'Customers'], ['SALES', 'Sales CRM'], ['QUOTATIONS', 'Quotations'], ['INVOICES', 'Invoices'], ['PAYMENTS', 'Payments'], ['PROJECTS', 'Projects'], ['TASKS', 'Tasks'], ['MARKETING', 'Digital marketing'], ['WEBSITES', 'Websites'], ['TICKETS', 'Support tickets'], ['DOCUMENTS', 'Documents'], ['HR', 'HR'], ['ASSETS', 'Assets'], ['FINANCE', 'Finance'], ['REPORTS', 'Reports'], ['AUTOMATION', 'Automation'], ['COMMUNICATION', 'Communication'], ['SETTINGS', 'Settings']]
const ACTIONS: [string, string][] = [['V', 'View'], ['C', 'Create'], ['E', 'Edit'], ['D', 'Delete'], ['A', 'Approve'], ['X', 'Export'], ['I', 'Import']]
const SCOPES: [string, string][] = [['OWN', 'Own records'], ['TEAM', 'Team records'], ['DEPARTMENT', 'Department records'], ['ALL', 'All records']]
type Perms = Record<string, { actions: string; scope: string }>

function Roles() {
  const { can, me, reloadMe, reloadLookups } = useAuth()
  const { data, reload } = useApi<{ items: any[] }>('/settings/roles')
  const [roleId, setRoleId] = useState('')
  const [perms, setPerms] = useState<Perms>({})
  const [add, setAdd] = useState(false)
  const [del, setDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const role = data?.items.find((r) => r.id === roleId) ?? data?.items[0]
  useEffect(() => { if (role) setPerms(JSON.parse(JSON.stringify(role.perms))) }, [role?.id, data]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !role) return <Loading />
  const locked = role.key === 'SUPER_ADMIN' || !can('SETTINGS', 'EDIT')
  const dirty = JSON.stringify(perms) !== JSON.stringify(role.perms)
  const toggle = (module: string, letter: string) => setPerms((p) => {
    const cur = p[module] ?? { actions: '', scope: 'OWN' }
    let actions = cur.actions.includes(letter) ? cur.actions.replace(letter, '') : cur.actions + letter
    if (letter === 'V' && !actions.includes('V')) actions = ''
    else if (actions && !actions.includes('V')) actions = 'V' + actions
    const next = { ...p }
    if (actions) next[module] = { ...cur, actions: ACTIONS.map(([l]) => l).filter((l) => actions.includes(l)).join('') }
    else delete next[module]
    return next
  })
  async function save() {
    setBusy(true)
    if (await act(() => api(`/settings/roles/${role.id}/permissions`, { method: 'PUT', body: { perms } }), 'Permissions saved')) { reload(); if (me.roles.some((r) => r.id === role.id)) await reloadMe() }
    setBusy(false)
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chips value={role.id} onChange={setRoleId} options={data.items.map((r) => ({ value: r.id, label: r.name }))} />
        {can('SETTINGS', 'CREATE') && <Button onClick={() => setAdd(true)}><Plus size={16} />Add role</Button>}
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0"><div className="font-display text-[15px] font-semibold">{role.name}</div><div className="text-[13px] text-muted">{role.description || 'Custom role'}. {role.userCount} {role.userCount === 1 ? 'person has' : 'people have'} this role.</div></div>
          <div className="flex gap-2">
            {!role.isSystem && can('SETTINGS', 'DELETE') && <Button variant="danger" onClick={() => setDel(true)}><Trash2 size={15} />Delete role</Button>}
            {!locked && <Button variant="primary" disabled={!dirty} loading={busy} onClick={save}>Save permissions</Button>}
          </div>
        </div>
        {role.key === 'SUPER_ADMIN' && <p className="border-b border-line bg-accent-soft px-4 py-2 text-[13px]">Super Admin always has every permission on all records. It cannot be changed.</p>}
        <Table>
          <thead><tr><Th>Module</Th>{ACTIONS.map(([l, name]) => <Th key={l} className="text-center">{name}</Th>)}<Th>Which records</Th></tr></thead>
          <tbody>{MODULES.map(([key, label]) => {
            const p = perms[key]
            return (
              <tr key={key} className={cn(!p && 'text-muted')}>
                <Td className="font-medium whitespace-nowrap">{label}</Td>
                {ACTIONS.map(([l, name]) => <Td key={l} className="text-center"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" aria-label={`${label}: ${name}`} disabled={locked} checked={!!p?.actions.includes(l)} onChange={() => toggle(key, l)} /></Td>)}
                <Td><Select className="h-8 w-44 text-[13px]" aria-label={`${label}: which records`} disabled={locked || !p} value={p?.scope ?? 'OWN'} onChange={(e) => setPerms((s) => ({ ...s, [key]: { ...s[key], scope: e.target.value } }))}>{SCOPES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</Select></Td>
              </tr>
            )
          })}</tbody>
        </Table>
      </Card>
      <p className="text-xs text-muted">Own records: only what the person created or is assigned. Team: also the people who report to them and their team mates. Department: everyone in their department. A change applies the next time each person opens a page.</p>
      <FormDialog open={add} onClose={() => setAdd(false)} title="Add role" submitLabel="Add role" size="sm" fields={[{ name: 'name', label: 'Role name', required: true, full: true }, { name: 'description', label: 'What this role is for', full: true }]}
        onSubmit={async (v) => { const r = await api('/settings/roles', { body: v }); toast.success('Role added. Now choose its permissions.'); reload(); await reloadLookups(); setRoleId(r.id) }} />
      <ConfirmDialog open={del} onClose={() => setDel(false)} title={`Delete the role ${role.name}?`} confirmLabel="Delete role" danger onConfirm={async () => { await api(`/settings/roles/${role.id}`, { method: 'DELETE' }); toast.success('Role deleted'); setRoleId(''); reload(); await reloadLookups() }}>This cannot be undone.</ConfirmDialog>
    </div>
  )
}

function Structure() {
  const { lookups, reloadLookups } = useAuth()
  const [members, setMembers] = useState<{ row: any; reload: () => void } | null>(null)
  const users = userOptions(lookups)
  const depts = lookups.departments.map((d: any) => ({ value: d.id, label: d.name }))
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-display text-[15px] font-semibold">Branches</h2>
        <Resource path="/settings/branches" module="SETTINGS" noun="branch" afterSave={reloadLookups} defaults={{ isActive: true }} toForm={(r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? '']))}
          fields={[{ name: 'name', label: 'Branch', required: true }, { name: 'code', label: 'Short code', required: true, placeholder: 'HO' }, { name: 'gstin', label: 'GSTIN, if separate' }, { name: 'phone', label: 'Phone' }, { name: 'addressLine1', label: 'Address', full: true }, { name: 'city', label: 'City' }, { name: 'stateCode', label: 'State', type: 'select', options: stateOptions(lookups) }, { name: 'pincode', label: 'PIN code' }, { name: 'isActive', label: 'Open', type: 'checkbox', placeholder: 'This branch is in use' }]}
          columns={[{ header: 'Branch', cell: (r) => <Two top={r.name} bottom={r.code} /> }, { header: 'City', cell: (r) => [r.city, r.state].filter(Boolean).join(', ') }, { header: 'GSTIN', cell: (r) => <span className="num">{r.gstin}</span> }, { header: 'Open', cell: (r) => (r.isActive ? 'Yes' : 'No') }]} />
      </section>
      <section className="space-y-2">
        <h2 className="font-display text-[15px] font-semibold">Departments</h2>
        <Resource path="/settings/departments" module="SETTINGS" noun="department" afterSave={reloadLookups} toForm={(r) => ({ name: r.name, code: r.code ?? '', headId: r.headId ?? '' })}
          fields={[{ name: 'name', label: 'Department', required: true }, { name: 'code', label: 'Short code' }, { name: 'headId', label: 'Head', type: 'select', options: users }]}
          columns={[{ header: 'Department', cell: (r) => <span className="font-medium">{r.name}</span> }, { header: 'Head', cell: (r) => personName(r.head) }, { header: 'People', right: true, cell: (r) => r._count.members }]} />
      </section>
      <section className="space-y-2">
        <h2 className="font-display text-[15px] font-semibold">Teams</h2>
        <Resource path="/settings/teams" module="SETTINGS" noun="team" afterSave={reloadLookups} toForm={(r) => ({ name: r.name, departmentId: r.departmentId ?? '', leadId: r.leadId ?? '' })} empty="No teams yet. A team groups people for the Team access scope."
          fields={[{ name: 'name', label: 'Team', required: true }, { name: 'departmentId', label: 'Department', type: 'select', options: depts }, { name: 'leadId', label: 'Team lead', type: 'select', options: users }]}
          rowActions={(r, ctx) => <Button size="sm" onClick={() => setMembers({ row: r, reload: ctx.reload })}>Members</Button>}
          columns={[{ header: 'Team', cell: (r) => <span className="font-medium">{r.name}</span> }, { header: 'Department', cell: (r) => r.department?.name }, { header: 'Lead', cell: (r) => personName(r.lead) }, { header: 'Members', right: true, cell: (r) => r.members.length }]} />
      </section>
      <FormDialog open={!!members} onClose={() => setMembers(null)} title={`Members of ${members?.row.name ?? ''}`} submitLabel="Save members" initial={{ userIds: members?.row.members.map((m: any) => m.userId) ?? [] }}
        fields={[{ name: 'userIds', label: 'Tap a name to add or remove it', type: 'multi', options: users }]}
        onSubmit={async (v) => { await api(`/settings/teams/${members!.row.id}/members`, { method: 'PUT', body: v }); toast.success('Members saved'); members!.reload(); await reloadLookups() }} />
    </div>
  )
}

function Lists() {
  const { reloadLookups, lookups } = useAuth()
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-2">
        <h2 className="font-display text-[15px] font-semibold">Lead stages</h2>
        <Resource path="/settings/lead-stages" module="SETTINGS" noun="stage" afterSave={reloadLookups} defaults={{ position: 10 }} toForm={(r) => ({ name: r.name, position: r.position })}
          fields={[{ name: 'name', label: 'Stage', required: true }, { name: 'position', label: 'Order', type: 'number', required: true, help: 'Lower numbers come first.' }]}
          columns={[{ header: 'Stage', cell: (r) => <span className="font-medium">{r.name}</span> }, { header: 'Order', right: true, cell: (r) => r.position }]} />
      </section>
      <section className="space-y-2">
        <h2 className="font-display text-[15px] font-semibold">Lead sources</h2>
        <Resource path="/settings/lead-sources" module="SETTINGS" noun="source" afterSave={reloadLookups} defaults={{ isActive: true }}
          fields={[{ name: 'name', label: 'Source', required: true }, { name: 'isActive', label: 'In use', type: 'checkbox', placeholder: 'Show in lists' }]}
          columns={[{ header: 'Source', cell: (r) => <span className="font-medium">{r.name}</span> }, { header: 'In use', cell: (r) => (r.isActive ? 'Yes' : 'No') }]} />
      </section>
      {!gstOff(lookups.organization) && <section className="space-y-2">
        <h2 className="font-display text-[15px] font-semibold">GST rates</h2>
        <Resource path="/settings/tax-rates" module="SETTINGS" noun="rate" afterSave={reloadLookups} defaults={{ isActive: true }}
          fields={[{ name: 'name', label: 'Name', required: true, placeholder: 'GST 18%' }, { name: 'rate', label: 'Rate (%)', type: 'number', required: true }, { name: 'isDefault', label: 'Default', type: 'checkbox', placeholder: 'Use for new lines' }, { name: 'isActive', label: 'In use', type: 'checkbox', placeholder: 'Show in lists' }]}
          columns={[{ header: 'Rate', cell: (r) => <span className="font-medium">{r.name}</span> }, { header: 'Percent', right: true, cell: (r) => `${r.rate}%` }, { header: 'Default', cell: (r) => (r.isDefault ? 'Yes' : '') }, { header: 'In use', cell: (r) => (r.isActive ? 'Yes' : 'No') }]} />
      </section>}
      <p className="self-end text-xs text-muted">Services and packages are under Quotations. Leave types are under HR. Expense categories and bank accounts are under Finance.</p>
    </div>
  )
}

function Email() {
  const { can, me } = useAuth()
  const { data, reload } = useApi<{ config: any; isActive: boolean; hasPassword: boolean }>('/settings/integrations/smtp')
  const [to, setTo] = useState(me.email)
  const [testing, setTesting] = useState(false)
  if (!data) return <Loading />
  const c = data.config
  const edit = can('SETTINGS', 'EDIT')
  return (
    <div className="max-w-3xl space-y-4">
      <Panel title="Outgoing email (SMTP)" action={<Badge tone={data.isActive && c.host ? 'good' : 'mute'}>{data.isActive && c.host ? 'Set up' : 'Not set up'}</Badge>}>
        <p className="mb-4 text-[13px] text-muted">Quotations, invoices and payment reminders are emailed through this mailbox. With a Hostinger mailbox: host smtp.hostinger.com, port 465, secure connection on, and the mailbox address and password. Until this is set up, emails are recorded as failed and nothing is sent.</p>
        {edit ? (
          <InlineForm key={JSON.stringify(c)} submitLabel="Save email settings"
            initial={{ host: c.host ?? '', port: c.port ?? 465, secure: c.secure ?? true, user: c.user ?? '', password: '', fromName: c.fromName ?? '', fromEmail: c.fromEmail ?? '', isActive: data.isActive || !c.host }}
            fields={[{ name: 'host', label: 'SMTP host', required: true, placeholder: 'smtp.hostinger.com' }, { name: 'port', label: 'Port', type: 'number', required: true }, { name: 'user', label: 'Username', placeholder: 'accounts@yourcompany.com' }, { name: 'password', label: data.hasPassword ? 'Password (leave empty to keep)' : 'Password', type: 'password' }, { name: 'fromName', label: 'Sender name', required: true, placeholder: 'Your company' }, { name: 'fromEmail', label: 'Sender email', type: 'email', required: true }, { name: 'secure', label: 'Secure connection', type: 'checkbox', placeholder: 'Use SSL (port 465)' }, { name: 'isActive', label: 'Sending', type: 'checkbox', placeholder: 'Send emails through this mailbox' }]}
            onSubmit={async (v) => { await api('/settings/integrations/smtp', { method: 'PUT', body: v }); toast.success('Email settings saved'); reload() }} />
        ) : <p className="text-sm text-muted">You can view settings but not change them.</p>}
      </Panel>
      {edit && (
        <Panel title="Send a test email">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-60 flex-1 flex-col gap-1"><span className="text-[13px] font-medium text-muted">Send to</span><Input type="email" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <Button loading={testing} onClick={async () => { setTesting(true); try { const r = await api('/settings/integrations/smtp/test', { body: { to } }); if (r.sent) toast.success('Test email sent. Check the inbox.'); else toast.error(r.error ?? 'The test email could not be sent') } catch (e) { toast.error((e as Error).message) } finally { setTesting(false) } }}>Send test</Button>
          </div>
        </Panel>
      )}
      <Panel title="WhatsApp">
        <p className="text-sm text-muted">No setup is needed. The WhatsApp buttons on leads, quotations and invoices open WhatsApp on your phone or computer with the message already written, and you press send. Messages are not sent automatically.</p>
      </Panel>
    </div>
  )
}

function WebsiteForm() {
  const { lookups } = useAuth()
  const key = lookups.organization.settings?.leadFormKey
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const url = `${origin}/api/v1/public/leads?key=${key ?? ''}`
  const snippet = `<form id="enquiry">
  <input name="name" placeholder="Your name" required>
  <input name="phone" placeholder="Phone">
  <input name="email" type="email" placeholder="Email">
  <input name="company" placeholder="Company">
  <textarea name="message" placeholder="What do you need?"></textarea>
  <button>Send enquiry</button>
</form>
<script>
document.getElementById('enquiry').addEventListener('submit', async (e) => {
  e.preventDefault()
  const data = Object.fromEntries(new FormData(e.target))
  const res = await fetch('${url}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  alert(res.ok ? 'Thank you. We will contact you soon.' : 'Something went wrong. Please call us.')
  if (res.ok) e.target.reset()
})
</script>`
  const copy = (text: string, what: string) => navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`))
  if (!key) return <Empty>The form key is visible only to people who can view settings.</Empty>
  return (
    <div className="max-w-3xl space-y-4">
      <Panel title="Send website enquiries straight into Leads">
        <p className="mb-3 text-sm text-muted">Any form on your website can post to this address. Each enquiry becomes a lead with the source Website form, and is assigned by lead rotation if that is on.</p>
        <div className="flex items-center gap-2"><code className="num min-w-0 flex-1 truncate rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px]">{url}</code><Button onClick={() => copy(url, 'Address')}><Copy size={15} />Copy</Button></div>
        <p className="mt-3 text-[13px] text-muted">Fields it accepts: name (required), phone, email, company, city, state and message.</p>
      </Panel>
      <Panel title="Example form to paste into a web page" action={<Button size="sm" onClick={() => copy(snippet, 'Code')}><Copy size={14} />Copy code</Button>}>
        <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 text-[12.5px] leading-relaxed"><code>{snippet}</code></pre>
      </Panel>
    </div>
  )
}

const short = (v: unknown) => { if (v === null || v === undefined) return ''; const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > 90 ? s.slice(0, 90) + '…' : s }
function AuditLog() {
  return (
    <>
      <Resource path="/settings/audit-logs" module="SETTINGS" noun="entry" search="Search person or record type" canDelete={false} pageSize={50} empty="Nothing recorded yet."
        columns={[
          { header: 'When', cell: (r) => <span className="whitespace-nowrap text-muted">{fmtDateTime(r.createdAt)}</span> }, { header: 'Who', cell: (r) => personName(r.user) || 'System' },
          { header: 'Did', cell: (r) => <Status value={r.action} label={human(r.action)} /> }, { header: 'To', cell: (r) => <Two top={<span className="font-normal">{r.entityType}</span>} bottom={r.module ? human(r.module) : undefined} /> },
          { header: 'Details', className: 'max-w-md', cell: (r) => <span className="num text-xs break-all text-muted">{short(r.after)}</span> }, { header: 'From', cell: (r) => <span className="num text-xs text-muted">{r.ipAddress}</span> },
        ]} />
      <p className="mt-3 text-xs text-muted">Every sign-in, change, approval and permission change is recorded here and cannot be edited.</p>
    </>
  )
}

export default function Settings() {
  const [tab, setTab] = useState('company')
  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} options={[{ value: 'company', label: 'Company' }, { value: 'users', label: 'Users' }, { value: 'roles', label: 'Roles and permissions' }, { value: 'structure', label: 'Branches and teams' }, { value: 'lists', label: 'Lists' }, { value: 'email', label: 'Email and WhatsApp' }, { value: 'form', label: 'Website form' }, { value: 'audit', label: 'Audit log' }]} />
      {tab === 'company' && <Company />}
      {tab === 'users' && <Users />}
      {tab === 'roles' && <Roles />}
      {tab === 'structure' && <Structure />}
      {tab === 'lists' && <Lists />}
      {tab === 'email' && <Email />}
      {tab === 'form' && <WebsiteForm />}
      {tab === 'audit' && <AuditLog />}
    </div>
  )
}
