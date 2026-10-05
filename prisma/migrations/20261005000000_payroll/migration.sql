-- Payroll runs and payslips
-- CreateTable
CREATE TABLE `PayrollRun` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `month` CHAR(7) NOT NULL,
    `status` ENUM('DRAFT', 'FINALISED', 'PAID') NOT NULL DEFAULT 'DRAFT',
    `workingDays` INTEGER NOT NULL,
    `totalGross` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalDeductions` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalNet` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `createdById` CHAR(36) NULL,
    `finalisedAt` DATETIME(3) NULL,
    `paidOn` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PayrollRun_organizationId_month_key`(`organizationId`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payslip` (
    `id` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `runId` CHAR(36) NOT NULL,
    `employeeId` CHAR(36) NOT NULL,
    `month` CHAR(7) NOT NULL,
    `monthlySalary` DECIMAL(14, 2) NOT NULL,
    `workingDays` DECIMAL(6, 2) NOT NULL,
    `paidDays` DECIMAL(6, 2) NOT NULL,
    `lopDays` DECIMAL(6, 2) NOT NULL DEFAULT 0,
    `earnings` JSON NOT NULL,
    `extraEarnings` JSON NULL,
    `deductions` JSON NULL,
    `gross` DECIMAL(14, 2) NOT NULL,
    `totalDeductions` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `netPay` DECIMAL(14, 2) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Payslip_employeeId_month_idx`(`employeeId`, `month`),
    UNIQUE INDEX `Payslip_runId_employeeId_key`(`runId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PayrollRun` ADD CONSTRAINT `PayrollRun_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payslip` ADD CONSTRAINT `Payslip_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payslip` ADD CONSTRAINT `Payslip_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `PayrollRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payslip` ADD CONSTRAINT `Payslip_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

