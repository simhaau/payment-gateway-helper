import { BillingBatch, Settings } from './types';

function padRight(str: string, len: number): string {
  return str.slice(0, len).padEnd(len, ' ');
}

function padLeft(str: string, len: number, char = '0'): string {
  return str.slice(0, len).padStart(len, char);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function amountToAgorot(amount: number): string {
  return Math.round(amount * 100).toString();
}

export function generateMasavFile(batch: BillingBatch, settings: Settings): string {
  const lines: string[] = [];
  const validTx = batch.transactions.filter(t => t.status === 'included');
  const creationDate = formatDate(batch.date);
  const valueDate = formatDate(batch.valueDate);

  // Header Record (Type 1) - 128 chars
  let header = '1';                                          // 1: Record type
  header += '02';                                            // 2-3: Operation type (debit)
  header += padLeft(settings.masavSenderCode, 8);           // 4-11: Sender code
  header += padLeft('', 8);                                  // 12-19: Receiver (zeros)
  header += creationDate;                                    // 20-25: Creation date
  header += valueDate;                                       // 26-31: Value date
  header += '001';                                           // 32-34: File serial
  header += padLeft(settings.institutionCode, 5);           // 35-39: Institution code
  header = padRight(header, 128);
  lines.push(header);

  // Transaction Records (Type 2)
  for (const tx of validTx) {
    let line = '2';                                          // 1: Record type
    line += padLeft(tx.bankNumber, 2);                      // 2-3: Bank number
    line += padLeft(tx.branchNumber, 3);                    // 4-6: Branch number
    line += padLeft(tx.accountNumber, 9);                   // 7-15: Account number
    line += '1';                                             // 16: Debit indicator
    line += padLeft(amountToAgorot(tx.amount), 10);         // 17-26: Amount in agorot
    line += valueDate;                                       // 27-32: Value date
    line += padRight(tx.customerName, 16);                  // 33-48: Customer name
    line += padRight(tx.idNumber, 20);                      // 49-68: Reference/ID
    line = padRight(line, 128);
    lines.push(line);
  }

  // Summary Record (Type 9)
  const totalAmount = validTx.reduce((sum, t) => sum + t.amount, 0);
  let summary = '9';                                         // 1: Record type
  summary += padLeft(amountToAgorot(totalAmount), 15);      // 2-16: Total debit amount
  summary += padLeft('0', 15);                               // 17-31: Total credit amount
  summary += padLeft(String(validTx.length), 7);            // 32-38: Debit count
  summary += padLeft('0', 7);                                // 39-45: Credit count
  summary = padRight(summary, 128);
  lines.push(summary);

  return lines.join('\r\n');
}

export interface ValidationError {
  customerId: number;
  customerName: string;
  field: string;
  message: string;
}

export function validateBatchForMasav(batch: BillingBatch, settings: Settings): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!settings.masavSenderCode) {
    errors.push({ customerId: 0, customerName: 'מערכת', field: 'senderCode', message: 'חסר קוד שולח מסב בהגדרות' });
  }
  if (!settings.institutionCode) {
    errors.push({ customerId: 0, customerName: 'מערכת', field: 'institutionCode', message: 'חסר קוד מוסד בהגדרות' });
  }

  for (const tx of batch.transactions) {
    if (!tx.bankNumber || tx.bankNumber.length > 2) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'bankNumber', message: 'מספר בנק לא תקין' });
    }
    if (!tx.branchNumber || tx.branchNumber.length > 3) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'branchNumber', message: 'מספר סניף לא תקין' });
    }
    if (!tx.accountNumber || tx.accountNumber.length > 9) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'accountNumber', message: 'מספר חשבון לא תקין' });
    }
    if (tx.amount <= 0) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'amount', message: 'סכום לא תקין' });
    }
  }

  return errors;
}

export function downloadMasavFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=windows-1255' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
