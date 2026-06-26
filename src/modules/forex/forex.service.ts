import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAgentDto, UpdateAgentDto, EgpInDto, UsdOutDto } from './dto/forex.dto';
import { ForexRepository } from './forex.repository';

@Injectable()
export class ForexService {
  constructor(private repo: ForexRepository) {}

  async findAll() {
    const agents = await this.repo.findAllAgents();
    return Promise.all(agents.map(async (a) => {
      const txs = await this.repo.findAgentTxsByIdSimple(a.id);
      const { egpIn, egpOut } = this.calcBalance(txs);
      return { ...a, egpIn, egpOut, balance: egpIn - egpOut };
    }));
  }

  async findOne(uid: string) {
    const agent = await this.repo.findAgentByUid(uid);
    if (!agent) throw new NotFoundException('الوكيل غير موجود');
    const txs = await this.repo.findAgentTxs(agent.id);
    const { egpIn, egpOut } = this.calcBalance(txs);
    return { ...agent, egpIn, egpOut, balance: egpIn - egpOut, txs };
  }

  create(dto: CreateAgentDto) { return this.repo.createAgent(dto); }

  async update(uid: string, dto: UpdateAgentDto) {
    const agent = await this.repo.findAgentByUid(uid);
    if (!agent) throw new NotFoundException();
    return this.repo.updateAgent(agent.id, dto);
  }

  async remove(uid: string) {
    const agent = await this.repo.findAgentByUid(uid);
    if (!agent) throw new NotFoundException();
    return this.repo.removeAgent(agent.id);
  }

  async egpIn(agentUid: string, dto: EgpInDto) {
    const agent = await this.repo.findAgentByUid(agentUid);
    if (!agent) throw new NotFoundException();
    const treasury = dto.treasuryId ? await this.repo.findTreasuryByUid(dto.treasuryId) : null;
    return this.repo.egpIn(agent, treasury?.id, dto);
  }

  async usdOut(agentUid: string, dto: UsdOutDto) {
    const agent = await this.repo.findAgentByUid(agentUid);
    if (!agent) throw new NotFoundException();
    const party = await this.repo.findPartyByUid(dto.partyId);
    if (!party) throw new NotFoundException('المورد غير موجود');
    return this.repo.usdOut(agent, party, dto);
  }

  async deleteTx(txUid: string) {
    const agentTx = await this.repo.findAgentTxByUid(txUid);
    if (!agentTx) throw new NotFoundException();
    return this.repo.deleteAgentTx(agentTx.id);
  }

  private calcBalance(txs: { type: string; egpAmount: number; usdAmount: number; exchangeRate: number }[]) {
    const egpIn = txs.filter((t) => t.type === 'EGP_IN').reduce((s, t) => s + t.egpAmount, 0);
    const egpOut = txs.filter((t) => t.type === 'USD_OUT').reduce((s, t) => s + t.usdAmount * t.exchangeRate, 0);
    return { egpIn, egpOut };
  }
}
