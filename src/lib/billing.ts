import { Customer, BillingBatch, BillingTransaction } from './types';

export function getCustomersDueForBilling(customers: Customer[], targetDate?: Date): Customer[] {
  const now = targetDate || new Date();
  return customers.filter(c => {
    if (c.status !== 'active') return false;
    if (!c.monthlyAmount || c.monthlyAmount <= 0) return false;
    const start = new Date(c.startDate);
    if (start > now) return false;
    if (c.endDate) {
      const end = new Date(c.endDate);
      if (end < now) return false;
    }
    return true;
  });
}

export function createBillingBatch(
  customers: Customer[],
  valueDate: string
): BillingBatch {
  const transactions: BillingTransaction[] = customers.map(c => {
    const errors: string[] = [];
    if (!c.bankNumber) errors.push('חסר מספר בנק');
    if (!c.branchNumber) errors.push('חסר מספר סניף');
    if (!c.accountNumber) errors.push('חסר מספר חשבון');
    if (!c.monthlyAmount || c.monthlyAmount <= 0) errors.push('סכום לא תקין');

    return {
      customerId: c.id!,
      customerName: c.fullName,
      amount: (c.paymentMethod === 'mixed' ? (c.bankAmount || c.monthlyAmount) : c.monthlyAmount),
      bankNumber: c.bankNumber,
      branchNumber: c.branchNumber,
      accountNumber: c.accountNumber,
      idNumber: c.idNumber,
      status: errors.length > 0 ? 'error' as const : 'included' as const,
      errorMessage: errors.join(', '),
    };
  });

  const included = transactions.filter(t => t.status === 'included');

  return {
    date: new Date().toISOString().split('T')[0],
    valueDate,
    totalAmount: included.reduce((s, t) => s + t.amount, 0),
    transactionCount: included.length,
    status: 'pending',
    transactions,
    createdAt: new Date().toISOString(),
  };
}

export function calculateExpectedMonthlyIncome(customers: Customer[]): number {
  return customers
    .filter(c => c.status === 'active' && c.monthlyAmount > 0)
    .reduce((sum, c) => sum + c.monthlyAmount, 0);
}
