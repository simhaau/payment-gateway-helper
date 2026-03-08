import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Trash2, Edit, Copy, Users, Download, Filter, Upload, Banknote, Building2, Shuffle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAllCustomers, deleteCustomer, addCustomer, getAllGroups, bulkUpdateCustomers, getSettings, getAllDebts } from '@/lib/db';
import { parseCSVCustomers } from '@/lib/csvImport';
import { getCustomerMonthlyAmount } from '@/lib/billing';
import CustomerDialog from './CustomerDialog';
import CustomerDetailView from './CustomerDetailView';
import type { Customer, Group, Settings, DebtRecord } from '@/lib/types';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'פעיל', variant: 'default' },
  paused: { label: 'מושהה', variant: 'secondary' },
  cancelled: { label: 'מבוטל', variant: 'destructive' },
};

const PAYMENT_ICONS: Record<string, { icon: typeof Building2; label: string }> = {
  bank: { icon: Building2, label: 'בנק' },
  cash: { icon: Banknote, label: 'מזומן' },
  mixed: { icon: Shuffle, label: 'משולב' },
};

export default function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [bulkGroupDialogOpen, setBulkGroupDialogOpen] = useState(false);
  const [bulkGroupId, setBulkGroupId] = useState<string>('');
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);

  const loadData = () => {
    Promise.all([getAllCustomers(), getAllGroups(), getSettings(), getAllDebts()])
      .then(([c, g, s, d]) => { setCustomers(c); setGroups(g); setSettings(s); setDebts(d); });
  };

  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const getCustomerTotalThisMonth = (customerId: number) => {
    const customerDebts = debts.filter(d => d.customerId === customerId && d.month === currentMonth);
    const totalCharged = customerDebts.reduce((s, d) => s + d.amount, 0);
    const totalPaid = customerDebts.reduce((s, d) => s + d.paidAmount, 0);
    return { totalCharged, totalPaid, balance: totalCharged - totalPaid, debts: customerDebts };
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    let result = customers;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.fullName.toLowerCase().includes(q) ||
        (c.nickname || '').toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.idNumber.includes(q) ||
        c.accountNumber.includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') result = result.filter(c => c.status === statusFilter);
    if (groupFilter !== 'all') result = result.filter(c => String(c.groupId) === groupFilter);
    if (paymentFilter !== 'all') result = result.filter(c => (c.paymentMethod || 'bank') === paymentFilter);
    return result;
  }, [customers, search, statusFilter, groupFilter, paymentFilter]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const toggleSelect = (id: number) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleAll = () => {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map(c => c.id!)));
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    await deleteCustomer(deleteId);
    toast.success('הלקוח נמחק');
    setDeleteId(null);
    loadData();
  };

  const handleDuplicate = async (c: Customer) => {
    const { id, createdAt, updatedAt, ...rest } = c;
    await addCustomer({ ...rest, fullName: `${rest.fullName} (copy)`, nickname: rest.nickname ? `${rest.nickname} (העתק)` : '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    toast.success('לקוח שוכפל');
    loadData();
  };

  const handleBulkGroup = async () => {
    const groupId = bulkGroupId === 'none' ? null : Number(bulkGroupId);
    const toUpdate = customers.filter(c => selected.has(c.id!)).map(c => ({ ...c, groupId, updatedAt: new Date().toISOString() }));
    await bulkUpdateCustomers(toUpdate);
    toast.success(`${toUpdate.length} לקוחות עודכנו`);
    setSelected(new Set());
    setBulkGroupDialogOpen(false);
    loadData();
  };

  const openNewCustomer = () => { setEditingCustomer(null); setDialogOpen(true); };
  const openEditCustomer = (c: Customer) => { setEditingCustomer(c); setDialogOpen(true); };

  const displayName = (c: Customer) => c.nickname || c.fullName;

  const pricePerAmpere = settings?.pricePerAmpere || 0;

  const exportCSV = () => {
    const headers = ['שם', 'כינוי', 'ת.ז', 'טלפון', 'אימייל', 'תשלום', 'בנק', 'סניף', 'חשבון', 'אמפרים', 'סכום', 'סטטוס'];
    const rows = filtered.map(c => [c.fullName, c.nickname || '', c.idNumber, c.phone, c.email, PAYMENT_ICONS[c.paymentMethod || 'bank']?.label || 'בנק', c.bankNumber, c.branchNumber, c.accountNumber, c.amperes || 0, getCustomerMonthlyAmount(c, pricePerAmpere), STATUS_MAP[c.status]?.label || c.status]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `customers_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleImportCSV = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = parseCSVCustomers(text);
        if (parsed.length === 0) { toast.error('לא נמצאו לקוחות בקובץ'); return; }
        const now = new Date().toISOString();
        let added = 0;
        for (const c of parsed) {
          await addCustomer({ ...c, createdAt: now, updatedAt: now });
          added++;
        }
        toast.success(`${added} לקוחות יובאו בהצלחה`);
        loadData();
      } catch (err) { toast.error('שגיאה בייבוא הקובץ'); }
    };
    input.click();
  };

  const groupName = (gid: number | null) => {
    if (!gid) return '';
    return groups.find(g => g.id === gid)?.name || '';
  };

  if (viewingCustomer) {
    return <CustomerDetailView customer={viewingCustomer} onBack={() => setViewingCustomer(null)} />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="חיפוש לפי שם, כינוי, טלפון, ת.ז..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pr-10" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]"><Filter className="h-3.5 w-3.5 ml-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="active">פעיל</SelectItem>
            <SelectItem value="paused">מושהה</SelectItem>
            <SelectItem value="cancelled">מבוטל</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={v => { setPaymentFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]"><Banknote className="h-3.5 w-3.5 ml-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל התשלומים</SelectItem>
            <SelectItem value="bank">בנק</SelectItem>
            <SelectItem value="cash">מזומן</SelectItem>
            <SelectItem value="mixed">משולב</SelectItem>
          </SelectContent>
        </Select>
        <Select value={groupFilter} onValueChange={v => { setGroupFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><Users className="h-3.5 w-3.5 ml-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הקבוצות</SelectItem>
            {groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={openNewCustomer}><Plus className="h-4 w-4 ml-1" />לקוח חדש</Button>
        <Button variant="secondary" onClick={exportCSV}><Download className="h-4 w-4 ml-1" />ייצוא</Button>
        <Button variant="secondary" onClick={handleImportCSV}><Upload className="h-4 w-4 ml-1" />ייבוא CSV</Button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
          <span className="text-sm font-medium">{selected.size} לקוחות נבחרו</span>
          <Button size="sm" variant="secondary" onClick={() => setBulkGroupDialogOpen(true)}>שיוך לקבוצה</Button>
          <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>בטל בחירה</Button>
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        {filtered.length} לקוחות {search || statusFilter !== 'all' || groupFilter !== 'all' || paymentFilter !== 'all' ? '(מסוננים)' : ''}
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10"><Checkbox checked={paged.length > 0 && selected.size === paged.length} onCheckedChange={toggleAll} /></TableHead>
              <TableHead>שם / כינוי</TableHead>
              <TableHead>ת.ז</TableHead>
              <TableHead>טלפון</TableHead>
              <TableHead>תשלום</TableHead>
              <TableHead>בנק/סניף/חשבון</TableHead>
              <TableHead>אמפרים</TableHead>
              <TableHead>סכום חודשי</TableHead>
              <TableHead>חיוב החודש</TableHead>
              <TableHead>קבוצה</TableHead>
              <TableHead>סטטוס</TableHead>
              <TableHead className="w-24">פעולות</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map(c => {
              const pm = PAYMENT_ICONS[c.paymentMethod || 'bank'];
              const PayIcon = pm?.icon || Building2;
              return (
                <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell><Checkbox checked={selected.has(c.id!)} onCheckedChange={() => toggleSelect(c.id!)} /></TableCell>
                  <TableCell>
                    <div className="cursor-pointer hover:text-primary transition-colors" onClick={() => setViewingCustomer(c)}>
                      <span className="font-medium">{displayName(c)}</span>
                      {c.nickname && <span className="text-xs text-muted-foreground block" dir="ltr">{c.fullName}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm font-mono">{c.idNumber}</TableCell>
                  <TableCell className="text-sm font-mono" dir="ltr">{c.phone}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1 text-xs">
                      <PayIcon className="h-3 w-3" />
                      {pm?.label || 'בנק'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-mono" dir="ltr">
                    {(c.paymentMethod || 'bank') !== 'cash' && c.bankNumber ? `${c.bankNumber}-${c.branchNumber}-${c.accountNumber}` : '-'}
                  </TableCell>
                  <TableCell className="font-medium" dir="ltr">
                    {(c.amperes || 0) > 0 ? c.amperes : '-'}
                  </TableCell>
                  <TableCell className="text-success font-medium">
                    {(() => {
                      const amt = getCustomerMonthlyAmount(c, pricePerAmpere);
                      return amt > 0 ? `₪${amt.toLocaleString()}` : '-';
                    })()}
                    {c.paymentMethod === 'mixed' && (c.amperes || 0) > 0 && (
                      <span className="text-xs text-muted-foreground block">
                        בנק: ₪{(c.bankAmount || 0).toLocaleString()} | מזומן: ₪{(c.cashAmount || 0).toLocaleString()}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const monthData = getCustomerTotalThisMonth(c.id!);
                      if (monthData.totalCharged === 0) return <span className="text-muted-foreground">—</span>;
                      return (
                        <div>
                          <span className={`font-medium ${monthData.balance > 0 ? 'text-destructive' : 'text-success'}`}>
                            ₪{monthData.totalCharged.toLocaleString()}
                          </span>
                          {monthData.balance <= 0 && monthData.totalPaid > 0 && (
                            <span className="text-xs text-success block">שולם ✓</span>
                          )}
                          {monthData.balance > 0 && (
                            <span className="text-xs text-destructive block">יתרה: ₪{monthData.balance.toLocaleString()}</span>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>{c.groupId ? <Badge variant="outline">{groupName(c.groupId)}</Badge> : '-'}</TableCell>
                  <TableCell><Badge variant={STATUS_MAP[c.status]?.variant || 'secondary'}>{STATUS_MAP[c.status]?.label || c.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewingCustomer(c)} title="הצג פרטים"><Eye className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditCustomer(c)}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDuplicate(c)}><Copy className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(c.id!)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                  {customers.length === 0 ? 'אין לקוחות עדיין. הוסף לקוח חדש כדי להתחיל.' : 'לא נמצאו תוצאות'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>הקודם</Button>
          <span className="text-sm text-muted-foreground">עמוד {page + 1} מתוך {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>הבא</Button>
        </div>
      )}

      <CustomerDialog open={dialogOpen} onOpenChange={setDialogOpen} customer={editingCustomer} groups={groups} onSaved={() => loadData()} />

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת לקוח</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את הלקוח? פעולה זו לא ניתנת לביטול.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkGroupDialogOpen} onOpenChange={setBulkGroupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>שיוך {selected.size} לקוחות לקבוצה</AlertDialogTitle>
            <AlertDialogDescription>בחר קבוצה לשיוך הלקוחות הנבחרים</AlertDialogDescription>
          </AlertDialogHeader>
          <Select value={bulkGroupId} onValueChange={setBulkGroupId}>
            <SelectTrigger><SelectValue placeholder="בחר קבוצה" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">ללא קבוצה</SelectItem>
              {groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkGroup} disabled={!bulkGroupId}>שייך</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
