import { useState, useEffect, useMemo } from 'react';
import { ArrowRight, User, CreditCard, Banknote, Calendar, TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Clock, Zap, Building2, Shuffle, FileText, Plus, Trash2, EyeOff, Eye, Pencil, Download, FileSpreadsheet, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getDebtsByCustomer, getSettings, getAllActivities, getAllBatches, addDebt, updateDebt, deleteDebt, addActivity } from '@/lib/db';
import { getCustomerMonthlyAmount } from '@/lib/billing';
import type { Customer, DebtRecord, Settings, ActivityLog, BillingBatch } from '@/lib/types';
import { toast } from 'sonner';

interface Props {
  customer: Customer;
  onBack: () => void;
}

export default function CustomerDetailView({ customer, onBack }: Props) {
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [addChargeDialog, setAddChargeDialog] = useState(false);
  const [chargeType, setChargeType] = useState<'money' | 'amperes'>('money');
  const [chargeAmount, setChargeAmount] = useState(0);
  const [chargeAmperes, setChargeAmperes] = useState(0);
  const [chargeMonth, setChargeMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [chargeNotes, setChargeNotes] = useState('');

  const [editDialog, setEditDialog] = useState<DebtRecord | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editNotes, setEditNotes] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<DebtRecord | null>(null);

  const loadData = () => {
    Promise.all([
      getDebtsByCustomer(customer.id!),
      getSettings(),
      getAllActivities(),
      getAllBatches(),
    ]).then(([d, s, a, b]) => {
      setDebts(d);
      setSettings(s);
      setActivities(a.filter(act => act.customerId === customer.id));
      setBatches(b);
    });
  };

  useEffect(() => { loadData(); }, [customer.id]);

  const pricePerAmpere = settings?.pricePerAmpere || 0;
  const monthlyAmount = getCustomerMonthlyAmount(customer, pricePerAmpere);
  const displayName = customer.nickname || customer.fullName;

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const currentMonthDebts = useMemo(() => debts.filter(d => d.month === currentMonth), [debts, currentMonth]);
  const activeCurrentDebts = useMemo(() => currentMonthDebts.filter(d => d.status !== 'suspended'), [currentMonthDebts]);
  const currentMonthTotal = activeCurrentDebts.reduce((s, d) => s + d.amount, 0);
  const currentMonthPaid = activeCurrentDebts.reduce((s, d) => s + d.paidAmount, 0);
  const currentMonthBalance = currentMonthTotal - currentMonthPaid;
  const currentMonthPending = activeCurrentDebts.filter(d => d.status === 'pending_collection').reduce((s, d) => s + (d.amount - d.paidAmount), 0);

  const baseDebts = useMemo(() => activeCurrentDebts.filter(d => !d.notes || (!d.notes.includes('אמפרים נוספים') && !d.notes.includes('חיוב נוסף'))), [activeCurrentDebts]);
  const extraDebts = useMemo(() => activeCurrentDebts.filter(d => d.notes && (d.notes.includes('אמפרים נוספים') || d.notes.includes('חיוב נוסף'))), [activeCurrentDebts]);
  const baseTotal = baseDebts.reduce((s, d) => s + d.amount, 0);
  const extrasTotal = extraDebts.reduce((s, d) => s + d.amount, 0);

  const activeDebts = useMemo(() => debts.filter(d => d.status !== 'suspended'), [debts]);
  const totalEverCharged = useMemo(() => activeDebts.reduce((s, d) => s + d.amount, 0), [activeDebts]);
  const totalEverPaid = useMemo(() => activeDebts.reduce((s, d) => s + d.paidAmount, 0), [activeDebts]);
  const openDebtTotal = useMemo(() =>
    activeDebts.filter(d => d.status !== 'paid' && d.status !== 'advance').reduce((s, d) => s + (d.amount - d.paidAmount), 0),
    [activeDebts]
  );
  const suspendedCount = useMemo(() => debts.filter(d => d.status === 'suspended').length, [debts]);

  const customerBatches = useMemo(() => {
    return batches
      .filter(b => b.transactions.some(t => t.customerId === customer.id && t.status === 'included'))
      .map(b => {
        const tx = b.transactions.find(t => t.customerId === customer.id)!;
        return { ...b, customerAmount: tx.amount };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [batches, customer.id]);

  const futureMonthDebts = useMemo(() => debts.filter(d => d.month > currentMonth), [debts, currentMonth]);

  const futureMonthBreakdown = useMemo(() => {
    const map = new Map<string, { debts: DebtRecord[]; total: number }>();
    futureMonthDebts.forEach(d => {
      const existing = map.get(d.month) || { debts: [], total: 0 };
      existing.debts.push(d);
      if (d.status !== 'suspended') existing.total += d.amount;
      map.set(d.month, existing);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => ({ month, ...data }));
  }, [futureMonthDebts]);

  const monthlyBreakdown = useMemo(() => {
    const map = new Map<string, { debts: DebtRecord[]; total: number; paid: number; pending: number }>();
    debts.forEach(d => {
      const existing = map.get(d.month) || { debts: [], total: 0, paid: 0, pending: 0 };
      existing.debts.push(d);
      if (d.status !== 'suspended') {
        existing.total += d.amount;
        existing.paid += d.paidAmount;
        if (d.status === 'pending_collection') existing.pending += (d.amount - d.paidAmount);
      }
      map.set(d.month, existing);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, data]) => ({ month, ...data, balance: data.total - data.paid }));
  }, [debts]);

  const sortedActivities = useMemo(() =>
    [...activities].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50),
    [activities]
  );

  const handleAddCharge = async () => {
    const amount = chargeType === 'amperes' ? chargeAmperes * pricePerAmpere : chargeAmount;
    if (amount <= 0) { toast.error('סכום חייב להיות גדול מ-0'); return; }
    const notes = chargeType === 'amperes'
      ? `חיוב נוסף: ${chargeAmperes} אמפרים${chargeNotes ? ' - ' + chargeNotes : ''}`
      : `חיוב נוסף${chargeNotes ? ': ' + chargeNotes : ''}`;
    await addDebt({
      customerId: customer.id!,
      customerName: customer.fullName,
      month: chargeMonth,
      amount,
      paidAmount: 0,
      status: 'unpaid',
      paidDate: '',
      notes,
      createdAt: new Date().toISOString(),
    });
    await addActivity({
      type: 'extra_charge',
      description: `חיוב נוסף ₪${amount.toLocaleString()} עבור ${displayName} (${chargeMonth}) — ${notes}`,
      customerId: customer.id!,
      customerName: customer.fullName,
      amount,
      createdAt: new Date().toISOString(),
    });
    toast.success(`חיוב ₪${amount.toLocaleString()} נוסף בהצלחה`);
    setAddChargeDialog(false);
    setChargeAmount(0);
    setChargeAmperes(0);
    setChargeNotes('');
    loadData();
  };

  const handleSuspend = async (debt: DebtRecord) => {
    await updateDebt({ ...debt, status: 'suspended' });
    await addActivity({
      type: 'other',
      description: `חיוב ₪${debt.amount.toLocaleString()} הוסתר (מושהה) עבור ${displayName} (${debt.month})`,
      customerId: customer.id!,
      customerName: customer.fullName,
      amount: debt.amount,
      createdAt: new Date().toISOString(),
    });
    toast.success('החיוב הוסתר');
    loadData();
  };

  const handleUnsuspend = async (debt: DebtRecord) => {
    await updateDebt({ ...debt, status: 'unpaid' });
    await addActivity({
      type: 'other',
      description: `חיוב ₪${debt.amount.toLocaleString()} הוחזר לפעיל עבור ${displayName} (${debt.month})`,
      customerId: customer.id!,
      customerName: customer.fullName,
      amount: debt.amount,
      createdAt: new Date().toISOString(),
    });
    toast.success('החיוב הוחזר');
    loadData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteDebt(deleteTarget.id!);
    await addActivity({
      type: 'debt_deleted',
      description: `חיוב ₪${deleteTarget.amount.toLocaleString()} נמחק עבור ${displayName} (${deleteTarget.month})`,
      customerId: customer.id!,
      customerName: customer.fullName,
      amount: deleteTarget.amount,
      createdAt: new Date().toISOString(),
    });
    toast.success('החיוב נמחק');
    setDeleteTarget(null);
    loadData();
  };

  const handleEdit = async () => {
    if (!editDialog) return;
    if (editAmount <= 0) { toast.error('סכום חייב להיות גדול מ-0'); return; }
    const oldAmount = editDialog.amount;
    await updateDebt({ ...editDialog, amount: editAmount, notes: editNotes });
    await addActivity({
      type: 'other',
      description: `חיוב עודכן עבור ${displayName} (${editDialog.month}): ₪${oldAmount.toLocaleString()} → ₪${editAmount.toLocaleString()}`,
      customerId: customer.id!,
      customerName: customer.fullName,
      amount: editAmount,
      createdAt: new Date().toISOString(),
    });
    toast.success('החיוב עודכן');
    setEditDialog(null);
    loadData();
  };

  const handleExportCustomerPDF = async () => {
    try {
      const { exportTableToPDF } = await import('@/lib/pdfExport');
      await exportTableToPDF({
        title: `דוח לקוח: ${customer.fullName}${customer.nickname ? ` (${customer.nickname})` : ''}`,
        subtitle: `אמפרים: ${customer.amperes || 0} • סכום חודשי: ₪${monthlyAmount.toLocaleString()} • חוב פתוח: ₪${openDebtTotal.toLocaleString()}`,
        headers: ['חודש', 'חיובים', 'סה"כ', 'שולם', 'ממתין', 'יתרה', 'סטטוס'],
        rows: monthlyBreakdown.map(m => [
          m.month,
          m.debts.length.toString(),
          `₪${m.total.toLocaleString()}`,
          `₪${m.paid.toLocaleString()}`,
          m.pending > 0 ? `₪${m.pending.toLocaleString()}` : '—',
          `₪${m.balance.toLocaleString()}`,
          m.debts.filter(d => d.status !== 'suspended').every(d => d.status === 'paid') ? 'שולם' :
          m.pending > 0 ? 'ממתין' : m.balance > 0 ? 'חוב' : 'לא שולם',
        ]),
        totalsRow: ['סה"כ', debts.length.toString(), `₪${totalEverCharged.toLocaleString()}`, `₪${totalEverPaid.toLocaleString()}`, '', `₪${(totalEverCharged - totalEverPaid).toLocaleString()}`, ''],
        filename: `customer_${customer.id}_report.pdf`,
      });
      toast.success('PDF יוצא בהצלחה');
    } catch (e) {
      console.error('PDF export error:', e);
      toast.error('שגיאה בייצוא PDF');
    }
  };

  const handleExportCustomerExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wsData = [
        [`דוח לקוח: ${customer.fullName}`],
        [],
        ['חודש', 'מספר חיובים', 'סה"כ', 'שולם', 'ממתין', 'יתרה', 'סטטוס'],
        ...monthlyBreakdown.map(m => [
          m.month, m.debts.length, m.total, m.paid, m.pending,  m.balance,
          m.debts.every(d => d.status === 'paid') ? 'שולם' : m.pending > 0 ? 'ממתין' : m.balance > 0 ? 'חוב' : 'לא שולם',
        ]),
        [],
        ['סה"כ', debts.length, totalEverCharged, totalEverPaid, '', totalEverCharged - totalEverPaid, ''],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'דוח');
      XLSX.writeFile(wb, `customer_${customer.id}_report.xlsx`);
      toast.success('Excel יוצא בהצלחה');
    } catch (e) {
      toast.error('שגיאה בייצוא Excel');
    }
  };

  const paymentMethodLabel = {
    bank: { label: 'הוראת קבע (בנק)', icon: Building2, color: 'text-primary' },
    cash: { label: 'מזומן', icon: Banknote, color: 'text-success' },
    mixed: { label: 'משולב', icon: Shuffle, color: 'text-warning' },
  }[customer.paymentMethod || 'bank'];

  const statusLabel = {
    active: { label: 'פעיל', color: 'bg-success/15 text-success border-success/30' },
    paused: { label: 'מושהה', color: 'bg-warning/15 text-warning border-warning/30' },
    cancelled: { label: 'מבוטל', color: 'bg-destructive/15 text-destructive border-destructive/30' },
  }[customer.status];

  const getDebtStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-success/15 text-success border-success/30 text-xs">שולם</Badge>;
      case 'partial': return <Badge variant="outline" className="text-warning border-warning/30 text-xs">חלקי</Badge>;
      case 'advance': return <Badge className="bg-primary/15 text-primary border-primary/30 text-xs">מראש</Badge>;
      case 'suspended': return <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30 text-xs">מושהה</Badge>;
      case 'pending_collection': return <Badge className="bg-warning/15 text-warning border-warning/30 text-xs">ממתין לגביה</Badge>;
      default: return <Badge variant="destructive" className="text-xs">לא שולם</Badge>;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'payment': return <Banknote className="h-3.5 w-3.5 text-success" />;
      case 'batch': return <CreditCard className="h-3.5 w-3.5 text-primary" />;
      case 'batch_collected': return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
      case 'extra_charge': return <Zap className="h-3.5 w-3.5 text-warning" />;
      case 'advance': return <TrendingUp className="h-3.5 w-3.5 text-primary" />;
      case 'cash_override': return <Banknote className="h-3.5 w-3.5 text-success" />;
      case 'debt_deleted': return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const renderChargeActions = (d: DebtRecord) => {
    if (d.status === 'paid') return null;
    return (
      <div className="flex items-center gap-1">
        {d.status === 'suspended' ? (
          <Button variant="ghost" size="icon" className="h-7 w-7" title="החזר חיוב" onClick={() => handleUnsuspend(d)}>
            <Eye className="h-3.5 w-3.5 text-success" />
          </Button>
        ) : d.status !== 'pending_collection' ? (
          <Button variant="ghost" size="icon" className="h-7 w-7" title="הסתר חיוב" onClick={() => handleSuspend(d)}>
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" className="h-7 w-7" title="ערוך" onClick={() => { setEditDialog(d); setEditAmount(d.amount); setEditNotes(d.notes); }}>
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="מחק" onClick={() => setDeleteTarget(d)}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
            <ArrowRight className="h-4 w-4" />
            חזור
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{displayName}</h2>
              {customer.nickname && <p className="text-sm text-muted-foreground" dir="ltr">{customer.fullName}</p>}
            </div>
            <Badge className={statusLabel.color}>{statusLabel.label}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setAddChargeDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            הוסף חיוב
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCustomerPDF} className="gap-1">
            <FileText className="h-3.5 w-3.5" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCustomerExcel} className="gap-1">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </Button>
        </div>
      </div>

      {/* Quick Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">אמפרים</p>
            <p className="text-xl font-bold mt-1">{customer.amperes || 0}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">סכום חודשי</p>
            <p className="text-xl font-bold text-success mt-1">₪{monthlyAmount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">חיוב החודש</p>
            <p className={`text-xl font-bold mt-1 ${currentMonthBalance > 0 ? 'text-destructive' : currentMonthTotal > 0 ? 'text-success' : ''}`}>
              {currentMonthTotal > 0 ? `₪${currentMonthTotal.toLocaleString()}` : `₪${monthlyAmount.toLocaleString()}`}
            </p>
            {currentMonthPending > 0 && (
              <p className="text-xs text-warning mt-0.5">ממתין: ₪{currentMonthPending.toLocaleString()}</p>
            )}
            {currentMonthBalance <= 0 && currentMonthPaid > 0 && (
              <p className="text-xs text-success mt-0.5">שולם ✓</p>
            )}
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">חוב פתוח</p>
            <p className={`text-xl font-bold mt-1 ${openDebtTotal > 0 ? 'text-destructive' : 'text-success'}`}>
              ₪{openDebtTotal.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">סה"כ שולם</p>
            <p className="text-xl font-bold text-success mt-1">₪{totalEverPaid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">מושהים</p>
            <p className="text-xl font-bold text-muted-foreground mt-1">{suspendedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Customer Details + Current Month */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              פרטי לקוח
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              {customer.idNumber && (
                <div><p className="text-xs text-muted-foreground">ת.ז</p><p className="font-mono" dir="ltr">{customer.idNumber}</p></div>
              )}
              {customer.phone && (
                <div><p className="text-xs text-muted-foreground">טלפון</p><p className="font-mono" dir="ltr">{customer.phone}</p></div>
              )}
              {customer.phone2 && (
                <div><p className="text-xs text-muted-foreground">טלפון נוסף</p><p className="font-mono" dir="ltr">{customer.phone2}</p></div>
              )}
              {customer.email && (
                <div><p className="text-xs text-muted-foreground">אימייל</p><p dir="ltr">{customer.email}</p></div>
              )}
            </div>
            {(customer.city || customer.street || customer.address) && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground">כתובת</p>
                  <p>{[customer.city, customer.street, customer.houseNumber].filter(Boolean).join(', ') || customer.address}</p>
                </div>
              </>
            )}
            <Separator />
            <div className="flex items-center gap-2">
              <paymentMethodLabel.icon className={`h-4 w-4 ${paymentMethodLabel.color}`} />
              <span>{paymentMethodLabel.label}</span>
            </div>
            {(customer.paymentMethod === 'bank' || customer.paymentMethod === 'mixed') && customer.bankNumber && (
              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-xs text-muted-foreground">בנק</p><p className="font-mono" dir="ltr">{customer.bankNumber}</p></div>
                <div><p className="text-xs text-muted-foreground">סניף</p><p className="font-mono" dir="ltr">{customer.branchNumber}</p></div>
                <div><p className="text-xs text-muted-foreground">חשבון</p><p className="font-mono" dir="ltr">{customer.accountNumber}</p></div>
              </div>
            )}
            {customer.accountHolderName && (
              <div><p className="text-xs text-muted-foreground">שם בעל חשבון</p><p>{customer.accountHolderName}</p></div>
            )}
            {customer.paymentMethod === 'mixed' && (
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">סכום בנק</p><p>₪{(customer.bankAmount || 0).toLocaleString()}</p></div>
                <div><p className="text-xs text-muted-foreground">סכום מזומן</p><p>₪{(customer.cashAmount || 0).toLocaleString()}</p></div>
              </div>
            )}
            {customer.authorizationRef && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground">אסמכתא</p><p className="font-mono" dir="ltr">{customer.authorizationRef}</p></div>
                  {customer.authorizationDate && (
                    <div><p className="text-xs text-muted-foreground">תאריך אישור</p><p>{new Date(customer.authorizationDate).toLocaleDateString('he-IL')}</p></div>
                  )}
                </div>
              </>
            )}
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">תאריך התחלה</p>
                <p>{customer.startDate ? new Date(customer.startDate).toLocaleDateString('he-IL') : '—'}</p>
              </div>
              {customer.endDate && (
                <div><p className="text-xs text-muted-foreground">תאריך סיום</p><p>{new Date(customer.endDate).toLocaleDateString('he-IL')}</p></div>
              )}
            </div>
            {customer.notes && (
              <><Separator /><div><p className="text-xs text-muted-foreground">הערות</p><p className="text-muted-foreground">{customer.notes}</p></div></>
            )}
          </CardContent>
        </Card>

        {/* Current Month Status */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                סטטוס חודש נוכחי ({currentMonth})
              </span>
              <Button variant="outline" size="sm" onClick={() => { setChargeMonth(currentMonth); setAddChargeDialog(true); }} className="gap-1 text-xs">
                <Plus className="h-3 w-3" />הוסף
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentMonthDebts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>אין חיובים לחודש הנוכחי</p>
                <p className="text-xs mt-1">חיוב צפוי: ₪{monthlyAmount.toLocaleString()} ({customer.amperes} אמפר)</p>
              </div>
            ) : (
              <div className="space-y-3">
                {currentMonthDebts.map(d => (
                  <div key={d.id} className={`flex items-center justify-between p-3 rounded-lg border border-border/50 ${d.status === 'suspended' ? 'bg-muted/10 opacity-60' : d.status === 'pending_collection' ? 'bg-warning/5 border-warning/20' : d.status === 'paid' ? 'bg-success/5 border-success/20' : 'bg-muted/30'}`}>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        ₪{d.amount.toLocaleString()}
                        {d.notes && <span className="text-xs text-muted-foreground mr-2">({d.notes?.split(' | ')[0]})</span>}
                      </p>
                      {d.paidAmount > 0 && d.paidAmount < d.amount && (
                        <p className="text-xs text-muted-foreground">שולם: ₪{d.paidAmount.toLocaleString()} • יתרה: ₪{(d.amount - d.paidAmount).toLocaleString()}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {getDebtStatusBadge(d.status)}
                      {renderChargeActions(d)}
                    </div>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between text-sm font-medium">
                  <span>סה"כ פעיל</span>
                  <span>₪{currentMonthTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">שולם</span>
                  <span className="text-success">₪{currentMonthPaid.toLocaleString()}</span>
                </div>
                {currentMonthPending > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-warning">ממתין לגביה</span>
                    <span className="text-warning">₪{currentMonthPending.toLocaleString()}</span>
                  </div>
                )}
                {currentMonthBalance > 0 && (
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-destructive">יתרה לתשלום</span>
                    <span className="text-destructive">₪{currentMonthBalance.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Future Charges */}
      {futureMonthBreakdown.length > 0 && (
        <Card className="glass-card border-warning/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-warning" />
              חיובים עתידיים ({futureMonthDebts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {futureMonthBreakdown.map(fm => (
                <div key={fm.month} className="rounded-lg border border-border/50 overflow-hidden">
                  <div className="flex items-center justify-between bg-warning/5 px-4 py-2">
                    <span className="font-mono text-sm font-medium" dir="ltr">{fm.month}</span>
                    <span className="text-sm font-medium">₪{fm.total.toLocaleString()}</span>
                  </div>
                  <Table>
                    <TableBody>
                      {fm.debts.map(d => (
                        <TableRow key={d.id} className={`hover:bg-muted/30 ${d.status === 'suspended' ? 'opacity-50' : ''}`}>
                          <TableCell className="text-sm">{d.notes || 'חיוב'}</TableCell>
                          <TableCell className="font-medium">₪{d.amount.toLocaleString()}</TableCell>
                          <TableCell>{getDebtStatusBadge(d.status)}</TableCell>
                          <TableCell className="text-left">{renderChargeActions(d)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly Breakdown */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-primary" />
            היסטוריית חיובים ({debts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyBreakdown.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">אין היסטוריה</p>
          ) : (
            <div className="space-y-4">
              {monthlyBreakdown.map(m => {
                const allPaid = m.debts.filter(d => d.status !== 'suspended').every(d => d.status === 'paid' || d.status === 'advance');
                const hasPending = m.debts.some(d => d.status === 'pending_collection');
                return (
                  <div key={m.month} className="rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center justify-between bg-muted/50 px-4 py-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-medium" dir="ltr">{m.month}</span>
                        {allPaid && m.total > 0 ? (
                          <Badge className="bg-success/15 text-success border-success/30 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />שולם</Badge>
                        ) : hasPending ? (
                          <Badge className="bg-warning/15 text-warning border-warning/30 text-xs">ממתין לגביה</Badge>
                        ) : m.balance > 0 ? (
                          <Badge variant="destructive" className="text-xs">חוב: ₪{m.balance.toLocaleString()}</Badge>
                        ) : null}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        סה"כ: ₪{m.total.toLocaleString()} | שולם: ₪{m.paid.toLocaleString()}
                        {m.pending > 0 && <span className="text-warning"> | ממתין: ₪{m.pending.toLocaleString()}</span>}
                      </div>
                    </div>
                    <Table>
                      <TableBody>
                        {m.debts.map(d => (
                          <TableRow key={d.id} className={`hover:bg-muted/30 ${d.status === 'suspended' ? 'opacity-50' : ''}`}>
                            <TableCell className="text-sm max-w-[250px]">
                              {d.notes?.split(' | ')[0] || 'חיוב רגיל'}
                            </TableCell>
                            <TableCell className="font-medium">₪{d.amount.toLocaleString()}</TableCell>
                            <TableCell className="text-success">₪{d.paidAmount.toLocaleString()}</TableCell>
                            <TableCell>{getDebtStatusBadge(d.status)}</TableCell>
                            <TableCell className="text-left">{renderChargeActions(d)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batch History */}
      {customerBatches.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              היסטוריית אצוות ({customerBatches.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>אצווה #</TableHead>
                    <TableHead>תאריך</TableHead>
                    <TableHead>תאריך ערך</TableHead>
                    <TableHead>סכום</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerBatches.map(b => (
                    <TableRow key={b.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">#{b.id}</TableCell>
                      <TableCell>{new Date(b.createdAt).toLocaleDateString('he-IL')}</TableCell>
                      <TableCell>{new Date(b.valueDate).toLocaleDateString('he-IL')}</TableCell>
                      <TableCell className="text-success font-medium">₪{b.customerAmount.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={b.status === 'collected' ? 'default' : 'secondary'} className={b.status === 'collected' ? 'bg-success text-success-foreground' : ''}>
                          {b.status === 'collected' ? '✓ נגבה' : b.status === 'pending' ? 'ממתין' : b.status === 'exported' ? 'יוצא' : 'נוצר'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Log */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            יומן פעולות ({sortedActivities.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedActivities.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">אין פעולות</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {sortedActivities.map(a => (
                <div key={a.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="mt-0.5">{getActivityIcon(a.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{a.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(a.createdAt).toLocaleDateString('he-IL')} {new Date(a.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Charge Dialog */}
      <Dialog open={addChargeDialog} onOpenChange={setAddChargeDialog}>
        <DialogContent onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>הוספת חיוב — {displayName}</DialogTitle>
            <DialogDescription>הוסף חיוב נוסף ללקוח. החיוב ייכלל באצווה הבאה.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>סוג</Label>
              <Select value={chargeType} onValueChange={(v: 'money' | 'amperes') => setChargeType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="money">סכום ב-₪</SelectItem>
                  <SelectItem value="amperes">אמפרים נוספים</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {chargeType === 'money' ? (
              <div className="space-y-1.5">
                <Label>סכום (₪)</Label>
                <Input type="number" value={chargeAmount || ''} onChange={e => setChargeAmount(Number(e.target.value))} dir="ltr" placeholder="0" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>אמפרים</Label>
                <Input type="number" value={chargeAmperes || ''} onChange={e => setChargeAmperes(Number(e.target.value))} dir="ltr" placeholder="0" />
                {chargeAmperes > 0 && pricePerAmpere > 0 && (
                  <p className="text-xs text-muted-foreground">= ₪{(chargeAmperes * pricePerAmpere).toLocaleString()}</p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>חודש</Label>
              <input type="month" value={chargeMonth} onChange={e => setChargeMonth(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>הערות</Label>
              <Textarea value={chargeNotes} onChange={e => setChargeNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setAddChargeDialog(false)}>ביטול</Button>
            <Button onClick={handleAddCharge}>הוסף חיוב</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>עריכת חיוב</DialogTitle>
            <DialogDescription>{editDialog?.month}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>סכום (₪)</Label>
              <Input type="number" value={editAmount || ''} onChange={e => setEditAmount(Number(e.target.value))} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>הערות</Label>
              <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditDialog(null)}>ביטול</Button>
            <Button onClick={handleEdit}>שמור</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת חיוב</AlertDialogTitle>
            <AlertDialogDescription>
              האם למחוק: ₪{deleteTarget?.amount.toLocaleString()} ({deleteTarget?.month})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
