import type { Customer } from './types';

/**
 * Parse CSV text into customer objects.
 * Supports common Hebrew column headers and auto-detects delimiter.
 */
export function parseCSVCustomers(text: string): Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Auto-detect delimiter
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"/, '').replace(/"$/, '').toLowerCase());
  
  // Map Hebrew/English headers to fields
  const headerMap: Record<string, keyof Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>> = {
    'שם': 'fullName',
    'שם מלא': 'fullName',
    'name': 'fullName',
    'fullname': 'fullName',
    'full_name': 'fullName',
    'ת.ז': 'idNumber',
    'תעודת זהות': 'idNumber',
    'id': 'idNumber',
    'idnumber': 'idNumber',
    'id_number': 'idNumber',
    'טלפון': 'phone',
    'phone': 'phone',
    'נייד': 'phone',
    'אימייל': 'email',
    'email': 'email',
    'מייל': 'email',
    'כתובת': 'address',
    'address': 'address',
    'הערות': 'notes',
    'notes': 'notes',
    'בנק': 'bankNumber',
    'מספר בנק': 'bankNumber',
    'bank': 'bankNumber',
    'banknumber': 'bankNumber',
    'סניף': 'branchNumber',
    'מספר סניף': 'branchNumber',
    'branch': 'branchNumber',
    'branchnumber': 'branchNumber',
    'חשבון': 'accountNumber',
    'מספר חשבון': 'accountNumber',
    'account': 'accountNumber',
    'accountnumber': 'accountNumber',
    'שם בעל חשבון': 'accountHolderName',
    'סכום': 'monthlyAmount',
    'סכום חודשי': 'monthlyAmount',
    'amount': 'monthlyAmount',
    'monthlyamount': 'monthlyAmount',
    'monthly_amount': 'monthlyAmount',
  };

  const fieldIndexes: Partial<Record<keyof Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>, number>> = {};
  headers.forEach((h, i) => {
    const field = headerMap[h];
    if (field) fieldIndexes[field] = i;
  });

  if (!fieldIndexes.fullName && fieldIndexes.fullName !== 0) {
    // Try first column as name
    fieldIndexes.fullName = 0;
  }

  const results: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^"/, '').replace(/"$/, ''));
    if (cols.length < 1 || !cols[0]) continue;

    const getVal = (field: keyof Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const idx = fieldIndexes[field];
      return idx !== undefined && idx < cols.length ? cols[idx] : '';
    };

    const fullName = getVal('fullName');
    if (!fullName) continue;

    const amountStr = getVal('monthlyAmount');
    const monthlyAmount = amountStr ? parseFloat(amountStr.replace(/[₪,\s]/g, '')) || 0 : 0;

    results.push({
      fullName,
      idNumber: getVal('idNumber'),
      phone: getVal('phone'),
      phone2: '',
      email: getVal('email'),
      city: '',
      street: '',
      houseNumber: '',
      address: getVal('address'),
      notes: getVal('notes'),
      bankNumber: getVal('bankNumber'),
      branchNumber: getVal('branchNumber'),
      accountNumber: getVal('accountNumber'),
      accountHolderName: getVal('accountHolderName') || fullName,
      authorizationRef: '',
      authorizationDate: '',
      nickname: '',
      paymentMethod: 'bank',
      bankAmount: 0,
      cashAmount: 0,
      amperes: 0,
      monthlyAmount,
      billingCycle: 'monthly',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      chargeFrequencyMonths: 1,
      status: 'active',
      groupId: null,
      phaseId: null,
      tags: [],
    });
  }

  return results;
}
