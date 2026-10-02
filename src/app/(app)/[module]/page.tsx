'use client'
import { useParams } from 'next/navigation'
import Assets from '@/modules/assets'
import Automation from '@/modules/automation'
import { NoAccess } from '@/modules/common'
import Communication from '@/modules/communication'
import Customers from '@/modules/customers'
import Dashboard from '@/modules/dashboard'
import { Documents, Tickets, Websites } from '@/modules/delivery'
import Finance from '@/modules/finance'
import HR from '@/modules/hr'
import Invoices from '@/modules/invoices'
import Leads from '@/modules/leads'
import Marketing from '@/modules/marketing'
import Payments from '@/modules/payments'
import Profile from '@/modules/profile'
import Projects from '@/modules/projects'
import Quotations from '@/modules/quotations'
import Reports from '@/modules/reports'
import Sales from '@/modules/sales'
import Settings from '@/modules/settings'
import Tasks from '@/modules/tasks'
import { useAuth } from '@/lib/auth'

/** Address, the permission module it needs, the screen, and how the "no access" message names it. */
const SCREENS: Record<string, [module: string | null, screen: React.ComponentType, what: string]> = {
  dashboard: ['DASHBOARD', Dashboard, 'the dashboard'], leads: ['LEADS', Leads, 'leads'], customers: ['CUSTOMERS', Customers, 'customers'], sales: ['SALES', Sales, 'the sales CRM'],
  quotations: ['QUOTATIONS', Quotations, 'quotations'], invoices: ['INVOICES', Invoices, 'invoices'], payments: ['PAYMENTS', Payments, 'payments'], projects: ['PROJECTS', Projects, 'projects'],
  tasks: ['TASKS', Tasks, 'tasks'], marketing: ['MARKETING', Marketing, 'digital marketing'], websites: ['WEBSITES', Websites, 'websites'], tickets: ['TICKETS', Tickets, 'support tickets'],
  documents: ['DOCUMENTS', Documents, 'documents'], hr: ['HR', HR, 'HR'], assets: ['ASSETS', Assets, 'assets'], finance: ['FINANCE', Finance, 'finance'], reports: ['REPORTS', Reports, 'reports'],
  automation: ['AUTOMATION', Automation, 'automation'], communication: ['COMMUNICATION', Communication, 'the communication centre'], settings: ['SETTINGS', Settings, 'settings'], profile: [null, Profile, ''],
}

export default function ModulePage() {
  const { module: key } = useParams<{ module: string }>()
  const { can } = useAuth()
  const entry = SCREENS[key]
  if (!entry) return <div className="rounded-xl border border-line bg-surface px-4 py-12 text-center text-sm text-muted">This page does not exist. Choose a module from the menu.</div>
  const [module, Screen, what] = entry
  if (module && !can(module)) return <NoAccess what={what} />
  return <Screen />
}
