-- Client portal: contacts sign in with an emailed code; clients can reply on tickets
-- DropForeignKey
ALTER TABLE `Comment` DROP FOREIGN KEY `Comment_authorId_fkey`;

-- AlterTable
ALTER TABLE `Comment` ADD COLUMN `contactId` CHAR(36) NULL,
    MODIFY `authorId` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `Contact` ADD COLUMN `portalAccess` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `portalLastSeenAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `PortalSession` (
    `id` CHAR(36) NOT NULL,
    `contactId` CHAR(36) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PortalSession_tokenHash_key`(`tokenHash`),
    INDEX `PortalSession_contactId_idx`(`contactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PortalCode` (
    `id` CHAR(36) NOT NULL,
    `contactId` CHAR(36) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `tries` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PortalCode_contactId_idx`(`contactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PortalSession` ADD CONSTRAINT `PortalSession_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PortalCode` ADD CONSTRAINT `PortalCode_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

