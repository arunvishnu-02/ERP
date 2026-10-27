-- 1X System: a project is given to a team. That team's Team Lead manages it and gives tasks to the team.
ALTER TABLE "Project" ADD COLUMN "teamId" CHAR(36);

-- CreateIndex
CREATE INDEX "Project_teamId_idx" ON "Project"("teamId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
