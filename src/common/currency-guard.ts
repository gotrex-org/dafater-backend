import { BadRequestException } from '@nestjs/common';

type Cur = string | null | undefined;

// الدولار لا يُعامل معاملة الجنيه: حساب بالدولار لا يتحرك بنفس الرقم مع خزنة بالجنيه.
// التحويل بين العملتين يتم عن طريق الوكيل (دورة الدولار — common/usd-fifo.ts).
export function assertCashCurrency(partyCurrency: Cur, treasuryCurrency: Cur, hasRate = false) {
  const party = partyCurrency ?? 'EGP';
  const treasury = treasuryCurrency ?? 'EGP';
  if (party === treasury) return;
  if (party === 'USD') {
    throw new BadRequestException('لا يمكن تسجيل مبلغ بالدولار في خزنة بالجنيه. الدفع لمورد الدولار يتم عن طريق الوكيل، أو من خزنة بالدولار');
  }
  if (!hasRate) {
    throw new BadRequestException('لا يمكن تسجيل مبلغ بالجنيه في خزنة بالدولار بدون سعر الدولار');
  }
}
