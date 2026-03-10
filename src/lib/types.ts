export interface Customer {
  id?: number;
  fullName: string;
  nickname: string;
  idNumber: string;
  phone: string;
  phone2: string;
  email: string;
  city: string;
  street: string;
  houseNumber: string;
  address: string;
  notes: string;
  paymentMethod: 'bank' | 'cash' | 'mixed';
  bankAmount: number;
  cashAmount: number;
  bankNumber: string;
  branchNumber: string;
  accountNumber: string;
  accountHolderName: string;
  authorizationRef: string;
  authorizationDate: string;
  amperes: number;
  monthlyAmount: number;
  billingCycle: 'monthly' | 'custom';
  startDate: string;
  endDate: string;
  chargeFrequencyMonths: number;
  status: 'active' | 'paused' | 'cancelled';
  groupId: number | null;
  phaseId: number | null;
  tags: string[];
  balance: number; // credit balance (positive = customer has credit)
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

export interface Phase {
  id?: number;
  name: string;
  description: string;
  createdAt: string;
}

export interface Reminder {
  id?: number;
  title: string;
  description: string;
  dueDate: string;
  recurring: boolean;
  recurringDay: number; // day of month for recurring
  color: string;
  completed: boolean;
  completedAt: string;
  customerId?: number;
  customerName?: string;
  createdAt: string;
}

export interface DebtRecord {
  id?: number;
  customerId: number;
  customerName: string;
  month: string;
  amount: number;
  paidAmount: number;
  status: 'unpaid' | 'partial' | 'paid' | 'advance' | 'suspended' | 'pending_collection';
  paidDate: string;
  paymentMethod?: 'bank' | 'cash' | 'mixed'; // how it was paid
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
  status: 'pending' | 'generated' | 'exported' | 'collected';
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
  billingCycleDay: number;
  pricePerAmpere: number;
  primaryColor: string;
  secondaryColor: string;
}

export interface ActivityLog {
  id?: number;
  type: 'payment' | 'batch' | 'extra_charge' | 'advance' | 'debt_created' | 'debt_deleted' | 'cash_override' | 'batch_collected' | 'bulk_charge' | 'batch_cancelled' | 'reminder' | 'customer_created' | 'customer_updated' | 'customer_deleted' | 'settings_updated' | 'phase_created' | 'group_created' | 'other';
  description: string;
  customerId?: number;
  customerName?: string;
  amount?: number;
  relatedId?: number;
  reversible?: boolean;
  reverseData?: string; // JSON string with data to reverse the action
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
  billingCycleDay: 1,
  pricePerAmpere: 0,
  primaryColor: '',
  secondaryColor: '',
};

export const EMPTY_CUSTOMER: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> = {
  fullName: '',
  nickname: '',
  idNumber: '',
  phone: '',
  phone2: '',
  email: '',
  city: '',
  street: '',
  houseNumber: '',
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
  amperes: 0,
  monthlyAmount: 0,
  billingCycle: 'monthly',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  chargeFrequencyMonths: 1,
  status: 'active',
  groupId: null,
  phaseId: null,
  tags: [],
  balance: 0,
};
