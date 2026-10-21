-- مراجعة المدير لتعديلات المستخدمين: التعديل يُنفَّذ فوراً ويبقى «بانتظار المراجعة»
-- حتى يوافق عليه المدير أو يرفضه. السجلات القديمة بلا حالة.

ALTER TABLE "AuditLog" ADD COLUMN "reviewStatus" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "reviewedAt" TIMESTAMP(3);
CREATE INDEX "AuditLog_reviewStatus_idx" ON "AuditLog"("reviewStatus");
