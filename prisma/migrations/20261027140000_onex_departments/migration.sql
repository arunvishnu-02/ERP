-- 1X System: departments, roles and project assignment.
-- Only adds columns, a table and rows; existing data is kept.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "crossDepartment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "departmentId" CHAR(36),
ADD COLUMN     "teamLeadId" CHAR(36);

-- CreateTable
CREATE TABLE "ProjectDepartment" (
    "projectId" CHAR(36) NOT NULL,
    "departmentId" CHAR(36) NOT NULL,

    CONSTRAINT "ProjectDepartment_pkey" PRIMARY KEY ("projectId","departmentId")
);

-- CreateIndex
CREATE INDEX "Project_departmentId_idx" ON "Project"("departmentId");

-- CreateIndex
CREATE INDEX "Project_teamLeadId_idx" ON "Project"("teamLeadId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_teamLeadId_fkey" FOREIGN KEY ("teamLeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDepartment" ADD CONSTRAINT "ProjectDepartment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDepartment" ADD CONSTRAINT "ProjectDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Departments from the plan. Old default names are renamed when the new name is free, then any missing ones are added.
UPDATE "Department" d SET "name" = 'Digital Marketing', "updatedAt" = now()
WHERE d."name" = 'Marketing' AND NOT EXISTS (SELECT 1 FROM "Department" x WHERE x."organizationId" = d."organizationId" AND x."name" = 'Digital Marketing');
UPDATE "Department" d SET "name" = 'UI/UX Design', "updatedAt" = now()
WHERE d."name" = 'Design' AND NOT EXISTS (SELECT 1 FROM "Department" x WHERE x."organizationId" = d."organizationId" AND x."name" = 'UI/UX Design');
INSERT INTO "Department" ("id", "organizationId", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", n."name", now(), now()
FROM "Organization" o CROSS JOIN (VALUES ('Development'), ('Digital Marketing'), ('UI/UX Design'), ('Video Editing')) AS n("name")
WHERE NOT EXISTS (SELECT 1 FROM "Department" x WHERE x."organizationId" = o."id" AND x."name" = n."name");

-- Roles: "Team Leader" as in the plan, and a new Intern role with the same access as Staff
UPDATE "Role" SET "name" = 'Team Leader', "updatedAt" = now() WHERE "key" = 'TEAM_LEAD' AND "name" = 'Team Lead';
INSERT INTO "Role" ("id", "organizationId", "name", "key", "description", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", 'Intern', 'INTERN', 'Own tasks and the projects they are on, like Staff', true, now(), now()
FROM "Organization" o
WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."organizationId" = o."id" AND r."key" = 'INTERN');
INSERT INTO "RolePermission" ("roleId", "permissionId", "scope")
SELECT r."id", p."id", g."scope"::"AccessScope"
FROM (VALUES
    ('DASHBOARD', 'VIEW', 'ALL'),
    ('PROJECTS', 'VIEW', 'OWN'),
    ('TASKS', 'VIEW', 'OWN'),
    ('TASKS', 'CREATE', 'OWN'),
    ('TASKS', 'EDIT', 'OWN'),
    ('TICKETS', 'VIEW', 'OWN'),
    ('TICKETS', 'CREATE', 'OWN'),
    ('TICKETS', 'EDIT', 'OWN'),
    ('DOCUMENTS', 'VIEW', 'ALL')
) AS g("module", "action", "scope")
JOIN "Role" r ON r."key" = 'INTERN' AND r."isSystem" = true
JOIN "Permission" p ON p."module"::text = g."module" AND p."action"::text = g."action"
ON CONFLICT DO NOTHING;

-- A Manager works on the projects and tasks of their own department
UPDATE "RolePermission" rp SET "scope" = 'DEPARTMENT'
FROM "Role" r, "Permission" p
WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id" AND r."key" = 'MANAGER' AND rp."scope" = 'ALL'
  AND p."module"::text IN ('PROJECTS', 'TASKS');

-- Projects already given to a team take the team's department and lead
UPDATE "Project" p SET "departmentId" = t."departmentId", "teamLeadId" = t."leadId"
FROM "Team" t WHERE p."teamId" = t."id" AND p."departmentId" IS NULL AND p."teamLeadId" IS NULL;
