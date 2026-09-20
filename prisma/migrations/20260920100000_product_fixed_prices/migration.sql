-- سعر شراء/بيع ثابت لكل صنف — يُملأ تلقائيًا في سطر الفاتورة وقابل للتعديل عليها.
ALTER TABLE "Product" ADD COLUMN "purchasePrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "salePrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
