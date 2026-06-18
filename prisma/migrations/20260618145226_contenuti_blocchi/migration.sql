-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('INSTAGRAM', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "ContentFormat" AS ENUM ('REEL', 'CAROUSEL', 'STORY', 'LONG_VIDEO');

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lucaDeliveryAt" TIMESTAMP(3),
    "matteoDeliveryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "blockId" TEXT,
    "title" TEXT NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'INSTAGRAM',
    "format" "ContentFormat",
    "publishAt" TIMESTAMP(3),
    "hook" TEXT,
    "notes" TEXT,
    "materialsUrl" TEXT,
    "views" INTEGER,
    "reach" INTEGER,
    "nonFollowerPct" DOUBLE PRECISION,
    "likes" INTEGER,
    "commentsCount" INTEGER,
    "saves" INTEGER,
    "shares" INTEGER,
    "followsGenerated" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contentId" TEXT,
    "blockId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "views" INTEGER,
    "reach" INTEGER,
    "nonFollowerPct" DOUBLE PRECISION,
    "likes" INTEGER,
    "saves" INTEGER,
    "shares" INTEGER,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Block_workspaceId_idx" ON "Block"("workspaceId");

-- CreateIndex
CREATE INDEX "Content_workspaceId_idx" ON "Content"("workspaceId");

-- CreateIndex
CREATE INDEX "Content_blockId_idx" ON "Content"("blockId");

-- CreateIndex
CREATE INDEX "Comment_workspaceId_idx" ON "Comment"("workspaceId");

-- CreateIndex
CREATE INDEX "Comment_contentId_idx" ON "Comment"("contentId");

-- CreateIndex
CREATE INDEX "Comment_blockId_idx" ON "Comment"("blockId");

-- CreateIndex
CREATE INDEX "MetricSnapshot_contentId_idx" ON "MetricSnapshot"("contentId");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
