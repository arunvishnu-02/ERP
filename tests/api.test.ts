// End-to-end API tests on a real MySQL/MariaDB database. Run with: npm test
// The database named in TEST_DATABASE_URL is emptied first, so never point it at real data.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { after, before, test } from 'node:test'
import mariadb from 'mariadb'

const url = process.env.TEST_DATABASE_URL ?? 'mysql://cx:cx@127.0.0.1:3306/cx_test'
const uploads = `/tmp/cx-test-uploads-${process.pid}`
let handleApi: (r: Request) => Promise<Response>
const S: any = { ids: {} }
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const plusDays = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

before(async () => {
  Object.assign(process.env, { DATABASE_URL: url, ENCRYPTION_KEY: 'ab'.repeat(32), UPLOAD_DIR: uploads, RUN_JOBS: 'false', APP_URL: 'http://app.test' })
  const u = new URL(url)
  const conn = await mariadb.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: u.username, password: u.password, database: u.pathname.slice(1) })
  await conn.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const t of await conn.query('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()')) await conn.query(`DROP TABLE \`${t.name}\``)
  await conn.end()
  handleApi = (await import('../src/server/app')).handleApi
})
after(async () => {
  await (await import('../src/server/db')).prisma.$disconnect()
  fs.rmSync(uploads, { recursive: true, force: true })
})

/** `session` is the session cookie of the person making the call, as "cx_session=...". */
async function call(method: string, path: string, session?: string, body?: any, headers: Record<string, string> = {}) {
  const form = body instanceof FormData
  const res = await handleApi(new Request('http://app.test/api/v1' + path, {
    method,
    headers: { ...(body && !form ? { 'content-type': 'application/json' } : {}), ...(session ? { cookie: session } : {}), ...(path.startsWith('/public/') ? {} : { 'x-requested-with': 'test' }), ...headers },
    body: form ? body : body ? JSON.stringify(body) : undefined,
  }))
  const text = await res.text()
  let parsed: any = text
  try { parsed = text ? JSON.parse(text) : null } catch {}
  return { status: res.status, body: parsed, headers: res.headers }
}
const cookieOf = (r: { headers: Headers }) => String(r.headers.get('set-cookie')).split(';')[0]
async function signIn(email: string, password: string) {
  const r = await call('POST', '/auth/login', undefined, { email, password })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.match(String(r.headers.get('set-cookie')), /cx_session=.+HttpOnly/)
  return cookieOf(r)
}
async function ok(method: string, path: string, token?: string, body?: any) {
  const r = await call(method, path, token, body)
  assert.ok(r.status >= 200 && r.status < 300, `${method} ${path} -> ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`)
  return r.body
}
async function deny(method: string, path: string, token: string | undefined, body: any, status = 403) {
  const r = await call(method, path, token, body)
  assert.equal(r.status, status, `${method} ${path} -> ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
  return r.body
}
const setupBody = { companyName: 'Cipher Mutex', stateCode: '29', gstin: '29ABCDE1234F1Z5', firstName: 'Kiran', lastName: 'Rao', email: 'Admin@Example.com', password: 'Passw0rd!' }

test('first-run setup creates the company with no sample records', async () => {
  assert.equal((await ok('GET', '/auth/status')).needsSetup, true)
  const r = await call('POST', '/auth/setup', undefined, setupBody)
  assert.equal(r.status, 201)
  S.admin = cookieOf(r)
  assert.match(S.admin, /^cx_session=.{20,}/)
  assert.equal((await ok('GET', '/auth/status')).needsSetup, false)
  await deny('POST', '/auth/setup', undefined, setupBody, 409)
  const me = await ok('GET', '/auth/me', S.admin)
  assert.equal(me.roles[0].key, 'SUPER_ADMIN')
  assert.equal(me.perms.LEADS.VIEW, 'ALL')
  assert.equal(me.email, 'admin@example.com')
  S.lk = await ok('GET', '/lookups', S.admin)
  assert.equal(S.lk.roles.length, 9)
  assert.equal(S.lk.leadStages.length, 6)
  assert.equal(S.lk.organization.stateCode, '29')
  for (const p of ['/leads', '/customers', '/quotations', '/invoices', '/payments', '/projects', '/tasks', '/tickets', '/campaigns', '/services']) assert.equal((await ok('GET', p, S.admin)).total, 0, p)
  await deny('GET', '/leads', undefined, undefined, 401)
  await deny('GET', '/leads', 'cx_session=not-a-real-session', undefined, 401)
})

test('users get roles; wrong passwords and missing permissions are refused', async () => {
  const role = (k: string) => S.lk.roles.find((r: any) => r.key === k).id
  const dept = (n: string) => S.lk.departments.find((d: any) => d.name === n).id
  for (const [key, first, roleKey, d] of [['sales', 'Rohan', 'SALES_EXECUTIVE', 'Sales'], ['sales2', 'Meera', 'SALES_EXECUTIVE', 'Sales'], ['manager', 'Maya', 'MANAGER', 'Management'], ['accounts', 'Anil', 'ACCOUNTS', 'Accounts'], ['dev', 'Divya', 'DEVELOPER', 'Development'], ['hr', 'Hari', 'HR', 'HR']]) {
    const u = await ok('POST', '/settings/users', S.admin, { firstName: first, email: `${key}@example.com`, password: 'Passw0rd!', roleIds: [role(roleKey)], departmentId: dept(d) })
    assert.equal(u.passwordHash, undefined)
    S.ids[key] = u.id
    S[key] = await signIn(`${key}@example.com`, 'Passw0rd!')
  }
  S.ids.admin = (await ok('GET', '/auth/me', S.admin)).id
  await deny('POST', '/auth/login', undefined, { email: 'sales@example.com', password: 'wrong-password' }, 401)
  await deny('GET', '/settings/users', S.sales, undefined)
  await deny('POST', '/settings/users', S.admin, { firstName: 'Dup', email: 'sales@example.com', password: 'Passw0rd!', roleIds: [role('HR')] }, 409)
  assert.equal((await ok('GET', '/settings/users', S.admin)).total, 7)
})

test('leads: own-record scope, follow-ups, rotation, website form, import, notes and files', async () => {
  const l1 = await ok('POST', '/leads', S.sales, { firstName: 'Imran', lastName: 'Qureshi', companyName: 'UrbanNest Realty', phone: '919000000001', email: 'imran@urbannest.example', state: 'Kerala', sourceId: S.lk.leadSources[0].id, requirement: 'Website and ads', estimatedValue: 150000, nextFollowUpAt: plusDays(-1) })
  S.l1 = l1
  assert.equal(l1.ownerId, S.ids.sales)
  assert.match(l1.leadNumber, /^CX\/LD\/\d\d-\d\d\/0001$/)
  const l2 = await ok('POST', '/leads', S.admin, { firstName: 'Pooja', companyName: 'Vertex Pharma' })
  assert.equal((await ok('GET', '/leads', S.sales)).total, 1)
  assert.equal((await ok('GET', '/leads', S.sales2)).total, 0)
  assert.equal((await ok('GET', '/leads', S.admin)).total, 2)
  await deny('GET', `/leads/${l2.id}`, S.sales, undefined, 404)
  await deny('PATCH', `/leads/${l2.id}`, S.sales, { firstName: 'Changed' }, 404)
  await deny('DELETE', `/leads/${l1.id}`, S.sales, undefined)
  await deny('GET', '/leads/not-a-uuid', S.admin, undefined, 404)
  await deny('POST', '/leads', S.sales, { companyName: 'No name' }, 400)

  await ok('POST', `/leads/${l1.id}/log`, S.sales, { type: 'CALL', note: 'Wants a website with ads', nextFollowUpAt: plusDays(30) })
  const d1 = await ok('GET', `/leads/${l1.id}`, S.sales)
  assert.equal(d1.stage.name, 'Contacted')
  assert.equal(d1.followUps.length, 2)
  assert.ok((await ok('GET', `/activities?entityType=LEAD&entityId=${l1.id}`, S.sales)).items.length >= 2)
  assert.equal((await ok('GET', '/follow-ups', S.sales)).items.length, 1)
  await deny('PATCH', `/leads/${l1.id}`, S.sales, { stageId: S.lk.leadStages.find((s: any) => s.isWon).id }, 400)

  // rotation + website form
  const auto = await ok('GET', '/automations', S.admin)
  await ok('PUT', '/automations/rotation', S.admin, { assigneeIds: [S.ids.sales, S.ids.sales2] })
  await ok('PATCH', `/automations/${auto.rules.find((r: any) => r.trigger === 'LEAD_CREATED').id}`, S.admin, { isActive: true })
  const key = S.lk.organization.settings.leadFormKey
  await deny('POST', '/public/leads?key=wrong-key-wrong-key-wrong', undefined, { name: 'Nobody' }, 404)
  await ok('POST', `/public/leads?key=${key}`, undefined, { name: 'Web Person One', phone: '919000000002', message: 'Need SEO' })
  await ok('POST', `/public/leads?key=${key}`, undefined, { name: 'Web Person Two' })
  const all = (await ok('GET', '/leads?q=Web Person', S.admin)).items
  assert.deepEqual(all.map((l: any) => l.ownerId).sort(), [S.ids.sales, S.ids.sales2].sort())
  assert.equal(all[0].source.name, 'Website form')

  const imp = await ok('POST', '/leads/import', S.admin, { rows: [{ name: 'Import One', company: 'A Co', source: 'Referral', value: 5000 }, { company: 'Missing name' }] })
  assert.deepEqual([imp.created, imp.failed], [1, 1])
  await deny('POST', '/leads/import', S.sales, { rows: [{ name: 'x' }] })

  await ok('POST', '/notes', S.sales, { entityType: 'LEAD', entityId: l1.id, body: 'Prefers calls after 4 pm' })
  assert.equal((await ok('GET', `/notes?entityType=LEAD&entityId=${l1.id}`, S.sales)).items.length, 1)
  await deny('GET', `/notes?entityType=LEAD&entityId=${l1.id}`, S.dev, undefined)
  const fd = new FormData()
  fd.append('entityType', 'LEAD')
  fd.append('entityId', l1.id)
  fd.append('file', new Blob(['brief contents']), 'brief.txt')
  const att = await ok('POST', '/attachments', S.sales, fd)
  const dl = await handleApi(new Request(`http://app.test/api/v1/files/${att.file.id}/download`, { headers: { cookie: S.sales } }))
  assert.equal(await dl.text(), 'brief contents')
})

test('quotation: GST, approval, rejection, revision, sending, customer acceptance, conversion', async () => {
  const items = [{ description: 'Business website', quantity: 1, unitPrice: 60000, sacCode: '998314' }, { description: 'Ads management', quantity: 6, unit: 'months', unitPrice: 15000, discountPercent: 10 }]
  const q = await ok('POST', '/quotations', S.sales, { leadId: S.l1.id, items })
  assert.match(q.quotationNumber, /^CX\/QT\//)
  assert.deepEqual([q.taxableAmount, q.igstAmount, q.cgstAmount, q.totalAmount], [141000, 25380, 0, 166380]) // Kerala customer, Karnataka company: IGST
  assert.equal((await ok('GET', `/leads/${S.l1.id}`, S.sales)).stage.name, 'Proposal')
  await deny('POST', '/quotations', S.sales, { leadId: S.l1.id, items: [] }, 400)
  await ok('POST', `/quotations/${q.id}/submit`, S.sales)
  await deny('POST', `/quotations/${q.id}/approve`, S.sales, undefined)
  await deny('PATCH', `/quotations/${q.id}`, S.sales, { leadId: S.l1.id, items }, 409)
  await deny('POST', `/quotations/${q.id}/send`, S.sales, {}, 409)
  assert.equal((await ok('GET', '/dashboard', S.manager)).approvals.length, 1)
  assert.equal((await ok('POST', `/quotations/${q.id}/reject`, S.manager, { note: 'Discount is too high' })).status, 'REJECTED')
  const q2 = await ok('POST', `/quotations/${q.id}/revise`, S.sales)
  assert.deepEqual([q2.revision, q2.status, q2.quotationNumber], [2, 'DRAFT', q.quotationNumber])
  const list = await ok('GET', '/quotations', S.sales)
  assert.deepEqual([list.total, list.items[0].id], [1, q2.id])
  items[0].unitPrice = 50000
  const edited = await ok('PATCH', `/quotations/${q2.id}`, S.sales, { leadId: S.l1.id, items })
  assert.deepEqual([edited.taxableAmount, edited.igstAmount, edited.totalAmount], [131000, 23580, 154580])
  await ok('POST', `/quotations/${q2.id}/submit`, S.sales)
  assert.equal((await ok('POST', `/quotations/${q2.id}/approve`, S.manager)).status, 'APPROVED')
  const sent = await ok('POST', `/quotations/${q2.id}/send`, S.sales, { channel: 'LINK' })
  assert.equal(sent.status, 'SENT')
  assert.match(sent.link, /^http:\/\/app\.test\/q\/.{20,}$/)
  assert.ok(sent.message.includes(sent.link))
  const mail = await ok('POST', `/quotations/${q2.id}/send`, S.sales, { channel: 'EMAIL' })
  assert.equal(mail.email.sent, false) // SMTP is not set up yet
  const token = sent.link.split('/q/')[1]
  const pub = await ok('GET', `/public/quotations/${token}`)
  assert.deepEqual([pub.status, pub.publicToken, pub.organization.name, pub.items.length], ['VIEWED', undefined, 'Cipher Mutex', 2])
  await deny('GET', '/public/quotations/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', undefined, undefined, 404)
  await deny('POST', `/quotations/${q2.id}/convert`, S.sales, {}, 409)
  assert.equal((await ok('POST', `/public/quotations/${token}/accept`)).status, 'ACCEPTED')
  const project = await ok('POST', `/quotations/${q2.id}/convert`, S.sales, { managerId: S.ids.dev, memberIds: [S.ids.sales], category: 'WEBSITE_DEVELOPMENT' })
  S.project = project
  const lead = await ok('GET', `/leads/${S.l1.id}`, S.sales)
  assert.deepEqual([lead.status, lead.stage.name], ['CONVERTED', 'Won'])
  const customers = await ok('GET', '/customers', S.sales)
  assert.equal(customers.total, 1)
  S.customer = customers.items[0]
  assert.deepEqual([S.customer.name, S.customer.billingStateCode, S.customer.contacts.length], ['UrbanNest Realty', '32', 1])
  const full = await ok('GET', `/quotations/${q2.id}`, S.sales)
  assert.deepEqual([full.status, full.revisions.length, full.projects.length], ['CONVERTED', 2, 1])
  assert.ok(full.activities.some((a: any) => a.summary.startsWith('Rejected')))
})

test('project to payment: milestones draft invoices, numbering, part payment with TDS, credit note, completion', async () => {
  const p = await ok('GET', `/projects/${S.project.id}/detail`, S.dev)
  assert.deepEqual(p.milestones.map((m: any) => m.amount), [50000, 81000])
  await deny('GET', '/projects', S.sales, undefined) // Sales Executive has no Projects permission by default
  assert.equal((await ok('GET', '/projects', S.manager)).total, 1)
  const done = await ok('POST', `/projects/milestones/${p.milestones[0].id}/complete`, S.dev)
  assert.ok(done.invoice.invoiceNumber.startsWith('DRAFT-'))
  await deny('GET', '/invoices', S.dev, undefined)
  assert.equal((await ok('GET', '/invoices', S.sales)).total, 1)
  await deny('POST', `/invoices/${done.invoice.id}/send`, S.sales, {})
  const inv = await ok('POST', `/invoices/${done.invoice.id}/send`, S.accounts, { channel: 'LINK' })
  assert.match(inv.invoiceNumber, /^CX\/INV\/\d\d-\d\d\/0001$/)
  assert.deepEqual([inv.status, inv.totalAmount, inv.igstAmount, inv.balanceDue], ['SENT', 59000, 9000, 59000])
  assert.equal((await ok('GET', `/public/invoices/${inv.link.split('/i/')[1]}`)).invoiceNumber, inv.invoiceNumber)

  const pay = (invoiceId: string, amount: number, tdsAmount = 0) => ({ customerId: S.customer.id, method: 'UPI', referenceNumber: 'UTR1', allocations: [{ invoiceId, amount, tdsAmount }] })
  await deny('POST', '/payments', S.sales, pay(inv.id, 100))
  const p1 = await ok('POST', '/payments', S.accounts, pay(inv.id, 30000, 5000))
  assert.match(p1.receiptNumber, /^CX\/RCT\//)
  let cur = await ok('GET', `/invoices/${inv.id}`, S.accounts)
  assert.deepEqual([cur.status, cur.balanceDue, cur.amountPaid, cur.tdsAmount], ['PARTIALLY_PAID', 24000, 30000, 5000])
  await deny('POST', '/payments', S.accounts, pay(inv.id, 30000), 400)
  await ok('POST', '/payments', S.accounts, pay(inv.id, 24000))
  cur = await ok('GET', `/invoices/${inv.id}`, S.accounts)
  assert.deepEqual([cur.status, cur.balanceDue], ['PAID', 0])

  await deny('POST', `/projects/${S.project.id}/complete`, S.dev, undefined, 409)
  const done2 = await ok('POST', `/projects/milestones/${p.milestones[1].id}/complete`, S.dev)
  await deny('POST', `/projects/${S.project.id}/complete`, S.dev, undefined, 409)
  const inv2 = await ok('POST', `/invoices/${done2.invoice.id}/send`, S.accounts, {})
  assert.match(inv2.invoiceNumber, /0002$/)
  assert.equal(inv2.totalAmount, 95580)
  const cn = await ok('POST', '/credit-notes', S.accounts, { invoiceId: inv2.id, reason: 'One month of ads cancelled', amount: 1000 })
  assert.deepEqual([cn.totalAmount, cn.igstAmount], [1180, 180])
  assert.equal((await ok('GET', `/invoices/${inv2.id}`, S.accounts)).balanceDue, 94400)
  assert.equal((await ok('GET', '/payments/pending', S.accounts)).items.length, 1)
  await ok('POST', '/payments', S.accounts, pay(inv2.id, 94400))
  assert.equal((await ok('GET', '/payments/pending', S.accounts)).items.length, 0)
  assert.equal((await ok('POST', `/projects/${S.project.id}/complete`, S.dev)).status, 'COMPLETED')
  const fin = await ok('GET', '/finance/summary', S.accounts)
  assert.equal(fin.months.at(-1).income, 148400)

  // a manual invoice: pay, delete the payment, then void
  const m = await ok('POST', '/invoices', S.accounts, { customerId: S.customer.id, items: [{ description: 'Extra page', quantity: 2, unitPrice: 2500 }] })
  await deny('POST', `/invoices/${m.id}/void`, S.accounts, undefined, 409)
  const ms = await ok('POST', `/invoices/${m.id}/send`, S.accounts, {})
  const mp = await ok('POST', '/payments', S.accounts, pay(m.id, 5900))
  await ok('DELETE', `/payments/${mp.id}`, S.accounts)
  assert.deepEqual([(await ok('GET', `/invoices/${m.id}`, S.accounts)).status, (await ok('GET', '/finance/summary', S.accounts)).months.at(-1).income], ['SENT', 148400])
  assert.equal((await ok('POST', `/invoices/${ms.id}/void`, S.accounts)).status, 'VOID')
  await deny('DELETE', `/invoices/${ms.id}`, S.accounts, undefined, 409)
  assert.deepEqual((await ok('GET', `/customers/${S.customer.id}/history`, S.sales)).invoices.length, 3)
})

test('permission changes apply at once', async () => {
  const roles = (await ok('GET', '/settings/roles', S.admin)).items
  const sales = roles.find((r: any) => r.key === 'SALES_EXECUTIVE')
  assert.deepEqual(sales.perms.LEADS, { actions: 'VCE', scope: 'OWN' })
  const perms = { ...sales.perms, LEADS: { actions: 'VCE', scope: 'DEPARTMENT' } }
  delete perms.QUOTATIONS
  await ok('PUT', `/settings/roles/${sales.id}/permissions`, S.admin, { perms })
  await deny('GET', '/quotations', S.sales, undefined)
  assert.equal((await ok('GET', '/leads', S.sales)).total, 4) // own lead plus the three given to the Sales department by the rotation
  await deny('PUT', `/settings/roles/${roles.find((r: any) => r.key === 'SUPER_ADMIN').id}/permissions`, S.admin, { perms: {} })
  await deny('PATCH', `/settings/users/${S.ids.admin}`, S.admin, { status: 'SUSPENDED' }, 400)
  await ok('PUT', `/settings/roles/${sales.id}/permissions`, S.admin, { perms: sales.perms })
  const custom = await ok('POST', '/settings/roles', S.admin, { name: 'Intern' })
  await ok('DELETE', `/settings/roles/${custom.id}`, S.admin)
  await ok('PATCH', `/settings/users/${S.ids.sales2}`, S.admin, { status: 'SUSPENDED' })
  await deny('GET', '/leads', S.sales2, undefined, 401)
  await ok('PATCH', `/settings/users/${S.ids.sales2}`, S.admin, { status: 'ACTIVE' })
})

test('the other modules save and read back', async () => {
  const A = S.admin
  // customers, contacts, intra-state GST
  const acme = await ok('POST', '/customers', A, { name: 'Acme Traders', billingStateCode: '29', email: 'ops@acme.example', paymentTermsDays: 7 })
  S.acme = acme
  await ok('POST', `/customers/${acme.id}/contacts`, A, { firstName: 'Asha', email: 'asha@acme.example', isPrimary: true })
  assert.equal((await ok('GET', `/customers/${acme.id}/contacts`, A)).total, 1)
  const svc = await ok('POST', '/services', A, { name: 'SEO', category: 'SEO', basePrice: 18000, sacCode: '998361', unit: 'months' })
  await ok('POST', '/packages', A, { name: 'Starter', price: 50000, items: [{ serviceId: svc.id, quantity: 3 }] })
  const q = await ok('POST', '/quotations', A, { customerId: acme.id, items: [{ serviceId: svc.id, description: 'SEO', quantity: 1, unitPrice: 1000 }] })
  assert.deepEqual([q.cgstAmount, q.sgstAmount, q.igstAmount, q.totalAmount], [90, 90, 0, 1180])
  // sales CRM
  const stages = S.lk.pipelines[0].stages
  const deal = await ok('POST', '/deals', A, { title: 'SEO retainer', customerId: acme.id, value: 216000 })
  assert.equal(deal.stage.name, stages[0].name)
  assert.equal((await ok('PATCH', `/deals/${deal.id}`, A, { stageId: stages.find((s: any) => s.isWon).id })).status, 'WON')
  await ok('POST', '/meetings', A, { title: 'Kick-off', customerId: acme.id, startsAt: `${today}T10:00:00Z`, endsAt: `${today}T11:00:00Z` })
  await ok('POST', '/calls', A, { customerId: acme.id, direction: 'OUTBOUND', phone: '919000000009', outcome: 'Agreed scope' })
  await ok('POST', '/follow-ups', A, { customerId: acme.id, type: 'CALL', dueAt: today })
  // projects and tasks
  const proj = await ok('POST', '/projects', A, { name: 'Acme SEO', customerId: acme.id, managerId: S.ids.manager })
  await ok('PUT', `/projects/${proj.id}/members`, A, { userIds: [S.ids.dev] })
  const ms = await ok('POST', `/projects/${proj.id}/milestones`, A, { name: 'Audit', amount: 10000 })
  await ok('PATCH', `/projects/milestones/${ms.id}`, A, { name: 'Site audit' })
  assert.equal((await ok('GET', '/projects', S.dev)).total, 2)
  const task = await ok('POST', '/tasks', A, { title: 'Keyword research', projectId: proj.id, assigneeId: S.ids.dev, priority: 'HIGH', dueDate: today })
  assert.equal((await ok('GET', '/tasks?mine=1', S.dev)).total, 1)
  assert.equal((await ok('GET', '/dashboard', S.dev)).tasks.length, 1)
  await ok('POST', `/tasks/${task.id}/timer/start`, S.dev)
  await ok('POST', `/tasks/${task.id}/timer/stop`, S.dev)
  await ok('POST', `/tasks/${task.id}/time`, S.dev, { minutes: 45, description: 'Research' })
  await ok('POST', '/comments', S.dev, { entityType: 'TASK', entityId: task.id, body: 'First pass done' })
  const doneTask = await ok('PATCH', `/tasks/${task.id}`, S.dev, { status: 'DONE' })
  assert.ok(doneTask.completedAt && doneTask.loggedMinutes >= 46)
  // marketing
  const camp = await ok('POST', '/campaigns', A, { customerId: acme.id, name: 'Diwali sale', platforms: ['INSTAGRAM', 'META_ADS'], startDate: today, budget: 60000, status: 'ACTIVE' })
  const content = await ok('POST', '/content-items', A, { customerId: acme.id, campaignId: camp.id, type: 'REEL', title: 'Teaser reel', platform: 'INSTAGRAM', scheduledAt: plusDays(3), assigneeId: S.ids.dev })
  assert.ok((await ok('PATCH', `/content-items/${content.id}`, A, { status: 'PUBLISHED' })).publishedAt)
  await ok('POST', '/ad-spend', A, { campaignId: camp.id, platform: 'META_ADS', spendDate: today, amount: 2500, leads: 7 })
  const camps = await ok('GET', '/campaigns', A)
  assert.deepEqual([camps.items[0].spent, camps.items[0].leads], [2500, 7])
  assert.equal((await ok('GET', `/content-items?from=${today}&to=${plusDays(10)}`, A)).total, 1)
  // websites, renewals, credentials
  const site = await ok('POST', '/websites', A, { customerId: acme.id, name: 'Acme site', url: 'https://acme.example', status: 'LIVE' })
  const asset = await ok('POST', '/web-assets', A, { customerId: acme.id, websiteId: site.id, type: 'DOMAIN', name: 'acme.example', expiryDate: plusDays(5), renewalCost: 1200, billingAmount: 1800 })
  S.asset = asset
  assert.equal((await ok('GET', '/web-assets', A)).items[0].daysLeft, 5)
  const cred = await ok('POST', '/credentials', A, { label: 'Acme WordPress', type: 'CMS_ADMIN', customerId: acme.id, username: 'admin', secret: 's3cret-Value' })
  const creds = await ok('GET', '/credentials', S.dev)
  assert.ok(!JSON.stringify(creds).includes('s3cret') && creds.items[0].secretCiphertext === undefined)
  assert.equal((await ok('POST', `/credentials/${cred.id}/reveal`, S.dev)).secret, 's3cret-Value')
  assert.equal((await ok('GET', '/credentials', A)).items[0]._count.accessLogs, 1)
  await deny('GET', '/credentials', S.sales, undefined)
  // tickets
  const tk = await ok('POST', '/tickets', A, { customerId: acme.id, subject: 'Form not sending', description: 'Contact form emails are not arriving', priority: 'HIGH', assigneeId: S.ids.dev })
  assert.ok((await ok('PATCH', `/tickets/${tk.id}`, S.dev, { status: 'RESOLVED', resolutionNotes: 'SMTP fixed' })).resolvedAt)
  // documents
  const fd = new FormData()
  fd.append('title', 'Service agreement')
  fd.append('category', 'AGREEMENT')
  fd.append('customerId', acme.id)
  fd.append('file', new Blob(['v1']), 'agreement.txt')
  const doc = await ok('POST', '/documents', A, fd)
  const fd2 = new FormData()
  fd2.append('file', new Blob(['v2']), 'agreement-v2.txt')
  assert.equal((await ok('POST', `/documents/${doc.id}/versions`, A, fd2)).currentVersion, 2)
  const hrDoc = new FormData()
  hrDoc.append('title', 'Leave policy'); hrDoc.append('category', 'HR_FILE'); hrDoc.append('file', new Blob(['policy']), 'policy.txt')
  await ok('POST', '/documents', S.hr, hrDoc)
  assert.equal((await ok('GET', '/documents', S.dev)).total, 1) // HR files are hidden from non-HR roles
  assert.equal((await ok('GET', '/documents', S.hr)).total, 2)
  // HR
  const emps = await ok('GET', '/hr/employees', S.hr)
  assert.equal(emps.total, 7)
  await deny('GET', '/hr/employees', S.dev, undefined)
  const devEmp = emps.items.find((e: any) => e.user?.id === S.ids.dev)
  await ok('PUT', '/hr/attendance', S.hr, { employeeId: devEmp.id, date: plusDays(-1), status: 'WORK_FROM_HOME' })
  await ok('POST', '/me/check-in', S.dev, {})
  await ok('POST', '/me/check-out', S.dev, {})
  const leave = await ok('POST', '/me/leave-requests', S.dev, { leaveTypeId: S.lk.leaveTypes[0].id, startDate: plusDays(3), endDate: plusDays(4), reason: 'Family function' })
  assert.equal(leave.days, 2)
  await deny('POST', `/hr/leave-requests/${leave.id}/approve`, S.dev, undefined)
  assert.equal((await ok('POST', `/hr/leave-requests/${leave.id}/approve`, S.hr)).status, 'APPROVED')
  const mine = await ok('GET', '/me/hr', S.dev)
  assert.deepEqual([mine.attendance.status, mine.leaveRequests.length, mine.leaveTypes.find((t: any) => t.id === S.lk.leaveTypes[0].id).used], ['PRESENT', 1, 2])
  assert.equal((await ok('GET', `/hr/attendance?date=${plusDays(3)}`, S.hr)).items.find((e: any) => e.id === devEmp.id).attendance.status, 'ON_LEAVE')
  await ok('POST', '/hr/holidays', S.hr, { name: 'Founders day', date: plusDays(20) })
  await ok('POST', '/hr/reviews', S.hr, { employeeId: devEmp.id, periodStart: plusDays(-90), periodEnd: today, rating: 4.5, strengths: 'Reliable' })
  // assets
  const laptop = await ok('POST', '/assets', S.hr, { name: 'Laptop 14 inch', category: 'LAPTOP', purchaseCost: 92000 })
  await ok('POST', `/assets/${laptop.id}/assign`, S.hr, { employeeId: devEmp.id })
  assert.equal((await ok('GET', '/assets', S.hr)).items[0].assignments[0].employee.id, devEmp.id)
  await ok('POST', `/assets/${laptop.id}/maintenance`, S.hr, { type: 'Service', description: 'Battery replaced', performedAt: today, cost: 4500 })
  await ok('POST', `/assets/${laptop.id}/return`, S.hr, {})
  assert.deepEqual([(await ok('GET', `/assets/${laptop.id}/history`, S.hr)).assignments.length, (await ok('GET', `/assets/${laptop.id}`, S.hr)).status], [1, 'AVAILABLE'])
  // finance
  const x = await ok('POST', '/finance/expenses', S.accounts, { categoryId: S.lk.expenseCategories[0].id, expenseDate: today, amount: 5000, taxAmount: 900, description: 'Meta ads top-up' })
  assert.equal(x.status, 'SUBMITTED')
  await ok('POST', `/finance/expenses/${x.id}/approve`, S.manager)
  const fin = await ok('GET', '/finance/summary', S.accounts)
  assert.deepEqual([fin.months.at(-1).expense, fin.byCategory[0].amount], [5900, 5900])
  // recurring invoices
  const rec = await ok('POST', '/recurring-invoices', S.accounts, { customerId: acme.id, title: 'SEO retainer', frequency: 'MONTHLY', startDate: plusDays(-2), items: [{ description: 'SEO', quantity: 1, unitPrice: 18000 }] })
  S.rec = rec
  // reports, automation, communication, settings
  const rep = await ok('GET', '/reports/overview', S.manager)
  assert.deepEqual([rep.summary.leads >= 5, rep.summary.converted, rep.team.length], [true, 1, 7], JSON.stringify(rep.summary))
  await deny('GET', '/reports/overview', S.dev, undefined)
  assert.ok((await ok('GET', '/communication/feed', A)).total > 10)
  assert.equal((await ok('POST', '/communication/email', A, { to: 'x@example.com', subject: 'Hi', body: 'Hello' })).sent, false)
  assert.ok((await ok('GET', '/communication/messages', A)).total >= 2)
  assert.equal((await ok('GET', '/communication/templates', A)).total, 7)
  const notes = await ok('GET', '/notifications', S.manager)
  assert.ok(notes.unread > 0)
  await ok('POST', '/notifications/read', S.manager, {})
  assert.equal((await ok('GET', '/notifications', S.manager)).unread, 0)
  await ok('PATCH', '/settings/organization', A, { name: 'Cipher Mutex', docPrefix: 'CM', invoiceTerms: 'Pay within 7 days' })
  await ok('POST', '/settings/branches', A, { name: 'Kochi', code: 'KOC', stateCode: '32' })
  await ok('PUT', '/settings/integrations/smtp', A, { host: 'smtp.example.com', port: 587, user: 'u', password: 'p', fromName: 'CM', fromEmail: 'hello@example.com', isActive: false })
  assert.equal((await ok('GET', '/settings/integrations/smtp', A)).hasPassword, true)
  assert.ok((await ok('GET', '/settings/audit-logs', A)).total > 30)
  for (const who of ['admin', 'manager', 'sales', 'accounts', 'dev', 'hr']) assert.ok(Array.isArray((await ok('GET', '/dashboard', S[who])).kpis), who)
  assert.equal((await ok('GET', '/dashboard', S.hr)).kpis.length, 0)
  await ok('POST', '/auth/change-password', S.hr, { current: 'Passw0rd!', next: 'NewPassw0rd!' })
  await ok('POST', '/auth/login', undefined, { email: 'hr@example.com', password: 'NewPassw0rd!' })
})

test('daily automations: reminders, renewals and recurring invoices run once', async () => {
  await ok('POST', '/leads', S.admin, { firstName: 'Due', companyName: 'Follow-up due', ownerId: S.ids.sales, nextFollowUpAt: plusDays(-1) })
  const old = await ok('POST', '/invoices', S.accounts, { customerId: S.acme.id, issueDate: plusDays(-40), dueDate: plusDays(-25), items: [{ description: 'Old work', quantity: 1, unitPrice: 1000 }] })
  const sent = await ok('POST', `/invoices/${old.id}/send`, S.accounts, {})
  assert.match(sent.invoiceNumber, /^CM\/INV\//) // the new prefix applies to new sequences
  assert.equal((await ok('GET', '/invoices?status=OVERDUE', S.accounts)).total, 1)
  const run = await ok('POST', '/automations/run-now', S.admin)
  assert.ok(run.followUps >= 1, JSON.stringify(run))
  assert.deepEqual([run.paymentReminders, run.renewals, run.recurringInvoices], [1, 1, 1])
  const again = await ok('POST', '/automations/run-now', S.admin)
  assert.deepEqual(again, { followUps: 0, paymentReminders: 0, renewals: 0, recurringInvoices: 0 })
  assert.equal((await ok('GET', '/recurring-invoices', S.accounts)).items[0].lastRunDate.slice(0, 10), today)
  const renewed = await ok('POST', `/web-assets/${S.asset.id}/renew`, S.admin, {})
  assert.ok(renewed.asset.expiryDate.slice(0, 4) > today.slice(0, 4) && renewed.invoice.totalAmount === 2124)
  assert.ok((await ok('GET', '/automations', S.admin)).runs.length >= 4)
})

test('sessions: cookie login, request protection, password change and logout', async () => {
  // a changing request without the X-Requested-With header is refused, whoever sends it
  const bare = await handleApi(new Request('http://app.test/api/v1/leads', { method: 'POST', headers: { 'content-type': 'application/json', cookie: S.admin }, body: JSON.stringify({ firstName: 'Blocked' }) }))
  assert.equal(bare.status, 403)
  // two sessions for one person; changing the password on one signs the other out
  const first = await signIn('hr@example.com', 'NewPassw0rd!')
  const second = await signIn('hr@example.com', 'NewPassw0rd!')
  assert.notEqual(first, second)
  await deny('POST', '/auth/change-password', first, { current: 'wrong-one', next: 'N3w-Passw0rd!' }, 400)
  assert.equal((await call('POST', '/auth/change-password', first, { current: 'NewPassw0rd!', next: 'N3w-Passw0rd!' })).status, 204)
  await ok('GET', '/auth/me', first)
  await deny('GET', '/auth/me', second, undefined, 401)
  await deny('POST', '/auth/login', undefined, { email: 'hr@example.com', password: 'NewPassw0rd!' }, 401)
  // logout ends the session on the server, not only in the browser
  const out = await call('POST', '/auth/logout', first)
  assert.equal(out.status, 204)
  assert.match(String(out.headers.get('set-cookie')), /cx_session=;.*Max-Age=0/)
  await deny('GET', '/auth/me', first, undefined, 401)
  // a suspended person is signed out at once
  const dev = await signIn('dev@example.com', 'Passw0rd!')
  await ok('PATCH', `/settings/users/${S.ids.dev}`, S.admin, { status: 'SUSPENDED' })
  await deny('GET', '/auth/me', dev, undefined, 401)
  assert.equal((await ok('GET', '/health')).ok, true)
})
