export interface Customer {
  id?: number;
  fullName: string;
  nickname: string;
  idNumber: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  paymentMethod: 'bank' | 'cash' | 'mixed';
  bankAmount: number; // for mixed: amount via bank
  cashAmount: number; // for mixed: amount via cash
  bankNumber: string;
  branchNumber: string;
  accountNumber: string;
  accountHolderName: string;
  authorizationRef: string;
  authorizationDate: string;
  monthlyAmount: number;
  billingCycle: 'monthly' | 'custom';
  startDate: string;
  endDate: string;
  chargeFrequencyMonths: number;
  status: 'active' | 'paused' | 'cancelled';
  groupId: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id?: number;
  name: string;
  description: string;
  color: string;
  createdAt: string;
}

export interface DebtRecord {
  id?: number;
  customerId: number;
  customerName: string;
  month: string; // YYYY-MM
  amount: number;
  paidAmount: number;
  status: 'unpaid' | 'partial' | 'paid' | 'advance';
  paidDate: string;
  notes: string;
  createdAt: string;
}

export interface BillingTransaction {
  customerId: number;
  customerName: string;
  amount: number;
  bankNumber: string;
  branchNumber: string;
  accountNumber: string;
  idNumber: string;
  status: 'included' | 'error';
  errorMessage: string;
}

export interface BillingBatch {
  id?: number;
  date: string;
  valueDate: string;
  totalAmount: number;
  transactionCount: number;
  status: 'pending' | 'generated' | 'exported';
  transactions: BillingTransaction[];
  createdAt: string;
}

export interface Settings {
  id?: number;
  organizationName: string;
  masavSenderCode: string;
  institutionCode: string;
  bankNumber: string;
  branchNumber: string;
  accountNumber: string;
  defaultBillingDay: number;
}

export interface ActivityLog {
  id?: number;
  type: 'payment' | 'batch' | 'extra_charge' | 'advance' | 'debt_created' | 'debt_deleted' | 'cash_override' | 'other';
  description: string;
  customerId?: number;
  customerName?: string;
  amount?: number;
  relatedId?: number; // debt or batch id
  createdAt: string;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  organizationName: '',
  masavSenderCode: '',
  institutionCode: '',
  bankNumber: '',
  branchNumber: '',
  accountNumber: '',
  defaultBillingDay: 1,
};

export const EMPTY_CUSTOMER: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> = {
  fullName: '',
  nickname: '',
  idNumber: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  paymentMethod: 'bank',
  bankAmount: 0,
  cashAmount: 0,
  bankNumber: '',
  branchNumber: '',
  accountNumber: '',
  accountHolderName: '',
  authorizationRef: '',
  authorizationDate: '',
  monthlyAmount: 0,
  billingCycle: 'monthly',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  chargeFrequencyMonths: 1,
  status: 'active',
  groupId: null,
  tags: [],
};
