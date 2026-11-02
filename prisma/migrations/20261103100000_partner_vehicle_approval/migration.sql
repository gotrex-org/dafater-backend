-- تصفية ثابتة: صاحب الاسم يضيف فواتير الشراء بنفسه (approved = false) والمالك
-- يوافق بكتابة المبلغ للوحدة أو النسبة. الصفوف الموجودة اختارها المالك، فهي موافق عليها.
ALTER TABLE "PartnerVehicle" ADD COLUMN "percent" DOUBLE PRECISION;
ALTER TABLE "PartnerVehicle" ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT true;
