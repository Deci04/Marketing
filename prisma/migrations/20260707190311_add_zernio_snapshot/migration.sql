-- CreateTable
CREATE TABLE "ZernioSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channel" "Channel",
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data" JSONB NOT NULL,

    CONSTRAINT "ZernioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ZernioSnapshot_workspaceId_idx" ON "ZernioSnapshot"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ZernioSnapshot_workspaceId_channel_key" ON "ZernioSnapshot"("workspaceId", "channel");

-- AddForeignKey
ALTER TABLE "ZernioSnapshot" ADD CONSTRAINT "ZernioSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
