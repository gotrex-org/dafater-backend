/**
 * How a delete should behave when the record is referenced by other rows.
 *
 * - `strict`  — the default. Refuse with a 409 describing what's attached, so the UI
 *               can ask which of the two it should be.
 * - `cascade` — delete the related records along with it.
 * - `archive` — keep every related record exactly as it is and just hide the record
 *               itself from the lists and pickers.
 *
 * Archive exists because a real delete often isn't possible: Invoice.partyId and
 * InvoiceItem.productId are required columns with onDelete: Restrict, so the row can't
 * leave while its paperwork points at it — and Transaction.partyId is onDelete: Cascade,
 * so a plain delete would take the party's whole ledger with it.
 */
export type DeleteMode = 'strict' | 'cascade' | 'archive';

export function parseDeleteMode(cascade?: string, archive?: string): DeleteMode {
  if (archive === 'true') return 'archive';
  if (cascade === 'true') return 'cascade';
  return 'strict';
}

/**
 * The 409 body. `canCascade` tells the UI whether "delete the related records too" is
 * even on the table — for a product sitting in real invoice lines it never is.
 */
export function deleteConflict(what: string, related: number, canCascade: boolean) {
  return {
    message: canCascade
      ? `${what} مرتبط بـ ${related} حركة/سجل.`
      : `${what} مستعمل في ${related} فاتورة/صفقة فعلية، فمش ممكن يتمسح هو ومعاملاته — لأن ده معناه تعديل فواتير موجودة.`,
    related,
    canCascade,
    // Both callers of this (parties, products) support archiving; it's what tells the UI
    // to offer three choices instead of the old yes/no confirm.
    canArchive: true,
  };
}
