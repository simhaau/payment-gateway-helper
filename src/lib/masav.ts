import { BillingBatch, Settings } from './types';
import { toAgorot, agorotToMasavField } from './agorot';
import { validateBankAccount, validateIsraeliId, validateValueDate } from './bankValidation';

/**
 * MASAV File Generator — Bank-Grade Implementation
 * Strict 128-char ASCII records, integer arithmetic, full validation.
 */

// ── String helpers (strict ASCII, no trim surprises) ──

function toAscii(input: string): string {
  return (input ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function padRight(str: string, len: number): string {
  const ascii = toAscii(str);
  // Strict: take exactly `len` chars, pad with spaces
  const truncated = ascii.length > len ? ascii.substring(0, len) : ascii;
  return truncated + ' '.repeat(len - truncated.length);
}

function padLeft(str: string, len: number, char = '0'): string {
  const clean = String(str ?? '');
  const truncated = clean.length > len ? clean.substring(clean.length - len) : clean;
  return char.repeat(len - truncated.length) + truncated;
}

function assertRecordLength(record: string, label: string): void {
  if (record.length !== 128) {
    throw new Error(`MASAV ${label}: expected 128 chars, got ${record.length}. Content: "${record}"`);
  }
  // Verify all chars are valid ASCII (0x00-0x7F)
  for (let i = 0; i < record.length; i++) {
    const code = record.charCodeAt(i);
    if (code > 0x7F) {
      throw new Error(`MASAV ${label}: non-ASCII char at position ${i + 1} (code ${code})`);
    }
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${dateStr}`);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

// ── Validation ──

export interface ValidationError {
  customerId: number;
  customerName: string;
  field: string;
  message: string;
  severity: 'critical' | 'warning';
}

export interface SimulationResult {
  passed: boolean;
  errors: ValidationError[];
  criticalCount: number;
  warningCount: number;
  totalAmountAgorot: number;
  recordCount: number;
  reconciliationValid: boolean;
}

export function simulateMasavBatch(batch: BillingBatch, settings: Settings): SimulationResult {
  const errors: ValidationError[] = [];
  const validTx = batch.transactions.filter(t => t.status === 'included');

  // ── System-level checks ──
  if (!settings.masavSenderCode || !/^\d{1,8}$/.test(settings.masavSenderCode.replace(/\D/g, ''))) {
    errors.push({ customerId: 0, customerName: 'מערכת', field: 'masavSenderCode', message: 'קוד מוסד/נושא מסב חסר או לא תקין (1-8 ספרות)', severity: 'critical' });
  }
  if (!settings.institutionCode || !/^\d{1,5}$/.test(settings.institutionCode.replace(/\D/g, ''))) {
    errors.push({ customerId: 0, customerName: 'מערכת', field: 'institutionCode', message: 'קוד מוסד שולח חסר או לא תקין (1-5 ספרות)', severity: 'critical' });
  }
  const asciiName = toAscii(settings.organizationName);
  if (!asciiName || asciiName.length === 0) {
    errors.push({ customerId: 0, customerName: 'מערכת', field: 'organizationName', message: 'שם ארגון חסר', severity: 'critical' });
  } else if (asciiName !== settings.organizationName.trim()) {
    errors.push({ customerId: 0, customerName: 'מערכת', field: 'organizationName', message: 'שם ארגון למסב חייב להיות באנגלית/ASCII בלבד', severity: 'critical' });
  }

  // Value date checks
  const dateErrors = validateValueDate(batch.valueDate);
  for (const e of dateErrors) {
    errors.push({ customerId: 0, customerName: 'מערכת', field: e.field, message: e.message, severity: e.severity });
  }

  // ── Per-transaction checks ──
  const seenKeys = new Set<string>();
  let totalAgorot = 0;
  const individualAgorot: number[] = [];

  for (const tx of validTx) {
    // Bank account validation
    const bankResult = validateBankAccount(tx.bankNumber, tx.branchNumber, tx.accountNumber);
    for (const e of bankResult.errors) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: e.field, message: e.message, severity: e.severity });
    }

    // Amount validation (integer)
    const agorot = toAgorot(tx.amount);
    if (agorot <= 0) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'amount', message: 'סכום חייב להיות גדול מ-0', severity: 'critical' });
    }
    if (agorot > 99999999999) { // 11 digits max for shekel portion
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'amount', message: 'סכום חורג ממגבלת מסב (11 ספרות)', severity: 'critical' });
    }
    individualAgorot.push(agorot);
    totalAgorot += agorot;

    // ID number validation
    const cleanId = (tx.idNumber || '').replace(/\D/g, '');
    if (!cleanId || cleanId.length === 0 || cleanId.length > 9) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'idNumber', message: 'מספר זהות חסר או לא תקין', severity: 'critical' });
    } else if (!validateIsraeliId(cleanId)) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'idNumber', message: 'ספרת ביקורת של תעודת זהות שגויה', severity: 'warning' });
    }

    // Name must be ASCII for MASAV
    const asciiTxName = toAscii(tx.customerName);
    if (!asciiTxName || asciiTxName.length === 0) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'customerName', message: 'שם לקוח חסר', severity: 'critical' });
    } else if (asciiTxName !== tx.customerName.trim()) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'customerName', message: 'שם לקוח למסב חייב להיות באנגלית/ASCII בלבד', severity: 'critical' });
    }

    // Duplicate detection
    const key = `${tx.bankNumber}-${tx.branchNumber}-${tx.accountNumber}-${agorot}`;
    if (seenKeys.has(key)) {
      errors.push({ customerId: tx.customerId, customerName: tx.customerName, field: 'duplicate', message: 'כפילות: אותו חשבון וסכום מופיעים פעמיים באצווה', severity: 'warning' });
    }
    seenKeys.add(key);
  }

  // ── Reconciliation ──
  const declaredAgorot = toAgorot(batch.totalAmount);
  const reconciliationValid = totalAgorot === declaredAgorot;
  if (!reconciliationValid) {
    errors.push({
      customerId: 0, customerName: 'מערכת', field: 'reconciliation',
      message: `אי התאמה: סכום רשומות ₪${(totalAgorot / 100).toFixed(2)} ≠ סכום מוצהר ₪${(declaredAgorot / 100).toFixed(2)}`,
      severity: 'critical'
    });
  }

  const criticalCount = errors.filter(e => e.severity === 'critical').length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;

  return {
    passed: criticalCount === 0,
    errors,
    criticalCount,
    warningCount,
    totalAmountAgorot: totalAgorot,
    recordCount: validTx.length,
    reconciliationValid,
  };
}

// Legacy wrapper
export function validateBatchForMasav(batch: BillingBatch, settings: Settings): ValidationError[] {
  return simulateMasavBatch(batch, settings).errors;
}

// ── File Generation ──

export function generateMasavFile(batch: BillingBatch, settings: Settings): string {
  // Run simulation first — block if critical errors
  const sim = simulateMasavBatch(batch, settings);
  if (!sim.passed) {
    throw new Error(`קובץ מסב לא נוצר: ${sim.criticalCount} שגיאות קריטיות. יש לתקן את כל השגיאות לפני ייצוא.`);
  }

  const lines: string[] = [];
  const validTx = batch.transactions.filter(t => t.status === 'included');
  const paymentDate = formatDate(batch.valueDate);
  const creationDate = formatDate(batch.date);
  const institutionCode = padLeft(String(settings.masavSenderCode).replace(/\D/g, ''), 8);
  const sendingInstitution = padLeft(String(settings.institutionCode).replace(/\D/g, ''), 5);

  // ── Header Record (K) ──
  let header = '';
  header += 'K';                                    // 1     (1)
  header += institutionCode;                         // 2-9   (8)
  header += '00';                                    // 10-11 (2)  Currency ILS
  header += paymentDate;                             // 12-17 (6)
  header += '0';                                     // 18    (1)
  header += '001';                                   // 19-21 (3)  Serial
  header += '0';                                     // 22    (1)
  header += creationDate;                            // 23-28 (6)
  header += sendingInstitution;                      // 29-33 (5)
  header += '000000';                                // 34-39 (6)
  header += padRight(settings.organizationName, 30); // 40-69 (30)
  header += padRight('', 56);                        // 70-125(56)
  header += 'KOT';                                   // 126-128(3)
  assertRecordLength(header, 'header');
  lines.push(header);

  // ── Movement Records (1) ──
  let runningTotalAgorot = 0;

  for (const tx of validTx) {
    const agorot = toAgorot(tx.amount);
    runningTotalAgorot += agorot;

    let line = '';
    line += '1';                                                           // 1     (1)
    line += institutionCode;                                               // 2-9   (8)
    line += '00';                                                          // 10-11 (2)
    line += '000000';                                                      // 12-17 (6)
    line += padLeft(String(tx.bankNumber).replace(/\D/g, ''), 2);          // 18-19 (2)
    line += padLeft(String(tx.branchNumber).replace(/\D/g, ''), 3);        // 20-22 (3)
    line += '0000';                                                        // 23-26 (4)
    line += padLeft(String(tx.accountNumber).replace(/\D/g, ''), 9);       // 27-35 (9)
    line += '0';                                                           // 36    (1)
    line += padLeft(String(tx.idNumber).replace(/\D/g, ''), 9);            // 37-45 (9)
    line += padRight(tx.customerName, 16);                                 // 46-61 (16)
    line += agorotToMasavField(agorot, 13);                                // 62-74 (13)
    line += padLeft(String(tx.idNumber).replace(/\D/g, ''), 20);           // 75-94 (20)
    line += '00000000';                                                    // 95-102(8)
    line += '000';                                                         // 103-105(3)
    line += '006';                                                         // 106-108(3) Credit transfer
    line += padLeft('', 18);                                               // 109-126(18)
    line += '  ';                                                          // 127-128(2)
    assertRecordLength(line, `movement[${tx.customerName}]`);
    lines.push(line);
  }

  // ── Totals Record (5) ──
  let totals = '';
  totals += '5';                                     // 1     (1)
  totals += institutionCode;                         // 2-9   (8)
  totals += '00';                                    // 10-11 (2)
  totals += paymentDate;                             // 12-17 (6)
  totals += '0';                                     // 18    (1)
  totals += '001';                                   // 19-21 (3)
  totals += agorotToMasavField(runningTotalAgorot, 15); // 22-36 (15)
  totals += padLeft('', 15);                         // 37-51 (15)
  totals += padLeft(String(validTx.length), 7);      // 52-58 (7)
  totals += padLeft('', 7);                          // 59-65 (7)
  totals += padRight('', 63);                        // 66-128(63)
  assertRecordLength(totals, 'totals');
  lines.push(totals);

  // ── End Record ──
  const end = '9'.repeat(128);
  assertRecordLength(end, 'end');
  lines.push(end);

  // Final integrity: verify running total matches sum record
  // (This is guaranteed by construction but we double-check)
  const sumFieldValue = totals.substring(21, 36);
  const expectedSum = agorotToMasavField(runningTotalAgorot, 15);
  if (sumFieldValue !== expectedSum) {
    throw new Error('MASAV internal error: totals record sum mismatch');
  }

  return lines.join('\r\n');
}

export function downloadMasavFile(content: string, filename: string) {
  // MASAV files are strict single-byte ASCII
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    if (code > 0x7F) {
      bytes[i] = 32; // Replace any non-ASCII with space
    } else {
      bytes[i] = code;
    }
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
