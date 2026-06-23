ALTER TABLE "Content" ADD COLUMN "videoProxyUrl" TEXT;
ALTER TABLE "Content" ADD COLUMN "masterLink" TEXT;
ALTER TABLE "Comment" ADD COLUMN "audioUrl" TEXT;
ALTER TABLE "Comment" ADD COLUMN "videoTimestamp" DOUBLE PRECISION;
