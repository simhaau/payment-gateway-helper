import { useState, useEffect, useMemo } from 'react';
import { FileText, FileSpreadsheet, BarChart3, TrendingUp, TrendingDown, Users, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAllCustomers, getAllGroups, getAllDebts, getAllBatches, getSettings, getAllPhases } from '@/lib/db';
import { getCustomerMonthlyAmount } from '@/lib/billing';
import { exportTableToPDF } from '@/lib/pdfExport';
import type { Customer, Group, DebtRecord, BillingBatch, Settings, Phase } from '@/lib/types';
import { toast } from 'sonner';

type ReportScope = 'all' | 'group' | 'single' | 'phase';
type ReportPeriod = 'monthly' | 'yearly';

interface ReportRow {
  customerName: string;
  customerId: number;
  month: string;
  baseAmount: number;
  extraAmount: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  balance: number;
  status: string;
  paymentMethod: string;
}

export default function ReportsView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [scope, setScope] = useState<ReportScope>('all');
  const [groupId, setGroupId] = useState('');
  const [phaseId, setPhaseId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [period, setPeriod] = useState<ReportPeriod>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));

  useEffect(() => {
    Promise.all([getAllCustomers(), getAllGroups(), getAllDebts(), getAllBatches(), getSettings(), getAllPhases()])
      .then(([c, g, d, b, s, p]) => { setCustomers(c); setGroups(g); setDebts(d); setBatches(b); setSettings(s); setPhases(p); });
  }, []);

  const pricePerAmpere = settings?.pricePerAmpere || 0;

  const filteredCustomersList = useMemo(() => {
    if (!customerSearch) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(c => c.fullName.toLowerCase().includes(q) || (c.nickname || '').toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, customerSearch]);

  const targetCustomers = useMemo(() => {
    if (scope === 'group' && groupId) return customers.filter(c => String(c.groupId) === groupId);
    if (scope === 'phase' && phaseId) return customers.filter(c => String(c.phaseId) === phaseId);
    if (scope === 'single' && customerId) return customers.filter(c => String(c.id) === customerId);
    return customers;
  }, [customers, scope, groupId, phaseId, customerId]);

  const targetCustomerIds = useMemo(() => new Set(targetCustomers.map(c => c.id!)), [targetCustomers]);

  const filteredDebts = useMemo(() => {
    let filtered = debts.filter(d => targetCustomerIds.has(d.customerId));
    if (period === 'monthly') {
      filtered = filtered.filter(d => d.month === selectedMonth);
    } else {
      filtered = filtered.filter(d => d.month.startsWith(selectedYear));
    }
    return filtered;
  }, [debts, targetCustomerIds, period, selectedMonth, selectedYear]);

  const reportRows = useMemo((): ReportRow[] => {
    const map = new Map<string, ReportRow>();
    const customerMap = new Map(customers.map(c => [c.id!, c]));

    for (const c of targetCustomers) {
      const customerDebts = filteredDebts.filter(d => d.customerId === c.id!);
      if (period === 'monthly') {
        const key = `${c.id}-${selectedMonth}`;
        const base = customerDebts.filter(d => !d.notes || (!d.notes.includes('חיוב נוסף') && !d.notes.includes('אמפרים נוספים') && !d.notes.includes('חיוב גורף')));
        const extras = customerDebts.filter(d => d.notes && (d.notes.includes('חיוב נוסף') || d.notes.includes('אמפרים נוספים') || d.notes.includes('חיוב גורף')));
        const baseAmt = base.reduce((s, d) => d.status !== 'suspended' ? s + d.amount : s, 0);
        const extraAmt = extras.reduce((s, d) => d.status !== 'suspended' ? s + d.amount : s, 0);
        const paid = customerDebts.filter(d => d.status !== 'suspended').reduce((s, d) => s + d.paidAmount, 0);
        const pending = customerDebts.filter(d => d.status === 'pending_collection').reduce((s, d) => s + d.amount, 0);
        const total = baseAmt + extraAmt;
        const expectedBase = getCustomerMonthlyAmount(c, pricePerAmpere);
        const allPaid = customerDebts.length > 0 && customerDebts.filter(d => d.status !== 'suspended').every(d => d.status === 'paid');

        let status = 'לא שולם';
        if (allPaid) status = 'שולם';
        else if (pending > 0) status = 'ממתין לגביה';
        else if (paid > 0) status = 'חלקי';
        else if (customerDebts.some(d => d.status === 'suspended')) status = 'מושהה';

        const pm = c.paymentMethod === 'cash' ? 'מזומן' : c.paymentMethod === 'mixed' ? 'משולב' : 'בנק';

        map.set(key, {
          customerName: c.nickname || c.fullName,
          customerId: c.id!,
          month: selectedMonth,
          baseAmount: baseAmt || expectedBase,
          extraAmount: extraAmt,
          totalAmount: total || expectedBase,
          paidAmount: paid,
          pendingAmount: pending,
          balance: (total || expectedBase) - paid,
          status,
          paymentMethod: pm,
        });
      } else {
        const months = new Set(customerDebts.map(d => d.month));
        let yearBase = 0, yearExtra = 0, yearPaid = 0, yearPending = 0;
        for (const month of months) {
          const mDebts = customerDebts.filter(d => d.month === month);
          const base = mDebts.filter(d => !d.notes || (!d.notes.includes('חיוב נוסף') && !d.notes.includes('אמפרים נוספים') && !d.notes.includes('חיוב גורף')));
          const extras = mDebts.filter(d => d.notes && (d.notes.includes('חיוב נוסף') || d.notes.includes('אמפרים נוספים') || d.notes.includes('חיוב גורף')));
          yearBase += base.filter(d => d.status !== 'suspended').reduce((s, d) => s + d.amount, 0);
          yearExtra += extras.filter(d => d.status !== 'suspended').reduce((s, d) => s + d.amount, 0);
          yearPaid += mDebts.filter(d => d.status !== 'suspended').reduce((s, d) => s + d.paidAmount, 0);
          yearPending += mDebts.filter(d => d.status === 'pending_collection').reduce((s, d) => s + d.amount, 0);
        }
        const total = yearBase + yearExtra;
        const pm = c.paymentMethod === 'cash' ? 'מזומן' : c.paymentMethod === 'mixed' ? 'משולב' : 'בנק';
        map.set(`${c.id}-year`, {
          customerName: c.nickname || c.fullName,
          customerId: c.id!,
          month: selectedYear,
          baseAmount: yearBase,
          extraAmount: yearExtra,
          totalAmount: total,
          paidAmount: yearPaid,
          pendingAmount: yearPending,
          balance: total - yearPaid,
          status: total > 0 && yearPaid >= total ? 'שולם' : yearPending > 0 ? 'ממתין לגביה' : yearPaid > 0 ? 'חלקי' : 'לא שולם',
          paymentMethod: pm,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [targetCustomers, filteredDebts, period, selectedMonth, selectedYear, pricePerAmpere, customers]);

  const totals = useMemo(() => ({
    base: reportRows.reduce((s, r) => s + r.baseAmount, 0),
    extra: reportRows.reduce((s, r) => s + r.extraAmount, 0),
    total: reportRows.reduce((s, r) => s + r.totalAmount, 0),
    paid: reportRows.reduce((s, r) => s + r.paidAmount, 0),
    pending: reportRows.reduce((s, r) => s + r.pendingAmount, 0),
    balance: reportRows.reduce((s, r) => s + r.balance, 0),
  }), [reportRows]);

  const scopeLabel = scope === 'all' ? 'כל הלקוחות' : scope === 'group' ? (groups.find(g => String(g.id) === groupId)?.name || 'קבוצה') : scope === 'phase' ? (phases.find(p => String(p.id) === phaseId)?.name || 'פזה') : (targetCustomers[0]?.nickname || targetCustomers[0]?.fullName || 'לקוח');
  const periodLabel = period === 'monthly' ? selectedMonth : selectedYear;
  const reportTitle = `דוח ${period === 'monthly' ? 'חודשי' : 'שנתי'} — ${scopeLabel} — ${periodLabel}`;

  const years = useMemo(() => {
    const y = new Set<string>();
    debts.forEach(d => y.add(d.month.substring(0, 4)));
    y.add(String(new Date().getFullYear()));
    return Array.from(y).sort().reverse();
  }, [debts]);

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wsData = [
        [reportTitle],
        [],
        ['#', 'שם לקוח', 'אופן תשלום', 'חיוב בסיסי', 'חיובים נוספים', 'סה"כ', 'שולם', 'ממתין לגביה', 'יתרה', 'סטטוס'],
        ...reportRows.map((r, i) => [i + 1, r.customerName, r.paymentMethod, r.baseAmount, r.extraAmount, r.totalAmount, r.paidAmount, r.pendingAmount, r.balance, r.status]),
        [],
        ['', 'סה"כ', '', totals.base, totals.extra, totals.total, totals.paid, totals.pending, totals.balance, ''],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'דוח');
      XLSX.writeFile(wb, `report_${periodLabel}_${scope}.xlsx`);
      toast.success('Excel יוצא בהצלחה');
    } catch (e) {
      console.error('Excel export error:', e);
      toast.error('שגיאה בייצוא Excel');
    }
  };

  const handleExportPDF = async () => {
    try {
      await exportTableToPDF({
        title: reportTitle,
        subtitle: `${reportRows.length} לקוחות • סה"כ: ₪${totals.total.toLocaleString()} • שולם: ₪${totals.paid.toLocaleString()} • יתרה: ₪${totals.balance.toLocaleString()}`,
        headers: ['#', 'שם לקוח', 'תשלום', 'בסיסי', 'נוספים', 'סה"כ', 'שולם', 'ממתין', 'יתרה', 'סטטוס'],
        rows: reportRows.map((r, i) => [
          i + 1, r.customerName, r.paymentMethod,
          `₪${r.baseAmount.toLocaleString()}`,
          r.extraAmount > 0 ? `₪${r.extraAmount.toLocaleString()}` : '—',
          `₪${r.totalAmount.toLocaleString()}`,
          `₪${r.paidAmount.toLocaleString()}`,
          r.pendingAmount > 0 ? `₪${r.pendingAmount.toLocaleString()}` : '—',
          `₪${r.balance.toLocaleString()}`,
          r.status,
        ]),
        totalsRow: ['', 'סה"כ', '', `₪${totals.base.toLocaleString()}`, `₪${totals.extra.toLocaleString()}`, `₪${totals.total.toLocaleString()}`, `₪${totals.paid.toLocaleString()}`, `₪${totals.pending.toLocaleString()}`, `₪${totals.balance.toLocaleString()}`, ''],
        filename: `report_${periodLabel}_${scope}.pdf`,
      });
      toast.success('PDF יוצא בהצלחה');
    } catch (e) {
      console.error('PDF export error:', e);
      toast.error('שגיאה בייצוא PDF: ' + (e instanceof Error ? e.message : 'שגיאה'));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'שולם': return <Badge className="bg-success/15 text-success text-xs">שולם</Badge>;
      case 'ממתין לגביה': return <Badge className="bg-warning/15 text-warning text-xs">ממתין</Badge>;
      case 'חלקי': return <Badge variant="outline" className="text-warning text-xs">חלקי</Badge>;
      case 'מושהה': return <Badge variant="outline" className="text-muted-foreground text-xs">מושהה</Badge>;
      default: return <Badge variant="destructive" className="text-xs">לא שולם</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Config */}
      <Card className="glass-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            מערכת דוחות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">היקף</Label>
              <Select value={scope} onValueChange={(v: ReportScope) => setScope(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הלקוחות</SelectItem>
                  <SelectItem value="group">לפי קבוצה</SelectItem>
                  <SelectItem value="phase">לפי פזה</SelectItem>
                  <SelectItem value="single">לקוח בודד</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scope === 'group' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">קבוצה</Label>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger><SelectValue placeholder="בחר קבוצה" /></SelectTrigger>
                  <SelectContent>
                    {groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {scope === 'phase' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">פזה</Label>
                <Select value={phaseId} onValueChange={setPhaseId}>
                  <SelectTrigger><SelectValue placeholder="בחר פזה" /></SelectTrigger>
                  <SelectContent>
                    {phases.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {scope === 'single' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">לקוח</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="בחר לקוח" /></SelectTrigger>
                  <SelectContent>
                    <div className="p-2"><Input placeholder="חפש..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} className="h-8" /></div>
                    {filteredCustomersList.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nickname || c.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">תקופה</Label>
              <Select value={period} onValueChange={(v: ReportPeriod) => setPeriod(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">חודשי</SelectItem>
                  <SelectItem value="yearly">שנתי</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {period === 'monthly' ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">חודש</Label>
                <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background" dir="ltr" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">שנה</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-4">
            <Button onClick={handleExportPDF} className="gap-2">
              <FileText className="h-4 w-4" />
              ייצוא PDF
            </Button>
            <Button onClick={handleExportExcel} variant="secondary" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              ייצוא Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">לקוחות</p>
            <p className="text-xl font-bold mt-1 flex items-center gap-1"><Users className="h-4 w-4 text-muted-foreground" />{reportRows.length}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">חיוב בסיסי</p>
            <p className="text-xl font-bold mt-1">₪{totals.base.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">חיובים נוספים</p>
            <p className="text-xl font-bold text-warning mt-1">₪{totals.extra.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">שולם</p>
            <p className="text-xl font-bold text-success mt-1 flex items-center gap-1"><TrendingUp className="h-4 w-4" />₪{totals.paid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">ממתין לגביה</p>
            <p className="text-xl font-bold text-warning mt-1">₪{totals.pending.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">יתרה</p>
            <p className={`text-xl font-bold mt-1 flex items-center gap-1 ${totals.balance > 0 ? 'text-destructive' : 'text-success'}`}>
              <TrendingDown className="h-4 w-4" />₪{totals.balance.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{reportTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>שם לקוח</TableHead>
                  <TableHead>תשלום</TableHead>
                  <TableHead>בסיסי</TableHead>
                  <TableHead>נוספים</TableHead>
                  <TableHead>סה"כ</TableHead>
                  <TableHead>שולם</TableHead>
                  <TableHead>ממתין</TableHead>
                  <TableHead>יתרה</TableHead>
                  <TableHead>סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportRows.map((r, i) => (
                  <TableRow key={`${r.customerId}-${r.month}`} className="hover:bg-muted/30">
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.customerName}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.paymentMethod}</Badge></TableCell>
                    <TableCell>₪{r.baseAmount.toLocaleString()}</TableCell>
                    <TableCell className={r.extraAmount > 0 ? 'text-warning font-medium' : 'text-muted-foreground'}>
                      {r.extraAmount > 0 ? `₪${r.extraAmount.toLocaleString()}` : '—'}
                    </TableCell>
                    <TableCell className="font-semibold">₪{r.totalAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-success">₪{r.paidAmount.toLocaleString()}</TableCell>
                    <TableCell className={r.pendingAmount > 0 ? 'text-warning font-medium' : 'text-muted-foreground'}>
                      {r.pendingAmount > 0 ? `₪${r.pendingAmount.toLocaleString()}` : '—'}
                    </TableCell>
                    <TableCell className={r.balance > 0 ? 'text-destructive font-medium' : 'text-success'}>
                      ₪{r.balance.toLocaleString()}
                    </TableCell>
                    <TableCell>{getStatusBadge(r.status)}</TableCell>
                  </TableRow>
                ))}
                {reportRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                      אין נתונים לתקופה שנבחרה
                    </TableCell>
                  </TableRow>
                )}
                {reportRows.length > 0 && (
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell></TableCell>
                    <TableCell>סה"כ</TableCell>
                    <TableCell></TableCell>
                    <TableCell>₪{totals.base.toLocaleString()}</TableCell>
                    <TableCell className="text-warning">₪{totals.extra.toLocaleString()}</TableCell>
                    <TableCell>₪{totals.total.toLocaleString()}</TableCell>
                    <TableCell className="text-success">₪{totals.paid.toLocaleString()}</TableCell>
                    <TableCell className="text-warning">₪{totals.pending.toLocaleString()}</TableCell>
                    <TableCell className={totals.balance > 0 ? 'text-destructive' : 'text-success'}>
                      ₪{totals.balance.toLocaleString()}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
