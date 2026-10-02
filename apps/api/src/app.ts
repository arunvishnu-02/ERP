import cookieParser from 'cookie-parser'
import express, { Router } from 'express'
import helmet from 'helmet'
import { authenticate } from './core/auth.js'
import { errorHandler, notFound, plain } from './core/http.js'
import { prisma } from './db.js'
import { authRouter } from './modules/auth.js'
import { assetsRouter, documentsRouter, financeRouter, hrRouter, meRouter } from './modules/backoffice.js'
import { customersRouter } from './modules/customers.js'
import { adSpendRouter, campaignsRouter, contentRouter, credentialsRouter, ticketsRouter, webAssetsRouter, websitesRouter } from './modules/delivery.js'
import { automationRouter, communicationRouter, dashboardRouter, reportsRouter } from './modules/insights.js'
import { creditNotesRouter, invoicesRouter, recurringRouter } from './modules/invoices.js'
import { followUpsRouter, leadsRouter } from './modules/leads.js'
import { bankAccountsRouter, paymentsRouter } from './modules/payments.js'
import { projectsRouter } from './modules/projects.js'
import { publicRouter } from './modules/public.js'
import { packagesRouter, quotationsRouter, servicesRouter } from './modules/quotations.js'
import { callsRouter, dealsRouter, meetingsRouter } from './modules/sales.js'
import { lookups, settingsRouter } from './modules/settings.js'
import { sharedRouter } from './modules/shared.js'
import { tasksRouter } from './modules/tasks.js'

export function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(express.json({ limit: '2mb' }))
  app.use(cookieParser())
  app.use((_req, res, next) => {
    const json = res.json.bind(res)
    res.json = (body: any) => json(plain(body))
    next()
  })

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
  v1.use('/me', meRouter)
  v1.use('/assets', assetsRouter)
  v1.use('/finance', financeRouter)
  v1.use('/reports', reportsRouter)
  v1.use('/automations', automationRouter)
  v1.use('/communication', communicationRouter)
  v1.use('/settings', settingsRouter)
  v1.use('/', sharedRouter)

  app.use('/api/v1', v1)
  app.use(() => {
    throw notFound('Page')
  })
  app.use(errorHandler)
  return app
}
