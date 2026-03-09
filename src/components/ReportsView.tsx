import { useState, useEffect, useMemo } from 'react';
import { FileText, FileSpreadsheet, BarChart3, TrendingUp, TrendingDown, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  pendingAmount: number;
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
    pending: reportRows.reduce((s, r) => s + r.pendingAmount, 0),
    balance: reportRows.reduce((s, r) => s + r.balance, 0),
  }), [reportRows]);

  const scopeLabel = scope === 'all' ? 'כל הלקוחות' : scope === 'group' ? (groups.find(g => String(g.id) === groupId)?.name || 'קבוצה') : (targetCustomers[0]?.nickname || targetCustomers[0]?.fullName || 'לקוח');
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
        ['שם לקוח', 'חיוב בסיסי', 'חיובים נוספים', 'סה"כ', 'שולם', 'ממתין לגביה', 'יתרה', 'סטטוס'],
        ...reportRows.map(r => [r.customerName, r.baseAmount, r.extraAmount, r.totalAmount, r.paidAmount, r.pendingAmount, r.balance, r.status]),
        [],
        ['סה"כ', totals.base, totals.extra, totals.total, totals.paid, totals.pending, totals.balance, ''],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      XLSX.writeFile(wb, `report_${periodLabel}_${scope}.xlsx`);
      toast.success('Excel יוצא בהצלחה');
    } catch (e) {
      console.error('Excel export error:', e);
      toast.error('שגיאה בייצוא Excel');
    }
  };

  const handleExportPDF = async () => {
    try {
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
      await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.width;

      // Title area
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Collection Report', pageW / 2, 14, { align: 'center' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Period: ${periodLabel} | Scope: ${scope === 'all' ? 'All' : scope} | Generated: ${new Date().toLocaleDateString('en-GB')}`, pageW / 2, 20, { align: 'center' });

      // Summary line
      doc.setFontSize(8);
      doc.text(
        `Total: ${totals.total.toLocaleString()} NIS | Paid: ${totals.paid.toLocaleString()} NIS | Pending: ${totals.pending.toLocaleString()} NIS | Balance: ${totals.balance.toLocaleString()} NIS`,
        pageW / 2, 25, { align: 'center' }
      );

      const tableData = reportRows.map((r, i) => [
        i + 1,
        r.customerName,
        r.baseAmount.toLocaleString(),
        r.extraAmount > 0 ? r.extraAmount.toLocaleString() : '-',
        r.totalAmount.toLocaleString(),
        r.paidAmount.toLocaleString(),
        r.pendingAmount > 0 ? r.pendingAmount.toLocaleString() : '-',
        r.balance.toLocaleString(),
        r.status === 'שולם' ? 'Paid' : r.status === 'ממתין לגביה' ? 'Pending' : r.status === 'חלקי' ? 'Partial' : 'Unpaid',
      ]);

      tableData.push([
        '', 'TOTAL',
        totals.base.toLocaleString(),
        totals.extra > 0 ? totals.extra.toLocaleString() : '-',
        totals.total.toLocaleString(),
        totals.paid.toLocaleString(),
        totals.pending > 0 ? totals.pending.toLocaleString() : '-',
        totals.balance.toLocaleString(),
        '',
      ]);

      (doc as any).autoTable({
        startY: 30,
        head: [['#', 'Customer', 'Base (NIS)', 'Extras', 'Total', 'Paid', 'Pending', 'Balance', 'Status']],
        body: tableData,
        styles: { halign: 'center', fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 40, halign: 'left' },
          8: { cellWidth: 18, halign: 'center' },
        },
        didParseCell: (data: any) => {
          // Bold last row
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [229, 231, 235];
          }
          // Color balance column
          if (data.column.index === 7 && data.row.index < tableData.length - 1) {
            const val = reportRows[data.row.index]?.balance;
            if (val !== undefined && val > 0) data.cell.styles.textColor = [220, 38, 38];
            else data.cell.styles.textColor = [22, 163, 74];
          }
        },
        margin: { top: 30, right: 14, bottom: 14, left: 14 },
      });

      // Footer
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`Page ${i}/${totalPages}`, pageW - 14, doc.internal.pageSize.height - 7, { align: 'right' });
      }

      doc.save(`report_${periodLabel}_${scope}.pdf`);
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
        <CardHeader>
          <CardTitle className="text-base">{reportTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>שם לקוח</TableHead>
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
                {reportRows.map(r => (
                  <TableRow key={`${r.customerId}-${r.month}`} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{r.customerName}</TableCell>
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
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
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
