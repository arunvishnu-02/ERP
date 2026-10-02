# CX CRM ERP

CRM and ERP for a digital marketing, website development and IT services company.
One path for every deal: Lead, Follow-up, Quotation, Approval, Project, Invoice, Payment, Completion.

To put it on a server, read [DEPLOY.md](DEPLOY.md).

## What is inside

| Folder | What it is |
|---|---|
| `apps/api` | The API. Node.js, Express 5, TypeScript, Prisma 7, PostgreSQL. JWT login and role-based permissions. |
| `apps/web` | The web app. Next.js 16, React 19, Tailwind CSS 4, shadcn-style components on Radix. |
| `deploy` | Scripts to install, update, back up and restore on a server. |
| `docker-compose.yml`, `Caddyfile` | Runs PostgreSQL, the API, the web app and HTTPS on one server. |

The 20 modules: Dashboard, Leads, Customers, Sales CRM, Quotations, Invoices, Payments, Projects, Tasks, Digital marketing, Websites, Support tickets, Documents, HR, Assets, Finance, Reports, Automation, Communication, Settings.

There is no sample data. The first visit shows a setup page that creates the company and the first Super Admin, plus sensible defaults: nine roles, lead stages and sources, GST rates, leave types, expense categories and message templates.

## Run it on your own computer (for developers)

You need Node.js 22. Docker is not needed for development.

Terminal 1, the database:

```
cd apps/api
npm install
cp .env.example .env
npm run db:local
```

Terminal 2, the API on port 4000:

```
cd apps/api
npm run dev
```

Terminal 3, the web app on port 3000:

```
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000.

## Checks

```
cd apps/api && npm run typecheck && npm test     # 9 end-to-end tests on a real PostgreSQL
cd apps/web && npm run typecheck && npm run build
```

## How the code is organised

**API (`apps/api/src`)**

- `core/` holds what every module shares: `auth.ts` (tokens, permissions, record scope), `crud.ts` (list, create, edit, delete for one table, with search, filters, audit log), `util.ts` (GST arithmetic, document numbers, dates), `seed.ts` (first-run defaults), `jobs.ts` (daily reminders), `migrate.ts`.
- `modules/` has one file per area: `leads.ts`, `quotations.ts`, `invoices.ts`, `payments.ts`, `projects.ts` and so on.
- `generated/prisma` is the generated Prisma client. It is kept in the repository so the server build does not need the Prisma command line tool.

**Web (`apps/web/src`)**

- `components/` holds the building blocks: `ui.tsx`, `form.tsx`, `resource.tsx` (a full list screen for one kind of record), `doc.tsx` (quotation and invoice editor and view), `record.tsx` (timeline, notes, comments, files).
- `modules/` has one file per screen. `app/(app)/[module]/page.tsx` maps each address to its screen and checks the permission.

## Changing the database

1. Edit `apps/api/prisma/schema.prisma`.
2. Run `npm run db:generate` in `apps/api` to rebuild the client.
3. Add the change as a new SQL file in `apps/api/migrations`, for example `0002_add_lead_score.sql`. Prisma's `migrate diff` command can write this SQL for you.

The API runs every new file in `migrations` when it starts, in name order, and remembers which ones it has run.

## Permissions

Each role has, for each module, a set of actions (View, Create, Edit, Delete, Approve, Export, Import) and one scope (Own, Team, Department or All records). A Super Admin edits these under Settings, Roles and permissions. The API checks every request; the web app only hides what a person cannot use.

## Business rules worth knowing

- GST is worked out per line. Same state as the company: CGST and SGST. Another state: IGST. Export customers: zero.
- Document numbers look like `CX/INV/2026-27/0001` and restart each financial year. An invoice gets its number when it is sent; before that it is a draft.
- A sent invoice cannot be edited. Use a credit note to correct it.
- Payments can include TDS deducted by the customer.
- Daily checks run after 9:00 India time: follow-up reminders, payment reminders (3, 10, 20 and 30 days overdue), renewal reminders (30, 15, 7 and 1 days before expiry) and recurring invoices.

## Not in this version

- WhatsApp opens in WhatsApp with the message written; it is not sent through the WhatsApp Business API. SMS is not connected.
- Files are stored on the server's disk, not in S3-compatible storage.
- Notifications refresh every 20 seconds; there is no live socket connection.
- PDF is made with the browser's "Print, Save as PDF" on the print pages.
- Quotation approval is one step. The multi-step approval tables exist in the database but are not used.
- Two-factor login, Redis and a job queue, and PostgreSQL row-level security are not included.
- File downloads check that the file belongs to your company, not the module permission of each file.
