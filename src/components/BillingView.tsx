import { useState, useEffect } from 'react';
import { CreditCard, Download, FileText, AlertCircle, CheckCircle2, Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAllCustomers, getAllGroups, getAllBatches, getAllDebts, addBatch, updateBatch, updateDebt, getSettings, addActivity } from '@/lib/db';
import { getCustomersDueForBilling, createBillingBatch, getCustomerMonthlyAmount } from '@/lib/billing';
import { generateMasavFile, validateBatchForMasav, downloadMasavFile } from '@/lib/masav';
import type { Customer, Group, BillingBatch, DebtRecord, Settings } from '@/lib/types';
import { toast } from 'sonner';

export default function BillingView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scope, setScope] = useState('all');
  const [groupId, setGroupId] = useState('');
  const [singleCustomerId, setSingleCustomerId] = useState('');
  const [valueDate, setValueDate] = useState(new Date().toISOString().split('T')[0]);
  const [billingMonths, setBillingMonths] = useState(1);
  const [includeExtraDebts, setIncludeExtraDebts] = useState(true);
  const [creating, setCreating] = useState(false);
  const [viewBatch, setViewBatch] = useState<BillingBatch | null>(null);
  const [confirmCreate, setConfirmCreate] = useState(false);

  const loadData = () => {
    Promise.all([getAllCustomers(), getAllGroups(), getAllBatches(), getSettings(), getAllDebts()])
      .then(([c, g, b, s, d]) => {
        setCustomers(c);
        setGroups(g);
        setBatches(b.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setSettings(s);
        setDebts(d);
      });
  };

  useEffect(() => { loadData(); }, []);

  // Only bank/mixed customers are relevant for MASAV billing
  const bankCustomers = customers.filter(c => (c.paymentMethod || 'bank') !== 'cash');

  const getTargetCustomers = (): Customer[] => {
    const due = getCustomersDueForBilling(bankCustomers);
    if (scope === 'all') return due;
    if (scope === 'group' && groupId) return due.filter(c => String(c.groupId) === groupId);
    if (scope === 'single' && singleCustomerId) return due.filter(c => String(c.id) === singleCustomerId);
    return due;
  };

  // Get unpaid debts for bank customers (extra charges)
  const getExtraDebts = (): DebtRecord[] => {
    if (!includeExtraDebts) return [];
    const targets = getTargetCustomers();
    const targetIds = new Set(targets.map(c => c.id!));
    return debts.filter(d =>
      targetIds.has(d.customerId) &&
      d.status !== 'paid' &&
      d.status !== 'advance' &&
      d.notes // Only include debts with notes (extra charges)
    );
  };

  const handleCreateBatch = async () => {
    setCreating(true);
    try {
      const targets = getTargetCustomers();
      if (targets.length === 0) { toast.error('אין לקוחות לגבייה'); return; }
      const extras = getExtraDebts();
      const batch = createBillingBatch(targets, valueDate, extras, billingMonths);
      await addBatch(batch);

      // Auto-settle: create/update debt records as paid for each included transaction
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      for (const t of batch.transactions.filter(tx => tx.status === 'included')) {
        // Mark extra debts as paid
        const custExtras = extras.filter(d => d.customerId === t.customerId && d.status !== 'paid');
        for (const d of custExtras) {
          await updateDebt({ ...d, paidAmount: d.amount, status: 'paid', paidDate: now.toISOString().split('T')[0], notes: d.notes ? `${d.notes} | שולם באצווה` : 'שולם באצווה' });
        }
        // Mark monthly debts as paid for billed months
        for (let m = 0; m < billingMonths; m++) {
          const monthDate = new Date(now.getFullYear(), now.getMonth() + m);
          const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
          const existingDebt = debts.find(d => d.customerId === t.customerId && d.month === month && d.status !== 'paid' && d.status !== 'advance');
          if (existingDebt) {
            await updateDebt({ ...existingDebt, paidAmount: existingDebt.amount, status: 'paid', paidDate: now.toISOString().split('T')[0], notes: existingDebt.notes ? `${existingDebt.notes} | שולם באצווה` : 'שולם באצווה' });
          }
        }

        // Log activity
        await addActivity({
          type: 'batch',
          description: `גבייה באצווה: ₪${t.amount.toLocaleString()} מ${t.customerName}${billingMonths > 1 ? ` (${billingMonths} חודשים)` : ''}`,
          customerId: t.customerId,
          customerName: t.customerName,
          amount: t.amount,
          createdAt: now.toISOString(),
        });
      }

      toast.success(`אצוות גבייה נוצרה: ${batch.transactionCount} פעולות, ₪${batch.totalAmount.toLocaleString()}${billingMonths > 1 ? ` (${billingMonths} חודשים)` : ''}`);
      loadData();
    } catch (e) {
      toast.error('שגיאה ביצירת אצוות');
    } finally {
      setCreating(false);
      setConfirmCreate(false);
    }
  };

  const handleExportMasav = (batch: BillingBatch) => {
    if (!settings) { toast.error('חסרות הגדרות מוסד'); return; }
    const errors = validateBatchForMasav(batch, settings);
    if (errors.length > 0) {
      toast.error(`נמצאו ${errors.length} שגיאות: ${errors[0].message}`);
      return;
    }
    const content = generateMasavFile(batch, settings);
    const filename = `masav_${batch.date}_${batch.id}.msv`;
    downloadMasavFile(content, filename);
    updateBatch({ ...batch, status: 'exported' });
    toast.success('קובץ מסב יוצא בהצלחה');
    loadData();
  };

  const targetCount = getTargetCustomers().length;
  const extraDebtsCount = getExtraDebts().length;
  const displayName = (c: Customer) => c.nickname || c.fullName;

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            יצירת אצוות גבייה (בנק)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">היקף</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הלקוחות הפעילים</SelectItem>
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
                <Select value={singleCustomerId} onValueChange={setSingleCustomerId}>
                  <SelectTrigger><SelectValue placeholder="בחר לקוח" /></SelectTrigger>
                  <SelectContent>
                    {bankCustomers.filter(c => c.status === 'active').map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {displayName(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">תאריך ערך</Label>
              <Input type="date" value={valueDate} onChange={e => setValueDate(e.target.value)} dir="ltr" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end mt-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">מספר חודשים לגבייה</Label>
              <Select value={String(billingMonths)} onValueChange={v => setBillingMonths(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 12].map(m => (
                    <SelectItem key={m} value={String(m)}>
                      {m === 1 ? 'חודש אחד' : `${m} חודשים`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pb-1">
              <Checkbox
                id="includeExtras"
                checked={includeExtraDebts}
                onCheckedChange={v => setIncludeExtraDebts(!!v)}
              />
              <Label htmlFor="includeExtras" className="text-sm cursor-pointer">
                כלול חיובים נוספים ({extraDebtsCount})
              </Label>
            </div>

            <Button onClick={() => setConfirmCreate(true)} disabled={creating || targetCount === 0}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <CreditCard className="h-4 w-4 ml-1" />}
              צור אצוות ({targetCount} לקוחות{billingMonths > 1 ? ` × ${billingMonths} חודשים` : ''})
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Batches List */}
      <div>
        <h3 className="text-lg font-semibold mb-3">היסטוריית אצוות</h3>
        {batches.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p>אין אצוות גבייה עדיין</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {batches.map(b => {
              const errorCount = b.transactions.filter(t => t.status === 'error').length;
              return (
                <Card key={b.id} className="glass-card">
                  <CardContent className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-medium">אצוות #{b.id}</p>
                          <p className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString('he-IL')} • ערך: {new Date(b.valueDate).toLocaleDateString('he-IL')}</p>
                        </div>
                        <Badge variant={b.status === 'exported' ? 'default' : 'secondary'}>
                          {b.status === 'pending' ? 'ממתין' : b.status === 'generated' ? 'נוצר' : 'יוצא'}
                        </Badge>
                        {errorCount > 0 && (
                          <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />{errorCount} שגיאות</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-left">
                          <p className="text-sm text-muted-foreground">{b.transactionCount} פעולות</p>
                          <p className="text-success font-semibold">₪{b.totalAmount.toLocaleString()}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setViewBatch(b)}><FileText className="h-3.5 w-3.5 ml-1" />פרטים</Button>
                          <Button size="sm" onClick={() => handleExportMasav(b)}><Download className="h-3.5 w-3.5 ml-1" />קובץ מסב</Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Batch Detail Dialog */}
      {viewBatch && (
        <AlertDialog open={!!viewBatch} onOpenChange={() => setViewBatch(null)}>
          <AlertDialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>פרטי אצוות #{viewBatch.id}</AlertDialogTitle>
              <AlertDialogDescription>{viewBatch.transactionCount} פעולות • ₪{viewBatch.totalAmount.toLocaleString()}</AlertDialogDescription>
            </AlertDialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>לקוח</TableHead>
                  <TableHead>בנק</TableHead>
                  <TableHead>סניף</TableHead>
                  <TableHead>חשבון</TableHead>
                  <TableHead>סכום</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead>הערות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewBatch.transactions.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell>{t.customerName}</TableCell>
                    <TableCell className="font-mono" dir="ltr">{t.bankNumber}</TableCell>
                    <TableCell className="font-mono" dir="ltr">{t.branchNumber}</TableCell>
                    <TableCell className="font-mono" dir="ltr">{t.accountNumber}</TableCell>
                    <TableCell className="text-success">₪{t.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      {t.status === 'included' ? <CheckCircle2 className="h-4 w-4 text-success" /> : (
                        <span className="text-destructive text-xs flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{t.errorMessage}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                      {t.status === 'included' && t.errorMessage}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <AlertDialogFooter>
              <AlertDialogCancel>סגור</AlertDialogCancel>
              <AlertDialogAction onClick={() => { handleExportMasav(viewBatch); setViewBatch(null); }}>
                <Download className="h-4 w-4 ml-1" />ייצא קובץ מסב
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <AlertDialog open={confirmCreate} onOpenChange={setConfirmCreate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>יצירת אצוות גבייה</AlertDialogTitle>
            <AlertDialogDescription>
              ייווצרו {targetCount} פעולות גבייה עם תאריך ערך {new Date(valueDate).toLocaleDateString('he-IL')}.
              {billingMonths > 1 && <><br />גבייה עבור {billingMonths} חודשים.</>}
              {extraDebtsCount > 0 && includeExtraDebts && <><br />כולל {extraDebtsCount} חיובים נוספים.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateBatch}>צור אצוות</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
