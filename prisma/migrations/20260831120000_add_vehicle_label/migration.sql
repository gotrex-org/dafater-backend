-- مسمّى العربية (عربية الزيتون / عربية ديدي) — غير رقم اللوحة وغير اسم السائق
ALTER TABLE "Manifest" ADD COLUMN "vehicleLabel" TEXT;
ALTER TABLE "Driver" ADD COLUMN "vehicleLabel" TEXT;
ALTER TABLE "driver_trips" ADD COLUMN "vehicleLabel" TEXT;
