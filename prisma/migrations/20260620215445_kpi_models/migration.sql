-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "series" TEXT NOT NULL,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benchmark" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "rangeLabel" TEXT,
    "source" TEXT,

    CONSTRAINT "Benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValueConversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "who" TEXT NOT NULL,
    "what" TEXT NOT NULL,
    "channel" TEXT,
    "link" TEXT,

    CONSTRAINT "ValueConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Measurement_workspaceId_idx" ON "Measurement"("workspaceId");

-- CreateIndex
CREATE INDEX "Benchmark_workspaceId_idx" ON "Benchmark"("workspaceId");

-- CreateIndex
CREATE INDEX "ValueConversation_workspaceId_idx" ON "ValueConversation"("workspaceId");

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Benchmark" ADD CONSTRAINT "Benchmark_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValueConversation" ADD CONSTRAINT "ValueConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
