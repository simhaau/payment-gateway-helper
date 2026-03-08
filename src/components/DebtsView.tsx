import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Check, AlertCircle, Banknote, TrendingDown, CreditCard, Calendar, Trash2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getAllCustomers, getAllDebts, addDebt, updateDebt, deleteDebt, addActivity, getSettings } from '@/lib/db';
import { getCustomerMonthlyAmount } from '@/lib/billing';
import type { Customer, DebtRecord, Settings } from '@/lib/types';
import { toast } from 'sonner';

export default function DebtsView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [payDialog, setPayDialog] = useState<DebtRecord | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [generateDialog, setGenerateDialog] = useState(false);
  const [generateMonth, setGenerateMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [advanceDialog, setAdvanceDialog] = useState(false);
  const [advanceCustomerId, setAdvanceCustomerId] = useState('');
  const [advanceMode, setAdvanceMode] = useState<'amount' | 'months'>('amount');
  const [advanceTotalAmount, setAdvanceTotalAmount] = useState(0);
  const [advanceMonths, setAdvanceMonths] = useState(1);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<DebtRecord | null>(null);
  // Extra amperes dialog
  const [extraChargeDialog, setExtraChargeDialog] = useState(false);
  const [extraChargeCustomerId, setExtraChargeCustomerId] = useState('');
  const [extraChargeAmperes, setExtraChargeAmperes] = useState(0);
  const [extraChargeNotes, setExtraChargeNotes] = useState('');
  // Cash payment dialog (pay any customer's debt in cash)
  const [cashPayDialog, setCashPayDialog] = useState(false);
  const [cashPayCustomerId, setCashPayCustomerId] = useState('');
  const [cashPayDebtId, setCashPayDebtId] = useState('');
  const [cashPayAmount, setCashPayAmount] = useState(0);

  const loadData = () => {
    Promise.all([getAllCustomers(), getAllDebts()])
      .then(([c, d]) => { setCustomers(c); setDebts(d); });
  };

  useEffect(() => { loadData(); }, []);

  const cashCustomers = useMemo(() =>
    customers.filter(c => c.status === 'active' && (c.paymentMethod === 'cash' || c.paymentMethod === 'mixed')),
    [customers]
  );

  const allActiveCustomers = useMemo(() =>
    customers.filter(c => c.status === 'active'),
    [customers]
  );

  const displayName = (c: Customer) => c.nickname || c.fullName;

  const filteredDebts = useMemo(() => {
    let result = debts;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d => d.customerName.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') result = result.filter(d => d.status === statusFilter);
    return result.sort((a, b) => b.month.localeCompare(a.month) || a.customerName.localeCompare(b.customerName));
  }, [debts, search, statusFilter]);

  const totalDebt = useMemo(() =>
    debts.filter(d => d.status !== 'paid' && d.status !== 'advance')
      .reduce((s, d) => s + (d.amount - d.paidAmount), 0),
    [debts]
  );

  const unpaidCount = useMemo(() => debts.filter(d => d.status === 'unpaid').length, [debts]);
  const partialCount = useMemo(() => debts.filter(d => d.status === 'partial').length, [debts]);

  const handleGenerateDebts = async () => {
    let count = 0;
    for (const c of cashCustomers) {
      const existing = debts.find(d => d.customerId === c.id && d.month === generateMonth);
      if (existing) continue;
      const cashAmt = c.paymentMethod === 'mixed' ? c.cashAmount : c.monthlyAmount;
      if (cashAmt <= 0) continue;
      await addDebt({
        customerId: c.id!,
        customerName: c.nickname || c.fullName,
        month: generateMonth,
        amount: cashAmt,
        paidAmount: 0,
        status: 'unpaid',
        paidDate: '',
        notes: '',
        createdAt: new Date().toISOString(),
      });
      count++;
    }
    toast.success(`${count} חובות נוצרו לחודש ${generateMonth}`);
    setGenerateDialog(false);
    loadData();
  };

  const handlePay = async () => {
    if (!payDialog) return;
    const newPaid = payDialog.paidAmount + payAmount;
    const newStatus = newPaid >= payDialog.amount ? 'paid' : 'partial';
    await updateDebt({
      ...payDialog,
      paidAmount: Math.min(newPaid, payDialog.amount),
      status: newStatus,
      paidDate: newStatus === 'paid' ? new Date().toISOString().split('T')[0] : payDialog.paidDate,
    });
    await addActivity({
      type: 'payment',
      description: `תשלום ₪${payAmount.toLocaleString()} מ${payDialog.customerName} (${payDialog.month}) — ${newStatus === 'paid' ? 'סולק' : 'חלקי'}`,
      customerId: payDialog.customerId,
      customerName: payDialog.customerName,
      amount: payAmount,
      relatedId: payDialog.id,
      createdAt: new Date().toISOString(),
    });
    toast.success(newStatus === 'paid' ? 'החוב סולק במלואו' : `שולם ₪${payAmount} חלקית`);
    setPayDialog(null);
    setPayAmount(0);
    loadData();
  };

  const handleAdvancePayment = async () => {
    if (!advanceCustomerId) return;
    const cust = customers.find(c => c.id === Number(advanceCustomerId));
    if (!cust) return;
    const cashAmt = cust.paymentMethod === 'mixed' ? cust.cashAmount : cust.monthlyAmount;
    if (cashAmt <= 0) { toast.error('לא הוגדר סכום חודשי'); return; }

    const now = new Date();
    const baseMonth = new Date(now.getFullYear(), now.getMonth());

    let monthsToPayFull: number;
    let remainder = 0;

    if (advanceMode === 'amount') {
      if (advanceTotalAmount <= 0) { toast.error('הכנס סכום'); return; }
      monthsToPayFull = Math.floor(advanceTotalAmount / cashAmt);
      remainder = advanceTotalAmount - (monthsToPayFull * cashAmt);
    } else {
      monthsToPayFull = advanceMonths;
    }

    // First settle any existing unpaid/partial debts with the money
    let totalUsed = 0;
    const existingUnpaid = debts
      .filter(d => d.customerId === cust.id && (d.status === 'unpaid' || d.status === 'partial'))
      .sort((a, b) => a.month.localeCompare(b.month));

    if (advanceMode === 'amount') {
      let budget = advanceTotalAmount;
      for (const d of existingUnpaid) {
        if (budget <= 0) break;
        const owed = d.amount - d.paidAmount;
        const pay = Math.min(owed, budget);
        const newPaid = d.paidAmount + pay;
        const newStatus = newPaid >= d.amount ? 'paid' : 'partial';
        await updateDebt({ ...d, paidAmount: newPaid, status: newStatus, paidDate: newStatus === 'paid' ? now.toISOString().split('T')[0] : d.paidDate });
        budget -= pay;
        totalUsed += pay;
      }
      // Recalculate months from remaining budget
      if (budget > 0) {
        monthsToPayFull = Math.floor(budget / cashAmt);
        remainder = budget - (monthsToPayFull * cashAmt);
      } else {
        monthsToPayFull = 0;
        remainder = 0;
      }
    }

    // Create advance records for future months
    let created = 0;
    for (let i = 0; i < monthsToPayFull; i++) {
      const m = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + i + 1);
      const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const existing = debts.find(d => d.customerId === cust.id && d.month === month);
      if (existing) {
        // Pay off existing debt for this month
        if (existing.status !== 'paid' && existing.status !== 'advance') {
          await updateDebt({ ...existing, paidAmount: existing.amount, status: 'advance', paidDate: now.toISOString().split('T')[0], notes: 'תשלום מראש' });
        }
        continue;
      }
      await addDebt({
        customerId: cust.id!,
        customerName: cust.nickname || cust.fullName,
        month,
        amount: cashAmt,
        paidAmount: cashAmt,
        status: 'advance',
        paidDate: now.toISOString().split('T')[0],
        notes: 'תשלום מראש',
        createdAt: now.toISOString(),
      });
      created++;
    }

    // Handle remainder as partial payment for the next month
    if (remainder > 0) {
      const nextM = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + monthsToPayFull + 1);
      const nextMonth = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, '0')}`;
      const existingNext = debts.find(d => d.customerId === cust.id && d.month === nextMonth);
      if (existingNext) {
        const newPaid = Math.min(existingNext.paidAmount + remainder, existingNext.amount);
        await updateDebt({ ...existingNext, paidAmount: newPaid, status: newPaid >= existingNext.amount ? 'advance' : 'partial', paidDate: now.toISOString().split('T')[0] });
      } else {
        await addDebt({
          customerId: cust.id!,
          customerName: cust.nickname || cust.fullName,
          month: nextMonth,
          amount: cashAmt,
          paidAmount: remainder,
          status: 'partial',
          paidDate: now.toISOString().split('T')[0],
          notes: `תשלום מראש חלקי (₪${remainder})`,
          createdAt: now.toISOString(),
        });
      }
    }

    const parts: string[] = [];
    if (totalUsed > 0) parts.push(`₪${totalUsed.toLocaleString()} כיסו חובות קיימים`);
    if (monthsToPayFull > 0) parts.push(`${monthsToPayFull} חודשים שולמו מראש`);
    if (remainder > 0) parts.push(`₪${remainder.toLocaleString()} עודף לחודש הבא`);
    await addActivity({
      type: 'advance',
      description: `תשלום מראש: ${parts.join(' • ')} — ${cust.nickname || cust.fullName}`,
      customerId: cust.id,
      customerName: cust.nickname || cust.fullName,
      amount: advanceMode === 'amount' ? advanceTotalAmount : advanceAmount * advanceMonths,
      createdAt: new Date().toISOString(),
    });
    toast.success(parts.join(' • ') || 'התשלום בוצע');

    setAdvanceDialog(false);
    setAdvanceCustomerId('');
    setAdvanceMonths(1);
    setAdvanceTotalAmount(0);
    loadData();
  };

  const handleDeleteDebt = async () => {
    if (!deleteTarget?.id) return;
    await addActivity({
      type: 'debt_deleted',
      description: `מחיקת חיוב: ₪${deleteTarget.amount.toLocaleString()} של ${deleteTarget.customerName} (${deleteTarget.month})`,
      customerId: deleteTarget.customerId,
      customerName: deleteTarget.customerName,
      amount: deleteTarget.amount,
      createdAt: new Date().toISOString(),
    });
    await deleteDebt(deleteTarget.id);
    toast.success('החיוב נמחק');
    setDeleteTarget(null);
    loadData();
  };

  const handleExtraCharge = async () => {
    if (!extraChargeCustomerId || extraChargeAmount <= 0) return;
    const cust = customers.find(c => c.id === Number(extraChargeCustomerId));
    if (!cust) return;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await addDebt({
      customerId: cust.id!,
      customerName: cust.nickname || cust.fullName,
      month,
      amount: extraChargeAmount,
      paidAmount: 0,
      status: 'unpaid',
      paidDate: '',
      notes: extraChargeNotes || 'חיוב נוסף',
      createdAt: now.toISOString(),
    });
    await addActivity({
      type: 'extra_charge',
      description: `חיוב נוסף: ₪${extraChargeAmount.toLocaleString()} ל${cust.nickname || cust.fullName} (${extraChargeNotes || 'חיוב נוסף'})`,
      customerId: cust.id,
      customerName: cust.nickname || cust.fullName,
      amount: extraChargeAmount,
      createdAt: now.toISOString(),
    });
    toast.success(`חיוב נוסף של ₪${extraChargeAmount.toLocaleString()} נוצר ל${cust.nickname || cust.fullName}`);
    setExtraChargeDialog(false);
    setExtraChargeCustomerId('');
    setExtraChargeAmount(0);
    setExtraChargeNotes('');
    loadData();
  };

  const handleCashPay = async () => {
    if (!cashPayCustomerId || !cashPayDebtId || cashPayAmount <= 0) return;
    const debt = debts.find(d => d.id === Number(cashPayDebtId));
    if (!debt) return;
    const remaining = debt.amount - debt.paidAmount;
    const actualPay = Math.min(cashPayAmount, remaining);
    const newPaid = debt.paidAmount + actualPay;
    const newStatus = newPaid >= debt.amount ? 'paid' : 'partial';
    await updateDebt({
      ...debt,
      paidAmount: newPaid,
      status: newStatus,
      paidDate: newStatus === 'paid' ? new Date().toISOString().split('T')[0] : debt.paidDate,
      notes: debt.notes ? `${debt.notes} | שולם במזומן` : 'שולם במזומן',
    });
    await addActivity({
      type: 'cash_override',
      description: `תשלום במזומן: ₪${actualPay.toLocaleString()} מ${debt.customerName} (${debt.month}) — ${newStatus === 'paid' ? 'סולק' : 'חלקי'}`,
      customerId: debt.customerId,
      customerName: debt.customerName,
      amount: actualPay,
      relatedId: debt.id,
      createdAt: new Date().toISOString(),
    });
    toast.success(newStatus === 'paid' ? `החוב סולק במזומן (₪${actualPay.toLocaleString()})` : `שולם ₪${actualPay.toLocaleString()} במזומן`);
    setCashPayDialog(false);
    setCashPayCustomerId('');
    setCashPayDebtId('');
    setCashPayAmount(0);
    loadData();
  };


  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-success/15 text-success border-success/30">שולם</Badge>;
      case 'partial': return <Badge variant="outline" className="text-warning border-warning/30">חלקי</Badge>;
      case 'advance': return <Badge className="bg-primary/15 text-primary border-primary/30">מראש</Badge>;
      default: return <Badge variant="destructive">לא שולם</Badge>;
    }
  };

  // Group debts by customer for summary
  const customerSummary = useMemo(() => {
    const map = new Map<number, { name: string; total: number; paid: number; count: number }>();
    debts.forEach(d => {
      if (d.status === 'advance') return;
      const existing = map.get(d.customerId) || { name: d.customerName, total: 0, paid: 0, count: 0 };
      existing.total += d.amount;
      existing.paid += d.paidAmount;
      existing.count++;
      map.set(d.customerId, existing);
    });
    return Array.from(map.entries())
      .map(([id, data]) => ({ id, ...data, balance: data.total - data.paid }))
      .filter(s => s.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [debts]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">סה"כ חוב פתוח</p>
                <p className="text-2xl font-bold text-destructive mt-1">₪{totalDebt.toLocaleString()}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-destructive opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">לא שולם</p>
                <p className="text-2xl font-bold mt-1">{unpaidCount}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-destructive opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">תשלום חלקי</p>
                <p className="text-2xl font-bold mt-1">{partialCount}</p>
              </div>
              <Banknote className="h-8 w-8 text-warning opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">לקוחות מזומן</p>
                <p className="text-2xl font-bold mt-1">{cashCustomers.length}</p>
              </div>
              <Banknote className="h-8 w-8 text-success opacity-70" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setGenerateDialog(true)}>
          <Plus className="h-4 w-4 ml-1" />
          צור חובות חודשיים
        </Button>
        <Button variant="secondary" onClick={() => setAdvanceDialog(true)}>
          <Calendar className="h-4 w-4 ml-1" />
          תשלום מראש
        </Button>
        <Button variant="outline" onClick={() => setExtraChargeDialog(true)}>
          <PlusCircle className="h-4 w-4 ml-1" />
          חיוב נוסף
        </Button>
        <Button variant="outline" onClick={() => setCashPayDialog(true)}>
          <Banknote className="h-4 w-4 ml-1" />
          שלם במזומן
        </Button>
      </div>

      {/* Top Debtors */}
      {customerSummary.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-destructive" />
              לקוחות עם חוב ({customerSummary.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {customerSummary.map(s => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.count} חיובים</p>
                  </div>
                  <div className="text-left">
                    <p className="text-destructive font-semibold">₪{s.balance.toLocaleString()}</p>
                    {s.paid > 0 && <p className="text-xs text-muted-foreground">שולם: ₪{s.paid.toLocaleString()}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debts Table */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="חיפוש לפי שם..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="unpaid">לא שולם</SelectItem>
            <SelectItem value="partial">חלקי</SelectItem>
            <SelectItem value="paid">שולם</SelectItem>
            <SelectItem value="advance">מראש</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>לקוח</TableHead>
              <TableHead>חודש</TableHead>
              <TableHead>סכום</TableHead>
              <TableHead>שולם</TableHead>
              <TableHead>יתרה</TableHead>
              <TableHead>סטטוס</TableHead>
              <TableHead>הערות</TableHead>
              <TableHead className="w-32">פעולות</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDebts.map(d => (
              <TableRow key={d.id} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium">{d.customerName}</TableCell>
                <TableCell dir="ltr" className="font-mono text-sm">{d.month}</TableCell>
                <TableCell>₪{d.amount.toLocaleString()}</TableCell>
                <TableCell className="text-success">₪{d.paidAmount.toLocaleString()}</TableCell>
                <TableCell className={d.amount - d.paidAmount > 0 ? 'text-destructive font-medium' : 'text-success'}>
                  ₪{(d.amount - d.paidAmount).toLocaleString()}
                </TableCell>
                <TableCell>{getStatusBadge(d.status)}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={d.notes}>{d.notes}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {d.status !== 'paid' && d.status !== 'advance' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setPayDialog(d); setPayAmount(d.amount - d.paidAmount); }}
                      >
                        <Banknote className="h-3 w-3 ml-1" />
                        שלם
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(d)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredDebts.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  אין חובות להצגה
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pay Dialog */}
      <Dialog open={!!payDialog} onOpenChange={() => setPayDialog(null)}>
        <DialogContent onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>תשלום חוב</DialogTitle>
            <DialogDescription>
              {payDialog?.customerName} - {payDialog?.month} • יתרה: ₪{((payDialog?.amount || 0) - (payDialog?.paidAmount || 0)).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>סכום לתשלום (₪)</Label>
              <Input type="number" dir="ltr" value={payAmount || ''} onChange={e => setPayAmount(Number(e.target.value) || 0)} />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPayAmount((payDialog?.amount || 0) - (payDialog?.paidAmount || 0))}
              >
                מלא
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPayAmount(Math.floor(((payDialog?.amount || 0) - (payDialog?.paidAmount || 0)) / 2))}
              >
                חצי
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setPayDialog(null)}>ביטול</Button>
            <Button onClick={handlePay} disabled={payAmount <= 0}>
              <Check className="h-4 w-4 ml-1" />
              אשר תשלום
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Generate Dialog */}
      <Dialog open={generateDialog} onOpenChange={setGenerateDialog}>
        <DialogContent onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>יצירת חובות חודשיים</DialogTitle>
            <DialogDescription>ייצרו חובות עבור {cashCustomers.length} לקוחות מזומן/משולב</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>חודש</Label>
              <Input type="month" dir="ltr" value={generateMonth} onChange={e => setGenerateMonth(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setGenerateDialog(false)}>ביטול</Button>
            <Button onClick={handleGenerateDebts}>
              <Plus className="h-4 w-4 ml-1" />
              צור חובות
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Advance Payment Dialog */}
      <Dialog open={advanceDialog} onOpenChange={setAdvanceDialog}>
        <DialogContent onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>תשלום מראש</DialogTitle>
            <DialogDescription>שלם סכום חופשי או לפי חודשים — המערכת תחשב אוטומטית</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>לקוח</Label>
              <Select value={advanceCustomerId} onValueChange={v => {
                setAdvanceCustomerId(v);
                const c = allActiveCustomers.find(c => c.id === Number(v));
                if (c) {
                  const amt = c.paymentMethod === 'mixed' ? c.cashAmount : c.monthlyAmount;
                  setAdvanceAmount(amt);
                  if (advanceMode === 'months') setAdvanceTotalAmount(amt * advanceMonths);
                }
              }}>
                <SelectTrigger><SelectValue placeholder="בחר לקוח" /></SelectTrigger>
                <SelectContent>
                  {allActiveCustomers.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nickname || c.fullName} (₪{(c.paymentMethod === 'mixed' ? c.cashAmount : c.monthlyAmount).toLocaleString()}/חודש • {c.paymentMethod === 'bank' ? 'בנק' : c.paymentMethod === 'mixed' ? 'משולב' : 'מזומן'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mode Toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAdvanceMode('amount')}
                className={`p-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                  advanceMode === 'amount'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/30'
                }`}
              >
                💰 לפי סכום
              </button>
              <button
                type="button"
                onClick={() => setAdvanceMode('months')}
                className={`p-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                  advanceMode === 'months'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/30'
                }`}
              >
                📅 לפי חודשים
              </button>
            </div>

            {advanceMode === 'amount' ? (
              <div className="space-y-1.5">
                <Label>סכום ששולם (₪)</Label>
                <Input
                  type="number"
                  dir="ltr"
                  value={advanceTotalAmount || ''}
                  onChange={e => setAdvanceTotalAmount(Number(e.target.value) || 0)}
                  placeholder="למשל 1000"
                />
                {advanceCustomerId && advanceAmount > 0 && advanceTotalAmount > 0 && (
                  <div className="text-sm bg-muted/50 rounded-lg p-3 space-y-1 mt-2">
                    {(() => {
                      const custDebtsUnpaid = debts.filter(d => d.customerId === Number(advanceCustomerId) && (d.status === 'unpaid' || d.status === 'partial'));
                      const existingDebt = custDebtsUnpaid.reduce((s, d) => s + (d.amount - d.paidAmount), 0);
                      const afterDebt = Math.max(0, advanceTotalAmount - existingDebt);
                      const fullMonths = Math.floor(afterDebt / advanceAmount);
                      const rem = afterDebt - (fullMonths * advanceAmount);
                      return (
                        <>
                          {existingDebt > 0 && <p>🔴 כיסוי חוב קיים: <span className="font-semibold">₪{Math.min(existingDebt, advanceTotalAmount).toLocaleString()}</span></p>}
                          {fullMonths > 0 && <p>✅ חודשים מראש: <span className="font-semibold">{fullMonths}</span></p>}
                          {rem > 0 && <p>🟡 עודף לחודש הבא: <span className="font-semibold">₪{rem.toLocaleString()}</span></p>}
                          <p className="text-xs text-muted-foreground pt-1">סכום חודשי: ₪{advanceAmount.toLocaleString()}</p>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>מספר חודשים</Label>
                <Input type="number" dir="ltr" min={1} max={24} value={advanceMonths} onChange={e => {
                  const m = Number(e.target.value) || 1;
                  setAdvanceMonths(m);
                  setAdvanceTotalAmount(advanceAmount * m);
                }} />
                {advanceCustomerId && advanceAmount > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    סה"כ: <span className="font-semibold">₪{(advanceAmount * advanceMonths).toLocaleString()}</span>
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setAdvanceDialog(false)}>ביטול</Button>
            <Button type="button" onClick={handleAdvancePayment} disabled={!advanceCustomerId || (advanceMode === 'amount' && advanceTotalAmount <= 0)}>
              <Check className="h-4 w-4 ml-1" />
              בצע תשלום
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת חיוב</AlertDialogTitle>
            <AlertDialogDescription>
              האם למחוק את החיוב של {deleteTarget?.customerName} לחודש {deleteTarget?.month} (₪{deleteTarget?.amount.toLocaleString()})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDebt} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Extra Charge Dialog */}
      <Dialog open={extraChargeDialog} onOpenChange={setExtraChargeDialog}>
        <DialogContent onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>חיוב נוסף</DialogTitle>
            <DialogDescription>הוסף חיוב חד-פעמי לחודש הנוכחי — ישולם במזומן</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>לקוח</Label>
              <Select value={extraChargeCustomerId} onValueChange={setExtraChargeCustomerId}>
                <SelectTrigger><SelectValue placeholder="בחר לקוח" /></SelectTrigger>
                <SelectContent>
                  {customers.filter(c => c.status === 'active').map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nickname || c.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>סכום (₪)</Label>
              <Input type="number" dir="ltr" value={extraChargeAmount || ''} onChange={e => setExtraChargeAmount(Number(e.target.value) || 0)} placeholder="למשל 200" />
            </div>
            <div className="space-y-1.5">
              <Label>הערה</Label>
              <Textarea value={extraChargeNotes} onChange={e => setExtraChargeNotes(e.target.value)} placeholder="סיבת החיוב..." rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setExtraChargeDialog(false)}>ביטול</Button>
            <Button onClick={handleExtraCharge} disabled={!extraChargeCustomerId || extraChargeAmount <= 0}>
              <PlusCircle className="h-4 w-4 ml-1" />
              צור חיוב
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cash Payment Dialog */}
      <Dialog open={cashPayDialog} onOpenChange={setCashPayDialog}>
        <DialogContent onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>תשלום במזומן</DialogTitle>
            <DialogDescription>בחר לקוח וחוב לתשלום במזומן — גם ללקוחות בנק</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>לקוח</Label>
              <Select value={cashPayCustomerId} onValueChange={v => { setCashPayCustomerId(v); setCashPayDebtId(''); setCashPayAmount(0); }}>
                <SelectTrigger><SelectValue placeholder="בחר לקוח" /></SelectTrigger>
                <SelectContent>
                  {customers.filter(c => c.status === 'active').map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nickname || c.fullName} ({c.paymentMethod === 'bank' ? 'בנק' : c.paymentMethod === 'mixed' ? 'משולב' : 'מזומן'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {cashPayCustomerId && (() => {
              const customerDebts = debts.filter(d => d.customerId === Number(cashPayCustomerId) && d.status !== 'paid' && d.status !== 'advance');
              return customerDebts.length > 0 ? (
                <>
                  <div className="space-y-1.5">
                    <Label>חוב לתשלום</Label>
                    <Select value={cashPayDebtId} onValueChange={v => {
                      setCashPayDebtId(v);
                      const d = customerDebts.find(d => d.id === Number(v));
                      if (d) setCashPayAmount(d.amount - d.paidAmount);
                    }}>
                      <SelectTrigger><SelectValue placeholder="בחר חוב" /></SelectTrigger>
                      <SelectContent>
                        {customerDebts.map(d => (
                          <SelectItem key={d.id} value={String(d.id)}>
                            {d.month} — יתרה ₪{(d.amount - d.paidAmount).toLocaleString()} {d.notes ? `(${d.notes})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {cashPayDebtId && (
                    <div className="space-y-1.5">
                      <Label>סכום לתשלום (₪)</Label>
                      <Input type="number" dir="ltr" value={cashPayAmount || ''} onChange={e => setCashPayAmount(Number(e.target.value) || 0)} />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">אין חובות פתוחים ללקוח זה</p>
              );
            })()}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setCashPayDialog(false)}>ביטול</Button>
            <Button onClick={handleCashPay} disabled={!cashPayDebtId || cashPayAmount <= 0}>
              <Banknote className="h-4 w-4 ml-1" />
              שלם במזומן
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
