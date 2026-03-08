import { useState, useEffect, useMemo } from 'react';
import { Zap, Users, Trash2, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAllCustomers, getAllGroups, getAllDebts, getSettings, addDebt, updateDebt, deleteDebt, addActivity } from '@/lib/db';
import { getCustomerMonthlyAmount } from '@/lib/billing';
import type { Customer, Group, DebtRecord, Settings } from '@/lib/types';
import { toast } from 'sonner';

type ChargeScope = 'all' | 'group';
type ChargeType = 'money' | 'amperes';

export default function BulkChargeView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [scope, setScope] = useState<ChargeScope>('all');
  const [groupId, setGroupId] = useState('');
  const [chargeType, setChargeType] = useState<ChargeType>('money');
  const [amount, setAmount] = useState(0);
  const [amperes, setAmperes] = useState(0);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [notes, setNotes] = useState('');
  const [spreadMonths, setSpreadMonths] = useState(1); // multi-month support
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  // Cancel bulk dialog
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelScope, setCancelScope] = useState<'all' | 'group'>('all');
  const [cancelGroupId, setCancelGroupId] = useState('');
  const [cancelMonth, setCancelMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cancelNotes, setCancelNotes] = useState('');

  const loadData = () => {
    Promise.all([getAllCustomers(), getAllGroups(), getAllDebts(), getSettings()])
      .then(([c, g, d, s]) => { setCustomers(c); setGroups(g); setDebts(d); setSettings(s); });
  };

  useEffect(() => { loadData(); }, []);

  const pricePerAmpere = settings?.pricePerAmpere || 0;

  const targetCustomers = useMemo(() => {
    const active = customers.filter(c => c.status === 'active');
    if (scope === 'group' && groupId) return active.filter(c => String(c.groupId) === groupId);
    return active;
  }, [customers, scope, groupId]);

  const chargeAmount = chargeType === 'amperes' ? amperes * pricePerAmpere : amount;

  // Find existing bulk charges for the current month that match the notes pattern
  const existingBulkCharges = useMemo(() => {
    return debts.filter(d =>
      d.month === month &&
      d.notes?.includes('חיוב גורף') &&
      d.status !== 'paid'
    );
  }, [debts, month]);

  const cancelTargetDebts = useMemo(() => {
    let filtered = debts.filter(d =>
      d.month === cancelMonth &&
      d.notes?.includes('חיוב גורף') &&
      d.status !== 'paid'
    );
    if (cancelScope === 'group' && cancelGroupId) {
      const groupCustIds = new Set(customers.filter(c => String(c.groupId) === cancelGroupId).map(c => c.id!));
      filtered = filtered.filter(d => groupCustIds.has(d.customerId));
    }
    return filtered;
  }, [debts, cancelMonth, cancelScope, cancelGroupId, customers]);

  const handleCreateBulkCharge = async () => {
    if (chargeAmount <= 0) { toast.error('סכום חייב להיות גדול מ-0'); return; }
    setCreating(true);
    try {
      const now = new Date().toISOString();
      const noteText = chargeType === 'amperes'
        ? `חיוב גורף: ${amperes} אמפרים${notes ? ' - ' + notes : ''}`
        : `חיוב גורף${notes ? ': ' + notes : ''}`;

      let count = 0;
      // Create debts for each month in the spread
      for (let m = 0; m < spreadMonths; m++) {
        const [y, mo] = month.split('-').map(Number);
        const targetDate = new Date(y, mo - 1 + m);
        const targetMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
        for (const c of targetCustomers) {
          await addDebt({
            customerId: c.id!,
            customerName: c.fullName,
            month: targetMonth,
            amount: chargeAmount,
            paidAmount: 0,
            status: 'unpaid',
            paidDate: '',
            notes: spreadMonths > 1 ? `${noteText} (${m + 1}/${spreadMonths})` : noteText,
            createdAt: now,
          });
          count++;
        }
      }

      const totalCount = targetCustomers.length;
      await addActivity({
        type: 'extra_charge',
        description: `חיוב גורף ₪${chargeAmount.toLocaleString()} ל-${totalCount} לקוחות${spreadMonths > 1 ? ` × ${spreadMonths} חודשים` : ''} (${month}) — ${noteText}`,
        amount: chargeAmount * count,
        createdAt: now,
      });

      toast.success(`חיוב ₪${chargeAmount.toLocaleString()} נוסף ל-${totalCount} לקוחות${spreadMonths > 1 ? ` ל-${spreadMonths} חודשים` : ''}`);
      setConfirmDialog(false);
      setAmount(0);
      setAmperes(0);
      setNotes('');
      setSpreadMonths(1);
      loadData();
    } catch (e) {
      toast.error('שגיאה ביצירת חיוב גורף');
    } finally {
      setCreating(false);
    }
  };

  const handleCancelBulkCharge = async () => {
    if (cancelTargetDebts.length === 0) return;
    try {
      const now = new Date().toISOString();
      for (const d of cancelTargetDebts) {
        await deleteDebt(d.id!);
      }
      await addActivity({
        type: 'debt_deleted',
        description: `ביטול חיוב גורף: ${cancelTargetDebts.length} חיובים נמחקו (${cancelMonth})${cancelNotes ? ' — ' + cancelNotes : ''}`,
        amount: cancelTargetDebts.reduce((s, d) => s + d.amount, 0),
        createdAt: now,
      });
      toast.success(`${cancelTargetDebts.length} חיובים גורפים בוטלו`);
      setCancelDialog(false);
      setCancelNotes('');
      loadData();
    } catch (e) {
      toast.error('שגיאה בביטול חיובים');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Create Bulk Charge */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-warning" />
            חיוב גורף — הוספת חיוב לכל הלקוחות / קבוצה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">היקף</Label>
              <Select value={scope} onValueChange={(v: ChargeScope) => setScope(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הלקוחות הפעילים</SelectItem>
                  <SelectItem value="group">לפי קבוצה</SelectItem>
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
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">סוג חיוב</Label>
              <Select value={chargeType} onValueChange={(v: ChargeType) => setChargeType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="money">סכום כספי (₪)</SelectItem>
                  <SelectItem value="amperes">אמפרים נוספים</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 items-end">
            {chargeType === 'money' ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">סכום (₪)</Label>
                <Input type="number" min={0} value={amount || ''} onChange={e => setAmount(Number(e.target.value))} placeholder="0" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">אמפרים</Label>
                <Input type="number" min={0} value={amperes || ''} onChange={e => setAmperes(Number(e.target.value))} placeholder="0" />
                {amperes > 0 && pricePerAmpere > 0 && (
                  <p className="text-xs text-muted-foreground">= ₪{(amperes * pricePerAmpere).toLocaleString()}</p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">חודש חיוב</Label>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">הערות</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="תיאור החיוב..." rows={1} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">פריסה לחודשים</Label>
              <Input type="number" min={1} max={24} value={spreadMonths} onChange={e => setSpreadMonths(Math.max(1, Number(e.target.value)))} />
              {spreadMonths > 1 && (
                <p className="text-xs text-muted-foreground">₪{chargeAmount.toLocaleString()} × {spreadMonths} חודשים = ₪{(chargeAmount * spreadMonths).toLocaleString()} סה"כ לכל לקוח</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 mt-4">
            <Button onClick={() => setConfirmDialog(true)} disabled={chargeAmount <= 0 || targetCustomers.length === 0} className="gap-2">
              <Plus className="h-4 w-4" />
              הוסף חיוב ל-{targetCustomers.length} לקוחות (₪{chargeAmount.toLocaleString()} כ"א)
            </Button>
            <Button variant="destructive" onClick={() => setCancelDialog(true)} className="gap-2">
              <Trash2 className="h-4 w-4" />
              בטל חיובים גורפים
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Bulk Charges */}
      {existingBulkCharges.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-warning" />
              חיובים גורפים פעילים ({month})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>לקוח</TableHead>
                    <TableHead>סכום</TableHead>
                    <TableHead>הערות</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {existingBulkCharges.slice(0, 20).map(d => (
                    <TableRow key={d.id}>
                      <TableCell>{d.customerName}</TableCell>
                      <TableCell className="font-medium">₪{d.amount.toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.notes}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === 'suspended' ? 'outline' : 'destructive'} className="text-xs">
                          {d.status === 'suspended' ? 'מושהה' : 'לא שולם'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {existingBulkCharges.length > 20 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-sm">
                        +{existingBulkCharges.length - 20} חיובים נוספים
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm Create Dialog */}
      <AlertDialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור חיוב גורף</AlertDialogTitle>
            <AlertDialogDescription>
              ייווצר חיוב על סך ₪{chargeAmount.toLocaleString()} ל-{targetCustomers.length} לקוחות עבור חודש {month}.
              <br />סה"כ: ₪{(chargeAmount * targetCustomers.length).toLocaleString()}
              {notes && <><br />הערות: {notes}</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateBulkCharge} disabled={creating}>אשר חיוב</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Bulk Dialog */}
      <AlertDialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ביטול חיובים גורפים</AlertDialogTitle>
            <AlertDialogDescription>בחר את החודש וההיקף לביטול חיובים גורפים שטרם שולמו.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">היקף</Label>
                <Select value={cancelScope} onValueChange={(v: 'all' | 'group') => setCancelScope(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל הלקוחות</SelectItem>
                    <SelectItem value="group">לפי קבוצה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {cancelScope === 'group' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">קבוצה</Label>
                  <Select value={cancelGroupId} onValueChange={setCancelGroupId}>
                    <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                    <SelectContent>
                      {groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">חודש</Label>
              <input type="month" value={cancelMonth} onChange={e => setCancelMonth(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" dir="ltr" />
            </div>
            <p className="text-sm text-muted-foreground">
              נמצאו <span className="font-bold text-destructive">{cancelTargetDebts.length}</span> חיובים גורפים לביטול
              {cancelTargetDebts.length > 0 && ` (₪${cancelTargetDebts.reduce((s, d) => s + d.amount, 0).toLocaleString()})`}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>סגור</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelBulkCharge} disabled={cancelTargetDebts.length === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              מחק {cancelTargetDebts.length} חיובים
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
