import { Customer, BillingBatch, BillingTransaction, DebtRecord } from './types';

export function getCustomersDueForBilling(customers: Customer[], targetDate?: Date): Customer[] {
  const now = targetDate || new Date();
  return customers.filter(c => {
    if (c.status !== 'active') return false;
    if ((!c.amperes || c.amperes <= 0) && (!c.monthlyAmount || c.monthlyAmount <= 0)) return false;
    const start = new Date(c.startDate);
    if (start > now) return false;
    if (c.endDate) {
      const end = new Date(c.endDate);
      if (end < now) return false;
    }
    return true;
  });
}

export function getCustomerMonthlyAmount(c: Customer, pricePerAmpere: number): number {
  if (c.amperes && c.amperes > 0 && pricePerAmpere > 0) {
    return c.amperes * pricePerAmpere;
  }
  return c.monthlyAmount || 0;
}

export function createBillingBatch(
  customers: Customer[],
  valueDate: string,
  pricePerAmpere: number,
  extraDebts?: DebtRecord[],
  months?: number
): BillingBatch {
  const monthCount = months || 1;

  const transactions: BillingTransaction[] = customers.map(c => {
    const errors: string[] = [];
    if (!c.bankNumber) errors.push('חסר מספר בנק');
    if (!c.branchNumber) errors.push('חסר מספר סניף');
    if (!c.accountNumber) errors.push('חסר מספר חשבון');
    
    const monthlyAmt = getCustomerMonthlyAmount(c, pricePerAmpere);
    if (monthlyAmt <= 0) errors.push('סכום לא תקין');

    const baseAmount = (c.paymentMethod === 'mixed' ? (c.bankAmount || monthlyAmt) : monthlyAmt);
    
    // Add any extra debts (unpaid) for this customer
    const customerExtras = (extraDebts || []).filter(d => 
      d.customerId === c.id! && 
      d.status !== 'paid' && 
      d.status !== 'advance'
    );
    const extraAmount = customerExtras.reduce((s, d) => s + (d.amount - d.paidAmount), 0);
    const totalAmount = (baseAmount * monthCount) + extraAmount;

    return {
      customerId: c.id!,
      customerName: c.fullName,
      amount: totalAmount,
      bankNumber: c.bankNumber,
      branchNumber: c.branchNumber,
      accountNumber: c.accountNumber,
      idNumber: c.idNumber,
      status: errors.length > 0 ? 'error' as const : 'included' as const,
      errorMessage: errors.length > 0 
        ? errors.join(', ') 
        : (extraAmount > 0 ? `כולל ₪${extraAmount.toLocaleString()} חיובים נוספים` : '') + 
          (monthCount > 1 ? `${monthCount > 1 && extraAmount > 0 ? ' • ' : ''}${monthCount} חודשים` : ''),
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

export function calculateExpectedMonthlyIncome(customers: Customer[], pricePerAmpere: number): number {
  return customers
    .filter(c => c.status === 'active')
    .reduce((sum, c) => sum + getCustomerMonthlyAmount(c, pricePerAmpere), 0);
}
