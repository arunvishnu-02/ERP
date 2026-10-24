# CX CRM ERP

CRM and ERP for a digital marketing, website development and IT services company.
One path for every deal: Lead, Follow-up, Quotation, Approval, Project, Invoice, Payment, Completion.

It is one Next.js application with a PostgreSQL database (Supabase). It runs on Hostinger Node.js Web App Hosting.
To put it online, read [DEPLOY.md](DEPLOY.md).

## Technology

| Part | What is used |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui-style components on Radix, Lucide icons |
| Backend | Next.js route handlers on Node.js, REST API under `/api/v1`, TypeScript |
| Database | PostgreSQL (Supabase), Prisma ORM 7 |
| Login and security | Session cookie (httpOnly), role-based access control, Zod validation, scrypt password hashing |
| Tools | npm, Git, GitHub |

No Docker, no VPS, no PostgreSQL and no outside services are needed.

## What is in it

The 20 modules: Dashboard, Leads, Customers, Sales CRM, Quotations, Invoices, Payments, Projects, Tasks, Digital marketing, Websites, Support tickets, Documents, HR, Assets, Finance, Reports, Automation, Communication, Settings.

There is no sample data. The first visit shows a setup page that creates the company and the first Super Admin, plus sensible defaults: nine roles, lead stages and sources, GST rates, leave types, expense categories and message templates.

## Project structure

```
prisma/
  schema.prisma              database schema (103 tables)
  migrations/                Prisma migrations (SQL)
src/
  app/                       Next.js pages
    api/v1/[...path]/route.ts  the one route handler that serves the REST API
    (app)/                   signed-in area: layout and the screen for each module
    login/ setup/            sign in and first-run setup
    q/[token]/ i/[token]/    public quotation and invoice pages for customers
    print/                   print and "save as PDF" pages
  components/                reusable UI: ui.tsx, form.tsx, resource.tsx, doc.tsx, record.tsx
  modules/                   one file per screen (leads.tsx, invoices.tsx, ...)
  lib/                       browser helpers: api.ts, auth.tsx, format.ts
  server/                    everything that runs on the server
    app.ts                   builds the API and handles each request
    env.ts  db.ts            settings and the Prisma client
    core/                    router, login and permissions, validation, CRUD factory, GST and numbering, daily jobs, migrations
    modules/                 the API routes, one file per area (leads.ts, quotations.ts, ...)
  generated/prisma/          the generated Prisma client (kept in Git, see below)
  instrumentation.ts         runs once at server start
scripts/                     small build helpers
tests/api.test.ts            end-to-end API tests
```

## Run it on your own computer

You need Node.js 20 or newer and a PostgreSQL server (for example from Postgres.app or Homebrew), or a Supabase project.

1. Create an empty database:

   ```sql
   CREATE DATABASE cx CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Install and configure:

   ```
   npm install
   cp .env.example .env
   ```

   Open `.env`, set `DATABASE_URL` to your database, and set `ENCRYPTION_KEY` to the output of `openssl rand -hex 32`.

3. Start:

   ```
   npm run dev
   ```

4. Open http://localhost:3000. The tables are created automatically on the first start, and the setup page appears.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Production server. It listens on the port in the `PORT` variable, or 3000 |
| `npm run typecheck` | Check the TypeScript types |
| `npm test` | 9 end-to-end API tests. Set `TEST_DATABASE_URL` to an empty test database first; the tests wipe it |
| `npm run db:migrate` | `prisma migrate deploy`: apply the migrations by hand |
| `npm run db:generate` | `prisma generate`: rebuild the Prisma client after a schema change |

## Database and migrations

- The schema is `prisma/schema.prisma`. The first migration is `prisma/migrations/20261002000000_init/migration.sql`.
- **The app applies new migrations by itself when it starts.** It records them in the `_prisma_migrations` table in the same format Prisma uses, so `npx prisma migrate deploy` can also be used and the two do not clash.
- To change the schema:
  1. Edit `prisma/schema.prisma`.
  2. Run `npx prisma migrate dev --name what_changed`. This writes a new folder in `prisma/migrations` and updates the client in `src/generated/prisma`.
  3. Commit both. On the next deployment the app applies the new migration when it starts.
- The generated Prisma client is committed to Git on purpose, so the host does not need to run `prisma generate` during the build.

## How login and permissions work

- Signing in creates a random session value. The browser keeps it in an `httpOnly` cookie; the database keeps only its SHA-256 hash. Sessions last 30 days and are extended while the person stays active.
- Every changing request must carry the `X-Requested-With` header, which the app's own pages add. Other websites cannot add it, which stops cross-site request forgery.
- Each role has, for each module, a set of actions (View, Create, Edit, Delete, Approve, Export, Import) and one scope (Own, Team, Department or All records). A Super Admin edits these under Settings, Roles and permissions. The API checks every request; the pages only hide what a person cannot use.
- Passwords are hashed with scrypt and a random salt. Stored website passwords are encrypted with AES-256-GCM using `ENCRYPTION_KEY`.

## Business rules worth knowing

- GST is worked out per line. Same state as the company: CGST and SGST. Another state: IGST. Export customers: zero.
- Document numbers look like `CX/INV/2026-27/0001` and restart each financial year. An invoice gets its number when it is sent; before that it is a draft.
- A sent invoice cannot be edited. Use a credit note to correct it.
- Payments can include TDS deducted by the customer.
- Daily checks run after 9:00 India time: follow-up reminders, payment reminders (3, 10, 20 and 30 days overdue), renewal reminders (30, 15, 7 and 1 days before expiry) and recurring invoices. If the host stops the app while nobody is using it, the checks run on the first request after 9:00.

## Not in this version

- WhatsApp opens in WhatsApp with the message written; it is not sent through the WhatsApp Business API. SMS is not connected.
- Files are stored on the server's disk, not in S3-compatible storage.
- Notifications refresh every 20 seconds; there is no live socket connection.
- PDF is made with the browser's "Print, Save as PDF" on the print pages.
- Quotation approval is one step. The multi-step approval tables exist in the database but are not used.
- Two-factor login is not included.
- File downloads check that the file belongs to your company, not the module permission of each file.
- The sign-in rate limit is counted in memory, per server process.
