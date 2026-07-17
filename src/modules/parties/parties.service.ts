import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PartyRole } from '@prisma/client';
import { BalancesService } from '../balances/balances.service';
import { CreatePartyDto, LinkPartyDto, UpdatePartyDto } from './dto/party.dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PartiesRepository } from './parties.repository';

@Injectable()
export class PartiesService {
  constructor(
    private repo: PartiesRepository,
    private balances: BalancesService,
  ) {}

  async findAll(q: PaginationQueryDto, role?: PartyRole, includeHidden = false) {
    const result = await this.repo.findAll(q, role, includeHidden);
    const byId = await this.balances.allPartyBalances();
    const lastById = await this.repo.lastActivityByParty();
    const rateById = await this.balances.avgExchangeRateByParty();
    // Linked client/supplier pairs share one statement (see ledger()/findOne()) — the
    // list's balance & last-activity columns must match that, not each side's own figure.
    result.data = await Promise.all(result.data.map(async (p: any) => {
      const partner = p.linkedParty ?? p.linkedFrom ?? null;
      const balance = partner
        ? await this.balances.partyBalanceMulti([p.id, partner.id])
        : (byId[p.id] ?? p.opening);
      const lastActivity = partner
        ? [lastById[p.id], lastById[partner.id]].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime()).pop() ?? null
        : (lastById[p.id] ?? null);
      // USD party's weighted-average rate — prefer its own, fall back to a linked partner's.
      const avgExchangeRate = rateById[p.id] || (partner ? rateById[partner.id] : 0) || 0;
      return { ...p, balance, lastActivity, avgExchangeRate };
    }));
    return result;
  }

  async findOne(id: string) {
    const party = await this.repo.findOneByUid(id);
    if (!party) throw new NotFoundException('Party not found');
    const partner = (party as any).linkedParty ?? (party as any).linkedFrom ?? null;
    const balance = partner
      ? await this.balances.partyBalanceMulti([party.id, partner.id])
      : await this.balances.partyBalance(party.id);
    // Weighted-average EGP-per-USD rate for a USD party (0 if none) — so a deep-linked
    // ledger (opened by uid, not from the list) can still show the EGP equivalent.
    const rateById = await this.balances.avgExchangeRateByParty();
    const avgExchangeRate = rateById[party.id] || (partner ? rateById[partner.id] : 0) || 0;
    return { ...party, balance, avgExchangeRate, linkedParty: (party as any).linkedParty ?? null, linkedFrom: (party as any).linkedFrom ?? null };
  }

  async ledger(id: string, from?: string, to?: string, user?: { admin?: boolean; ledgerPartyIds?: string[] }) {
    const party = await this.findOne(id);
    const partner = (party as any).linkedParty ?? (party as any).linkedFrom ?? null;

    // ledgerPartyIds بقت "قائمة إخفاء" — الأطراف اللي فيها مايشوفهاش الموظف في كشف الحساب.
    if (user && !user.admin && user.ledgerPartyIds?.length) {
      const hidden = new Set(user.ledgerPartyIds);
      const visibleUids = [party.uid, ...(partner ? [(partner as any).uid] : [])];
      if (visibleUids.some((u) => hidden.has(u))) {
        throw new ForbiddenException('هذا الطرف مخفي عنك');
      }
    }

    const partyIds = partner ? [party.id, partner.id] : [party.id];
    const txns = await this.repo.ledgerTransactions(partyIds);

    const fromD = from ? new Date(from) : null;
    const toD = to ? new Date(to) : null;

    const totalOpening = partner
      ? (party.opening || 0) + (Number((partner as any).opening) || 0)
      : (party.opening || 0);

    let running = totalOpening;
    let periodOpening = totalOpening;
    const rows: any[] = [];

    for (const t of txns) {
      if (fromD && t.date < fromD) {
        running += (t.debit || 0) - (t.credit || 0);
        periodOpening = running;
        continue;
      }
      running += (t.debit || 0) - (t.credit || 0);
      if (toD && t.date > toD) continue;
      rows.push({
        id: t.uid,
        date: t.date,
        type: t.type,
        note: t.note,
        debit: t.debit,
        credit: t.credit,
        balance: running,
        partyRole: (t as any).party?.role ?? null,
        partyName: (t as any).party?.name ?? null,
        invoiceUid: t.invoice?.uid ?? null,
        dealUid: t.deal?.uid ?? null,
        manifestDate: t.invoice?.manifests?.[0]?.date ?? null,
        manifestNo: t.invoice?.manifests?.[0]?.no ?? null,
        manifestArrived: t.invoice?.manifests?.[0]?.driverTrips?.some((dt: any) => dt.arrivalDate != null) ?? false,
        invoiceItems: t.invoice
          ? t.invoice.items.map((it: any) => ({ name: it.product?.name ?? '', qty: it.qty, price: it.price }))
          : t.deal
          // A deal has two prices per item: buy (from supplier) and sell (to client). Each
          // side's statement must show its own price — the supplier sees the buy price, not
          // the sell price (which would leak the margin and misstate what we owe them).
          ? t.deal.items.map((it: any) => ({
              name: it.product?.name ?? '',
              qty: it.qty,
              price: (t as any).party?.role === 'SUPPLIER' ? (it.buyPrice ?? it.price) : it.price,
            }))
          : null,
      });
    }

    const closing = rows.length ? rows[rows.length - 1].balance : periodOpening;
    rows.reverse();
    return { party, linkedParty: partner, opening: periodOpening, rows, balance: closing };
  }

  async linkParty(id: string, dto: LinkPartyDto) {
    const party = await this.repo.findOneByUid(id);
    if (!party) throw new NotFoundException('Party not found');
    if ((party as any).linkedPartyId || (party as any).linkedFrom) {
      throw new BadRequestException('هذا الطرف مرتبط بالفعل — افصله أولاً');
    }
    if (dto.linkedPartyUid === id) throw new BadRequestException('لا يمكن ربط الطرف بنفسه');
    const target = await this.repo.findRawByUid(dto.linkedPartyUid);
    const targetFull = await this.repo.findOneByUid(target.uid);
    if ((targetFull as any)?.linkedPartyId || (targetFull as any)?.linkedFrom) {
      throw new BadRequestException('الطرف المستهدف مرتبط بالفعل — افصله أولاً');
    }
    return this.repo.setLink(id, target.id);
  }

  async unlinkParty(id: string) {
    const party = await this.repo.findOneByUid(id);
    if (!party) throw new NotFoundException('Party not found');
    // If this party is the "linkedFrom" side (i.e. another party points TO it), clear that other party's link
    const linkedFrom = (party as any).linkedFrom as any;
    if (linkedFrom) return this.repo.clearLink(linkedFrom.uid);
    return this.repo.clearLink(id);
  }

  create(dto: CreatePartyDto) { return this.repo.create(dto); }
  update(id: string, dto: UpdatePartyDto) { return this.repo.update(id, dto); }
  getDirectSaleParty() { return this.repo.findOrCreateDirectSaleParty(); }

  async remove(id: string, cascade: boolean) {
    const party = await this.repo.findRawByUid(id);
    if (!cascade) {
      const related = await this.repo.countRelated(party.id);
      if (related > 0) {
        throw new ConflictException(`يوجد ${related} حركة/فاتورة/صفقة مرتبطة بهذا الطرف — احذفها أولاً أو أكّد حذفها معه`);
      }
    }
    return this.repo.removeCascade(party.id);
  }
}
