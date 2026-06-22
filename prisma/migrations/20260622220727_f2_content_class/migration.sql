-- CreateTable
CREATE TABLE "ContentClass" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "ContentClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ContentToContentClass" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContentToContentClass_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "ContentClass_workspaceId_idx" ON "ContentClass"("workspaceId");

-- CreateIndex
CREATE INDEX "_ContentToContentClass_B_index" ON "_ContentToContentClass"("B");

-- AddForeignKey
ALTER TABLE "ContentClass" ADD CONSTRAINT "ContentClass_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContentToContentClass" ADD CONSTRAINT "_ContentToContentClass_A_fkey" FOREIGN KEY ("A") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContentToContentClass" ADD CONSTRAINT "_ContentToContentClass_B_fkey" FOREIGN KEY ("B") REFERENCES "ContentClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
