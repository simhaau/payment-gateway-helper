import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Check, AlertCircle, Banknote, TrendingDown, CreditCard, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { getAllCustomers, getAllDebts, addDebt, updateDebt } from '@/lib/db';
import type { Customer, DebtRecord } from '@/lib/types';
import { toast } from 'sonner';

export default function DebtsView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
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

  const loadData = () => {
    Promise.all([getAllCustomers(), getAllDebts()])
      .then(([c, d]) => { setCustomers(c); setDebts(d); });
  };

  useEffect(() => { loadData(); }, []);

  const cashCustomers = useMemo(() =>
    customers.filter(c => c.status === 'active' && (c.paymentMethod === 'cash' || c.paymentMethod === 'mixed')),
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
    toast.success(newStatus === 'paid' ? 'החוב סולק במלואו' : `שולם ₪${payAmount} חלקית`);
    setPayDialog(null);
    setPayAmount(0);
    loadData();
  };

  const handleAdvancePayment = async () => {
    if (!advanceCustomerId) return;
    const cust = customers.find(c => c.id === Number(advanceCustomerId));
    if (!cust) return;
    const now = new Date();
    const baseMonth = new Date(now.getFullYear(), now.getMonth());

    for (let i = 0; i < advanceMonths; i++) {
      const m = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + i + 1);
      const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const existing = debts.find(d => d.customerId === cust.id && d.month === month);
      if (existing) continue;
      const cashAmt = cust.paymentMethod === 'mixed' ? cust.cashAmount : cust.monthlyAmount;
      await addDebt({
        customerId: cust.id!,
        customerName: cust.nickname || cust.fullName,
        month,
        amount: cashAmt,
        paidAmount: cashAmt,
        status: 'advance',
        paidDate: new Date().toISOString().split('T')[0],
        notes: 'תשלום מראש',
        createdAt: new Date().toISOString(),
      });
    }
    toast.success(`${advanceMonths} חודשים שולמו מראש`);
    setAdvanceDialog(false);
    setAdvanceCustomerId('');
    setAdvanceMonths(1);
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
              <TableHead className="w-24">פעולות</TableHead>
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
                <TableCell>
                  {d.status !== 'paid' && d.status !== 'advance' && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setPayDialog(d); setPayAmount(d.amount - d.paidAmount); }}
                      >
                        <Banknote className="h-3 w-3 ml-1" />
                        שלם
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filteredDebts.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
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
            <DialogDescription>שלם עבור חודשים עתידיים</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>לקוח</Label>
              <Select value={advanceCustomerId} onValueChange={v => {
                setAdvanceCustomerId(v);
                const c = cashCustomers.find(c => c.id === Number(v));
                if (c) setAdvanceAmount(c.paymentMethod === 'mixed' ? c.cashAmount : c.monthlyAmount);
              }}>
                <SelectTrigger><SelectValue placeholder="בחר לקוח" /></SelectTrigger>
                <SelectContent>
                  {cashCustomers.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nickname || c.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>מספר חודשים</Label>
              <Input type="number" dir="ltr" min={1} max={12} value={advanceMonths} onChange={e => setAdvanceMonths(Number(e.target.value) || 1)} />
            </div>
            {advanceCustomerId && (
              <p className="text-sm text-muted-foreground">
                סה"כ: ₪{(advanceAmount * advanceMonths).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setAdvanceDialog(false)}>ביטול</Button>
            <Button onClick={handleAdvancePayment} disabled={!advanceCustomerId}>
              <Check className="h-4 w-4 ml-1" />
              שלם מראש
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
