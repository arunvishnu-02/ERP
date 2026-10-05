-- AlterTable
ALTER TABLE `User` ADD COLUMN `googleSub` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `File` ADD COLUMN `driveFileId` VARCHAR(191) NULL,
    ADD COLUMN `driveUrl` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `IntegrationSetting` MODIFY `provider` ENUM('SMTP', 'WHATSAPP_CLOUD', 'SMS_GATEWAY', 'PAYMENT_GATEWAY', 'OBJECT_STORAGE', 'GOOGLE') NOT NULL;

-- AlterTable
ALTER TABLE `WebhookEvent` MODIFY `provider` ENUM('SMTP', 'WHATSAPP_CLOUD', 'SMS_GATEWAY', 'PAYMENT_GATEWAY', 'OBJECT_STORAGE', 'GOOGLE') NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_googleSub_key` ON `User`(`googleSub`);

