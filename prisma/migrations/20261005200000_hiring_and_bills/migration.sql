-- Hiring (job openings and candidates) and vendor bill fields on expenses
-- AlterTable
ALTER TABLE `Expense` ADD COLUMN `billNumber` VARCHAR(191) NULL,
    ADD COLUMN `dueDate` DATE NULL;

-- CreateTable
CREATE TABLE `JobOpening` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `departmentId` CHAR(36) NULL,
    `employmentType` ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'FREELANCE') NOT NULL DEFAULT 'FULL_TIME',
    `location` VARCHAR(191) NULL,
    `salaryRange` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `status` ENUM('OPEN', 'ON_HOLD', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `openedOn` DATE NOT NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `JobOpening_organizationId_status_idx`(`organizationId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Candidate` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `jobId` CHAR(36) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `source` VARCHAR(191) NULL,
    `experience` VARCHAR(191) NULL,
    `link` VARCHAR(500) NULL,
    `stage` ENUM('APPLIED', 'INTERVIEW', 'OFFER', 'JOINED', 'REJECTED') NOT NULL DEFAULT 'APPLIED',
    `interviewAt` DATETIME(3) NULL,
    `monthlySalary` DECIMAL(14, 2) NULL,
    `joiningDate` DATE NULL,
    `offerSentAt` DATETIME(3) NULL,
    `offerAccepted` BOOLEAN NOT NULL DEFAULT false,
    `notes` TEXT NULL,
    `rejectionReason` VARCHAR(191) NULL,
    `employeeId` CHAR(36) NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Candidate_organizationId_jobId_stage_idx`(`organizationId`, `jobId`, `stage`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Candidate` ADD CONSTRAINT `Candidate_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `JobOpening`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

