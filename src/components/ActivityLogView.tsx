import { useState, useEffect, useMemo } from 'react';
import { Search, Trash2, History, Banknote, CreditCard, PlusCircle, Calendar, XCircle, MoreHorizontal, Undo2, UserPlus, Settings, Bell, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAllActivities, deleteActivity, getAllBatches, deleteBatch, getAllDebts, updateDebt, deleteDebt, deleteCustomer, addActivity } from '@/lib/db';
import type { ActivityLog } from '@/lib/types';
import { toast } from 'sonner';

const typeConfig: Record<string, { label: string; icon: typeof Banknote; color: string }> = {
  payment: { label: 'תשלום', icon: Banknote, color: 'text-success' },
  batch: { label: 'אצווה', icon: CreditCard, color: 'text-primary' },
  batch_collected: { label: 'אצווה נגבתה', icon: CreditCard, color: 'text-success' },
  batch_cancelled: { label: 'אצווה בוטלה', icon: XCircle, color: 'text-destructive' },
  extra_charge: { label: 'חיוב נוסף', icon: PlusCircle, color: 'text-warning' },
  bulk_charge: { label: 'חיוב גורף', icon: Zap, color: 'text-warning' },
  advance: { label: 'מראש', icon: Calendar, color: 'text-primary' },
  debt_created: { label: 'חוב נוצר', icon: PlusCircle, color: 'text-muted-foreground' },
  debt_deleted: { label: 'חוב נמחק', icon: XCircle, color: 'text-destructive' },
  cash_override: { label: 'מזומן', icon: Banknote, color: 'text-success' },
  customer_created: { label: 'לקוח חדש', icon: UserPlus, color: 'text-success' },
  customer_updated: { label: 'לקוח עודכן', icon: Users, color: 'text-primary' },
  customer_deleted: { label: 'לקוח נמחק', icon: XCircle, color: 'text-destructive' },
  settings_updated: { label: 'הגדרות', icon: Settings, color: 'text-muted-foreground' },
  phase_created: { label: 'פזה חדשה', icon: Zap, color: 'text-warning' },
  group_created: { label: 'קבוצה חדשה', icon: Users, color: 'text-primary' },
  reminder: { label: 'תזכורת', icon: Bell, color: 'text-primary' },
  other: { label: 'אחר', icon: MoreHorizontal, color: 'text-muted-foreground' },
};

export default function ActivityLogView() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<ActivityLog | null>(null);
  const [reverseTarget, setReverseTarget] = useState<ActivityLog | null>(null);

  const loadData = () => {
    getAllActivities().then(a => setActivities(a.sort((x, y) => y.createdAt.localeCompare(x.createdAt))));
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    let result = activities;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a => a.description.toLowerCase().includes(q) || a.customerName?.toLowerCase().includes(q));
    }
    if (typeFilter !== 'all') result = result.filter(a => a.type === typeFilter);
    return result;
  }, [activities, search, typeFilter]);

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    await deleteActivity(deleteTarget.id);
    toast.success('הפעולה נמחקה מההיסטוריה');
    setDeleteTarget(null);
    loadData();
  };

  const handleReverse = async () => {
    if (!reverseTarget) return;
    
    try {
      const type = reverseTarget.type;
      const reverseData = reverseTarget.reverseData ? JSON.parse(reverseTarget.reverseData) : null;

      if (type === 'batch' || type === 'batch_collected') {
        // Cancel the batch - revert debts
        if (reverseData?.batchId) {
          const batches = await getAllBatches();
          const batch = batches.find(b => b.id === reverseData.batchId);
          if (batch) {
            const allDebts = await getAllDebts();
            for (const t of batch.transactions.filter(tx => tx.status === 'included')) {
              const customerDebts = allDebts.filter(d =>
                d.customerId === t.customerId &&
                (d.status === 'pending_collection' || (batch.status === 'collected' && d.status === 'paid' && d.notes?.includes('נגבה באצווה #' + batch.id)))
              );
              for (const d of customerDebts) {
                await updateDebt({
                  ...d,
                  status: 'unpaid',
                  paidAmount: batch.status === 'collected' ? 0 : d.paidAmount,
                  paidDate: batch.status === 'collected' ? '' : d.paidDate,
                  notes: (d.notes || '').replace(` | נגבה באצווה #${batch.id}`, '').replace('נגבה באצווה #' + batch.id, ''),
                });
              }
            }
            await deleteBatch(batch.id!);
          }
        }
        toast.success('האצווה בוטלה — חובות שוחזרו');
      } else if (type === 'extra_charge' || type === 'debt_created' || type === 'bulk_charge') {
        // Delete the debt that was created
        if (reverseData?.debtId) {
          await deleteDebt(reverseData.debtId);
        } else if (reverseTarget.customerId && reverseTarget.amount) {
          // Try to find and remove the matching debt
          const allDebts = await getAllDebts();
          const matchingDebt = allDebts.find(d => 
            d.customerId === reverseTarget.customerId && 
            d.amount === reverseTarget.amount &&
            (d.status === 'unpaid' || d.status === 'pending_collection')
          );
          if (matchingDebt) {
            await deleteDebt(matchingDebt.id!);
          }
        }
        toast.success('החיוב בוטל');
      } else if (type === 'customer_created') {
        if (reverseData?.customerId) {
          await deleteCustomer(reverseData.customerId);
        }
        toast.success('הלקוח נמחק');
      } else {
        toast.error('לא ניתן לבטל פעולה מסוג זה');
        setReverseTarget(null);
        return;
      }

      // Log the reversal
      await addActivity({
        type: 'other',
        description: `ביטול פעולה: ${reverseTarget.description}`,
        customerId: reverseTarget.customerId,
        customerName: reverseTarget.customerName,
        amount: reverseTarget.amount,
        createdAt: new Date().toISOString(),
      });

      // Delete the original activity
      await deleteActivity(reverseTarget.id!);
    } catch (e) {
      console.error('Reverse error:', e);
      toast.error('שגיאה בביטול הפעולה');
    }
    
    setReverseTarget(null);
    loadData();
  };

  const canReverse = (a: ActivityLog) => {
    return ['batch', 'batch_collected', 'extra_charge', 'debt_created', 'bulk_charge', 'customer_created'].includes(a.type);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="חיפוש פעולה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הפעולות</SelectItem>
            <SelectItem value="payment">תשלום</SelectItem>
            <SelectItem value="batch">אצווה</SelectItem>
            <SelectItem value="batch_collected">אצווה נגבתה</SelectItem>
            <SelectItem value="batch_cancelled">אצווה בוטלה</SelectItem>
            <SelectItem value="extra_charge">חיוב נוסף</SelectItem>
            <SelectItem value="bulk_charge">חיוב גורף</SelectItem>
            <SelectItem value="advance">מראש</SelectItem>
            <SelectItem value="cash_override">מזומן</SelectItem>
            <SelectItem value="debt_created">חוב נוצר</SelectItem>
            <SelectItem value="debt_deleted">מחיקות</SelectItem>
            <SelectItem value="customer_created">לקוח חדש</SelectItem>
            <SelectItem value="customer_updated">לקוח עודכן</SelectItem>
            <SelectItem value="customer_deleted">לקוח נמחק</SelectItem>
            <SelectItem value="settings_updated">הגדרות</SelectItem>
            <SelectItem value="reminder">תזכורת</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-sm">{filtered.length} פעולות</Badge>
      </div>

      {filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p>אין פעולות להצגה</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => {
            const config = typeConfig[a.type] || typeConfig.other;
            const Icon = config.icon;
            const reversible = canReverse(a);
            return (
              <Card key={a.id} className="glass-card group">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`shrink-0 ${config.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{a.description}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{config.label}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.createdAt).toLocaleDateString('he-IL')} {new Date(a.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {a.amount != null && a.amount > 0 && (
                            <span className="text-xs font-semibold text-primary">₪{a.amount.toLocaleString()}</span>
                          )}
                          {a.customerName && (
                            <span className="text-xs text-muted-foreground">• {a.customerName}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {reversible && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-warning hover:text-warning opacity-0 group-hover:opacity-100 transition-opacity gap-1"
                          onClick={() => setReverseTarget(a)}
                          title="בטל פעולה"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          <span className="text-xs">בטל</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(a)}
                        title="מחק מההיסטוריה"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete (remove from history only) */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת פעולה מההיסטוריה</AlertDialogTitle>
            <AlertDialogDescription>
              הרישום ימחק מההיסטוריה בלבד. הפעולה עצמה <strong>לא תבוטל</strong>.
              <br /><br />
              {deleteTarget?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק מההיסטוריה</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reverse (undo the action) */}
      <AlertDialog open={!!reverseTarget} onOpenChange={() => setReverseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ביטול פעולה</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-destructive">שים לב: פעולה זו תבטל את הפעולה ותחזיר את המצב לפני ביצועה.</strong>
              <br /><br />
              {reverseTarget?.description}
              {reverseTarget?.amount && reverseTarget.amount > 0 && (
                <><br />סכום: ₪{reverseTarget.amount.toLocaleString()}</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleReverse} className="bg-warning text-warning-foreground hover:bg-warning/90">
              <Undo2 className="h-4 w-4 ml-1" />
              בטל פעולה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
