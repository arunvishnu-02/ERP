-- 1X System: the Calendar, with events people add by hand.

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" CHAR(36) NOT NULL,
    "organizationId" CHAR(36) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "date" DATE NOT NULL,
    "time" VARCHAR(5),
    "notes" TEXT,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdById" CHAR(36) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEvent_organizationId_date_idx" ON "CalendarEvent"("organizationId", "date");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
