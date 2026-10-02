-- CX CRM ERP: first migration (MySQL / MariaDB). Generated from prisma/schema.prisma by scripts/gen-sql.mjs

-- CreateTable
CREATE TABLE `Organization` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `legalName` VARCHAR(191) NULL,
  `gstin` VARCHAR(191) NULL,
  `pan` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `addressLine1` VARCHAR(191) NULL,
  `addressLine2` VARCHAR(191) NULL,
  `city` VARCHAR(191) NULL,
  `state` VARCHAR(191) NULL,
  `stateCode` VARCHAR(191) NULL,
  `pincode` VARCHAR(191) NULL,
  `country` VARCHAR(191) NOT NULL DEFAULT 'IN',
  `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
  `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Kolkata',
  `financialYearStartMonth` INTEGER NOT NULL DEFAULT 4,
  `logoFileId` CHAR(36) NULL,
  `plan` ENUM('TRIAL', 'STARTER', 'GROWTH', 'ENTERPRISE') NOT NULL DEFAULT 'TRIAL',
  `status` ENUM('ACTIVE', 'SUSPENDED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  `settings` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Organization_slug_key`(`slug`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Branch` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `gstin` VARCHAR(191) NULL,
  `addressLine1` VARCHAR(191) NULL,
  `city` VARCHAR(191) NULL,
  `state` VARCHAR(191) NULL,
  `stateCode` VARCHAR(191) NULL,
  `pincode` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `isHeadOffice` BOOLEAN NOT NULL DEFAULT false,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Branch_organizationId_code_key`(`organizationId`, `code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Department` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NULL,
  `headId` CHAR(36) NULL,
  `parentId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Department_organizationId_name_key`(`organizationId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Team` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `departmentId` CHAR(36) NULL,
  `name` VARCHAR(191) NOT NULL,
  `leadId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Team_organizationId_name_key`(`organizationId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeamMember` (
  `teamId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`teamId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `departmentId` CHAR(36) NULL,
  `email` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NULL,
  `passwordHash` VARCHAR(191) NOT NULL,
  `firstName` VARCHAR(191) NOT NULL,
  `lastName` VARCHAR(191) NULL,
  `avatarFileId` CHAR(36) NULL,
  `status` ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED') NOT NULL DEFAULT 'INVITED',
  `managerId` CHAR(36) NULL,
  `twoFactorEnabled` BOOLEAN NOT NULL DEFAULT false,
  `twoFactorSecret` VARCHAR(191) NULL,
  `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
  `emailVerifiedAt` DATETIME(3) NULL,
  `lastLoginAt` DATETIME(3) NULL,
  `preferences` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  INDEX `User_organizationId_status_idx`(`organizationId`, `status`),
  UNIQUE INDEX `User_organizationId_email_key`(`organizationId`, `email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `isSystem` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Role_organizationId_key_key`(`organizationId`, `key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserRole` (
  `userId` CHAR(36) NOT NULL,
  `roleId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
  `id` CHAR(36) NOT NULL,
  `module` ENUM('DASHBOARD', 'LEADS', 'CUSTOMERS', 'SALES', 'QUOTATIONS', 'INVOICES', 'PAYMENTS', 'PROJECTS', 'TASKS', 'MARKETING', 'WEBSITES', 'TICKETS', 'DOCUMENTS', 'HR', 'ASSETS', 'FINANCE', 'REPORTS', 'AUTOMATION', 'COMMUNICATION', 'SETTINGS') NOT NULL,
  `action` ENUM('VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT', 'IMPORT') NOT NULL,
  `description` TEXT NULL,
  UNIQUE INDEX `Permission_module_action_key`(`module`, `action`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
  `roleId` CHAR(36) NOT NULL,
  `permissionId` CHAR(36) NOT NULL,
  `scope` ENUM('OWN', 'TEAM', 'DEPARTMENT', 'ALL') NOT NULL DEFAULT 'OWN',
  PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `userAgent` TEXT NULL,
  `ipAddress` VARCHAR(191) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
  INDEX `Session_userId_idx`(`userId`),
  INDEX `Session_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApiKey` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `keyHash` VARCHAR(191) NOT NULL,
  `scopes` JSON NULL,
  `lastUsedAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ApiKey_keyHash_key`(`keyHash`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NULL,
  `action` ENUM('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'EXPORT', 'IMPORT', 'APPROVE', 'REJECT', 'PERMISSION_CHANGE', 'SECRET_VIEW') NOT NULL,
  `module` ENUM('DASHBOARD', 'LEADS', 'CUSTOMERS', 'SALES', 'QUOTATIONS', 'INVOICES', 'PAYMENTS', 'PROJECTS', 'TASKS', 'MARKETING', 'WEBSITES', 'TICKETS', 'DOCUMENTS', 'HR', 'ASSETS', 'FINANCE', 'REPORTS', 'AUTOMATION', 'COMMUNICATION', 'SETTINGS') NULL,
  `entityType` VARCHAR(191) NOT NULL,
  `entityId` VARCHAR(191) NULL,
  `before` JSON NULL,
  `after` JSON NULL,
  `ipAddress` VARCHAR(191) NULL,
  `userAgent` TEXT NULL,
  `requestId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AuditLog_organizationId_entityType_entityId_idx`(`organizationId`, `entityType`, `entityId`),
  INDEX `AuditLog_organizationId_userId_createdAt_idx`(`organizationId`, `userId`, `createdAt`),
  INDEX `AuditLog_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `File` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `bucket` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `fileName` VARCHAR(255) NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `sizeBytes` BIGINT NOT NULL,
  `checksum` VARCHAR(191) NULL,
  `uploadedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `File_bucket_key_key`(`bucket`, `key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attachment` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `fileId` CHAR(36) NOT NULL,
  `entityType` ENUM('LEAD', 'CUSTOMER', 'CONTACT', 'DEAL', 'QUOTATION', 'INVOICE', 'CREDIT_NOTE', 'PAYMENT', 'PROJECT', 'MILESTONE', 'TASK', 'CAMPAIGN', 'CONTENT_ITEM', 'WEBSITE', 'WEB_ASSET', 'TICKET', 'DOCUMENT', 'EMPLOYEE', 'LEAVE_REQUEST', 'ASSET', 'EXPENSE') NOT NULL,
  `entityId` CHAR(36) NOT NULL,
  `createdById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `Attachment_organizationId_entityType_entityId_idx`(`organizationId`, `entityType`, `entityId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Note` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `entityType` ENUM('LEAD', 'CUSTOMER', 'CONTACT', 'DEAL', 'QUOTATION', 'INVOICE', 'CREDIT_NOTE', 'PAYMENT', 'PROJECT', 'MILESTONE', 'TASK', 'CAMPAIGN', 'CONTENT_ITEM', 'WEBSITE', 'WEB_ASSET', 'TICKET', 'DOCUMENT', 'EMPLOYEE', 'LEAVE_REQUEST', 'ASSET', 'EXPENSE') NOT NULL,
  `entityId` CHAR(36) NOT NULL,
  `body` TEXT NOT NULL,
  `isPinned` BOOLEAN NOT NULL DEFAULT false,
  `authorId` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Note_organizationId_entityType_entityId_idx`(`organizationId`, `entityType`, `entityId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Comment` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `entityType` ENUM('LEAD', 'CUSTOMER', 'CONTACT', 'DEAL', 'QUOTATION', 'INVOICE', 'CREDIT_NOTE', 'PAYMENT', 'PROJECT', 'MILESTONE', 'TASK', 'CAMPAIGN', 'CONTENT_ITEM', 'WEBSITE', 'WEB_ASSET', 'TICKET', 'DOCUMENT', 'EMPLOYEE', 'LEAVE_REQUEST', 'ASSET', 'EXPENSE') NOT NULL,
  `entityId` CHAR(36) NOT NULL,
  `body` TEXT NOT NULL,
  `isInternal` BOOLEAN NOT NULL DEFAULT true,
  `mentions` JSON NULL,
  `authorId` CHAR(36) NOT NULL,
  `parentId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  INDEX `Comment_organizationId_entityType_entityId_idx`(`organizationId`, `entityType`, `entityId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Activity` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `entityType` ENUM('LEAD', 'CUSTOMER', 'CONTACT', 'DEAL', 'QUOTATION', 'INVOICE', 'CREDIT_NOTE', 'PAYMENT', 'PROJECT', 'MILESTONE', 'TASK', 'CAMPAIGN', 'CONTENT_ITEM', 'WEBSITE', 'WEB_ASSET', 'TICKET', 'DOCUMENT', 'EMPLOYEE', 'LEAVE_REQUEST', 'ASSET', 'EXPENSE') NOT NULL,
  `entityId` CHAR(36) NOT NULL,
  `type` ENUM('CREATED', 'UPDATED', 'STATUS_CHANGED', 'ASSIGNED', 'NOTE_ADDED', 'FILE_ADDED', 'COMMENT', 'CALL', 'MEETING', 'FOLLOW_UP_DONE', 'EMAIL_SENT', 'EMAIL_RECEIVED', 'WHATSAPP_SENT', 'WHATSAPP_RECEIVED', 'SMS_SENT', 'APPROVAL', 'PAYMENT', 'SYSTEM') NOT NULL,
  `summary` TEXT NOT NULL,
  `metadata` JSON NULL,
  `actorId` CHAR(36) NULL,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `Activity_organizationId_entityType_entityId_occurredAt_idx`(`organizationId`, `entityType`, `entityId`, `occurredAt`),
  INDEX `Activity_organizationId_occurredAt_idx`(`organizationId`, `occurredAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tag` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `color` VARCHAR(191) NULL,
  UNIQUE INDEX `Tag_organizationId_name_key`(`organizationId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TagAssignment` (
  `tagId` CHAR(36) NOT NULL,
  `entityType` ENUM('LEAD', 'CUSTOMER', 'CONTACT', 'DEAL', 'QUOTATION', 'INVOICE', 'CREDIT_NOTE', 'PAYMENT', 'PROJECT', 'MILESTONE', 'TASK', 'CAMPAIGN', 'CONTENT_ITEM', 'WEBSITE', 'WEB_ASSET', 'TICKET', 'DOCUMENT', 'EMPLOYEE', 'LEAVE_REQUEST', 'ASSET', 'EXPENSE') NOT NULL,
  `entityId` CHAR(36) NOT NULL,
  INDEX `TagAssignment_entityType_entityId_idx`(`entityType`, `entityId`),
  PRIMARY KEY (`tagId`, `entityType`, `entityId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NumberSequence` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `type` ENUM('LEAD', 'CUSTOMER', 'DEAL', 'QUOTATION', 'INVOICE', 'PROFORMA', 'CREDIT_NOTE', 'RECEIPT', 'PROJECT', 'TASK', 'TICKET', 'EXPENSE', 'EMPLOYEE', 'ASSET') NOT NULL,
  `prefix` VARCHAR(191) NOT NULL,
  `financialYear` VARCHAR(191) NOT NULL,
  `nextNumber` INTEGER NOT NULL DEFAULT 1,
  `padding` INTEGER NOT NULL DEFAULT 4,
  UNIQUE INDEX `NumberSequence_organizationId_type_financialYear_key`(`organizationId`, `type`, `financialYear`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadSource` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  UNIQUE INDEX `LeadSource_organizationId_name_key`(`organizationId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadStage` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `color` VARCHAR(191) NULL,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `isWon` BOOLEAN NOT NULL DEFAULT false,
  `isLost` BOOLEAN NOT NULL DEFAULT false,
  UNIQUE INDEX `LeadStage_organizationId_name_key`(`organizationId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lead` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `leadNumber` VARCHAR(191) NOT NULL,
  `firstName` VARCHAR(191) NOT NULL,
  `lastName` VARCHAR(191) NULL,
  `companyName` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `whatsappNumber` VARCHAR(191) NULL,
  `website` VARCHAR(500) NULL,
  `city` VARCHAR(191) NULL,
  `state` VARCHAR(191) NULL,
  `sourceId` CHAR(36) NULL,
  `stageId` CHAR(36) NOT NULL,
  `status` ENUM('OPEN', 'CONVERTED', 'LOST', 'JUNK') NOT NULL DEFAULT 'OPEN',
  `serviceInterest` JSON NULL,
  `requirement` TEXT NULL,
  `estimatedValue` DECIMAL(14,2) NULL,
  `score` INTEGER NULL,
  `ownerId` CHAR(36) NULL,
  `nextFollowUpAt` DATETIME(3) NULL,
  `lastContactedAt` DATETIME(3) NULL,
  `lostReason` TEXT NULL,
  `convertedAt` DATETIME(3) NULL,
  `customerId` CHAR(36) NULL,
  `utm` JSON NULL,
  `customFields` JSON NULL,
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  INDEX `Lead_organizationId_status_stageId_idx`(`organizationId`, `status`, `stageId`),
  INDEX `Lead_organizationId_ownerId_idx`(`organizationId`, `ownerId`),
  INDEX `Lead_organizationId_nextFollowUpAt_idx`(`organizationId`, `nextFollowUpAt`),
  INDEX `Lead_organizationId_phone_idx`(`organizationId`, `phone`),
  UNIQUE INDEX `Lead_organizationId_leadNumber_key`(`organizationId`, `leadNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FollowUp` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `leadId` CHAR(36) NULL,
  `dealId` CHAR(36) NULL,
  `customerId` CHAR(36) NULL,
  `type` ENUM('CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'SITE_VISIT', 'OTHER') NOT NULL,
  `subject` VARCHAR(500) NULL,
  `dueAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  `outcome` TEXT NULL,
  `status` ENUM('PENDING', 'DONE', 'MISSED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `assignedToId` CHAR(36) NOT NULL,
  `reminderSentAt` DATETIME(3) NULL,
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `FollowUp_organizationId_assignedToId_status_dueAt_idx`(`organizationId`, `assignedToId`, `status`, `dueAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `customerNumber` VARCHAR(191) NOT NULL,
  `type` ENUM('COMPANY', 'INDIVIDUAL') NOT NULL DEFAULT 'COMPANY',
  `name` VARCHAR(191) NOT NULL,
  `legalName` VARCHAR(191) NULL,
  `gstin` VARCHAR(191) NULL,
  `pan` VARCHAR(191) NULL,
  `industry` VARCHAR(191) NULL,
  `website` VARCHAR(500) NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `billingAddressLine1` VARCHAR(191) NULL,
  `billingAddressLine2` VARCHAR(191) NULL,
  `billingCity` VARCHAR(191) NULL,
  `billingState` VARCHAR(191) NULL,
  `billingStateCode` VARCHAR(191) NULL,
  `billingPincode` VARCHAR(191) NULL,
  `country` VARCHAR(191) NOT NULL DEFAULT 'IN',
  `isExport` BOOLEAN NOT NULL DEFAULT false,
  `paymentTermsDays` INTEGER NOT NULL DEFAULT 15,
  `creditLimit` DECIMAL(14,2) NULL,
  `accountManagerId` CHAR(36) NULL,
  `status` ENUM('ACTIVE', 'INACTIVE', 'CHURNED') NOT NULL DEFAULT 'ACTIVE',
  `customFields` JSON NULL,
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  INDEX `Customer_organizationId_name_idx`(`organizationId`, `name`),
  INDEX `Customer_organizationId_accountManagerId_idx`(`organizationId`, `accountManagerId`),
  UNIQUE INDEX `Customer_organizationId_customerNumber_key`(`organizationId`, `customerNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Contact` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `customerId` CHAR(36) NOT NULL,
  `firstName` VARCHAR(191) NOT NULL,
  `lastName` VARCHAR(191) NULL,
  `designation` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `whatsappNumber` VARCHAR(191) NULL,
  `isPrimary` BOOLEAN NOT NULL DEFAULT false,
  `isBillingContact` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Contact_organizationId_customerId_idx`(`organizationId`, `customerId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Pipeline` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  UNIQUE INDEX `Pipeline_organizationId_name_key`(`organizationId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PipelineStage` (
  `id` CHAR(36) NOT NULL,
  `pipelineId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `probability` INTEGER NOT NULL DEFAULT 0,
  `isWon` BOOLEAN NOT NULL DEFAULT false,
  `isLost` BOOLEAN NOT NULL DEFAULT false,
  UNIQUE INDEX `PipelineStage_pipelineId_name_key`(`pipelineId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Deal` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `dealNumber` VARCHAR(191) NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `customerId` CHAR(36) NULL,
  `leadId` CHAR(36) NULL,
  `contactId` CHAR(36) NULL,
  `pipelineId` CHAR(36) NOT NULL,
  `stageId` CHAR(36) NOT NULL,
  `value` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
  `expectedCloseDate` DATE NULL,
  `closedAt` DATETIME(3) NULL,
  `status` ENUM('OPEN', 'WON', 'LOST') NOT NULL DEFAULT 'OPEN',
  `lostReason` TEXT NULL,
  `ownerId` CHAR(36) NOT NULL,
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  INDEX `Deal_organizationId_status_stageId_idx`(`organizationId`, `status`, `stageId`),
  INDEX `Deal_organizationId_ownerId_idx`(`organizationId`, `ownerId`),
  UNIQUE INDEX `Deal_organizationId_dealNumber_key`(`organizationId`, `dealNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Meeting` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `leadId` CHAR(36) NULL,
  `dealId` CHAR(36) NULL,
  `customerId` CHAR(36) NULL,
  `startsAt` DATETIME(3) NOT NULL,
  `endsAt` DATETIME(3) NOT NULL,
  `location` VARCHAR(191) NULL,
  `meetingUrl` VARCHAR(500) NULL,
  `agenda` TEXT NULL,
  `outcome` TEXT NULL,
  `organizerId` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Meeting_organizationId_startsAt_idx`(`organizationId`, `startsAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MeetingAttendee` (
  `id` CHAR(36) NOT NULL,
  `meetingId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NULL,
  `contactId` CHAR(36) NULL,
  `externalName` VARCHAR(191) NULL,
  `externalEmail` VARCHAR(191) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CallLog` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `leadId` CHAR(36) NULL,
  `dealId` CHAR(36) NULL,
  `customerId` CHAR(36) NULL,
  `contactId` CHAR(36) NULL,
  `direction` ENUM('INBOUND', 'OUTBOUND') NOT NULL,
  `phone` VARCHAR(191) NOT NULL,
  `durationSeconds` INTEGER NULL,
  `outcome` TEXT NULL,
  `notes` TEXT NULL,
  `recordingFileId` CHAR(36) NULL,
  `userId` CHAR(36) NOT NULL,
  `calledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `CallLog_organizationId_calledAt_idx`(`organizationId`, `calledAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Service` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NULL,
  `category` ENUM('DIGITAL_MARKETING', 'SEO', 'SOCIAL_MEDIA', 'PAID_ADS', 'WEBSITE_DEVELOPMENT', 'ECOMMERCE', 'APP_DEVELOPMENT', 'UI_UX_DESIGN', 'VIDEO_EDITING', 'BRANDING', 'HOSTING_DOMAIN', 'MAINTENANCE', 'IT_SERVICES', 'OTHER') NOT NULL,
  `description` TEXT NULL,
  `sacCode` VARCHAR(191) NULL,
  `unit` VARCHAR(191) NOT NULL DEFAULT 'nos',
  `basePrice` DECIMAL(14,2) NOT NULL,
  `gstRate` DECIMAL(5,2) NOT NULL DEFAULT 18,
  `billingCycle` ENUM('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY') NOT NULL DEFAULT 'ONE_TIME',
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Service_organizationId_name_key`(`organizationId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServicePackage` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `price` DECIMAL(14,2) NOT NULL,
  `billingCycle` ENUM('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY') NOT NULL DEFAULT 'ONE_TIME',
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ServicePackage_organizationId_name_key`(`organizationId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServicePackageItem` (
  `id` CHAR(36) NOT NULL,
  `packageId` CHAR(36) NOT NULL,
  `serviceId` CHAR(36) NOT NULL,
  `quantity` DECIMAL(12,2) NOT NULL DEFAULT 1,
  `unitPrice` DECIMAL(14,2) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PriceRule` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` ENUM('VOLUME', 'CUSTOMER_TIER', 'PROMOTION', 'CONTRACT_DURATION') NOT NULL,
  `serviceId` CHAR(36) NULL,
  `packageId` CHAR(36) NULL,
  `minQuantity` DECIMAL(12,2) NULL,
  `minContractMonths` INTEGER NULL,
  `customerTier` VARCHAR(191) NULL,
  `discountPercent` DECIMAL(5,2) NULL,
  `discountAmount` DECIMAL(14,2) NULL,
  `validFrom` DATE NULL,
  `validTo` DATE NULL,
  `priority` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaxRate` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `rate` DECIMAL(5,2) NOT NULL,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  UNIQUE INDEX `TaxRate_organizationId_name_key`(`organizationId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Quotation` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `quotationNumber` VARCHAR(191) NOT NULL,
  `revision` INTEGER NOT NULL DEFAULT 1,
  `parentQuotationId` CHAR(36) NULL,
  `isLatest` BOOLEAN NOT NULL DEFAULT true,
  `customerId` CHAR(36) NULL,
  `leadId` CHAR(36) NULL,
  `dealId` CHAR(36) NULL,
  `contactId` CHAR(36) NULL,
  `title` VARCHAR(500) NULL,
  `issueDate` DATE NOT NULL,
  `validUntil` DATE NOT NULL,
  `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CONVERTED') NOT NULL DEFAULT 'DRAFT',
  `placeOfSupply` VARCHAR(191) NULL,
  `isInterState` BOOLEAN NOT NULL DEFAULT false,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
  `subtotal` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `discountTotal` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `taxableAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `cgstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `sgstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `igstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `totalAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `terms` TEXT NULL,
  `notes` TEXT NULL,
  `pdfFileId` CHAR(36) NULL,
  `rejectionNote` TEXT NULL,
  `publicToken` VARCHAR(191) NULL,
  `sentAt` DATETIME(3) NULL,
  `viewedAt` DATETIME(3) NULL,
  `acceptedAt` DATETIME(3) NULL,
  `preparedById` CHAR(36) NOT NULL,
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  UNIQUE INDEX `Quotation_publicToken_key`(`publicToken`),
  INDEX `Quotation_organizationId_status_idx`(`organizationId`, `status`),
  INDEX `Quotation_organizationId_customerId_idx`(`organizationId`, `customerId`),
  UNIQUE INDEX `Quotation_organizationId_quotationNumber_revision_key`(`organizationId`, `quotationNumber`, `revision`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuotationItem` (
  `id` CHAR(36) NOT NULL,
  `quotationId` CHAR(36) NOT NULL,
  `serviceId` CHAR(36) NULL,
  `packageId` CHAR(36) NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `description` TEXT NOT NULL,
  `sacCode` VARCHAR(191) NULL,
  `quantity` DECIMAL(12,2) NOT NULL DEFAULT 1,
  `unit` VARCHAR(191) NOT NULL DEFAULT 'nos',
  `unitPrice` DECIMAL(14,2) NOT NULL,
  `discountPercent` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `taxRate` DECIMAL(5,2) NOT NULL DEFAULT 18,
  `taxableAmount` DECIMAL(14,2) NOT NULL,
  `cgstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `sgstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `igstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `lineTotal` DECIMAL(14,2) NOT NULL,
  `billingCycle` ENUM('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY') NOT NULL DEFAULT 'ONE_TIME',
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApprovalRule` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `entityType` ENUM('LEAD', 'CUSTOMER', 'CONTACT', 'DEAL', 'QUOTATION', 'INVOICE', 'CREDIT_NOTE', 'PAYMENT', 'PROJECT', 'MILESTONE', 'TASK', 'CAMPAIGN', 'CONTENT_ITEM', 'WEBSITE', 'WEB_ASSET', 'TICKET', 'DOCUMENT', 'EMPLOYEE', 'LEAVE_REQUEST', 'ASSET', 'EXPENSE') NOT NULL,
  `stepNumber` INTEGER NOT NULL DEFAULT 1,
  `minAmount` DECIMAL(14,2) NULL,
  `maxAmount` DECIMAL(14,2) NULL,
  `approverRoleId` CHAR(36) NULL,
  `approverUserId` CHAR(36) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApprovalRequest` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `entityType` ENUM('LEAD', 'CUSTOMER', 'CONTACT', 'DEAL', 'QUOTATION', 'INVOICE', 'CREDIT_NOTE', 'PAYMENT', 'PROJECT', 'MILESTONE', 'TASK', 'CAMPAIGN', 'CONTENT_ITEM', 'WEBSITE', 'WEB_ASSET', 'TICKET', 'DOCUMENT', 'EMPLOYEE', 'LEAVE_REQUEST', 'ASSET', 'EXPENSE') NOT NULL,
  `entityId` CHAR(36) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `currentStep` INTEGER NOT NULL DEFAULT 1,
  `requestedById` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ApprovalRequest_organizationId_entityType_entityId_idx`(`organizationId`, `entityType`, `entityId`),
  INDEX `ApprovalRequest_organizationId_status_idx`(`organizationId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApprovalStep` (
  `id` CHAR(36) NOT NULL,
  `approvalRequestId` CHAR(36) NOT NULL,
  `stepNumber` INTEGER NOT NULL,
  `approverId` CHAR(36) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `comment` TEXT NULL,
  `decidedAt` DATETIME(3) NULL,
  UNIQUE INDEX `ApprovalStep_approvalRequestId_stepNumber_key`(`approvalRequestId`, `stepNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceTemplate` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `layout` JSON NOT NULL,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `invoiceNumber` VARCHAR(191) NOT NULL,
  `type` ENUM('TAX_INVOICE', 'PROFORMA') NOT NULL DEFAULT 'TAX_INVOICE',
  `customerId` CHAR(36) NOT NULL,
  `contactId` CHAR(36) NULL,
  `projectId` CHAR(36) NULL,
  `quotationId` CHAR(36) NULL,
  `recurringInvoiceId` CHAR(36) NULL,
  `templateId` CHAR(36) NULL,
  `issueDate` DATE NOT NULL,
  `dueDate` DATE NOT NULL,
  `paymentTermsDays` INTEGER NOT NULL DEFAULT 15,
  `status` ENUM('DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID') NOT NULL DEFAULT 'DRAFT',
  `placeOfSupply` VARCHAR(191) NULL,
  `isInterState` BOOLEAN NOT NULL DEFAULT false,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'INR',
  `subtotal` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `discountTotal` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `taxableAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `cgstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `sgstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `igstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `totalAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `amountPaid` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `tdsAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `creditedAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `balanceDue` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `terms` TEXT NULL,
  `notes` TEXT NULL,
  `pdfFileId` CHAR(36) NULL,
  `publicToken` VARCHAR(191) NULL,
  `sentAt` DATETIME(3) NULL,
  `viewedAt` DATETIME(3) NULL,
  `paidAt` DATETIME(3) NULL,
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  UNIQUE INDEX `Invoice_publicToken_key`(`publicToken`),
  INDEX `Invoice_organizationId_status_dueDate_idx`(`organizationId`, `status`, `dueDate`),
  INDEX `Invoice_organizationId_customerId_idx`(`organizationId`, `customerId`),
  INDEX `Invoice_organizationId_issueDate_idx`(`organizationId`, `issueDate`),
  UNIQUE INDEX `Invoice_organizationId_invoiceNumber_key`(`organizationId`, `invoiceNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceItem` (
  `id` CHAR(36) NOT NULL,
  `invoiceId` CHAR(36) NOT NULL,
  `serviceId` CHAR(36) NULL,
  `milestoneId` CHAR(36) NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `description` TEXT NOT NULL,
  `sacCode` VARCHAR(191) NULL,
  `quantity` DECIMAL(12,2) NOT NULL DEFAULT 1,
  `unit` VARCHAR(191) NOT NULL DEFAULT 'nos',
  `unitPrice` DECIMAL(14,2) NOT NULL,
  `discountPercent` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `taxRate` DECIMAL(5,2) NOT NULL DEFAULT 18,
  `taxableAmount` DECIMAL(14,2) NOT NULL,
  `cgstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `sgstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `igstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `lineTotal` DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CreditNote` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `creditNoteNumber` VARCHAR(191) NOT NULL,
  `invoiceId` CHAR(36) NOT NULL,
  `customerId` CHAR(36) NOT NULL,
  `issueDate` DATE NOT NULL,
  `reason` TEXT NOT NULL,
  `status` ENUM('DRAFT', 'ISSUED', 'APPLIED', 'VOID') NOT NULL DEFAULT 'DRAFT',
  `taxableAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `cgstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `sgstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `igstAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `totalAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `pdfFileId` CHAR(36) NULL,
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CreditNote_organizationId_creditNoteNumber_key`(`organizationId`, `creditNoteNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CreditNoteItem` (
  `id` CHAR(36) NOT NULL,
  `creditNoteId` CHAR(36) NOT NULL,
  `description` TEXT NOT NULL,
  `sacCode` VARCHAR(191) NULL,
  `quantity` DECIMAL(12,2) NOT NULL DEFAULT 1,
  `unitPrice` DECIMAL(14,2) NOT NULL,
  `taxRate` DECIMAL(5,2) NOT NULL DEFAULT 18,
  `taxableAmount` DECIMAL(14,2) NOT NULL,
  `lineTotal` DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecurringInvoice` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `customerId` CHAR(36) NOT NULL,
  `projectId` CHAR(36) NULL,
  `title` VARCHAR(500) NOT NULL,
  `frequency` ENUM('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY') NOT NULL,
  `intervalCount` INTEGER NOT NULL DEFAULT 1,
  `startDate` DATE NOT NULL,
  `endDate` DATE NULL,
  `nextRunDate` DATE NOT NULL,
  `lastRunDate` DATE NULL,
  `paymentTermsDays` INTEGER NOT NULL DEFAULT 15,
  `autoSend` BOOLEAN NOT NULL DEFAULT false,
  `status` ENUM('ACTIVE', 'PAUSED', 'ENDED') NOT NULL DEFAULT 'ACTIVE',
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `RecurringInvoice_organizationId_status_nextRunDate_idx`(`organizationId`, `status`, `nextRunDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecurringInvoiceItem` (
  `id` CHAR(36) NOT NULL,
  `recurringInvoiceId` CHAR(36) NOT NULL,
  `serviceId` CHAR(36) NULL,
  `description` TEXT NOT NULL,
  `sacCode` VARCHAR(191) NULL,
  `quantity` DECIMAL(12,2) NOT NULL DEFAULT 1,
  `unitPrice` DECIMAL(14,2) NOT NULL,
  `taxRate` DECIMAL(5,2) NOT NULL DEFAULT 18,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BankAccount` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `bankName` VARCHAR(191) NULL,
  `accountNumberLast4` VARCHAR(191) NULL,
  `ifsc` VARCHAR(191) NULL,
  `upiId` VARCHAR(191) NULL,
  `openingBalance` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `receiptNumber` VARCHAR(191) NOT NULL,
  `customerId` CHAR(36) NOT NULL,
  `paymentDate` DATE NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `tdsAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `method` ENUM('BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'CARD', 'PAYMENT_GATEWAY', 'OTHER') NOT NULL,
  `referenceNumber` VARCHAR(191) NULL,
  `bankAccountId` CHAR(36) NULL,
  `status` ENUM('PENDING', 'RECEIVED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'RECEIVED',
  `gatewayProvider` VARCHAR(191) NULL,
  `gatewayPaymentId` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `receiptFileId` CHAR(36) NULL,
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Payment_organizationId_paymentDate_idx`(`organizationId`, `paymentDate`),
  INDEX `Payment_organizationId_customerId_idx`(`organizationId`, `customerId`),
  UNIQUE INDEX `Payment_organizationId_receiptNumber_key`(`organizationId`, `receiptNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentAllocation` (
  `id` CHAR(36) NOT NULL,
  `paymentId` CHAR(36) NOT NULL,
  `invoiceId` CHAR(36) NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `tdsAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  UNIQUE INDEX `PaymentAllocation_paymentId_invoiceId_key`(`paymentId`, `invoiceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentReminder` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `invoiceId` CHAR(36) NOT NULL,
  `channel` ENUM('IN_APP', 'EMAIL', 'WHATSAPP', 'SMS') NOT NULL,
  `level` INTEGER NOT NULL DEFAULT 1,
  `scheduledAt` DATETIME(3) NOT NULL,
  `sentAt` DATETIME(3) NULL,
  `status` ENUM('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  INDEX `PaymentReminder_organizationId_status_scheduledAt_idx`(`organizationId`, `status`, `scheduledAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `projectNumber` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `customerId` CHAR(36) NOT NULL,
  `quotationId` CHAR(36) NULL,
  `dealId` CHAR(36) NULL,
  `category` ENUM('DIGITAL_MARKETING', 'SEO', 'SOCIAL_MEDIA', 'PAID_ADS', 'WEBSITE_DEVELOPMENT', 'ECOMMERCE', 'APP_DEVELOPMENT', 'UI_UX_DESIGN', 'VIDEO_EDITING', 'BRANDING', 'HOSTING_DOMAIN', 'MAINTENANCE', 'IT_SERVICES', 'OTHER') NOT NULL,
  `status` ENUM('PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'IN_REVIEW', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PLANNING',
  `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
  `startDate` DATE NULL,
  `dueDate` DATE NULL,
  `completedAt` DATETIME(3) NULL,
  `budget` DECIMAL(14,2) NULL,
  `progressPercent` INTEGER NOT NULL DEFAULT 0,
  `managerId` CHAR(36) NOT NULL,
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  INDEX `Project_organizationId_status_idx`(`organizationId`, `status`),
  INDEX `Project_organizationId_customerId_idx`(`organizationId`, `customerId`),
  INDEX `Project_organizationId_managerId_idx`(`organizationId`, `managerId`),
  UNIQUE INDEX `Project_organizationId_projectNumber_key`(`organizationId`, `projectNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectMember` (
  `id` CHAR(36) NOT NULL,
  `projectId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `roleInProject` VARCHAR(191) NULL,
  `hourlyCost` DECIMAL(14,2) NULL,
  `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ProjectMember_projectId_userId_key`(`projectId`, `userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Milestone` (
  `id` CHAR(36) NOT NULL,
  `projectId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `dueDate` DATE NULL,
  `completedAt` DATETIME(3) NULL,
  `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'INVOICED') NOT NULL DEFAULT 'PENDING',
  `isBillable` BOOLEAN NOT NULL DEFAULT false,
  `amount` DECIMAL(14,2) NULL,
  INDEX `Milestone_projectId_idx`(`projectId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `taskNumber` VARCHAR(191) NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `description` TEXT NULL,
  `projectId` CHAR(36) NULL,
  `milestoneId` CHAR(36) NULL,
  `parentTaskId` CHAR(36) NULL,
  `ticketId` CHAR(36) NULL,
  `campaignId` CHAR(36) NULL,
  `contentItemId` CHAR(36) NULL,
  `status` ENUM('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE', 'CANCELLED') NOT NULL DEFAULT 'TODO',
  `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
  `startDate` DATE NULL,
  `dueDate` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `estimatedMinutes` INTEGER NULL,
  `loggedMinutes` INTEGER NOT NULL DEFAULT 0,
  `boardPosition` DOUBLE NOT NULL DEFAULT 0,
  `assigneeId` CHAR(36) NULL,
  `reporterId` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  INDEX `Task_organizationId_assigneeId_status_dueDate_idx`(`organizationId`, `assigneeId`, `status`, `dueDate`),
  INDEX `Task_organizationId_projectId_status_idx`(`organizationId`, `projectId`, `status`),
  UNIQUE INDEX `Task_organizationId_taskNumber_key`(`organizationId`, `taskNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TimeEntry` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `taskId` CHAR(36) NULL,
  `projectId` CHAR(36) NULL,
  `userId` CHAR(36) NOT NULL,
  `startedAt` DATETIME(3) NOT NULL,
  `endedAt` DATETIME(3) NULL,
  `minutes` INTEGER NOT NULL DEFAULT 0,
  `isBillable` BOOLEAN NOT NULL DEFAULT true,
  `description` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `TimeEntry_organizationId_userId_startedAt_idx`(`organizationId`, `userId`, `startedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SocialAccount` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `customerId` CHAR(36) NOT NULL,
  `platform` ENUM('INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'YOUTUBE', 'X', 'GOOGLE_ADS', 'META_ADS', 'GOOGLE_BUSINESS', 'WHATSAPP', 'WEBSITE', 'OTHER') NOT NULL,
  `handle` VARCHAR(191) NOT NULL,
  `profileUrl` VARCHAR(500) NULL,
  UNIQUE INDEX `SocialAccount_customerId_platform_handle_key`(`customerId`, `platform`, `handle`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Campaign` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `customerId` CHAR(36) NOT NULL,
  `projectId` CHAR(36) NULL,
  `name` VARCHAR(191) NOT NULL,
  `objective` TEXT NULL,
  `platforms` JSON NULL,
  `status` ENUM('DRAFT', 'PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
  `startDate` DATE NOT NULL,
  `endDate` DATE NULL,
  `budget` DECIMAL(14,2) NULL,
  `managerId` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  INDEX `Campaign_organizationId_customerId_status_idx`(`organizationId`, `customerId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentItem` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `customerId` CHAR(36) NOT NULL,
  `campaignId` CHAR(36) NULL,
  `type` ENUM('POSTER', 'REEL', 'VIDEO', 'CAROUSEL', 'STORY', 'BLOG', 'AD_CREATIVE') NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `caption` TEXT NULL,
  `platform` ENUM('INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'YOUTUBE', 'X', 'GOOGLE_ADS', 'META_ADS', 'GOOGLE_BUSINESS', 'WHATSAPP', 'WEBSITE', 'OTHER') NOT NULL,
  `scheduledAt` DATETIME(3) NULL,
  `publishedAt` DATETIME(3) NULL,
  `status` ENUM('IDEA', 'IN_DESIGN', 'IN_EDIT', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'REJECTED') NOT NULL DEFAULT 'IDEA',
  `assigneeId` CHAR(36) NULL,
  `revisionCount` INTEGER NOT NULL DEFAULT 0,
  `postUrl` VARCHAR(500) NULL,
  `metrics` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ContentItem_organizationId_scheduledAt_idx`(`organizationId`, `scheduledAt`),
  INDEX `ContentItem_organizationId_customerId_status_idx`(`organizationId`, `customerId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdSpend` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `campaignId` CHAR(36) NOT NULL,
  `platform` ENUM('INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'YOUTUBE', 'X', 'GOOGLE_ADS', 'META_ADS', 'GOOGLE_BUSINESS', 'WHATSAPP', 'WEBSITE', 'OTHER') NOT NULL,
  `spendDate` DATE NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `impressions` INTEGER NULL,
  `clicks` INTEGER NULL,
  `leads` INTEGER NULL,
  `conversions` INTEGER NULL,
  UNIQUE INDEX `AdSpend_campaignId_platform_spendDate_key`(`campaignId`, `platform`, `spendDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CampaignReport` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `campaignId` CHAR(36) NOT NULL,
  `periodStart` DATE NOT NULL,
  `periodEnd` DATE NOT NULL,
  `metrics` JSON NOT NULL,
  `summary` TEXT NULL,
  `fileId` CHAR(36) NULL,
  `sentAt` DATETIME(3) NULL,
  `createdById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Website` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `customerId` CHAR(36) NOT NULL,
  `projectId` CHAR(36) NULL,
  `name` VARCHAR(191) NOT NULL,
  `url` VARCHAR(500) NOT NULL,
  `platform` VARCHAR(191) NULL,
  `status` ENUM('IN_DEVELOPMENT', 'LIVE', 'MAINTENANCE', 'DOWN', 'SUSPENDED', 'EXPIRED') NOT NULL DEFAULT 'IN_DEVELOPMENT',
  `monitoringEnabled` BOOLEAN NOT NULL DEFAULT true,
  `lastCheckedAt` DATETIME(3) NULL,
  `lastStatusCode` INTEGER NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Website_organizationId_customerId_idx`(`organizationId`, `customerId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebAsset` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `customerId` CHAR(36) NOT NULL,
  `websiteId` CHAR(36) NULL,
  `type` ENUM('DOMAIN', 'HOSTING', 'SSL', 'EMAIL_HOSTING', 'MAINTENANCE_CONTRACT', 'PLUGIN_LICENSE') NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NULL,
  `ownedBy` ENUM('AGENCY', 'CLIENT') NOT NULL DEFAULT 'AGENCY',
  `purchaseDate` DATE NULL,
  `expiryDate` DATE NOT NULL,
  `renewalCost` DECIMAL(14,2) NULL,
  `billingAmount` DECIMAL(14,2) NULL,
  `autoRenew` BOOLEAN NOT NULL DEFAULT false,
  `status` ENUM('ACTIVE', 'DUE_SOON', 'EXPIRED', 'RENEWED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  `reminderDaysBefore` JSON NULL,
  `lastReminderAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `WebAsset_organizationId_expiryDate_idx`(`organizationId`, `expiryDate`),
  INDEX `WebAsset_organizationId_customerId_idx`(`organizationId`, `customerId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Credential` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `customerId` CHAR(36) NULL,
  `websiteId` CHAR(36) NULL,
  `label` VARCHAR(191) NOT NULL,
  `type` ENUM('CPANEL', 'FTP', 'CMS_ADMIN', 'DOMAIN_REGISTRAR', 'HOSTING', 'DATABASE', 'SOCIAL_ACCOUNT', 'AD_ACCOUNT', 'OTHER') NOT NULL,
  `url` VARCHAR(500) NULL,
  `username` VARCHAR(191) NULL,
  `secretCiphertext` LONGBLOB NOT NULL,
  `secretIv` LONGBLOB NOT NULL,
  `secretAuthTag` LONGBLOB NOT NULL,
  `keyVersion` INTEGER NOT NULL DEFAULT 1,
  `notes` TEXT NULL,
  `lastRotatedAt` DATETIME(3) NULL,
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CredentialAccessLog` (
  `id` CHAR(36) NOT NULL,
  `credentialId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `action` ENUM('VIEW', 'COPY', 'UPDATE', 'DELETE') NOT NULL,
  `ipAddress` VARCHAR(191) NULL,
  `accessedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `CredentialAccessLog_credentialId_accessedAt_idx`(`credentialId`, `accessedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ticket` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `ticketNumber` VARCHAR(191) NOT NULL,
  `customerId` CHAR(36) NOT NULL,
  `contactId` CHAR(36) NULL,
  `projectId` CHAR(36) NULL,
  `websiteId` CHAR(36) NULL,
  `subject` VARCHAR(500) NOT NULL,
  `description` TEXT NOT NULL,
  `category` VARCHAR(191) NULL,
  `channel` ENUM('EMAIL', 'WHATSAPP', 'PHONE', 'PORTAL', 'INTERNAL') NOT NULL DEFAULT 'INTERNAL',
  `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
  `status` ENUM('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  `assigneeId` CHAR(36) NULL,
  `resolutionNotes` TEXT NULL,
  `firstResponseAt` DATETIME(3) NULL,
  `slaDueAt` DATETIME(3) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `closedAt` DATETIME(3) NULL,
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Ticket_organizationId_status_priority_idx`(`organizationId`, `status`, `priority`),
  INDEX `Ticket_organizationId_assigneeId_idx`(`organizationId`, `assigneeId`),
  UNIQUE INDEX `Ticket_organizationId_ticketNumber_key`(`organizationId`, `ticketNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentFolder` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `category` ENUM('AGREEMENT', 'QUOTATION', 'INVOICE', 'PROJECT_FILE', 'HR_FILE', 'OTHER') NOT NULL DEFAULT 'OTHER',
  `parentId` CHAR(36) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Document` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `folderId` CHAR(36) NULL,
  `category` ENUM('AGREEMENT', 'QUOTATION', 'INVOICE', 'PROJECT_FILE', 'HR_FILE', 'OTHER') NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `description` TEXT NULL,
  `customerId` CHAR(36) NULL,
  `projectId` CHAR(36) NULL,
  `employeeId` CHAR(36) NULL,
  `status` ENUM('DRAFT', 'ACTIVE', 'SIGNED', 'EXPIRED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `currentVersion` INTEGER NOT NULL DEFAULT 1,
  `expiresAt` DATE NULL,
  `ownerId` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  INDEX `Document_organizationId_category_idx`(`organizationId`, `category`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentVersion` (
  `id` CHAR(36) NOT NULL,
  `documentId` CHAR(36) NOT NULL,
  `version` INTEGER NOT NULL,
  `fileId` CHAR(36) NOT NULL,
  `changeNote` TEXT NULL,
  `uploadedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentVersion_documentId_version_key`(`documentId`, `version`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Employee` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NULL,
  `branchId` CHAR(36) NULL,
  `departmentId` CHAR(36) NULL,
  `employeeCode` VARCHAR(191) NOT NULL,
  `firstName` VARCHAR(191) NOT NULL,
  `lastName` VARCHAR(191) NULL,
  `designation` VARCHAR(191) NOT NULL,
  `employmentType` ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'FREELANCE') NOT NULL DEFAULT 'FULL_TIME',
  `dateOfJoining` DATE NOT NULL,
  `dateOfBirth` DATE NULL,
  `gender` VARCHAR(191) NULL,
  `personalEmail` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `emergencyContact` JSON NULL,
  `address` TEXT NULL,
  `panEncrypted` LONGBLOB NULL,
  `bankDetailsEncrypted` LONGBLOB NULL,
  `ctcAnnual` DECIMAL(14,2) NULL,
  `reportingManagerId` CHAR(36) NULL,
  `status` ENUM('ACTIVE', 'ON_NOTICE', 'EXITED') NOT NULL DEFAULT 'ACTIVE',
  `exitDate` DATE NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Employee_userId_key`(`userId`),
  INDEX `Employee_organizationId_status_idx`(`organizationId`, `status`),
  UNIQUE INDEX `Employee_organizationId_employeeCode_key`(`organizationId`, `employeeCode`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attendance` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `employeeId` CHAR(36) NOT NULL,
  `date` DATE NOT NULL,
  `status` ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'WORK_FROM_HOME', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF') NOT NULL,
  `checkInAt` DATETIME(3) NULL,
  `checkOutAt` DATETIME(3) NULL,
  `workMinutes` INTEGER NULL,
  `source` ENUM('MANUAL', 'WEB', 'MOBILE', 'BIOMETRIC') NOT NULL DEFAULT 'WEB',
  `notes` TEXT NULL,
  INDEX `Attendance_organizationId_date_idx`(`organizationId`, `date`),
  UNIQUE INDEX `Attendance_employeeId_date_key`(`employeeId`, `date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveType` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `annualQuota` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `isPaid` BOOLEAN NOT NULL DEFAULT true,
  `carryForward` BOOLEAN NOT NULL DEFAULT false,
  UNIQUE INDEX `LeaveType_organizationId_code_key`(`organizationId`, `code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveBalance` (
  `id` CHAR(36) NOT NULL,
  `employeeId` CHAR(36) NOT NULL,
  `leaveTypeId` CHAR(36) NOT NULL,
  `year` INTEGER NOT NULL,
  `allotted` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `used` DECIMAL(12,2) NOT NULL DEFAULT 0,
  UNIQUE INDEX `LeaveBalance_employeeId_leaveTypeId_year_key`(`employeeId`, `leaveTypeId`, `year`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveRequest` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `employeeId` CHAR(36) NOT NULL,
  `leaveTypeId` CHAR(36) NOT NULL,
  `startDate` DATE NOT NULL,
  `endDate` DATE NOT NULL,
  `days` DECIMAL(12,2) NOT NULL,
  `reason` TEXT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `approverId` CHAR(36) NULL,
  `decidedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `LeaveRequest_organizationId_status_idx`(`organizationId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Holiday` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `name` VARCHAR(191) NOT NULL,
  `date` DATE NOT NULL,
  `isOptional` BOOLEAN NOT NULL DEFAULT false,
  INDEX `Holiday_organizationId_date_idx`(`organizationId`, `date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PerformanceReview` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `employeeId` CHAR(36) NOT NULL,
  `reviewerId` CHAR(36) NOT NULL,
  `periodStart` DATE NOT NULL,
  `periodEnd` DATE NOT NULL,
  `rating` DECIMAL(5,2) NULL,
  `goals` JSON NULL,
  `strengths` TEXT NULL,
  `improvements` TEXT NULL,
  `status` ENUM('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED') NOT NULL DEFAULT 'DRAFT',
  `submittedAt` DATETIME(3) NULL,
  `acknowledgedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `assetTag` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `category` ENUM('LAPTOP', 'DESKTOP', 'MONITOR', 'PHONE', 'CAMERA', 'AUDIO_LIGHTING', 'FURNITURE', 'SOFTWARE_LICENSE', 'NETWORK', 'OTHER') NOT NULL,
  `serialNumber` VARCHAR(191) NULL,
  `vendorName` VARCHAR(191) NULL,
  `purchaseDate` DATE NULL,
  `purchaseCost` DECIMAL(14,2) NULL,
  `warrantyExpiresAt` DATE NULL,
  `status` ENUM('AVAILABLE', 'ASSIGNED', 'IN_REPAIR', 'RETIRED', 'LOST') NOT NULL DEFAULT 'AVAILABLE',
  `condition` TEXT NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Asset_organizationId_assetTag_key`(`organizationId`, `assetTag`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetAssignment` (
  `id` CHAR(36) NOT NULL,
  `assetId` CHAR(36) NOT NULL,
  `employeeId` CHAR(36) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `returnedAt` DATETIME(3) NULL,
  `conditionOnAssign` TEXT NULL,
  `conditionOnReturn` TEXT NULL,
  `assignedById` CHAR(36) NULL,
  INDEX `AssetAssignment_assetId_returnedAt_idx`(`assetId`, `returnedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssetMaintenance` (
  `id` CHAR(36) NOT NULL,
  `assetId` CHAR(36) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `description` TEXT NOT NULL,
  `vendorName` VARCHAR(191) NULL,
  `cost` DECIMAL(14,2) NULL,
  `performedAt` DATE NOT NULL,
  `nextDueAt` DATE NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseCategory` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `parentId` CHAR(36) NULL,
  UNIQUE INDEX `ExpenseCategory_organizationId_name_key`(`organizationId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Vendor` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `gstin` VARCHAR(191) NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Vendor_organizationId_name_key`(`organizationId`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `expenseNumber` VARCHAR(191) NOT NULL,
  `categoryId` CHAR(36) NOT NULL,
  `vendorId` CHAR(36) NULL,
  `projectId` CHAR(36) NULL,
  `campaignId` CHAR(36) NULL,
  `expenseDate` DATE NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `taxAmount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `description` TEXT NOT NULL,
  `paymentMethod` ENUM('BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'CARD', 'PAYMENT_GATEWAY', 'OTHER') NULL,
  `bankAccountId` CHAR(36) NULL,
  `paidById` CHAR(36) NULL,
  `isReimbursable` BOOLEAN NOT NULL DEFAULT false,
  `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID') NOT NULL DEFAULT 'DRAFT',
  `receiptFileId` CHAR(36) NULL,
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Expense_organizationId_expenseDate_idx`(`organizationId`, `expenseDate`),
  INDEX `Expense_organizationId_status_idx`(`organizationId`, `status`),
  UNIQUE INDEX `Expense_organizationId_expenseNumber_key`(`organizationId`, `expenseNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LedgerEntry` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `branchId` CHAR(36) NULL,
  `entryDate` DATE NOT NULL,
  `type` ENUM('INCOME', 'EXPENSE') NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `bankAccountId` CHAR(36) NULL,
  `sourceType` ENUM('PAYMENT', 'EXPENSE', 'REFUND', 'ADJUSTMENT', 'OPENING_BALANCE') NOT NULL,
  `sourceId` CHAR(36) NULL,
  `description` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `LedgerEntry_organizationId_entryDate_idx`(`organizationId`, `entryDate`),
  INDEX `LedgerEntry_organizationId_type_entryDate_idx`(`organizationId`, `type`, `entryDate`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SavedReport` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` ENUM('LEADS', 'CONVERSION', 'SALES', 'REVENUE', 'PAYMENTS', 'EMPLOYEE_PERFORMANCE', 'PROJECTS', 'CAMPAIGNS', 'FINANCE') NOT NULL,
  `filters` JSON NOT NULL,
  `columns` JSON NULL,
  `ownerId` CHAR(36) NOT NULL,
  `isShared` BOOLEAN NOT NULL DEFAULT false,
  `scheduleCron` VARCHAR(191) NULL,
  `recipients` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExportJob` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `module` ENUM('DASHBOARD', 'LEADS', 'CUSTOMERS', 'SALES', 'QUOTATIONS', 'INVOICES', 'PAYMENTS', 'PROJECTS', 'TASKS', 'MARKETING', 'WEBSITES', 'TICKETS', 'DOCUMENTS', 'HR', 'ASSETS', 'FINANCE', 'REPORTS', 'AUTOMATION', 'COMMUNICATION', 'SETTINGS') NOT NULL,
  `format` ENUM('XLSX', 'CSV', 'PDF') NOT NULL,
  `filters` JSON NULL,
  `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
  `fileId` CHAR(36) NULL,
  `error` TEXT NULL,
  `requestedById` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportJob` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `module` ENUM('DASHBOARD', 'LEADS', 'CUSTOMERS', 'SALES', 'QUOTATIONS', 'INVOICES', 'PAYMENTS', 'PROJECTS', 'TASKS', 'MARKETING', 'WEBSITES', 'TICKETS', 'DOCUMENTS', 'HR', 'ASSETS', 'FINANCE', 'REPORTS', 'AUTOMATION', 'COMMUNICATION', 'SETTINGS') NOT NULL,
  `fileId` CHAR(36) NOT NULL,
  `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
  `totalRows` INTEGER NOT NULL DEFAULT 0,
  `successRows` INTEGER NOT NULL DEFAULT 0,
  `failedRows` INTEGER NOT NULL DEFAULT 0,
  `errorFileId` CHAR(36) NULL,
  `requestedById` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DashboardWidget` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `widgetKey` VARCHAR(191) NOT NULL,
  `layout` JSON NOT NULL,
  `config` JSON NULL,
  UNIQUE INDEX `DashboardWidget_userId_widgetKey_key`(`userId`, `widgetKey`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SavedFilter` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `module` ENUM('DASHBOARD', 'LEADS', 'CUSTOMERS', 'SALES', 'QUOTATIONS', 'INVOICES', 'PAYMENTS', 'PROJECTS', 'TASKS', 'MARKETING', 'WEBSITES', 'TICKETS', 'DOCUMENTS', 'HR', 'ASSETS', 'FINANCE', 'REPORTS', 'AUTOMATION', 'COMMUNICATION', 'SETTINGS') NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `filters` JSON NOT NULL,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  INDEX `SavedFilter_userId_module_idx`(`userId`, `module`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AutomationRule` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `trigger` ENUM('LEAD_CREATED', 'LEAD_STAGE_CHANGED', 'FOLLOW_UP_DUE', 'DEAL_STAGE_CHANGED', 'QUOTATION_APPROVED', 'QUOTATION_ACCEPTED', 'PROJECT_CREATED', 'MILESTONE_COMPLETED', 'INVOICE_CREATED', 'INVOICE_OVERDUE', 'PAYMENT_RECEIVED', 'RENEWAL_DUE', 'TICKET_CREATED', 'SCHEDULE') NOT NULL,
  `conditions` JSON NULL,
  `scheduleCron` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `runCount` INTEGER NOT NULL DEFAULT 0,
  `lastRunAt` DATETIME(3) NULL,
  `createdById` CHAR(36) NULL,
  `updatedById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `AutomationRule_organizationId_trigger_isActive_idx`(`organizationId`, `trigger`, `isActive`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AutomationAction` (
  `id` CHAR(36) NOT NULL,
  `ruleId` CHAR(36) NOT NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `type` ENUM('ASSIGN_LEAD', 'CREATE_FOLLOW_UP', 'CREATE_TASK', 'GENERATE_QUOTATION', 'GENERATE_INVOICE', 'SEND_EMAIL', 'SEND_WHATSAPP', 'SEND_SMS', 'SEND_NOTIFICATION', 'UPDATE_FIELD', 'CALL_WEBHOOK') NOT NULL,
  `config` JSON NOT NULL,
  `delayMinutes` INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AutomationRun` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `ruleId` CHAR(36) NOT NULL,
  `entityType` ENUM('LEAD', 'CUSTOMER', 'CONTACT', 'DEAL', 'QUOTATION', 'INVOICE', 'CREDIT_NOTE', 'PAYMENT', 'PROJECT', 'MILESTONE', 'TASK', 'CAMPAIGN', 'CONTENT_ITEM', 'WEBSITE', 'WEB_ASSET', 'TICKET', 'DOCUMENT', 'EMPLOYEE', 'LEAVE_REQUEST', 'ASSET', 'EXPENSE') NULL,
  `entityId` CHAR(36) NULL,
  `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  `error` TEXT NULL,
  `log` JSON NULL,
  INDEX `AutomationRun_organizationId_ruleId_startedAt_idx`(`organizationId`, `ruleId`, `startedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadAssignmentRule` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `strategy` ENUM('ROUND_ROBIN', 'LEAST_LOADED', 'BY_SOURCE', 'BY_SERVICE', 'BY_TERRITORY') NOT NULL,
  `conditions` JSON NULL,
  `assigneeIds` JSON NULL,
  `lastAssignedIndex` INTEGER NOT NULL DEFAULT 0,
  `priority` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MessageTemplate` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `channel` ENUM('IN_APP', 'EMAIL', 'WHATSAPP', 'SMS') NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(500) NULL,
  `body` TEXT NOT NULL,
  `variables` JSON NULL,
  `whatsappTemplateName` VARCHAR(191) NULL,
  `whatsappLanguage` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MessageTemplate_organizationId_channel_key_key`(`organizationId`, `channel`, `key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `channel` ENUM('IN_APP', 'EMAIL', 'WHATSAPP', 'SMS') NOT NULL,
  `direction` ENUM('INBOUND', 'OUTBOUND') NOT NULL,
  `entityType` ENUM('LEAD', 'CUSTOMER', 'CONTACT', 'DEAL', 'QUOTATION', 'INVOICE', 'CREDIT_NOTE', 'PAYMENT', 'PROJECT', 'MILESTONE', 'TASK', 'CAMPAIGN', 'CONTENT_ITEM', 'WEBSITE', 'WEB_ASSET', 'TICKET', 'DOCUMENT', 'EMPLOYEE', 'LEAVE_REQUEST', 'ASSET', 'EXPENSE') NULL,
  `entityId` CHAR(36) NULL,
  `leadId` CHAR(36) NULL,
  `customerId` CHAR(36) NULL,
  `contactId` CHAR(36) NULL,
  `templateId` CHAR(36) NULL,
  `fromAddress` VARCHAR(500) NOT NULL,
  `toAddress` VARCHAR(500) NOT NULL,
  `subject` VARCHAR(500) NULL,
  `body` TEXT NOT NULL,
  `status` ENUM('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED') NOT NULL DEFAULT 'QUEUED',
  `providerMessageId` VARCHAR(191) NULL,
  `threadKey` VARCHAR(191) NULL,
  `error` TEXT NULL,
  `sentById` CHAR(36) NULL,
  `sentAt` DATETIME(3) NULL,
  `deliveredAt` DATETIME(3) NULL,
  `readAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `Message_organizationId_entityType_entityId_idx`(`organizationId`, `entityType`, `entityId`),
  INDEX `Message_organizationId_channel_createdAt_idx`(`organizationId`, `channel`, `createdAt`),
  INDEX `Message_providerMessageId_idx`(`providerMessageId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `body` TEXT NULL,
  `entityType` ENUM('LEAD', 'CUSTOMER', 'CONTACT', 'DEAL', 'QUOTATION', 'INVOICE', 'CREDIT_NOTE', 'PAYMENT', 'PROJECT', 'MILESTONE', 'TASK', 'CAMPAIGN', 'CONTENT_ITEM', 'WEBSITE', 'WEB_ASSET', 'TICKET', 'DOCUMENT', 'EMPLOYEE', 'LEAVE_REQUEST', 'ASSET', 'EXPENSE') NULL,
  `entityId` CHAR(36) NULL,
  `link` VARCHAR(500) NULL,
  `readAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `Notification_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationPreference` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `eventKey` VARCHAR(191) NOT NULL,
  `inApp` BOOLEAN NOT NULL DEFAULT true,
  `email` BOOLEAN NOT NULL DEFAULT true,
  `whatsapp` BOOLEAN NOT NULL DEFAULT false,
  UNIQUE INDEX `NotificationPreference_userId_eventKey_key`(`userId`, `eventKey`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IntegrationSetting` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `provider` ENUM('SMTP', 'WHATSAPP_CLOUD', 'SMS_GATEWAY', 'PAYMENT_GATEWAY', 'OBJECT_STORAGE') NOT NULL,
  `config` JSON NOT NULL,
  `secretCiphertext` LONGBLOB NULL,
  `secretIv` LONGBLOB NULL,
  `secretAuthTag` LONGBLOB NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT false,
  `lastVerifiedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `IntegrationSetting_organizationId_provider_key`(`organizationId`, `provider`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebhookEvent` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NULL,
  `provider` ENUM('SMTP', 'WHATSAPP_CLOUD', 'SMS_GATEWAY', 'PAYMENT_GATEWAY', 'OBJECT_STORAGE') NOT NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `externalId` VARCHAR(191) NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processedAt` DATETIME(3) NULL,
  UNIQUE INDEX `WebhookEvent_provider_externalId_key`(`provider`, `externalId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OutboxEvent` (
  `id` CHAR(36) NOT NULL,
  `organizationId` CHAR(36) NOT NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `aggregateType` VARCHAR(191) NOT NULL,
  `aggregateId` CHAR(36) NOT NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('PENDING', 'PUBLISHED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `publishedAt` DATETIME(3) NULL,
  INDEX `OutboxEvent_status_createdAt_idx`(`status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Branch` ADD CONSTRAINT `Branch_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_headId_fkey` FOREIGN KEY (`headId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Team` ADD CONSTRAINT `Team_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Team` ADD CONSTRAINT `Team_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Team` ADD CONSTRAINT `Team_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMember` ADD CONSTRAINT `TeamMember_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeamMember` ADD CONSTRAINT `TeamMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Role` ADD CONSTRAINT `Role_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `Permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApiKey` ADD CONSTRAINT `ApiKey_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `File` ADD CONSTRAINT `File_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `File`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Note` ADD CONSTRAINT `Note_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Note` ADD CONSTRAINT `Note_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Comment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tag` ADD CONSTRAINT `Tag_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TagAssignment` ADD CONSTRAINT `TagAssignment_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NumberSequence` ADD CONSTRAINT `NumberSequence_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadSource` ADD CONSTRAINT `LeadSource_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadStage` ADD CONSTRAINT `LeadStage_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `LeadSource`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `LeadStage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowUp` ADD CONSTRAINT `FollowUp_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowUp` ADD CONSTRAINT `FollowUp_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowUp` ADD CONSTRAINT `FollowUp_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowUp` ADD CONSTRAINT `FollowUp_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowUp` ADD CONSTRAINT `FollowUp_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_accountManagerId_fkey` FOREIGN KEY (`accountManagerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Pipeline` ADD CONSTRAINT `Pipeline_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PipelineStage` ADD CONSTRAINT `PipelineStage_pipelineId_fkey` FOREIGN KEY (`pipelineId`) REFERENCES `Pipeline`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_pipelineId_fkey` FOREIGN KEY (`pipelineId`) REFERENCES `Pipeline`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `PipelineStage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Meeting` ADD CONSTRAINT `Meeting_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Meeting` ADD CONSTRAINT `Meeting_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Meeting` ADD CONSTRAINT `Meeting_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Meeting` ADD CONSTRAINT `Meeting_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Meeting` ADD CONSTRAINT `Meeting_organizerId_fkey` FOREIGN KEY (`organizerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingAttendee` ADD CONSTRAINT `MeetingAttendee_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingAttendee` ADD CONSTRAINT `MeetingAttendee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingAttendee` ADD CONSTRAINT `MeetingAttendee_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CallLog` ADD CONSTRAINT `CallLog_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CallLog` ADD CONSTRAINT `CallLog_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CallLog` ADD CONSTRAINT `CallLog_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CallLog` ADD CONSTRAINT `CallLog_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CallLog` ADD CONSTRAINT `CallLog_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CallLog` ADD CONSTRAINT `CallLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Service` ADD CONSTRAINT `Service_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServicePackage` ADD CONSTRAINT `ServicePackage_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServicePackageItem` ADD CONSTRAINT `ServicePackageItem_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `ServicePackage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServicePackageItem` ADD CONSTRAINT `ServicePackageItem_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceRule` ADD CONSTRAINT `PriceRule_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceRule` ADD CONSTRAINT `PriceRule_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceRule` ADD CONSTRAINT `PriceRule_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `ServicePackage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaxRate` ADD CONSTRAINT `TaxRate_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_parentQuotationId_fkey` FOREIGN KEY (`parentQuotationId`) REFERENCES `Quotation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Quotation` ADD CONSTRAINT `Quotation_preparedById_fkey` FOREIGN KEY (`preparedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `ServicePackage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRule` ADD CONSTRAINT `ApprovalRule_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRule` ADD CONSTRAINT `ApprovalRule_approverRoleId_fkey` FOREIGN KEY (`approverRoleId`) REFERENCES `Role`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRule` ADD CONSTRAINT `ApprovalRule_approverUserId_fkey` FOREIGN KEY (`approverUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalStep` ADD CONSTRAINT `ApprovalStep_approvalRequestId_fkey` FOREIGN KEY (`approvalRequestId`) REFERENCES `ApprovalRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalStep` ADD CONSTRAINT `ApprovalStep_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceTemplate` ADD CONSTRAINT `InvoiceTemplate_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_recurringInvoiceId_fkey` FOREIGN KEY (`recurringInvoiceId`) REFERENCES `RecurringInvoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `InvoiceTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InvoiceItem` ADD CONSTRAINT `InvoiceItem_milestoneId_fkey` FOREIGN KEY (`milestoneId`) REFERENCES `Milestone`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditNote` ADD CONSTRAINT `CreditNote_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditNote` ADD CONSTRAINT `CreditNote_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditNote` ADD CONSTRAINT `CreditNote_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditNoteItem` ADD CONSTRAINT `CreditNoteItem_creditNoteId_fkey` FOREIGN KEY (`creditNoteId`) REFERENCES `CreditNote`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringInvoice` ADD CONSTRAINT `RecurringInvoice_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringInvoice` ADD CONSTRAINT `RecurringInvoice_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringInvoice` ADD CONSTRAINT `RecurringInvoice_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringInvoiceItem` ADD CONSTRAINT `RecurringInvoiceItem_recurringInvoiceId_fkey` FOREIGN KEY (`recurringInvoiceId`) REFERENCES `RecurringInvoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringInvoiceItem` ADD CONSTRAINT `RecurringInvoiceItem_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BankAccount` ADD CONSTRAINT `BankAccount_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentReminder` ADD CONSTRAINT `PaymentReminder_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentReminder` ADD CONSTRAINT `PaymentReminder_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMember` ADD CONSTRAINT `ProjectMember_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectMember` ADD CONSTRAINT `ProjectMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Milestone` ADD CONSTRAINT `Milestone_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_milestoneId_fkey` FOREIGN KEY (`milestoneId`) REFERENCES `Milestone`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_parentTaskId_fkey` FOREIGN KEY (`parentTaskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_contentItemId_fkey` FOREIGN KEY (`contentItemId`) REFERENCES `ContentItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_reporterId_fkey` FOREIGN KEY (`reporterId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeEntry` ADD CONSTRAINT `TimeEntry_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeEntry` ADD CONSTRAINT `TimeEntry_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeEntry` ADD CONSTRAINT `TimeEntry_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimeEntry` ADD CONSTRAINT `TimeEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialAccount` ADD CONSTRAINT `SocialAccount_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SocialAccount` ADD CONSTRAINT `SocialAccount_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Campaign` ADD CONSTRAINT `Campaign_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentItem` ADD CONSTRAINT `ContentItem_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentItem` ADD CONSTRAINT `ContentItem_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentItem` ADD CONSTRAINT `ContentItem_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentItem` ADD CONSTRAINT `ContentItem_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdSpend` ADD CONSTRAINT `AdSpend_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdSpend` ADD CONSTRAINT `AdSpend_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignReport` ADD CONSTRAINT `CampaignReport_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CampaignReport` ADD CONSTRAINT `CampaignReport_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Website` ADD CONSTRAINT `Website_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Website` ADD CONSTRAINT `Website_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Website` ADD CONSTRAINT `Website_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebAsset` ADD CONSTRAINT `WebAsset_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebAsset` ADD CONSTRAINT `WebAsset_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebAsset` ADD CONSTRAINT `WebAsset_websiteId_fkey` FOREIGN KEY (`websiteId`) REFERENCES `Website`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Credential` ADD CONSTRAINT `Credential_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Credential` ADD CONSTRAINT `Credential_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Credential` ADD CONSTRAINT `Credential_websiteId_fkey` FOREIGN KEY (`websiteId`) REFERENCES `Website`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CredentialAccessLog` ADD CONSTRAINT `CredentialAccessLog_credentialId_fkey` FOREIGN KEY (`credentialId`) REFERENCES `Credential`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CredentialAccessLog` ADD CONSTRAINT `CredentialAccessLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_websiteId_fkey` FOREIGN KEY (`websiteId`) REFERENCES `Website`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentFolder` ADD CONSTRAINT `DocumentFolder_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentFolder` ADD CONSTRAINT `DocumentFolder_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `DocumentFolder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `DocumentFolder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentVersion` ADD CONSTRAINT `DocumentVersion_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentVersion` ADD CONSTRAINT `DocumentVersion_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `File`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_reportingManagerId_fkey` FOREIGN KEY (`reportingManagerId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveType` ADD CONSTRAINT `LeaveType_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveBalance` ADD CONSTRAINT `LeaveBalance_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveBalance` ADD CONSTRAINT `LeaveBalance_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequest` ADD CONSTRAINT `LeaveRequest_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Holiday` ADD CONSTRAINT `Holiday_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Holiday` ADD CONSTRAINT `Holiday_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PerformanceReview` ADD CONSTRAINT `PerformanceReview_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PerformanceReview` ADD CONSTRAINT `PerformanceReview_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PerformanceReview` ADD CONSTRAINT `PerformanceReview_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Asset` ADD CONSTRAINT `Asset_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetAssignment` ADD CONSTRAINT `AssetAssignment_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetAssignment` ADD CONSTRAINT `AssetAssignment_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetMaintenance` ADD CONSTRAINT `AssetMaintenance_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseCategory` ADD CONSTRAINT `ExpenseCategory_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseCategory` ADD CONSTRAINT `ExpenseCategory_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `ExpenseCategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vendor` ADD CONSTRAINT `Vendor_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `ExpenseCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_paidById_fkey` FOREIGN KEY (`paidById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LedgerEntry` ADD CONSTRAINT `LedgerEntry_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `BankAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SavedReport` ADD CONSTRAINT `SavedReport_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SavedReport` ADD CONSTRAINT `SavedReport_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExportJob` ADD CONSTRAINT `ExportJob_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExportJob` ADD CONSTRAINT `ExportJob_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportJob` ADD CONSTRAINT `ImportJob_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportJob` ADD CONSTRAINT `ImportJob_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DashboardWidget` ADD CONSTRAINT `DashboardWidget_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DashboardWidget` ADD CONSTRAINT `DashboardWidget_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SavedFilter` ADD CONSTRAINT `SavedFilter_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SavedFilter` ADD CONSTRAINT `SavedFilter_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutomationRule` ADD CONSTRAINT `AutomationRule_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutomationAction` ADD CONSTRAINT `AutomationAction_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `AutomationRule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutomationRun` ADD CONSTRAINT `AutomationRun_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutomationRun` ADD CONSTRAINT `AutomationRun_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `AutomationRule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadAssignmentRule` ADD CONSTRAINT `LeadAssignmentRule_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageTemplate` ADD CONSTRAINT `MessageTemplate_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `MessageTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_sentById_fkey` FOREIGN KEY (`sentById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationPreference` ADD CONSTRAINT `NotificationPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IntegrationSetting` ADD CONSTRAINT `IntegrationSetting_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutboxEvent` ADD CONSTRAINT `OutboxEvent_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
