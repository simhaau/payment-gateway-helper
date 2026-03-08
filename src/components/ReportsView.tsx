import { useState, useEffect, useMemo } from 'react';
import { FileText, Download, FileSpreadsheet, Filter, Users, User, Calendar, TrendingUp, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { getAllCustomers, getAllGroups, getAllDebts, getAllBatches, getSettings } from '@/lib/db';
import { getCustomerMonthlyAmount } from '@/lib/billing';
import type { Customer, Group, DebtRecord, BillingBatch, Settings } from '@/lib/types';
import { toast } from 'sonner';

type ReportScope = 'all' | 'group' | 'single';
type ReportPeriod = 'monthly' | 'yearly';

interface ReportRow {
  customerName: string;
  customerId: number;
  month: string;
  baseAmount: number;
  extraAmount: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  status: string;
}

export default function ReportsView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [scope, setScope] = useState<ReportScope>('all');
  const [groupId, setGroupId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [period, setPeriod] = useState<ReportPeriod>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));

  useEffect(() => {
    Promise.all([getAllCustomers(), getAllGroups(), getAllDebts(), getAllBatches(), getSettings()])
      .then(([c, g, d, b, s]) => { setCustomers(c); setGroups(g); setDebts(d); setBatches(b); setSettings(s); });
  }, []);

  const pricePerAmpere = settings?.pricePerAmpere || 0;

  const targetCustomers = useMemo(() => {
    if (scope === 'group' && groupId) return customers.filter(c => String(c.groupId) === groupId);
    if (scope === 'single' && customerId) return customers.filter(c => String(c.id) === customerId);
    return customers;
  }, [customers, scope, groupId, customerId]);

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
    
    for (const c of targetCustomers) {
      const customerDebts = filteredDebts.filter(d => d.customerId === c.id!);
      if (period === 'monthly') {
        const key = `${c.id}-${selectedMonth}`;
        const base = customerDebts.filter(d => !d.notes || (!d.notes.includes('חיוב נוסף') && !d.notes.includes('אמפרים נוספים')));
        const extras = customerDebts.filter(d => d.notes && (d.notes.includes('חיוב נוסף') || d.notes.includes('אמפרים נוספים')));
        const baseAmt = base.reduce((s, d) => d.status !== 'suspended' ? s + d.amount : s, 0);
        const extraAmt = extras.reduce((s, d) => d.status !== 'suspended' ? s + d.amount : s, 0);
        const paid = customerDebts.filter(d => d.status !== 'suspended').reduce((s, d) => s + d.paidAmount, 0);
        const total = baseAmt + extraAmt;
        const allPaid = customerDebts.length > 0 && customerDebts.filter(d => d.status !== 'suspended').every(d => d.status === 'paid');
        map.set(key, {
          customerName: c.nickname || c.fullName,
          customerId: c.id!,
          month: selectedMonth,
          baseAmount: baseAmt || getCustomerMonthlyAmount(c, pricePerAmpere),
          extraAmount: extraAmt,
          totalAmount: total || getCustomerMonthlyAmount(c, pricePerAmpere),
          paidAmount: paid,
          balance: (total || getCustomerMonthlyAmount(c, pricePerAmpere)) - paid,
          status: allPaid ? 'שולם' : paid > 0 ? 'חלקי' : customerDebts.some(d => d.status === 'suspended') ? 'מושהה' : 'לא שולם',
        });
      } else {
        // Yearly: group by month
        const months = new Set(customerDebts.map(d => d.month));
        // Also include months where customer should have been charged
        for (let m = 0; m < 12; m++) {
          months.add(`${selectedYear}-${String(m + 1).padStart(2, '0')}`);
        }
        let yearBase = 0, yearExtra = 0, yearPaid = 0;
        for (const month of months) {
          const mDebts = customerDebts.filter(d => d.month === month);
          const base = mDebts.filter(d => !d.notes || (!d.notes.includes('חיוב נוסף') && !d.notes.includes('אמפרים נוספים')));
          const extras = mDebts.filter(d => d.notes && (d.notes.includes('חיוב נוסף') || d.notes.includes('אמפרים נוספים')));
          yearBase += base.filter(d => d.status !== 'suspended').reduce((s, d) => s + d.amount, 0);
          yearExtra += extras.filter(d => d.status !== 'suspended').reduce((s, d) => s + d.amount, 0);
          yearPaid += mDebts.filter(d => d.status !== 'suspended').reduce((s, d) => s + d.paidAmount, 0);
        }
        const total = yearBase + yearExtra;
        map.set(`${c.id}-year`, {
          customerName: c.nickname || c.fullName,
          customerId: c.id!,
          month: selectedYear,
          baseAmount: yearBase,
          extraAmount: yearExtra,
          totalAmount: total,
          paidAmount: yearPaid,
          balance: total - yearPaid,
          status: total > 0 && yearPaid >= total ? 'שולם' : yearPaid > 0 ? 'חלקי' : 'לא שולם',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [targetCustomers, filteredDebts, period, selectedMonth, selectedYear, pricePerAmpere]);

  const totals = useMemo(() => ({
    base: reportRows.reduce((s, r) => s + r.baseAmount, 0),
    extra: reportRows.reduce((s, r) => s + r.extraAmount, 0),
    total: reportRows.reduce((s, r) => s + r.totalAmount, 0),
    paid: reportRows.reduce((s, r) => s + r.paidAmount, 0),
    balance: reportRows.reduce((s, r) => s + r.balance, 0),
  }), [reportRows]);

  const scopeLabel = scope === 'all' ? 'כל הלקוחות' : scope === 'group' ? (groups.find(g => String(g.id) === groupId)?.name || 'קבוצה') : (targetCustomers[0]?.nickname || targetCustomers[0]?.fullName || 'לקוח');
  const periodLabel = period === 'monthly' ? selectedMonth : selectedYear;
  const reportTitle = `דוח ${period === 'monthly' ? 'חודשי' : 'שנתי'} — ${scopeLabel} — ${periodLabel}`;

  const years = useMemo(() => {
    const y = new Set<string>();
    debts.forEach(d => y.add(d.month.substring(0, 4)));
    const cur = String(new Date().getFullYear());
    y.add(cur);
    return Array.from(y).sort().reverse();
  }, [debts]);

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wsData = [
        [reportTitle],
        [],
        ['שם לקוח', 'חיוב בסיסי', 'חיובים נוספים', 'סה"כ', 'שולם', 'יתרה', 'סטטוס'],
        ...reportRows.map(r => [r.customerName, r.baseAmount, r.extraAmount, r.totalAmount, r.paidAmount, r.balance, r.status]),
        [],
        ['סה"כ', totals.base, totals.extra, totals.total, totals.paid, totals.balance, ''],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'דוח');
      XLSX.writeFile(wb, `report_${periodLabel}_${scope}.xlsx`);
      toast.success('קובץ Excel יוצא בהצלחה');
    } catch (e) {
      toast.error('שגיאה בייצוא Excel');
    }
  };

  const handleExportPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      await import('jspdf-autotable');
      
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      
      // Use built-in font (Hebrew won't render perfectly but data will show)
      doc.setFontSize(16);
      doc.text(reportTitle, doc.internal.pageSize.width / 2, 15, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleDateString('he-IL')}`, doc.internal.pageSize.width / 2, 22, { align: 'center' });

      const tableData = reportRows.map(r => [
        r.status,
        r.balance.toLocaleString(),
        r.paidAmount.toLocaleString(),
        r.totalAmount.toLocaleString(),
        r.extraAmount.toLocaleString(),
        r.baseAmount.toLocaleString(),
        r.customerName,
      ]);

      tableData.push([
        '',
        totals.balance.toLocaleString(),
        totals.paid.toLocaleString(),
        totals.total.toLocaleString(),
        totals.extra.toLocaleString(),
        totals.base.toLocaleString(),
        'Total',
      ]);

      (doc as any).autoTable({
        startY: 28,
        head: [['Status', 'Balance', 'Paid', 'Total', 'Extras', 'Base', 'Customer']],
        body: tableData,
        styles: { halign: 'center', fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246], halign: 'center' },
        footStyles: { fillColor: [229, 231, 235], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      doc.save(`report_${periodLabel}_${scope}.pdf`);
      toast.success('קובץ PDF יוצא בהצלחה');
    } catch (e) {
      toast.error('שגיאה בייצוא PDF');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Report Config */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            מערכת דוחות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">היקף</Label>
              <Select value={scope} onValueChange={(v: ReportScope) => setScope(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הלקוחות</SelectItem>
                  <SelectItem value="group">לפי קבוצה</SelectItem>
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

            {scope === 'single' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">לקוח</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="בחר לקוח" /></SelectTrigger>
                  <SelectContent>
                    {customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nickname || c.fullName}</SelectItem>)}
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background" dir="ltr" />
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
            <Button onClick={handleExportPDF} variant="default" className="gap-2">
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">לקוחות בדוח</p>
            <p className="text-xl font-bold mt-1">{reportRows.length}</p>
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
            <p className="text-xl font-bold text-success mt-1">₪{totals.paid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">יתרה</p>
            <p className={`text-xl font-bold mt-1 ${totals.balance > 0 ? 'text-destructive' : 'text-success'}`}>
              ₪{totals.balance.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Report Table */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">{reportTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>שם לקוח</TableHead>
                  <TableHead>חיוב בסיסי</TableHead>
                  <TableHead>חיובים נוספים</TableHead>
                  <TableHead>סה"כ</TableHead>
                  <TableHead>שולם</TableHead>
                  <TableHead>יתרה</TableHead>
                  <TableHead>סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportRows.map(r => (
                  <TableRow key={`${r.customerId}-${r.month}`} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{r.customerName}</TableCell>
                    <TableCell>₪{r.baseAmount.toLocaleString()}</TableCell>
                    <TableCell className={r.extraAmount > 0 ? 'text-warning font-medium' : 'text-muted-foreground'}>
                      {r.extraAmount > 0 ? `₪${r.extraAmount.toLocaleString()}` : '—'}
                    </TableCell>
                    <TableCell className="font-semibold">₪{r.totalAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-success">₪{r.paidAmount.toLocaleString()}</TableCell>
                    <TableCell className={r.balance > 0 ? 'text-destructive font-medium' : 'text-success'}>
                      ₪{r.balance.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'שולם' ? 'default' : r.status === 'חלקי' ? 'secondary' : 'destructive'} className="text-xs">
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {reportRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      אין נתונים לתקופה שנבחרה
                    </TableCell>
                  </TableRow>
                )}
                {reportRows.length > 0 && (
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>סה"כ</TableCell>
                    <TableCell>₪{totals.base.toLocaleString()}</TableCell>
                    <TableCell className="text-warning">₪{totals.extra.toLocaleString()}</TableCell>
                    <TableCell>₪{totals.total.toLocaleString()}</TableCell>
                    <TableCell className="text-success">₪{totals.paid.toLocaleString()}</TableCell>
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
