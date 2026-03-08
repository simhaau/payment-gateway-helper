import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, Trash2, Edit, Copy, Users, Download, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAllCustomers, deleteCustomer, addCustomer, getAllGroups, bulkUpdateCustomers } from '@/lib/db';
import CustomerDialog from './CustomerDialog';
import type { Customer, Group } from '@/lib/types';
import { EMPTY_CUSTOMER } from '@/lib/types';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'פעיל', variant: 'default' },
  paused: { label: 'מושהה', variant: 'secondary' },
  cancelled: { label: 'מבוטל', variant: 'destructive' },
};

export default function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [bulkGroupDialogOpen, setBulkGroupDialogOpen] = useState(false);
  const [bulkGroupId, setBulkGroupId] = useState<string>('');

  const loadData = useCallback(() => {
    Promise.all([getAllCustomers(), getAllGroups()])
      .then(([c, g]) => { setCustomers(c); setGroups(g); });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let result = customers;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.fullName.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.idNumber.includes(q) ||
        c.accountNumber.includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') result = result.filter(c => c.status === statusFilter);
    if (groupFilter !== 'all') result = result.filter(c => String(c.groupId) === groupFilter);
    return result;
  }, [customers, search, statusFilter, groupFilter]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
    await addCustomer({ ...rest, fullName: `${rest.fullName} (העתק)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
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

  const exportCSV = () => {
    const headers = ['שם', 'ת.ז', 'טלפון', 'אימייל', 'בנק', 'סניף', 'חשבון', 'סכום', 'סטטוס'];
    const rows = filtered.map(c => [c.fullName, c.idNumber, c.phone, c.email, c.bankNumber, c.branchNumber, c.accountNumber, c.monthlyAmount, STATUS_MAP[c.status]?.label || c.status]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `customers_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const groupName = (gid: number | null) => {
    if (!gid) return '';
    return groups.find(g => g.id === gid)?.name || '';
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי שם, טלפון, ת.ז, חשבון..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pr-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]">
            <Filter className="h-3.5 w-3.5 ml-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="active">פעיל</SelectItem>
            <SelectItem value="paused">מושהה</SelectItem>
            <SelectItem value="cancelled">מבוטל</SelectItem>
          </SelectContent>
        </Select>
        <Select value={groupFilter} onValueChange={v => { setGroupFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]">
            <Users className="h-3.5 w-3.5 ml-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הקבוצות</SelectItem>
            {groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => { setEditingCustomer(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 ml-1" />
          לקוח חדש
        </Button>
        <Button variant="secondary" onClick={exportCSV}>
          <Download className="h-4 w-4 ml-1" />
          ייצוא
        </Button>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
          <span className="text-sm font-medium">{selected.size} לקוחות נבחרו</span>
          <Button size="sm" variant="secondary" onClick={() => setBulkGroupDialogOpen(true)}>
            שיוך לקבוצה
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>
            בטל בחירה
          </Button>
        </div>
      )}

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        {filtered.length} לקוחות {search || statusFilter !== 'all' || groupFilter !== 'all' ? '(מסוננים)' : ''}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10">
                <Checkbox checked={paged.length > 0 && selected.size === paged.length} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead>שם</TableHead>
              <TableHead>ת.ז</TableHead>
              <TableHead>טלפון</TableHead>
              <TableHead>בנק/סניף/חשבון</TableHead>
              <TableHead>סכום חודשי</TableHead>
              <TableHead>קבוצה</TableHead>
              <TableHead>סטטוס</TableHead>
              <TableHead className="w-24">פעולות</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map(c => (
              <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                <TableCell>
                  <Checkbox checked={selected.has(c.id!)} onCheckedChange={() => toggleSelect(c.id!)} />
                </TableCell>
                <TableCell className="font-medium">{c.fullName}</TableCell>
                <TableCell className="text-muted-foreground text-sm font-mono">{c.idNumber}</TableCell>
                <TableCell className="text-sm font-mono" dir="ltr">{c.phone}</TableCell>
                <TableCell className="text-sm font-mono" dir="ltr">
                  {c.bankNumber && `${c.bankNumber}-${c.branchNumber}-${c.accountNumber}`}
                </TableCell>
                <TableCell className="text-success font-medium">
                  {c.monthlyAmount > 0 ? `₪${c.monthlyAmount.toLocaleString()}` : '-'}
                </TableCell>
                <TableCell>
                  {c.groupId ? <Badge variant="outline">{groupName(c.groupId)}</Badge> : '-'}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_MAP[c.status]?.variant || 'secondary'}>
                    {STATUS_MAP[c.status]?.label || c.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingCustomer(c); setDialogOpen(true); }}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDuplicate(c)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(c.id!)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  {customers.length === 0 ? 'אין לקוחות עדיין. הוסף לקוח חדש כדי להתחיל.' : 'לא נמצאו תוצאות'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>הקודם</Button>
          <span className="text-sm text-muted-foreground">עמוד {page + 1} מתוך {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>הבא</Button>
        </div>
      )}

      {/* Customer Dialog */}
      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customer={editingCustomer}
        groups={groups}
        onSaved={loadData}
      />

      {/* Delete Confirm */}
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

      {/* Bulk Group Dialog */}
      <AlertDialog open={bulkGroupDialogOpen} onOpenChange={setBulkGroupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>שיוך {selected.size} לקוחות לקבוצה</AlertDialogTitle>
          </AlertDialogHeader>
          <Select value={bulkGroupId} onValueChange={setBulkGroupId}>
            <SelectTrigger>
              <SelectValue placeholder="בחר קבוצה" />
            </SelectTrigger>
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
