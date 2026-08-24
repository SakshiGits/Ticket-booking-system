-- AlterTable
ALTER TABLE "events" ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "genre" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "posterUrl" TEXT,
ADD COLUMN     "rating" DOUBLE PRECISION;
