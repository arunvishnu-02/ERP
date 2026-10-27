-- 1X System step 1: the emailed sign-in code for Admin, and the new roles.

-- CreateTable
CREATE TABLE "LoginCode" (
    "id" CHAR(36) NOT NULL,
    "userId" CHAR(36) NOT NULL,
    "ticketHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "tries" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginCode_ticketHash_key" ON "LoginCode"("ticketHash");

-- CreateIndex
CREATE INDEX "LoginCode_userId_idx" ON "LoginCode"("userId");

-- AddForeignKey
ALTER TABLE "LoginCode" ADD CONSTRAINT "LoginCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Role names from the plan
UPDATE "Role" SET "name" = 'Admin', "description" = 'Full access to everything, including all money', "updatedAt" = now() WHERE "key" = 'SUPER_ADMIN' AND "name" = 'Super Admin';
UPDATE "Role" SET "name" = 'Sales', "description" = 'Works own leads and follow-ups. No quotations or amounts', "updatedAt" = now() WHERE "key" = 'SALES_EXECUTIVE' AND "name" = 'Sales Executive';
UPDATE "Role" SET "description" = 'Runs projects, tasks, tickets and leads; approves leave. Sees no money', "updatedAt" = now() WHERE "key" = 'MANAGER';
UPDATE "Role" SET "description" = 'Expenses, vendor bills and client payments. No quotations or salaries', "updatedAt" = now() WHERE "key" = 'ACCOUNTS';
UPDATE "Role" SET "description" = 'Staff records, attendance, leave, letters and assets. No salaries', "updatedAt" = now() WHERE "key" = 'HR';

-- Only Admin sees money: take quotations, invoices, payments, finance and reports away from the other roles
DELETE FROM "RolePermission" rp USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
  AND ((r."key" = 'MANAGER' AND p."module"::text IN ('QUOTATIONS', 'INVOICES', 'PAYMENTS', 'FINANCE', 'REPORTS'))
    OR (r."key" = 'SALES_EXECUTIVE' AND p."module"::text IN ('QUOTATIONS', 'INVOICES', 'PAYMENTS'))
    OR (r."key" = 'ACCOUNTS' AND p."module"::text IN ('QUOTATIONS', 'REPORTS')));

-- New roles: Team Lead and Staff, in every company
INSERT INTO "Role" ("id", "organizationId", "name", "key", "description", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", n."name", n."key", n."description", true, now(), now()
FROM "Organization" o CROSS JOIN (VALUES
    ('Team Lead', 'TEAM_LEAD', 'Assigns tasks to the team and approves their leave first. Sees no money'),
    ('Staff', 'STAFF', 'Own tasks, timesheet, tickets, leave and payslips')
) AS n("name", "key", "description")
WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."organizationId" = o."id" AND r."key" = n."key");

INSERT INTO "RolePermission" ("roleId", "permissionId", "scope")
SELECT r."id", p."id", g."scope"::"AccessScope"
FROM (VALUES
    ('TEAM_LEAD', 'DASHBOARD', 'VIEW', 'ALL'),
    ('TEAM_LEAD', 'CUSTOMERS', 'VIEW', 'ALL'),
    ('TEAM_LEAD', 'PROJECTS', 'VIEW', 'TEAM'),
    ('TEAM_LEAD', 'PROJECTS', 'EDIT', 'TEAM'),
    ('TEAM_LEAD', 'TASKS', 'VIEW', 'TEAM'),
    ('TEAM_LEAD', 'TASKS', 'CREATE', 'TEAM'),
    ('TEAM_LEAD', 'TASKS', 'EDIT', 'TEAM'),
    ('TEAM_LEAD', 'TASKS', 'DELETE', 'TEAM'),
    ('TEAM_LEAD', 'TICKETS', 'VIEW', 'TEAM'),
    ('TEAM_LEAD', 'TICKETS', 'CREATE', 'TEAM'),
    ('TEAM_LEAD', 'TICKETS', 'EDIT', 'TEAM'),
    ('TEAM_LEAD', 'WEBSITES', 'VIEW', 'ALL'),
    ('TEAM_LEAD', 'DOCUMENTS', 'VIEW', 'ALL'),
    ('TEAM_LEAD', 'DOCUMENTS', 'CREATE', 'ALL'),
    ('TEAM_LEAD', 'HR', 'VIEW', 'TEAM'),
    ('TEAM_LEAD', 'HR', 'APPROVE', 'TEAM'),
    ('TEAM_LEAD', 'COMMUNICATION', 'VIEW', 'TEAM'),
    ('TEAM_LEAD', 'COMMUNICATION', 'CREATE', 'TEAM'),
    ('STAFF', 'DASHBOARD', 'VIEW', 'ALL'),
    ('STAFF', 'PROJECTS', 'VIEW', 'OWN'),
    ('STAFF', 'TASKS', 'VIEW', 'OWN'),
    ('STAFF', 'TASKS', 'CREATE', 'OWN'),
    ('STAFF', 'TASKS', 'EDIT', 'OWN'),
    ('STAFF', 'TICKETS', 'VIEW', 'OWN'),
    ('STAFF', 'TICKETS', 'CREATE', 'OWN'),
    ('STAFF', 'TICKETS', 'EDIT', 'OWN'),
    ('STAFF', 'DOCUMENTS', 'VIEW', 'ALL')
) AS g("roleKey", "module", "action", "scope")
JOIN "Role" r ON r."key" = g."roleKey"
JOIN "Permission" p ON p."module"::text = g."module" AND p."action"::text = g."action"
ON CONFLICT DO NOTHING;
