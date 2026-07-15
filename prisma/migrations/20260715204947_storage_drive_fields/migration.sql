-- AlterTable
ALTER TABLE "Content" ADD COLUMN     "originalDriveFileId" TEXT;

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "driveFileId" TEXT;

-- CreateTable
CREATE TABLE "DriveConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "rootFolderId" TEXT,
    "rawMainFolderId" TEXT,
    "rawBrollFolderId" TEXT,
    "editatiFolderId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveConfig_pkey" PRIMARY KEY ("id")
);
