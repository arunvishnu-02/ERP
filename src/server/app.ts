// The REST API. Every /api/v1 request reaches handleApi() through the Next.js route handler.
import { authenticate } from './core/auth'
import { errorHandler, HttpError, notFound } from './core/http'
import { maybeRunDaily } from './core/jobs'
import { migrate } from './core/migrate'
import { Response, Router, type Request, type RouterImpl } from './core/router'
import { prisma } from './db'
import { rememberOrigin } from './env'
import { authRouter } from './modules/auth'
import { assetsRouter, documentsRouter, financeRouter, hrRouter, meRouter } from './modules/backoffice'
import { myPayslipsRouter, payrollRouter } from './modules/payroll'
import { customersRouter } from './modules/customers'
import { adSpendRouter, campaignsRouter, contentRouter, credentialsRouter, ticketsRouter, webAssetsRouter, websitesRouter } from './modules/delivery'
import { automationRouter, communicationRouter, dashboardRouter, reportsRouter } from './modules/insights'
import { creditNotesRouter, invoicesRouter, recurringRouter } from './modules/invoices'
import { followUpsRouter, leadsRouter } from './modules/leads'
import { bankAccountsRouter, paymentsRouter } from './modules/payments'
import { projectsRouter } from './modules/projects'
import { publicRouter } from './modules/public'
import { packagesRouter, quotationsRouter, servicesRouter } from './modules/quotations'
import { callsRouter, dealsRouter, meetingsRouter } from './modules/sales'
import { lookups, settingsRouter } from './modules/settings'
import { sharedRouter } from './modules/shared'
import { tasksRouter } from './modules/tasks'

function build() {
  const v1 = Router()
  v1.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`
    res.json({ ok: true })
  })
  v1.use('/auth', authRouter)
  v1.use('/public', publicRouter)
  v1.use(authenticate)
  v1.get('/lookups', lookups)
  v1.use('/dashboard', dashboardRouter)
  v1.use('/leads', leadsRouter)
  v1.use('/follow-ups', followUpsRouter)
  v1.use('/customers', customersRouter)
  v1.use('/deals', dealsRouter)
  v1.use('/meetings', meetingsRouter)
  v1.use('/calls', callsRouter)
  v1.use('/quotations', quotationsRouter)
  v1.use('/services', servicesRouter)
  v1.use('/packages', packagesRouter)
  v1.use('/invoices', invoicesRouter)
  v1.use('/credit-notes', creditNotesRouter)
  v1.use('/recurring-invoices', recurringRouter)
  v1.use('/payments', paymentsRouter)
  v1.use('/bank-accounts', bankAccountsRouter)
  v1.use('/projects', projectsRouter)
  v1.use('/tasks', tasksRouter)
  v1.use('/campaigns', campaignsRouter)
  v1.use('/content-items', contentRouter)
  v1.use('/ad-spend', adSpendRouter)
  v1.use('/websites', websitesRouter)
  v1.use('/web-assets', webAssetsRouter)
  v1.use('/credentials', credentialsRouter)
  v1.use('/tickets', ticketsRouter)
  v1.use('/documents', documentsRouter)
  v1.use('/hr', hrRouter)
  v1.use('/payroll', payrollRouter)
  v1.use('/me/payslips', myPayslipsRouter)
  v1.use('/me', meRouter)
  v1.use('/assets', assetsRouter)
  v1.use('/finance', financeRouter)
  v1.use('/reports', reportsRouter)
  v1.use('/automations', automationRouter)
  v1.use('/communication', communicationRouter)
  v1.use('/settings', settingsRouter)
  v1.use('/', sharedRouter)
  return v1
}

// Kept on globalThis so development reloads reuse the same router and the same "database is ready" promise.
const store = globalThis as unknown as { __cxRouter?: RouterImpl; __cxReady?: Promise<void> }
const router = () => (store.__cxRouter ??= build())

/** Brings the database up to date once per server process. A failure is retried on the next request. */
export function ready() {
  return (store.__cxReady ??= migrate().catch((e) => {
    store.__cxReady = undefined
    throw e
  }))
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const MAX_JSON = 2 * 1024 * 1024
const cookiesOf = (header?: string) => Object.fromEntries((header ?? '').split(';').map((c) => c.trim()).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))] }))

export async function handleApi(request: globalThis.Request): Promise<globalThis.Response> {
  const res = new Response()
  const url = new URL(request.url)
  const headers: Record<string, string> = {}
  request.headers.forEach((v, k) => { headers[k] = v })
  const query: Request['query'] = {}
  for (const k of new Set(url.searchParams.keys())) { const all = url.searchParams.getAll(k); query[k] = all.length > 1 ? all : all[0] }
  const req = {
    method: request.method.toUpperCase(),
    path: url.pathname.replace(/^\/api\/v1/, '') || '/',
    params: {}, query, body: {}, headers, cookies: cookiesOf(headers.cookie),
    ip: headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'] || 'local',
    raw: request,
  } as unknown as Request
  try {
    const host = headers['x-forwarded-host']?.split(',')[0]?.trim() || headers.host
    if (host) rememberOrigin(`${headers['x-forwarded-proto']?.split(',')[0]?.trim() || url.protocol.replace(':', '')}://${host}`)
    if (UNSAFE.has(req.method)) {
      // A changing request must come from our own pages: another site cannot add this header without permission.
      if (!req.path.startsWith('/public/') && !headers['x-requested-with']) throw new HttpError(403, 'This request was blocked. Reload the page and try again.')
      if ((headers['content-type'] ?? '').includes('application/json')) {
        const text = await request.text()
        if (text.length > MAX_JSON) throw new HttpError(413, 'The request is too large')
        try { req.body = text ? JSON.parse(text) : {} } catch { throw new HttpError(400, 'The request could not be read') }
      }
    }
    await ready()
    maybeRunDaily()
    if (!(await router().handle(req, res, req.path.split('/').filter(Boolean)))) throw notFound('Page')
  } catch (e) {
    errorHandler(e, res)
  }
  return res.toWeb()
}
