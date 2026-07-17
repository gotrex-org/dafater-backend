-- AlterTable: آخر ظهور للمستخدم (أونلاين / آخر فتح)
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
