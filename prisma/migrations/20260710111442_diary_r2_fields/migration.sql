-- AlterTable
ALTER TABLE "DiaryEntry" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "driveFileId" TEXT,
ADD COLUMN     "mediaSize" INTEGER,
ADD COLUMN     "mediaType" TEXT,
ADD COLUMN     "mediaUrl" TEXT,
ADD COLUMN     "r2Key" TEXT;
