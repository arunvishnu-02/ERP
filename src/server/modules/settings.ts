import { Router, type Request, type Response } from '../core/router'
import { authorize, can, fullName, hashPassword } from '../core/auth'
import { crud } from '../core/crud'
import { bad, conflict, forbidden, notFound, parse, shape } from '../core/http'
import { sendMail } from '../core/mail'
import { LETTER, LETTER_OF } from '../core/seed'
import { audit, encrypt, nextNumber, stateName, STATES, today } from '../core/util'
import { prisma, type Tx } from '../db'
import * as E from '../../generated/prisma/enums'

/** Small reference lists every screen needs for its dropdowns. */
export async function lookups(req: Request, res: Response) {
  const w = { organizationId: req.user.organizationId }
  const [org, users, departments, branches, teams, roles, leadStages, leadSources, pipelines, taxRates, expenseCategories, leaveTypes, services, packages, bankAccounts, vendors, employees, google] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: w.organizationId } }),
    prisma.user.findMany({ where: { ...w, deletedAt: null }, select: { id: true, firstName: true, lastName: true, departmentId: true, status: true }, orderBy: { firstName: 'asc' } }),
    prisma.department.findMany({ where: w, orderBy: { name: 'asc' } }),
    prisma.branch.findMany({ where: w, orderBy: { name: 'asc' } }),
    prisma.team.findMany({ where: w, include: { members: { select: { userId: true } } }, orderBy: { name: 'asc' } }),
    prisma.role.findMany({ where: w, select: { id: true, name: true, key: true }, orderBy: { createdAt: 'asc' } }),
    prisma.leadStage.findMany({ where: w, orderBy: { position: 'asc' } }),
    prisma.leadSource.findMany({ where: w, orderBy: { name: 'asc' } }),
    prisma.pipeline.findMany({ where: w, include: { stages: { orderBy: { position: 'asc' } } } }),
    prisma.taxRate.findMany({ where: { ...w, isActive: true }, orderBy: { rate: 'asc' } }),
    prisma.expenseCategory.findMany({ where: w, orderBy: { name: 'asc' } }),
    prisma.leaveType.findMany({ where: w, orderBy: { name: 'asc' } }),
    prisma.service.findMany({ where: { ...w, isActive: true }, orderBy: { name: 'asc' } }),
    prisma.servicePackage.findMany({ where: { ...w, isActive: true }, include: { items: { include: { service: true } } }, orderBy: { name: 'asc' } }),
    prisma.bankAccount.findMany({ where: { ...w, isActive: true }, orderBy: { name: 'asc' } }),
    prisma.vendor.findMany({ where: w, orderBy: { name: 'asc' } }),
    prisma.employee.findMany({ where: w, select: { id: true, firstName: true, lastName: true, userId: true, status: true }, orderBy: { firstName: 'asc' } }),
    prisma.integrationSetting.findUnique({ where: { organizationId_provider: { organizationId: w.organizationId, provider: 'GOOGLE' } }, select: { isActive: true } }),
  ])
  const settings = { ...((org.settings as any) ?? {}) }
  if (!can(req.user, 'SETTINGS', 'VIEW')) delete settings.leadFormKey
  res.json({
    organization: { ...org, settings },
    users: users.map((u) => ({ id: u.id, name: fullName(u), departmentId: u.departmentId, status: u.status })),
    employees: employees.map((e) => ({ id: e.id, name: fullName(e), userId: e.userId, status: e.status })),
    departments, branches, teams, roles, leadStages, leadSources, pipelines, taxRates, expenseCategories, leaveTypes, services, packages, bankAccounts, vendors,
    states: STATES,
    google: { drive: !!google?.isActive },
    enums: Object.fromEntries(Object.entries(E).map(([k, v]) => [k, Object.values(v as object)])),
  })
}

export const settingsRouter = Router()
const S = 'SETTINGS'

settingsRouter.patch('/organization', authorize(S, 'EDIT'), async (req, res) => {
  const d = parse(shape({
    name: 's', legalName: 's?', gstin: 's?', pan: 's?', email: 's?', phone: 's?', addressLine1: 's?', addressLine2: 's?', city: 's?', stateCode: 's?', pincode: 's?',
    financialYearStartMonth: 'i?', docPrefix: 's?', paymentTermsDays: 'i?', invoiceTerms: 's?', quotationTerms: 's?', bankDetails: 's?',
    gstRegistered: 'b?', website: 's?', tagline: 's?', upiId: 's?', signatory: 's?', logo: 'j?',
  }).partial(), req.body)
  const { docPrefix, paymentTermsDays, invoiceTerms, quotationTerms, bankDetails, gstRegistered, website, tagline, upiId, signatory, logo, ...cols } = d
  // The logo is kept as a small data URL so it also shows on the public quotation and invoice pages.
  if (logo != null && (typeof logo !== 'string' || !/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(logo) || logo.length > 400_000)) throw bad('Use a PNG, JPG, WebP or SVG logo smaller than 300 KB')
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: req.user.organizationId } })
  const settings = { ...((org.settings as any) ?? {}) }
  for (const [k, v] of Object.entries({ docPrefix, paymentTermsDays, invoiceTerms, quotationTerms, bankDetails, gstRegistered, website, tagline, upiId, signatory, logo })) if (v !== undefined) settings[k] = v
  if (cols.stateCode !== undefined) cols.state = stateName(cols.stateCode)
  if (cols.financialYearStartMonth === null) delete cols.financialYearStartMonth
  const updated = await prisma.organization.update({ where: { id: org.id }, data: { ...cols, settings } })
  await audit(prisma as unknown as Tx, req, 'UPDATE', S, 'Organization', org.id, null, d)
  res.json(updated)
})

// ── Users ──
const userInclude = { roles: { include: { role: { select: { id: true, name: true, key: true } } } }, department: { select: { id: true, name: true } }, employee: { select: { id: true, designation: true } } }
const userSpec = { firstName: 's', lastName: 's?', email: 's', phone: 's?', departmentId: 'id?', branchId: 'id?', managerId: 'id?' } as const

async function assertAdminRemains(tx: Tx, organizationId: string) {
  const n = await tx.user.count({ where: { organizationId, status: 'ACTIVE', deletedAt: null, roles: { some: { role: { key: 'SUPER_ADMIN' } } } } })
  if (!n) throw bad('At least one active Super Admin is needed')
}

settingsRouter.get('/users', authorize(S, 'VIEW'), async (req, res) => {
  const items = await prisma.user.findMany({ where: { organizationId: req.user.organizationId, deletedAt: null }, include: userInclude, orderBy: { createdAt: 'asc' } })
  res.json({ items, total: items.length })
})

settingsRouter.post('/users', authorize(S, 'CREATE'), async (req, res) => {
  const d = parse(shape({ ...userSpec, password: 's', roleIds: 's[]', designation: 's?' }), req.body)
  if (d.password.length < 8) throw bad('Use a password of at least 8 characters')
  if (!d.roleIds.length) throw bad('Choose at least one role')
  const organizationId = req.user.organizationId
  const passwordHash = await hashPassword(d.password)
  const user = await prisma.$transaction(async (tx) => {
    const roles = await tx.role.findMany({ where: { id: { in: d.roleIds }, organizationId } })
    if (roles.length !== d.roleIds.length) throw bad('Choose a valid role')
    const u = await tx.user.create({
      data: {
        organizationId, email: d.email.toLowerCase(), firstName: d.firstName, lastName: d.lastName ?? null, phone: d.phone ?? null, departmentId: d.departmentId ?? null,
        branchId: d.branchId ?? null, managerId: d.managerId ?? null, passwordHash, status: 'ACTIVE', mustChangePassword: true, roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
    })
    await tx.employee.create({
      data: { organizationId, userId: u.id, employeeCode: await nextNumber(tx, organizationId, 'EMPLOYEE'), firstName: d.firstName, lastName: d.lastName ?? null, designation: d.designation || roles[0].name, dateOfJoining: today(), departmentId: d.departmentId ?? null, branchId: d.branchId ?? null, phone: d.phone ?? null },
    })
    await audit(tx, req, 'CREATE', S, 'User', u.id, null, { email: u.email, roles: roles.map((r) => r.key) })
    return tx.user.findUniqueOrThrow({ where: { id: u.id }, include: userInclude })
  })
  res.status(201).json(user)
})

settingsRouter.patch('/users/:id', authorize(S, 'EDIT'), async (req, res) => {
  const d = parse(shape({ ...userSpec, 'roleIds?': 's[]', 'status?': ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] }).partial(), req.body)
  const organizationId = req.user.organizationId
  const user = await prisma.$transaction(async (tx) => {
    const before = await tx.user.findFirst({ where: { id: String(req.params.id), organizationId, deletedAt: null } })
    if (!before) throw notFound('User')
    const { roleIds, ...cols } = d
    if (cols.email) cols.email = cols.email.toLowerCase()
    await tx.user.update({ where: { id: before.id }, data: cols })
    if (roleIds) {
      if (!roleIds.length) throw bad('Choose at least one role')
      const roles = await tx.role.findMany({ where: { id: { in: roleIds }, organizationId } })
      if (roles.length !== roleIds.length) throw bad('Choose a valid role')
      await tx.userRole.deleteMany({ where: { userId: before.id } })
      await tx.userRole.createMany({ data: roleIds.map((roleId: string) => ({ userId: before.id, roleId })) })
    }
    if (cols.status && cols.status !== 'ACTIVE') await tx.session.deleteMany({ where: { userId: before.id } })
    await assertAdminRemains(tx, organizationId)
    await audit(tx, req, roleIds ? 'PERMISSION_CHANGE' : 'UPDATE', S, 'User', before.id, null, d)
    return tx.user.findUniqueOrThrow({ where: { id: before.id }, include: userInclude })
  })
  res.json(user)
})

settingsRouter.post('/users/:id/reset-password', authorize(S, 'EDIT'), async (req, res) => {
  const d = parse(shape({ password: 's' }), req.body)
  if (d.password.length < 8) throw bad('Use a password of at least 8 characters')
  const user = await prisma.user.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId, deletedAt: null } })
  if (!user) throw notFound('User')
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(d.password), mustChangePassword: true } })
  await prisma.session.deleteMany({ where: { userId: user.id } })
  await audit(prisma as unknown as Tx, req, 'UPDATE', S, 'User', user.id, null, { passwordReset: true })
  res.status(204).end()
})

// ── Roles and permissions ──
settingsRouter.get('/roles', authorize(S, 'VIEW'), async (req, res) => {
  const roles = await prisma.role.findMany({ where: { organizationId: req.user.organizationId }, include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { createdAt: 'asc' } })
  res.json({
    items: roles.map((r) => {
      const perms: Record<string, { actions: string; scope: string }> = {}
      for (const rp of r.permissions) {
        const p = (perms[rp.permission.module] ??= { actions: '', scope: rp.scope })
        p.actions += LETTER_OF[rp.permission.action]
      }
      // the database returns permissions in no fixed order; always list the letters as V C E D A X I
      for (const p of Object.values(perms)) p.actions = [...'VCEDAXI'].filter((l) => p.actions.includes(l)).join('')
      return { id: r.id, name: r.name, key: r.key, description: r.description, isSystem: r.isSystem, userCount: r._count.users, perms }
    }),
  })
})

settingsRouter.post('/roles', authorize(S, 'CREATE'), async (req, res) => {
  const d = parse(shape({ name: 's', description: 's?' }), req.body)
  const key = d.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (!key) throw bad('Give the role a name')
  const role = await prisma.role.create({ data: { organizationId: req.user.organizationId, name: d.name, description: d.description ?? null, key } })
  await audit(prisma as unknown as Tx, req, 'CREATE', S, 'Role', role.id, null, d)
  res.status(201).json(role)
})

settingsRouter.put('/roles/:id/permissions', authorize(S, 'EDIT'), async (req, res) => {
  const body = (req.body?.perms ?? {}) as Record<string, { actions?: string; scope?: string }>
  const role = await prisma.role.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } })
  if (!role) throw notFound('Role')
  if (role.key === 'SUPER_ADMIN') throw forbidden('Super Admin always has every permission')
  const all = await prisma.permission.findMany()
  const rows: { roleId: string; permissionId: string; scope: any }[] = []
  for (const [module, v] of Object.entries(body)) {
    let letters = [...new Set([...(v.actions ?? '')])].filter((l) => LETTER[l])
    if (!letters.length) continue
    if (!letters.includes('V')) letters = ['V', ...letters]
    const scope = (E.AccessScope as any)[v.scope ?? 'OWN'] ?? 'OWN'
    for (const l of letters) {
      const p = all.find((x) => x.module === module && x.action === LETTER[l])
      if (p) rows.push({ roleId: role.id, permissionId: p.id, scope })
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } })
    await tx.rolePermission.createMany({ data: rows })
    await audit(tx, req, 'PERMISSION_CHANGE', S, 'Role', role.id, null, body)
  })
  res.status(204).end()
})

settingsRouter.delete('/roles/:id', authorize(S, 'DELETE'), async (req, res) => {
  const role = await prisma.role.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId }, include: { _count: { select: { users: true } } } })
  if (!role) throw notFound('Role')
  if (role.isSystem) throw conflict('The built-in roles cannot be deleted')
  if (role._count.users) throw conflict('Move its users to another role first')
  await prisma.role.delete({ where: { id: role.id } })
  res.status(204).end()
})

// ── Email (SMTP) ──
settingsRouter.get('/integrations/smtp', authorize(S, 'VIEW'), async (req, res) => {
  const s = await prisma.integrationSetting.findUnique({ where: { organizationId_provider: { organizationId: req.user.organizationId, provider: 'SMTP' } } })
  res.json({ config: s?.config ?? {}, isActive: s?.isActive ?? false, hasPassword: !!s?.secretCiphertext })
})

settingsRouter.put('/integrations/smtp', authorize(S, 'EDIT'), async (req, res) => {
  const d = parse(shape({ host: 's', port: 'i', secure: 'b?', user: 's?', password: 's?', fromName: 's', fromEmail: 's', isActive: 'b?' }), req.body)
  const organizationId = req.user.organizationId
  const config = { host: d.host, port: d.port, secure: !!d.secure, user: d.user ?? '', fromName: d.fromName, fromEmail: d.fromEmail }
  const secret = d.password ? encrypt(d.password) : {}
  await prisma.integrationSetting.upsert({
    where: { organizationId_provider: { organizationId, provider: 'SMTP' } },
    create: { organizationId, provider: 'SMTP', config, isActive: d.isActive ?? true, ...secret },
    update: { config, isActive: d.isActive ?? true, ...secret },
  })
  await audit(prisma as unknown as Tx, req, 'UPDATE', S, 'IntegrationSetting', null, null, config)
  res.status(204).end()
})

// ── Email (Resend) ──
settingsRouter.get('/integrations/resend', authorize(S, 'VIEW'), async (req, res) => {
  const s = await prisma.integrationSetting.findUnique({ where: { organizationId_provider: { organizationId: req.user.organizationId, provider: 'RESEND' } } })
  res.json({ config: s?.config ?? {}, isActive: s?.isActive ?? false, hasKey: !!s?.secretCiphertext })
})

settingsRouter.put('/integrations/resend', authorize(S, 'EDIT'), async (req, res) => {
  const d = parse(shape({ apiKey: 's?', fromName: 's', fromEmail: 's', isActive: 'b?' }), req.body)
  const organizationId = req.user.organizationId
  const key = d.apiKey?.trim()
  if (key && !/^re_[\w-]{8,}$/.test(key)) throw bad('A Resend API key starts with re_')
  const fromEmail = d.fromEmail.trim().toLowerCase()
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fromEmail)) throw bad('Write the sender email like info@ciphermutex.com')
  const fromName = d.fromName.trim().replace(/[<>"]/g, '')
  if (!fromName) throw bad('Give a sender name')
  const old = await prisma.integrationSetting.findUnique({ where: { organizationId_provider: { organizationId, provider: 'RESEND' } } })
  if (!key && !old?.secretCiphertext) throw bad('Paste the Resend API key')
  const config = { fromName, fromEmail }
  const secret = key ? encrypt(key) : {}
  await prisma.integrationSetting.upsert({
    where: { organizationId_provider: { organizationId, provider: 'RESEND' } },
    create: { organizationId, provider: 'RESEND', config, isActive: d.isActive ?? true, ...secret },
    update: { config, isActive: d.isActive ?? true, ...secret },
  })
  await audit(prisma as unknown as Tx, req, 'UPDATE', S, 'IntegrationSetting', null, null, { resend: { ...config, isActive: d.isActive ?? true } })
  res.status(204).end()
})

settingsRouter.post('/integrations/smtp/test', authorize(S, 'EDIT'), async (req, res) => {
  const d = parse(shape({ to: 's' }), req.body)
  res.json(await sendMail(req.user.organizationId, { to: d.to, subject: 'Test email from CX CRM ERP', text: 'Email is set up correctly.', sentById: req.user.id }))
})

settingsRouter.get('/audit-logs', authorize(S, 'VIEW'), async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  const where: any = { organizationId: req.user.organizationId }
  if (q) where.OR = [{ entityType: { contains: q } }, { user: { firstName: { contains: q } } }]
  if (typeof req.query.module === 'string' && req.query.module) where.module = req.query.module
  const take = Math.min(Number(req.query.limit) || 50, 200)
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { user: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take, skip: Number(req.query.offset) || 0 }),
    prisma.auditLog.count({ where }),
  ])
  res.json({ items, total })
})

// ── Company structure and reference lists ──
settingsRouter.use('/branches', crud({ model: 'branch', module: S, label: 'Branch', fields: { name: 's', code: 's', gstin: 's?', addressLine1: 's?', city: 's?', stateCode: 's?', pincode: 's?', phone: 's?', 'isActive?': 'b' }, orderBy: { name: 'asc' }, beforeCreate: (d) => { d.state = stateName(d.stateCode) }, beforeUpdate: (d) => { if (d.stateCode !== undefined) d.state = stateName(d.stateCode) } }))
settingsRouter.use('/departments', crud({ model: 'department', module: S, label: 'Department', fields: { name: 's', code: 's?', branchId: 'id?', headId: 'id?' }, orderBy: { name: 'asc' }, include: { head: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { members: true } } } }))
settingsRouter.use('/teams', crud({ model: 'team', module: S, label: 'Team', fields: { name: 's', departmentId: 'id?', leadId: 'id?' }, orderBy: { name: 'asc' }, include: { members: { select: { userId: true } }, lead: { select: { id: true, firstName: true, lastName: true } }, department: { select: { id: true, name: true } } } }))
settingsRouter.put('/teams/:id/members', authorize(S, 'EDIT'), async (req, res) => {
  const d = parse(shape({ userIds: 's[]' }), req.body)
  const team = await prisma.team.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } })
  if (!team) throw notFound('Team')
  await prisma.$transaction([prisma.teamMember.deleteMany({ where: { teamId: team.id } }), prisma.teamMember.createMany({ data: d.userIds.map((userId: string) => ({ teamId: team.id, userId })) })])
  res.status(204).end()
})
settingsRouter.use('/lead-stages', crud({ model: 'leadStage', module: S, label: 'Stage', fields: { name: 's', position: 'i', color: 's?' }, orderBy: { position: 'asc' } }))
settingsRouter.use('/lead-sources', crud({ model: 'leadSource', module: S, label: 'Source', fields: { name: 's', 'isActive?': 'b' }, orderBy: { name: 'asc' } }))
settingsRouter.use('/tax-rates', crud({ model: 'taxRate', module: S, label: 'Tax rate', fields: { name: 's', rate: 'n', 'isDefault?': 'b', 'isActive?': 'b' }, orderBy: { rate: 'asc' } }))
