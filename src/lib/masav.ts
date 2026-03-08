import { BillingBatch, Settings } from './types';

/**
 * MASAV File Generator
 * Based on official MASAV specification:
 * - Record length: 128 characters (ASCII)
 * - CR+LF at end of each record (positions 129-130)
 * - Header record: starts with 'K', ends with 'KOT'
 * - Movement record: starts with '1'
 * - Totals record: starts with '5'
 * - End record: 128 nines
 */

// Normalize free-text fields to strict ASCII (MASAV is fixed-width single-byte format)
function toAscii(input: string): string {
  return (input ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pad string with spaces on the right to exact length
function padRight(str: string, len: number): string {
  return toAscii(str).slice(0, len).padEnd(len, ' ');
}

// Pad string with zeros (or given char) on the left to exact length
function padLeft(str: string, len: number, char = '0'): string {
  return String(str ?? '').slice(0, len).padStart(len, char);
}

function ensureRecordLength(record: string, type: string) {
  if (record.length !== 128) {
    throw new Error(`MASAV ${type} record must be 128 chars, got ${record.length}`);
  }
}

// Format date as YYMMDD
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

// Convert amount to agorot string (13 digits: 11 shekel + 2 agorot)
function amountToField(amount: number, len: number): string {
  const agorot = Math.round(amount * 100);
  return padLeft(String(agorot), len);
}

export function generateMasavFile(batch: BillingBatch, settings: Settings): string {
  const lines: string[] = [];
  const validTx = batch.transactions.filter(t => t.status === 'included');
  const paymentDate = formatDate(batch.valueDate);
  const creationDate = formatDate(batch.date);
  const institutionCode = padLeft(String(settings.masavSenderCode).replace(/\D/g, ''), 8);
  const sendingInstitution = padLeft(String(settings.institutionCode).replace(/\D/g, ''), 5);

  // ============================================
  // Header Record (128 chars) - Record ID 'K'
  // ============================================
  let header = '';
  header += 'K';                                    // Pos 1     (1)  Record ID
  header += institutionCode;                         // Pos 2-9   (8)  Institution/subject code
  header += '00';                                    // Pos 10-11 (2)  Currency code (ILS)
  header += paymentDate;                             // Pos 12-17 (6)  Date of payment YYMMDD
  header += '0';                                     // Pos 18    (1)  Filler
  header += '001';                                   // Pos 19-21 (3)  Serial number
  header += '0';                                     // Pos 22    (1)  Filler
  header += creationDate;                            // Pos 23-28 (6)  Date tape created YYMMDD
  header += sendingInstitution;                      // Pos 29-33 (5)  Sending institution
  header += '000000';                                // Pos 34-39 (6)  Filler (zeros)
  header += padRight(settings.organizationName, 30); // Pos 40-69 (30) Name of institution (ASCII only)
  header += padRight('', 56);                        // Pos 70-125(56) Filler (blanks)
  header += 'KOT';                                   // Pos 126-128(3) Header ID
  ensureRecordLength(header, 'header');
  lines.push(header);

  // ============================================
  // Movement Records (128 chars each) - Record ID '1'
  // ============================================
  for (const tx of validTx) {
    let line = '';
    line += '1';                                     // Pos 1     (1)  Record ID
    line += institutionCode;                         // Pos 2-9   (8)  Institution/subject
    line += '00';                                    // Pos 10-11 (2)  Currency
    line += '000000';                                // Pos 12-17 (6)  Filler
    line += padLeft(String(tx.bankNumber).replace(/\D/g, ''), 2);    // Pos 18-19 (2)  Bank code
    line += padLeft(String(tx.branchNumber).replace(/\D/g, ''), 3);  // Pos 20-22 (3)  Branch number
    line += '0000';                                  // Pos 23-26 (4)  Account type
    line += padLeft(String(tx.accountNumber).replace(/\D/g, ''), 9); // Pos 27-35 (9)  Account number
    line += '0';                                     // Pos 36    (1)  Filler
    line += padLeft(String(tx.idNumber).replace(/\D/g, ''), 9);      // Pos 37-45 (9)  ID number
    line += padRight(tx.customerName, 16);           // Pos 46-61 (16) Name of entitled (ASCII translated)
    line += amountToField(tx.amount, 13);            // Pos 62-74 (13) Amount (11+2)
    line += padRight(String(tx.idNumber).replace(/\D/g, ''), 20);    // Pos 75-94 (20) Reference
    line += '00000000';                              // Pos 95-102(8)  Payment period
    line += '000';                                   // Pos 103-105(3) Text code
    line += '001';                                   // Pos 106-108(3) Movement type (001=credit/authorized collection format)
    line += padLeft('', 18);                         // Pos 109-126(18) Filler (zeros)
    line += '  ';                                    // Pos 127-128(2) Filler (blanks)
    ensureRecordLength(line, 'movement');
    lines.push(line);
  }

  // ============================================
  // Totals Record (128 chars) - Record ID '5'
  // ============================================
  const totalAmount = validTx.reduce((sum, t) => sum + t.amount, 0);
  let totals = '';
  totals += '5';                                     // Pos 1     (1)  Record ID
  totals += institutionCode;                         // Pos 2-9   (8)  Institution/subject
  totals += '00';                                    // Pos 10-11 (2)  Currency
  totals += paymentDate;                             // Pos 12-17 (6)  Date of payment
  totals += '0';                                     // Pos 18    (1)  Filler
  totals += '001';                                   // Pos 19-21 (3)  Serial number
  totals += amountToField(totalAmount, 15);          // Pos 22-36 (15) Sum of movements
  totals += padLeft('', 15);                         // Pos 37-51 (15) Filler (zeros)
  totals += padLeft(String(validTx.length), 7);      // Pos 52-58 (7)  Number of movements
  totals += padLeft('', 70);                         // Pos 59-128(70) Filler (zeros)
  ensureRecordLength(totals, 'totals');
  lines.push(totals);

  // ============================================
  // End Record - 128 nines
  // ============================================
  const end = '9'.repeat(128);
  ensureRecordLength(end, 'end');
  lines.push(end);

  // Join with CR+LF as per spec
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
    errors.push({ customerId: 0, customerName: 'מערכת', field: 'senderCode', message: 'חסר קוד מוסד/נושא מסב בהגדרות' });
  }
  if (!settings.institutionCode) {
    errors.push({ customerId: 0, customerName: 'מערכת', field: 'institutionCode', message: 'חסר קוד מוסד שולח בהגדרות' });
  }
  if (toAscii(settings.organizationName) !== settings.organizationName.trim()) {
    errors.push({ customerId: 0, customerName: 'מערכת', field: 'organizationName', message: 'שם הארגון בקובץ מסב חייב להיות באנגלית/ASCII בלבד' });
  }

  for (const tx of batch.transactions) {
    if (tx.status !== 'included') continue;

    if (!tx.bankNumber || !/^\d{1,2}$/.test(tx.bankNumber)) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'bankNumber', message: 'מספר בנק לא תקין (1-2 ספרות)' });
    }
    if (!tx.branchNumber || !/^\d{1,3}$/.test(tx.branchNumber)) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'branchNumber', message: 'מספר סניף לא תקין (1-3 ספרות)' });
    }
    if (!tx.accountNumber || !/^\d{1,9}$/.test(tx.accountNumber)) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'accountNumber', message: 'מספר חשבון לא תקין (1-9 ספרות)' });
    }
    if (tx.amount <= 0) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'amount', message: 'סכום לא תקין (חייב להיות גדול מ-0)' });
    }
    if (!tx.idNumber || !/^\d{1,9}$/.test(tx.idNumber.replace(/\D/g, ''))) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'idNumber', message: 'מספר זהות לא תקין' });
    }
    if (toAscii(tx.customerName) !== tx.customerName.trim()) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'customerName', message: 'שם לקוח למסב חייב להיות באנגלית/ASCII בלבד (שם מתורגם)' });
    }
  }

  return errors;
}

export function downloadMasavFile(content: string, filename: string) {
  // MASAV files are strict single-byte ASCII
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    bytes[i] = code <= 0x7f ? code : 32; // fallback to space for any unexpected non-ASCII char
  }

  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
