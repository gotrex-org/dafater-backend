-- CreateEnum
CREATE TYPE "VehicleSource" AS ENUM ('OURS', 'CLIENT_OFFICE');

-- AlterTable
ALTER TABLE "Manifest" ADD COLUMN     "shippingOffice" TEXT,
ADD COLUMN     "vehicleSource" "VehicleSource" NOT NULL DEFAULT 'OURS';
