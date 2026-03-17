/**
 * Integer-based monetary arithmetic engine.
 * All amounts stored and calculated in agorot (1/100 shekel) to prevent floating-point errors.
 */

/** Convert shekel amount (float) to agorot (integer). Rounds to nearest agorot. */
export function toAgorot(shekelAmount: number): number {
  return Math.round(shekelAmount * 100);
}

/** Convert agorot (integer) back to shekel for display */
export function toShekel(agorotAmount: number): number {
  return agorotAmount / 100;
}

/** Safe addition in agorot */
export function addAgorot(...amounts: number[]): number {
  return amounts.reduce((sum, a) => sum + Math.round(a), 0);
}

/** Format agorot as shekel string for MASAV (no decimal point, padded) */
export function agorotToMasavField(agorot: number, fieldLen: number): string {
  const val = Math.abs(Math.round(agorot));
  return String(val).padStart(fieldLen, '0').slice(-fieldLen);
}

/** Validate that the sum of individual amounts matches the total */
export function validateAmountReconciliation(
  individualAmounts: number[],
  declaredTotal: number
): { valid: boolean; calculated: number; difference: number } {
  const calculated = individualAmounts.reduce((sum, a) => sum + Math.round(a), 0);
  const rounded = Math.round(declaredTotal);
  return {
    valid: calculated === rounded,
    calculated,
    difference: Math.abs(calculated - rounded),
  };
}
