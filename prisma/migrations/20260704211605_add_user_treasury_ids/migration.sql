-- AlterTable
ALTER TABLE "User" ADD COLUMN     "treasuryIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
