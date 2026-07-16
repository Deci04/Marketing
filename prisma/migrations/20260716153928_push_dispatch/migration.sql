-- CreateTable
CREATE TABLE "PushDispatch" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushDispatch_dedupeKey_key" ON "PushDispatch"("dedupeKey");
