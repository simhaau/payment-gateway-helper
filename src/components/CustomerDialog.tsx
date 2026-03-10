import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Banknote, Building2, Shuffle, Search } from 'lucide-react';
import { addCustomer, updateCustomer, getSettings, getAllCustomers } from '@/lib/db';
import { getAllBanks, getBranchesForBank, getBankName, getBranchName } from '@/lib/bankData';
import type { Customer, Group, Settings } from '@/lib/types';
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
  const [phone2, setPhone2] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
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
  const [amperes, setAmperes] = useState(0);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'custom'>('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<'active' | 'paused' | 'cancelled'>('active');
  const [groupId, setGroupId] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);

  // Bank search
  const [bankSearch, setBankSearch] = useState('');
  const [branchSearch, setBranchSearch] = useState('');
  // City/street autocomplete
  const [cityFocused, setCityFocused] = useState(false);
  const [streetFocused, setStreetFocused] = useState(false);

  const isEdit = !!customer;
  const pricePerAmpere = settings?.pricePerAmpere || 0;
  const computedMonthly = amperes * pricePerAmpere;

  useEffect(() => {
    Promise.all([getSettings(), getAllCustomers()]).then(([s, c]) => {
      setSettings(s);
      setAllCustomers(c);
    });
  }, []);

  // Autocomplete data
  const existingCities = useMemo(() => {
    const map = new Map<string, number>();
    allCustomers.forEach(c => {
      const v = c.city?.trim();
      if (v) map.set(v, (map.get(v) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [allCustomers]);

  const existingStreets = useMemo(() => {
    const map = new Map<string, number>();
    allCustomers.forEach(c => {
      const v = c.street?.trim();
      if (v) map.set(v, (map.get(v) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [allCustomers]);

  const citySuggestions = useMemo(() => {
    if (!city || !cityFocused) return [];
    const q = city.toLowerCase();
    return existingCities.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 5);
  }, [city, existingCities, cityFocused]);

  const streetSuggestions = useMemo(() => {
    if (!street || !streetFocused) return [];
    const q = street.toLowerCase();
    return existingStreets.filter(s => s.toLowerCase().includes(q) && s.toLowerCase() !== q).slice(0, 5);
  }, [street, existingStreets, streetFocused]);

  // Banks data
  const banks = useMemo(() => getAllBanks(), []);
  const filteredBanks = useMemo(() => {
    if (!bankSearch) return banks;
    const q = bankSearch.toLowerCase();
    return banks.filter(b => b.code.includes(q) || b.name.toLowerCase().includes(q));
  }, [banks, bankSearch]);

  const branches = useMemo(() => bankNumber ? getBranchesForBank(bankNumber) : [], [bankNumber]);
  const filteredBranches = useMemo(() => {
    if (!branchSearch) return branches.slice(0, 50);
    const q = branchSearch.toLowerCase();
    return branches.filter(b => b.branchCode.includes(q) || b.branchName.toLowerCase().includes(q)).slice(0, 50);
  }, [branches, branchSearch]);

  const selectedBankName = bankNumber ? getBankName(bankNumber) : '';
  const selectedBranchName = bankNumber && branchNumber ? getBranchName(bankNumber, branchNumber) : '';

  useEffect(() => {
    if (!open) return;
    if (customer) {
      setFullName(customer.fullName);
      setNickname(customer.nickname || '');
      setIdNumber(customer.idNumber);
      setPhone(customer.phone);
      setPhone2(customer.phone2 || '');
      setEmail(customer.email);
      setCity(customer.city || '');
      setStreet(customer.street || '');
      setHouseNumber(customer.houseNumber || '');
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
      setAmperes(customer.amperes || 0);
      setBillingCycle(customer.billingCycle);
      setStartDate(customer.startDate);
      setEndDate(customer.endDate);
      setStatus(customer.status);
      setGroupId(customer.groupId);
    } else {
      setFullName(''); setNickname(''); setIdNumber(''); setPhone(''); setPhone2(''); setEmail('');
      setCity(''); setStreet(''); setHouseNumber('');
      setNotes(''); setPaymentMethod('bank'); setBankAmount(0); setCashAmount(0);
      setBankNumber(''); setBranchNumber(''); setAccountNumber('');
      setAccountHolderName(''); setAuthorizationRef(''); setAuthorizationDate('');
      setAmperes(0); setBillingCycle('monthly');
      setStartDate(new Date().toISOString().split('T')[0]); setEndDate('');
      setStatus('active'); setGroupId(null);
    }
    setBankSearch(''); setBranchSearch('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (paymentMethod === 'mixed' && computedMonthly > 0) {
      const sum = bankAmount + cashAmount;
      if (sum <= 0 || sum !== computedMonthly) {
        const half = Math.floor(computedMonthly / 2);
        setBankAmount(half);
        setCashAmount(computedMonthly - half);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, computedMonthly]);

  const handleSave = useCallback(async () => {
    if (!fullName.trim()) { toast.error('שם הלקוח חובה'); return; }

    const monthlyAmount = computedMonthly;
    const address = [street, houseNumber, city].filter(Boolean).join(', ');
    let normalizedBankAmount = bankAmount;
    let normalizedCashAmount = cashAmount;

    if (paymentMethod === 'bank') { normalizedBankAmount = monthlyAmount; normalizedCashAmount = 0; }
    if (paymentMethod === 'cash') { normalizedBankAmount = 0; normalizedCashAmount = monthlyAmount; }
    if (paymentMethod === 'mixed') {
      const bank = Math.max(0, Number(bankAmount) || 0);
      const cash = Math.max(0, Number(cashAmount) || 0);
      const totalSplit = bank + cash;
      if (monthlyAmount <= 0) { normalizedBankAmount = 0; normalizedCashAmount = 0; }
      else if (totalSplit <= 0) { const half = Math.floor(monthlyAmount / 2); normalizedBankAmount = half; normalizedCashAmount = monthlyAmount - half; }
      else { const ratio = bank / totalSplit; normalizedBankAmount = Math.round(monthlyAmount * ratio); normalizedCashAmount = monthlyAmount - normalizedBankAmount; }
    }

    try {
      const now = new Date().toISOString();
      const data = {
        fullName, nickname, idNumber, phone, phone2, email, city, street, houseNumber, address, notes,
        paymentMethod, bankAmount: normalizedBankAmount, cashAmount: normalizedCashAmount,
        bankNumber, branchNumber, accountNumber, accountHolderName,
        authorizationRef, authorizationDate, amperes, monthlyAmount,
        billingCycle, startDate, endDate,
        chargeFrequencyMonths: 1, status, groupId, phaseId: null, tags: [] as string[], balance: 0,
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
      toast.error('שגיאה בשמירה');
    }
  }, [fullName, nickname, idNumber, phone, phone2, email, city, street, houseNumber, notes, paymentMethod, bankAmount, cashAmount, bankNumber, branchNumber, accountNumber, accountHolderName, authorizationRef, authorizationDate, amperes, computedMonthly, billingCycle, startDate, endDate, status, groupId, isEdit, customer, onOpenChange, onSaved]);

  const paymentMethodOptions = [
    { value: 'bank', label: 'הוראת קבע', icon: Building2, color: 'text-primary' },
    { value: 'cash', label: 'מזומן', icon: Banknote, color: 'text-success' },
    { value: 'mixed', label: 'משולב', icon: Shuffle, color: 'text-warning' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'עריכת לקוח' : 'לקוח חדש'}</DialogTitle>
          <DialogDescription>{isEdit ? 'ערוך פרטי לקוח' : 'הזן פרטי לקוח חדש'}</DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-6">
          {/* Personal */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-primary">פרטים אישיים</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">שם מלא *</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="ישראל ישראלי" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">כינוי</Label>
                <Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="כינוי" className="h-9" />
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
                <Label className="text-xs text-muted-foreground">טלפון נוסף</Label>
                <Input value={phone2} onChange={e => setPhone2(e.target.value)} type="tel" dir="ltr" placeholder="050-0000000" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">אימייל</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} type="email" dir="ltr" className="h-9" />
              </div>
            </div>
          </div>

          {/* Address with autocomplete */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-primary">כתובת</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 relative">
                <Label className="text-xs text-muted-foreground">עיר</Label>
                <Input value={city} onChange={e => setCity(e.target.value)}
                  onFocus={() => setCityFocused(true)} onBlur={() => setTimeout(() => setCityFocused(false), 200)}
                  placeholder="עיר" className="h-9" />
                {citySuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-popover border border-border rounded-lg shadow-lg mt-1 overflow-hidden">
                    {citySuggestions.map(s => (
                      <button key={s} type="button" className="w-full text-right px-3 py-2 text-sm hover:bg-accent transition-colors"
                        onMouseDown={() => { setCity(s); setCityFocused(false); }}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5 relative">
                <Label className="text-xs text-muted-foreground">רחוב</Label>
                <Input value={street} onChange={e => setStreet(e.target.value)}
                  onFocus={() => setStreetFocused(true)} onBlur={() => setTimeout(() => setStreetFocused(false), 200)}
                  placeholder="רחוב" className="h-9" />
                {streetSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-popover border border-border rounded-lg shadow-lg mt-1 overflow-hidden">
                    {streetSuggestions.map(s => (
                      <button key={s} type="button" className="w-full text-right px-3 py-2 text-sm hover:bg-accent transition-colors"
                        onMouseDown={() => { setStreet(s); setStreetFocused(false); }}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">מספר בית</Label>
                <Input value={houseNumber} onChange={e => setHouseNumber(e.target.value)} dir="ltr" placeholder="12" className="h-9" />
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-primary">אופן תשלום</h3>
            <div className="grid grid-cols-3 gap-2">
              {paymentMethodOptions.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setPaymentMethod(opt.value as 'bank' | 'cash' | 'mixed')}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                    paymentMethod === opt.value
                      ? 'border-primary bg-primary/5 text-primary shadow-sm'
                      : 'border-border hover:border-muted-foreground/30 text-muted-foreground'
                  }`}>
                  <opt.icon className={`h-4 w-4 ${paymentMethod === opt.value ? opt.color : ''}`} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bank Details */}
          {(paymentMethod === 'bank' || paymentMethod === 'mixed') && (
            <div>
              <h3 className="text-sm font-semibold mb-3 text-primary">פרטי חשבון בנק</h3>
              <div className="grid grid-cols-3 gap-3">
                {/* Bank Select */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">בנק</Label>
                  <Select value={bankNumber} onValueChange={v => { setBankNumber(v); setBranchNumber(''); setBranchSearch(''); }}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="בחר בנק">
                        {bankNumber ? `${bankNumber} - ${selectedBankName}` : 'בחר בנק'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2">
                        <Input placeholder="חפש בנק..." value={bankSearch} onChange={e => setBankSearch(e.target.value)} className="h-8" />
                      </div>
                      {filteredBanks.map(b => (
                        <SelectItem key={b.code} value={b.code}>
                          {b.code} — {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Branch Select */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">סניף</Label>
                  <Select value={branchNumber} onValueChange={setBranchNumber} disabled={!bankNumber}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="בחר סניף">
                        {branchNumber ? `${branchNumber} - ${selectedBranchName}` : 'בחר סניף'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2">
                        <Input placeholder="חפש סניף..." value={branchSearch} onChange={e => setBranchSearch(e.target.value)} className="h-8" />
                      </div>
                      {filteredBranches.map(b => (
                        <SelectItem key={b.branchCode} value={b.branchCode}>
                          {b.branchCode} — {b.branchName} ({b.city})
                        </SelectItem>
                      ))}
                      {branches.length > 50 && !branchSearch && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">חפש כדי לראות עוד סניפים...</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">מספר חשבון</Label>
                  <Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} dir="ltr" placeholder="123456789" className="h-9" />
                </div>
              </div>
              {selectedBankName && (
                <p className="text-xs text-muted-foreground mt-2">
                  {selectedBankName}{selectedBranchName ? ` • סניף ${selectedBranchName}` : ''}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">שם בעל החשבון (אנגלית)</Label>
                  <Input value={accountHolderName} onChange={e => setAccountHolderName(e.target.value)} className="h-9" dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">אסמכתא הרשאה</Label>
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
                <Label className="text-xs text-muted-foreground">כמות אמפרים</Label>
                <Input value={amperes || ''} onChange={e => setAmperes(Number(e.target.value) || 0)} type="number" dir="ltr" className="h-9" placeholder="25" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">סכום חודשי</Label>
                <div className="h-9 flex items-center px-3 rounded-lg border border-input bg-muted/50 text-sm font-medium" dir="ltr">
                  {pricePerAmpere > 0 ? `₪${computedMonthly.toLocaleString()} (${amperes} × ₪${pricePerAmpere})` : 'הגדר מחיר לאמפר'}
                </div>
              </div>

              {paymentMethod === 'mixed' && computedMonthly > 0 && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">סכום בנק (₪)</Label>
                    <Input value={bankAmount || ''} onChange={e => { const v = Number(e.target.value) || 0; setBankAmount(v); setCashAmount(computedMonthly - v); }}
                      type="number" dir="ltr" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">סכום מזומן (₪)</Label>
                    <Input value={cashAmount || ''} onChange={e => { const v = Number(e.target.value) || 0; setCashAmount(v); setBankAmount(computedMonthly - v); }}
                      type="number" dir="ltr" className="h-9" />
                    {bankAmount + cashAmount !== computedMonthly && computedMonthly > 0 && (
                      <p className="text-xs text-destructive">הסכומים לא תואמים</p>
                    )}
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">תאריך התחלה</Label>
                <Input value={startDate} onChange={e => setStartDate(e.target.value)} type="date" dir="ltr" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">תאריך סיום</Label>
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
          <div className="flex justify-end gap-3 pt-2 sticky bottom-0 bg-background pb-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button type="button" onClick={handleSave}>{isEdit ? 'שמור' : 'הוסף לקוח'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
