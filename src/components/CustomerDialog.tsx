import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Banknote, Building2, Shuffle } from 'lucide-react';
import { addCustomer, updateCustomer } from '@/lib/db';
import type { Customer, Group } from '@/lib/types';
import { EMPTY_CUSTOMER } from '@/lib/types';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  groups: Group[];
  onSaved: () => void;
}

export default function CustomerDialog({ open, onOpenChange, customer, groups, onSaved }: Props) {
  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'cash' | 'mixed'>('bank');
  const [bankAmount, setBankAmount] = useState(0);
  const [cashAmount, setCashAmount] = useState(0);
  const [bankNumber, setBankNumber] = useState('');
  const [branchNumber, setBranchNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [authorizationRef, setAuthorizationRef] = useState('');
  const [authorizationDate, setAuthorizationDate] = useState('');
  const [monthlyAmount, setMonthlyAmount] = useState(0);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'custom'>('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<'active' | 'paused' | 'cancelled'>('active');
  const [groupId, setGroupId] = useState<number | null>(null);

  const isEdit = !!customer;

  useEffect(() => {
    if (!open) return;
    if (customer) {
      setFullName(customer.fullName);
      setNickname(customer.nickname || '');
      setIdNumber(customer.idNumber);
      setPhone(customer.phone);
      setEmail(customer.email);
      setAddress(customer.address);
      setNotes(customer.notes);
      setPaymentMethod(customer.paymentMethod || 'bank');
      setBankAmount(customer.bankAmount || 0);
      setCashAmount(customer.cashAmount || 0);
      setBankNumber(customer.bankNumber);
      setBranchNumber(customer.branchNumber);
      setAccountNumber(customer.accountNumber);
      setAccountHolderName(customer.accountHolderName);
      setAuthorizationRef(customer.authorizationRef);
      setAuthorizationDate(customer.authorizationDate);
      setMonthlyAmount(customer.monthlyAmount);
      setBillingCycle(customer.billingCycle);
      setStartDate(customer.startDate);
      setEndDate(customer.endDate);
      setStatus(customer.status);
      setGroupId(customer.groupId);
    } else {
      setFullName(''); setNickname(''); setIdNumber(''); setPhone(''); setEmail('');
      setAddress(''); setNotes(''); setPaymentMethod('bank'); setBankAmount(0); setCashAmount(0);
      setBankNumber(''); setBranchNumber(''); setAccountNumber('');
      setAccountHolderName(''); setAuthorizationRef(''); setAuthorizationDate('');
      setMonthlyAmount(0); setBillingCycle('monthly');
      setStartDate(new Date().toISOString().split('T')[0]); setEndDate('');
      setStatus('active'); setGroupId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-split for mixed
  useEffect(() => {
    if (paymentMethod === 'mixed' && monthlyAmount > 0) {
      if (bankAmount + cashAmount !== monthlyAmount) {
        const half = Math.floor(monthlyAmount / 2);
        setBankAmount(half);
        setCashAmount(monthlyAmount - half);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod]);

  const handleSave = useCallback(async () => {
    if (!fullName.trim()) { toast.error('שם הלקוח חובה'); return; }
    if (paymentMethod === 'mixed' && bankAmount + cashAmount !== monthlyAmount) {
      toast.error('סכום הבנק + מזומן חייב להיות שווה לסכום החודשי');
      return;
    }
    try {
      const now = new Date().toISOString();
      const data = {
        fullName, nickname, idNumber, phone, email, address, notes,
        paymentMethod, bankAmount, cashAmount,
        bankNumber, branchNumber, accountNumber, accountHolderName,
        authorizationRef, authorizationDate, monthlyAmount,
        billingCycle, startDate, endDate,
        chargeFrequencyMonths: 1, status, groupId, tags: [] as string[],
      };
      if (isEdit && customer) {
        await updateCustomer({ ...customer, ...data, updatedAt: now });
        toast.success('הלקוח עודכן');
      } else {
        await addCustomer({ ...data, createdAt: now, updatedAt: now });
        toast.success('לקוח נוסף');
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('שגיאה בשמירת הלקוח: ' + (err instanceof Error ? err.message : 'שגיאה לא ידועה'));
    }
  }, [fullName, nickname, idNumber, phone, email, address, notes, paymentMethod, bankAmount, cashAmount, bankNumber, branchNumber, accountNumber, accountHolderName, authorizationRef, authorizationDate, monthlyAmount, billingCycle, startDate, endDate, status, groupId, isEdit, customer, onOpenChange, onSaved]);

  const paymentMethodOptions = [
    { value: 'bank', label: 'הוראת קבע (בנק)', icon: Building2, color: 'text-primary' },
    { value: 'cash', label: 'מזומן', icon: Banknote, color: 'text-success' },
    { value: 'mixed', label: 'משולב', icon: Shuffle, color: 'text-warning' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'עריכת לקוח' : 'לקוח חדש'}</DialogTitle>
          <DialogDescription>{isEdit ? 'ערוך את פרטי הלקוח' : 'הזן את פרטי הלקוח החדש'}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Personal Info */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-primary">פרטים אישיים</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">שם מלא (לבנק - אנגלית) *</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Israel Israeli" className="h-9" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">כינוי (עברית)</Label>
                <Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="ישראל ישראלי" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">תעודת זהות</Label>
                <Input value={idNumber} onChange={e => setIdNumber(e.target.value)} dir="ltr" placeholder="000000000" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">טלפון</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} type="tel" dir="ltr" placeholder="050-0000000" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">אימייל</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} type="email" dir="ltr" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">כתובת</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} className="h-9" />
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-primary">אופן תשלום</h3>
            <div className="grid grid-cols-3 gap-2">
              {paymentMethodOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMethod(opt.value as 'bank' | 'cash' | 'mixed')}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                    paymentMethod === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-muted-foreground/30 text-muted-foreground'
                  }`}
                >
                  <opt.icon className={`h-4 w-4 ${paymentMethod === opt.value ? opt.color : ''}`} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bank Details - show for bank and mixed */}
          {(paymentMethod === 'bank' || paymentMethod === 'mixed') && (
            <div>
              <h3 className="text-sm font-semibold mb-3 text-primary">פרטי חשבון בנק</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">מספר בנק</Label>
                  <Input value={bankNumber} onChange={e => setBankNumber(e.target.value)} dir="ltr" placeholder="12" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">מספר סניף</Label>
                  <Input value={branchNumber} onChange={e => setBranchNumber(e.target.value)} dir="ltr" placeholder="345" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">מספר חשבון</Label>
                  <Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} dir="ltr" placeholder="123456789" className="h-9" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">שם בעל החשבון (אנגלית)</Label>
                  <Input value={accountHolderName} onChange={e => setAccountHolderName(e.target.value)} className="h-9" dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">מספר אסמכתא הרשאה</Label>
                  <Input value={authorizationRef} onChange={e => setAuthorizationRef(e.target.value)} dir="ltr" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">תאריך הרשאה</Label>
                  <Input value={authorizationDate} onChange={e => setAuthorizationDate(e.target.value)} type="date" dir="ltr" className="h-9" />
                </div>
              </div>
            </div>
          )}

          {/* Billing Config */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-primary">הגדרות חיוב</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">סכום חודשי כולל (₪)</Label>
                <Input value={monthlyAmount || ''} onChange={e => setMonthlyAmount(Number(e.target.value) || 0)} type="number" dir="ltr" className="h-9" />
              </div>

              {paymentMethod === 'mixed' && (
                <>
                  <div />
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">סכום דרך הבנק (₪)</Label>
                    <Input
                      value={bankAmount || ''}
                      onChange={e => {
                        const v = Number(e.target.value) || 0;
                        setBankAmount(v);
                        setCashAmount(monthlyAmount - v);
                      }}
                      type="number" dir="ltr" className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">סכום במזומן (₪)</Label>
                    <Input
                      value={cashAmount || ''}
                      onChange={e => {
                        const v = Number(e.target.value) || 0;
                        setCashAmount(v);
                        setBankAmount(monthlyAmount - v);
                      }}
                      type="number" dir="ltr" className="h-9"
                    />
                    {bankAmount + cashAmount !== monthlyAmount && monthlyAmount > 0 && (
                      <p className="text-xs text-destructive">הסכומים לא מסתכמים לסכום החודשי</p>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">מחזור חיוב</Label>
                <Select value={billingCycle} onValueChange={v => setBillingCycle(v as 'monthly' | 'custom')}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">חודשי</SelectItem>
                    <SelectItem value="custom">מותאם אישית</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">תאריך התחלה</Label>
                <Input value={startDate} onChange={e => setStartDate(e.target.value)} type="date" dir="ltr" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">תאריך סיום (אופציונלי)</Label>
                <Input value={endDate} onChange={e => setEndDate(e.target.value)} type="date" dir="ltr" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">סטטוס</Label>
                <Select value={status} onValueChange={v => setStatus(v as 'active' | 'paused' | 'cancelled')}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">פעיל</SelectItem>
                    <SelectItem value="paused">מושהה</SelectItem>
                    <SelectItem value="cancelled">מבוטל</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">קבוצה</Label>
                <Select value={groupId ? String(groupId) : 'none'} onValueChange={v => setGroupId(v === 'none' ? null : Number(v))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא קבוצה</SelectItem>
                    {groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">הערות</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button type="button" onClick={handleSave}>{isEdit ? 'שמור שינויים' : 'הוסף לקוח'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
