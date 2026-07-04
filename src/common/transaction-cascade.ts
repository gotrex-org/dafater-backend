import { PrismaService } from '../prisma/prisma.service';

/**
 * Deletes a Transaction and everything else the action that created it
 * touched: sibling Transaction rows sharing the same groupId (e.g. a
 * collection + its transfer fee), any DriverPayment/DollarAgentTx paired to
 * one of those transactions via txId, any LoanReturn paired the same way
 * (rolling back the parent Loan's returned quantities/status), and any
 * DriverTrip delay/weight-diff pointer left dangling.
 *
 * Symmetric entry points (deletePayment, deleteAgentTx, loan remove) call
 * this too, so cascading works regardless of which side triggers the delete.
 */
export async function deleteTransactionAndEffects(prisma: PrismaService, transactionId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.findUnique({ where: { id: transactionId }, select: { id: true, groupId: true } });
    if (!txn) return;

    const ids = txn.groupId
      ? (await tx.transaction.findMany({ where: { groupId: txn.groupId }, select: { id: true } })).map((r) => r.id)
      : [txn.id];

    await tx.driverPayment.deleteMany({ where: { txId: { in: ids } } });
    await tx.dollarAgentTx.deleteMany({ where: { txId: { in: ids } } });

    const loanReturns = await tx.loanReturn.findMany({ where: { txId: { in: ids } } });
    for (const lr of loanReturns) {
      await tx.loanReturn.delete({ where: { id: lr.id } });
      const loan = await tx.loan.findUnique({ where: { id: lr.loanId } });
      if (loan) {
        const isGoods = lr.returnType === 'GOODS';
        await tx.loan.update({
          where: { id: loan.id },
          data: {
            returnedQty: isGoods ? Math.max(0, loan.returnedQty - lr.qty) : loan.returnedQty,
            cashReturnedQty: !isGoods ? Math.max(0, loan.cashReturnedQty - lr.qty) : loan.cashReturnedQty,
            status: 'OPEN',
          },
        });
      }
    }

    await tx.driverTrip.updateMany({ where: { delayTxId: { in: ids } }, data: { delayTxId: null, delayFee: 0 } });
    await tx.driverTrip.updateMany({ where: { weightDiffTxId: { in: ids } }, data: { weightDiffTxId: null, weightDiffAmount: 0 } });

    await tx.transaction.deleteMany({ where: { id: { in: ids } } });
  });
}
