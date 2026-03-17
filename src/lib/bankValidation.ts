/**
 * Israeli Bank Account Validation Engine
 * Validates bank codes, branch codes, and account numbers per Bank of Israel standards.
 */

import { getAllBanks, getBranchesForBank } from './bankData';

export interface BankValidationResult {
  valid: boolean;
  errors: BankValidationError[];
  severity: 'ok' | 'warning' | 'critical';
}

export interface BankValidationError {
  field: string;
  message: string;
  severity: 'warning' | 'critical';
}

// Known Israeli bank codes with their account number lengths
const BANK_ACCOUNT_STRUCTURES: Record<string, { minLen: number; maxLen: number; name: string }> = {
  '4':  { minLen: 6, maxLen: 9, name: 'בנק יהב' },
  '9':  { minLen: 6, maxLen: 9, name: 'בנק הדואר' },
  '10': { minLen: 6, maxLen: 9, name: 'בנק לאומי' },
  '11': { minLen: 6, maxLen: 9, name: 'בנק דיסקונט' },
  '12': { minLen: 6, maxLen: 9, name: 'בנק הפועלים' },
  '13': { minLen: 6, maxLen: 9, name: 'בנק אגוד' },
  '14': { minLen: 6, maxLen: 9, name: 'בנק אוצר החייל' },
  '17': { minLen: 6, maxLen: 9, name: 'בנק מרכנתיל דיסקונט' },
  '20': { minLen: 6, maxLen: 9, name: 'בנק מזרחי טפחות' },
  '22': { minLen: 6, maxLen: 9, name: 'סיטיבנק' },
  '26': { minLen: 6, maxLen: 9, name: 'בנק יובנק' },
  '31': { minLen: 6, maxLen: 9, name: 'בנק הבינלאומי' },
  '34': { minLen: 6, maxLen: 9, name: 'בנק ערבי ישראלי' },
  '46': { minLen: 6, maxLen: 9, name: 'בנק מסד' },
  '52': { minLen: 6, maxLen: 9, name: 'בנק פועלי אגודת ישראל' },
  '54': { minLen: 6, maxLen: 9, name: 'בנק ירושלים' },
};

/** Validate an Israeli ID number using Luhn-like algorithm */
export function validateIsraeliId(id: string): boolean {
  const cleaned = id.replace(/\D/g, '');
  if (cleaned.length === 0 || cleaned.length > 9) return false;
  const padded = cleaned.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = Number(padded[i]) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Full bank account validation */
export function validateBankAccount(
  bankCode: string,
  branchCode: string,
  accountNumber: string
): BankValidationResult {
  const errors: BankValidationError[] = [];

  // Clean inputs
  const cleanBank = (bankCode || '').replace(/\D/g, '');
  const cleanBranch = (branchCode || '').replace(/\D/g, '');
  const cleanAccount = (accountNumber || '').replace(/\D/g, '');

  // Bank code validation
  if (!cleanBank) {
    errors.push({ field: 'bankNumber', message: 'חסר מספר בנק', severity: 'critical' });
  } else if (!/^\d{1,2}$/.test(cleanBank)) {
    errors.push({ field: 'bankNumber', message: 'מספר בנק חייב להיות 1-2 ספרות', severity: 'critical' });
  } else {
    // Check if bank exists in our data
    const banks = getAllBanks();
    const bankExists = banks.some(b => b.code === cleanBank || b.code === cleanBank.replace(/^0+/, ''));
    if (!bankExists) {
      errors.push({ field: 'bankNumber', message: `קוד בנק ${cleanBank} לא מוכר במערכת הבנקאית`, severity: 'critical' });
    }
  }

  // Branch validation
  if (!cleanBranch) {
    errors.push({ field: 'branchNumber', message: 'חסר מספר סניף', severity: 'critical' });
  } else if (!/^\d{1,3}$/.test(cleanBranch)) {
    errors.push({ field: 'branchNumber', message: 'מספר סניף חייב להיות 1-3 ספרות', severity: 'critical' });
  } else if (cleanBank) {
    // Check branch exists for this bank
    const branches = getBranchesForBank(cleanBank.replace(/^0+/, '') || cleanBank);
    const branchExists = branches.some(b =>
      b.branchCode === cleanBranch ||
      b.branchCode === cleanBranch.replace(/^0+/, '') ||
      b.branchCode.padStart(3, '0') === cleanBranch.padStart(3, '0')
    );
    if (!branchExists && branches.length > 0) {
      errors.push({ field: 'branchNumber', message: `סניף ${cleanBranch} לא נמצא בבנק ${cleanBank}`, severity: 'warning' });
    }
  }

  // Account number validation
  if (!cleanAccount) {
    errors.push({ field: 'accountNumber', message: 'חסר מספר חשבון', severity: 'critical' });
  } else if (!/^\d{1,9}$/.test(cleanAccount)) {
    errors.push({ field: 'accountNumber', message: 'מספר חשבון חייב להיות 1-9 ספרות', severity: 'critical' });
  } else {
    const bankStruct = BANK_ACCOUNT_STRUCTURES[cleanBank] || BANK_ACCOUNT_STRUCTURES[cleanBank.replace(/^0+/, '')];
    if (bankStruct && (cleanAccount.length < bankStruct.minLen || cleanAccount.length > bankStruct.maxLen)) {
      errors.push({
        field: 'accountNumber',
        message: `בבנק ${bankStruct.name} מספר חשבון חייב להיות ${bankStruct.minLen}-${bankStruct.maxLen} ספרות`,
        severity: 'warning'
      });
    }
  }

  const hasCritical = errors.some(e => e.severity === 'critical');
  const hasWarning = errors.some(e => e.severity === 'warning');

  return {
    valid: !hasCritical,
    errors,
    severity: hasCritical ? 'critical' : hasWarning ? 'warning' : 'ok',
  };
}

/** Check if a date is a business day (not Friday/Saturday in Israel) */
export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 5 && day !== 6; // Friday=5, Saturday=6
}

/** Get next business day */
export function getNextBusinessDay(date: Date): Date {
  const d = new Date(date);
  while (!isBusinessDay(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** Validate value date for MASAV */
export function validateValueDate(dateStr: string): BankValidationError[] {
  const errors: BankValidationError[] = [];
  if (!dateStr) {
    errors.push({ field: 'valueDate', message: 'חסר תאריך ערך', severity: 'critical' });
    return errors;
  }
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (d < today) {
    errors.push({ field: 'valueDate', message: 'תאריך ערך לא יכול להיות בעבר', severity: 'critical' });
  }

  if (!isBusinessDay(d)) {
    const next = getNextBusinessDay(d);
    errors.push({
      field: 'valueDate',
      message: `תאריך ${dateStr} אינו יום עסקים. יום העסקים הקרוב: ${next.toISOString().split('T')[0]}`,
      severity: 'warning'
    });
  }

  return errors;
}
