-- منع تكرار رقم الفاتورة لكل طرف (تسابق nextNo)
CREATE UNIQUE INDEX "Invoice_partyId_no_key" ON "Invoice"("partyId", "no");

-- منع تكرار رقم العملية (البيع الخارجي) لكل عميل
CREATE UNIQUE INDEX "Deal_clientId_no_key" ON "Deal"("clientId", "no");

-- منع الترحيل المزدوج للخصم المجدوَل: خصم واحد لكل (جدول، تاريخ مناسبة).
-- الخصومات اليدوية (scheduleId = NULL) غير متأثرة — NULL فريد دايمًا في بوستجرس.
CREATE UNIQUE INDEX "Discount_scheduleId_date_key" ON "Discount"("scheduleId", "date");
