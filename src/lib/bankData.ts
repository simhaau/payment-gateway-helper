// Parse and provide bank/branch data from the CSV
import bankCsvUrl from './bankData.csv?raw';

export interface BankInfo {
  code: string;
  name: string;
}

export interface BranchInfo {
  bankCode: string;
  branchCode: string;
  branchName: string;
  address: string;
  city: string;
}

let _banks: BankInfo[] | null = null;
let _branches: BranchInfo[] | null = null;

function parseCSV() {
  if (_banks && _branches) return;

  const lines = bankCsvUrl.split('\n').slice(1); // skip header
  const bankMap = new Map<string, string>();
  const branches: BranchInfo[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    // Parse CSV with quoted fields
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    const bankCode = fields[0];
    const bankName = fields[1] || '';
    const branchCode = fields[2] || '';
    const branchName = fields[4] || '';
    const address = fields[5] || '';
    const city = fields[6] || '';
    const closeDate = fields[22] || '';

    if (!bankCode || !branchCode) continue;
    // Skip closed branches
    if (closeDate) continue;

    bankMap.set(bankCode, bankName);
    branches.push({ bankCode, branchCode, branchName, address, city });
  }

  _banks = Array.from(bankMap.entries())
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => Number(a.code) - Number(b.code));
  _branches = branches;
}

export function getAllBanks(): BankInfo[] {
  parseCSV();
  return _banks || [];
}

export function getBranchesForBank(bankCode: string): BranchInfo[] {
  parseCSV();
  return (_branches || []).filter(b => b.bankCode === bankCode);
}

export function getBankName(bankCode: string): string {
  parseCSV();
  return _banks?.find(b => b.code === bankCode)?.name || '';
}

export function getBranchName(bankCode: string, branchCode: string): string {
  parseCSV();
  return (_branches || []).find(b => b.bankCode === bankCode && b.branchCode === branchCode)?.branchName || '';
}
