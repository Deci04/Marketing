-- Fondamenta serata 2026-07-04: additiva, nessun DROP, nessuna perdita dati.

-- Content: aggancio piattaforma (Zernio/W)
ALTER TABLE "Content" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Content" ADD COLUMN "publishState" TEXT;
ALTER TABLE "Content" ADD COLUMN "publishError" TEXT;
CREATE INDEX "Content_externalId_idx" ON "Content"("externalId");

-- User: collegamento Telegram (T/N)
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramLinkCode" TEXT;
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- Google Calendar (G)
CREATE TABLE "GoogleCalendarConfig" (
    "workspaceId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "channelId" TEXT,
    "resourceId" TEXT,
    "watchExpiration" TIMESTAMP(3),
    "syncToken" TEXT,
    "connectedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoogleCalendarConfig_pkey" PRIMARY KEY ("workspaceId")
);

CREATE TABLE "GoogleCalendarLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "googleCalendarId" TEXT NOT NULL,
    "etag" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'SYNCED',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoogleCalendarLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoogleCalendarLink_workspaceId_refType_refId_key" ON "GoogleCalendarLink"("workspaceId", "refType", "refId");
CREATE INDEX "GoogleCalendarLink_googleEventId_idx" ON "GoogleCalendarLink"("googleEventId");

-- Zernio: account social connesso (Z)
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "zernioAccountId" TEXT NOT NULL,
    "handle" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SocialAccount_workspaceId_platform_key" ON "SocialAccount"("workspaceId", "platform");
CREATE INDEX "SocialAccount_workspaceId_idx" ON "SocialAccount"("workspaceId");

-- Diario Telegram (T)
CREATE TABLE "DiaryEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "rawText" TEXT,
    "caption" TEXT,
    "telegramFileId" TEXT,
    "telegramFileType" TEXT,
    "aiTitle" TEXT,
    "aiDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiaryEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DiaryEntry_workspaceId_createdAt_idx" ON "DiaryEntry"("workspaceId", "createdAt");

-- Foreign keys
ALTER TABLE "GoogleCalendarConfig" ADD CONSTRAINT "GoogleCalendarConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoogleCalendarLink" ADD CONSTRAINT "GoogleCalendarLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
