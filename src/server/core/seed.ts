import crypto from 'node:crypto'
import type { Tx } from '../db'
import * as E from '../../generated/prisma/enums'
import { hashPassword } from './auth'
import { nextNumber, stateName, today } from './util'

export const MODULES = Object.values(E.ModuleKey) as string[]
export const ACTIONS = Object.values(E.PermissionAction) as string[]
export const LETTER: Record<string, string> = { V: 'VIEW', C: 'CREATE', E: 'EDIT', D: 'DELETE', A: 'APPROVE', X: 'EXPORT', I: 'IMPORT' }
export const LETTER_OF: Record<string, string> = Object.fromEntries(Object.entries(LETTER).map(([k, v]) => [v, k]))

type Grants = Record<string, [letters: string, scope?: string]>
/** The nine roles from the spec with their starting permissions. A Super Admin can change every one of them later. */
const ROLES: { key: string; name: string; description: string; grants: Grants | 'ALL' }[] = [
  { key: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full access to everything', grants: 'ALL' },
  { key: 'MANAGER', name: 'Manager', description: 'Runs sales and delivery, approves quotations, expenses and leave',
    grants: { DASHBOARD: ['V'], LEADS: ['VCEDXI'], CUSTOMERS: ['VCEDXI'], SALES: ['VCED'], QUOTATIONS: ['VCEDAX'], INVOICES: ['VX'], PAYMENTS: ['VX'], PROJECTS: ['VCEDX'], TASKS: ['VCED'], MARKETING: ['VCED'], WEBSITES: ['VCE'], TICKETS: ['VCED'], DOCUMENTS: ['VCE'], HR: ['VA'], FINANCE: ['VAX'], REPORTS: ['VX'], AUTOMATION: ['V'], COMMUNICATION: ['VC'] } },
  { key: 'SALES_EXECUTIVE', name: 'Sales Executive', description: 'Works own leads, customers, deals and quotations',
    grants: { DASHBOARD: ['V'], LEADS: ['VCE', 'OWN'], CUSTOMERS: ['VCE', 'OWN'], SALES: ['VCE', 'OWN'], QUOTATIONS: ['VCE', 'OWN'], INVOICES: ['V', 'OWN'], PAYMENTS: ['V', 'OWN'], TASKS: ['VCE', 'OWN'], COMMUNICATION: ['VC', 'OWN'] } },
  { key: 'DIGITAL_MARKETING_EXECUTIVE', name: 'Digital Marketing Executive', description: 'Campaigns, content calendar and ad spend',
    grants: { DASHBOARD: ['V'], CUSTOMERS: ['V'], PROJECTS: ['V', 'OWN'], TASKS: ['VCE', 'OWN'], MARKETING: ['VCE', 'DEPARTMENT'], DOCUMENTS: ['V'], COMMUNICATION: ['V', 'OWN'] } },
  { key: 'DEVELOPER', name: 'Developer', description: 'Assigned projects, tasks, websites and tickets',
    grants: { DASHBOARD: ['V'], PROJECTS: ['VE', 'OWN'], TASKS: ['VCE', 'OWN'], WEBSITES: ['VCE'], TICKETS: ['VCE', 'OWN'], DOCUMENTS: ['VC'] } },
  { key: 'UI_UX_DESIGNER', name: 'UI/UX Designer', description: 'Assigned projects, tasks and content',
    grants: { DASHBOARD: ['V'], PROJECTS: ['V', 'OWN'], TASKS: ['VCE', 'OWN'], MARKETING: ['VE', 'OWN'], DOCUMENTS: ['VC'] } },
  { key: 'VIDEO_EDITOR', name: 'Video Editor', description: 'Own tasks, reels and videos',
    grants: { DASHBOARD: ['V'], TASKS: ['VCE', 'OWN'], MARKETING: ['VE', 'OWN'], DOCUMENTS: ['V'] } },
  { key: 'ACCOUNTS', name: 'Accounts', description: 'Invoices, payments, expenses and finance',
    grants: { DASHBOARD: ['V'], CUSTOMERS: ['V'], QUOTATIONS: ['V'], INVOICES: ['VCEDAX'], PAYMENTS: ['VCEDAX'], FINANCE: ['VCEDAX'], REPORTS: ['VX'] } },
  { key: 'HR', name: 'HR', description: 'Employees, attendance, leave and assets',
    grants: { DASHBOARD: ['V'], DOCUMENTS: ['VC'], HR: ['VCEDAX'], ASSETS: ['VCED'] } },
]

/** First-run setup: the company, its defaults and the first Super Admin. No sample records are created. */
export async function bootstrap(tx: Tx, d: { companyName: string; stateCode: string; gstin?: string | null; firstName: string; lastName?: string | null; email: string; password: string; passwordHash?: string }) {
  const org = await tx.organization.create({
    data: {
      name: d.companyName, slug: 'main', legalName: d.companyName, gstin: d.gstin || null, state: stateName(d.stateCode), stateCode: d.stateCode, plan: 'ENTERPRISE',
      settings: { docPrefix: 'CX', paymentTermsDays: 15, leadFormKey: crypto.randomBytes(16).toString('hex') },
    },
  })
  const organizationId = org.id
  const branch = await tx.branch.create({ data: { organizationId, name: 'Head office', code: 'HO', isHeadOffice: true, state: org.state, stateCode: org.stateCode, gstin: org.gstin } })
  const depts = ['Management', 'Sales', 'Marketing', 'Development', 'Design', 'Accounts', 'HR']
  await tx.department.createMany({ data: depts.map((name) => ({ organizationId, name, branchId: branch.id })) })
  const management = await tx.department.findFirstOrThrow({ where: { organizationId, name: 'Management' } })

  await tx.permission.createMany({ data: MODULES.flatMap((module) => ACTIONS.map((action) => ({ module: module as any, action: action as any }))), skipDuplicates: true })
  const perms = await tx.permission.findMany()
  const permId = (module: string, action: string) => perms.find((p) => p.module === module && p.action === action)!.id
  let adminRoleId = ''
  for (const r of ROLES) {
    const role = await tx.role.create({ data: { organizationId, key: r.key, name: r.name, description: r.description, isSystem: true } })
    if (r.key === 'SUPER_ADMIN') adminRoleId = role.id
    const rows = r.grants === 'ALL'
      ? perms.map((p) => ({ roleId: role.id, permissionId: p.id, scope: 'ALL' as const }))
      : Object.entries(r.grants).flatMap(([module, [letters, scope]]) => [...letters].map((l) => ({ roleId: role.id, permissionId: permId(module, LETTER[l]), scope: (scope ?? 'ALL') as any })))
    await tx.rolePermission.createMany({ data: rows })
  }

  const stages = [['New', true, false, false], ['Contacted', false, false, false], ['Qualified', false, false, false], ['Proposal', false, false, false], ['Won', false, true, false], ['Lost', false, false, true]] as const
  await tx.leadStage.createMany({ data: stages.map(([name, isDefault, isWon, isLost], position) => ({ organizationId, name, position, isDefault, isWon, isLost })) })
  await tx.leadSource.createMany({ data: ['Website form', 'Meta Ads', 'Google Ads', 'Instagram', 'Referral', 'WhatsApp', 'Walk-in'].map((name) => ({ organizationId, name })) })
  await tx.pipeline.create({
    data: {
      organizationId, name: 'Sales pipeline', isDefault: true,
      stages: { create: [['Qualified', 20], ['Proposal', 50], ['Negotiation', 75], ['Won', 100], ['Lost', 0]].map(([name, probability], position) => ({ name: String(name), probability: Number(probability), position, isWon: name === 'Won', isLost: name === 'Lost' })) },
    },
  })
  await tx.taxRate.createMany({ data: [0, 5, 12, 18, 28].map((rate) => ({ organizationId, name: `GST ${rate}%`, rate, isDefault: rate === 18 })) })
  await tx.expenseCategory.createMany({ data: ['Ad spend', 'Cloud hosting', 'Software', 'Rent', 'Salaries', 'Travel', 'Professional fees', 'Office', 'Other'].map((name) => ({ organizationId, name })) })
  await tx.leaveType.createMany({ data: [['Casual leave', 'CL', 12], ['Sick leave', 'SL', 12], ['Earned leave', 'EL', 15]].map(([name, code, annualQuota]) => ({ organizationId, name: String(name), code: String(code), annualQuota: Number(annualQuota) })) })
  await tx.automationRule.createMany({
    data: [
      ['LEAD_CREATED', 'Assign new leads automatically', 'When a lead is added without an owner, give it to the next person in the rotation.', false],
      ['FOLLOW_UP_DUE', 'Follow-up reminders', 'Each morning, remind people about the follow-ups due that day.', true],
      ['MILESTONE_COMPLETED', 'Draft an invoice when a milestone is completed', 'A completed billable milestone gets a draft invoice for Accounts to review.', true],
      ['INVOICE_OVERDUE', 'Payment reminders', 'At 3, 10, 20 and 30 days overdue: notify the account manager, and email the customer if email is set up.', true],
      ['RENEWAL_DUE', 'Renewal reminders', '30, 15, 7 and 1 days before a domain, hosting plan or SSL certificate expires.', true],
      ['SCHEDULE', 'Recurring invoices', 'Draft each recurring invoice on its due date.', true],
    ].map(([trigger, name, description, isActive]) => ({ organizationId, trigger: trigger as any, name: String(name), description: String(description), isActive: Boolean(isActive) })),
  })
  await tx.leadAssignmentRule.create({ data: { organizationId, name: 'Lead rotation', strategy: 'ROUND_ROBIN', assigneeIds: [] } })
  await tx.messageTemplate.createMany({
    data: [
      ['EMAIL', 'quotation_sent', 'Quotation', 'Quotation {{number}} from {{company}}', 'Hello {{contact}},\n\nPlease find our quotation {{number}} for {{amount}}.\nView it here: {{link}}\n\nRegards,\n{{sender}}\n{{company}}'],
      ['EMAIL', 'invoice_sent', 'Invoice', 'Invoice {{number}} from {{company}}', 'Hello {{contact}},\n\nInvoice {{number}} for {{amount}} is due on {{due_date}}.\nView it here: {{link}}\n\nRegards,\n{{company}}'],
      ['EMAIL', 'payment_reminder', 'Payment reminder', 'Reminder: invoice {{number}} is overdue', 'Hello {{contact}},\n\nInvoice {{number}} for {{amount}} was due on {{due_date}}. Please let us know when we can expect payment.\nView it here: {{link}}\n\nRegards,\n{{company}}'],
      ['EMAIL', 'renewal_due', 'Renewal due', '{{asset}} expires on {{expiry}}', 'Hello {{contact}},\n\nYour {{asset}} expires on {{expiry}}. Reply to this email and we will renew it for you.\n\nRegards,\n{{company}}'],
      ['WHATSAPP', 'quotation_share', 'Quotation', null, 'Hi {{contact}}, here is our quotation {{number}} for {{amount}}. You can view it here: {{link}}'],
      ['WHATSAPP', 'invoice_share', 'Invoice', null, 'Hi {{contact}}, invoice {{number}} for {{amount}} is due on {{due_date}}. You can view it here: {{link}}'],
      ['WHATSAPP', 'follow_up', 'Follow-up', null, 'Hi {{contact}}, this is {{sender}} from {{company}}. Following up on your enquiry.'],
    ].map(([channel, key, name, subject, body]) => ({ organizationId, channel: channel as any, key: String(key), name: String(name), subject: subject as string | null, body: String(body), variables: [] })),
  })

  const user = await tx.user.create({
    data: {
      organizationId, email: d.email.toLowerCase(), firstName: d.firstName, lastName: d.lastName || null, passwordHash: d.passwordHash ?? (await hashPassword(d.password)),
      status: 'ACTIVE', emailVerifiedAt: new Date(), branchId: branch.id, departmentId: management.id, roles: { create: { roleId: adminRoleId } },
    },
  })
  await tx.employee.create({
    data: { organizationId, userId: user.id, employeeCode: await nextNumber(tx, organizationId, 'EMPLOYEE'), firstName: d.firstName, lastName: d.lastName || null, designation: 'Administrator', dateOfJoining: today(), branchId: branch.id, departmentId: management.id },
  })
  return user
}
