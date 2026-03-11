import { useState, useEffect, useMemo } from 'react';
import { CreditCard, Download, FileText, AlertCircle, CheckCircle2, Loader2, Search, AlertTriangle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAllCustomers, getAllGroups, getAllBatches, getAllDebts, addBatch, updateBatch, updateDebt, getSettings, addActivity, deleteBatch, deleteDebt } from '@/lib/db';
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
  const [customerSearch, setCustomerSearch] = useState('');
  const [valueDate, setValueDate] = useState(new Date().toISOString().split('T')[0]);
  const [billingMonths, setBillingMonths] = useState(1);
  const [includeExtraDebts, setIncludeExtraDebts] = useState(true);
  const [includePreviousDebts, setIncludePreviousDebts] = useState(true);
  const [includeAlreadyBilled, setIncludeAlreadyBilled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewBatch, setViewBatch] = useState<BillingBatch | null>(null);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [collectBatch, setCollectBatch] = useState<BillingBatch | null>(null);
  const [cancelBatch, setCancelBatch] = useState<BillingBatch | null>(null);

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

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // Only include existing active customers (not deleted)
  const existingCustomerIds = useMemo(() => new Set(customers.map(c => c.id!)), [customers]);
  const bankCustomers = customers.filter(c => (c.paymentMethod || 'bank') !== 'cash');

  // Check which customers were already billed this month
  const alreadyBilledIds = useMemo(() => {
    const ids = new Set<number>();
    for (const b of batches) {
      if (b.status === 'collected' || b.status === 'exported' || b.status === 'pending') {
        const batchMonth = b.date.substring(0, 7);
        if (batchMonth === currentMonth) {
          for (const t of b.transactions) {
            // Only count if customer still exists
            if (t.status === 'included' && existingCustomerIds.has(t.customerId)) {
              ids.add(t.customerId);
            }
          }
        }
      }
    }
    return ids;
  }, [batches, currentMonth, existingCustomerIds]);

  const getTargetCustomers = (): Customer[] => {
    // Only active, existing customers
    let due = getCustomersDueForBilling(bankCustomers);
    if (scope === 'group' && groupId) due = due.filter(c => String(c.groupId) === groupId);
    if (scope === 'single' && singleCustomerId) due = due.filter(c => String(c.id) === singleCustomerId);
    if (!includeAlreadyBilled) {
      due = due.filter(c => !alreadyBilledIds.has(c.id!));
    }
    return due;
  };

  const getExtraDebts = (): DebtRecord[] => {
    if (!includeExtraDebts) return [];
    const targets = getTargetCustomers();
    const targetIds = new Set(targets.map(c => c.id!));
    return debts.filter(d =>
      targetIds.has(d.customerId) &&
      existingCustomerIds.has(d.customerId) && // customer must exist
      d.month === currentMonth &&
      d.status !== 'paid' &&
      d.status !== 'advance' &&
      d.status !== 'suspended' &&
      d.status !== 'pending_collection' &&
      d.notes
    );
  };

  const handleCreateBatch = async () => {
    setCreating(true);
    try {
      const targets = getTargetCustomers();
      if (targets.length === 0) { toast.error('אין לקוחות לגבייה'); return; }
      const extras = getExtraDebts();
      const pricePerAmpere = settings?.pricePerAmpere || 0;
      const batch = createBillingBatch(targets, valueDate, pricePerAmpere, extras, billingMonths);

      batch.status = 'pending';
      const batchId = await addBatch(batch);

      // Create/update debts for each customer in batch
      for (const t of batch.transactions.filter(tx => tx.status === 'included')) {
        // Mark extra debts as pending
        const custExtras = extras.filter(d => d.customerId === t.customerId && d.status !== 'paid');
        for (const d of custExtras) {
          await updateDebt({ ...d, status: 'pending_collection' });
        }
        
        // For monthly charges: find or create debt records, mark as pending_collection
        for (let m = 0; m < billingMonths; m++) {
          const monthDate = new Date(now.getFullYear(), now.getMonth() + m);
          const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
          const existingDebt = debts.find(d => d.customerId === t.customerId && d.month === month && d.status !== 'paid' && d.status !== 'advance' && d.status !== 'suspended' && !d.notes?.includes('חיוב נוסף') && !d.notes?.includes('אמפרים נוספים'));
          
          if (existingDebt) {
            await updateDebt({ ...existingDebt, status: 'pending_collection' });
          } else {
            // Create a new debt record for this month
            const customer = targets.find(c => c.id === t.customerId);
            if (customer) {
              const monthlyAmt = getCustomerMonthlyAmount(customer, pricePerAmpere);
              const { addDebt } = await import('@/lib/db');
              await addDebt({
                customerId: t.customerId,
                customerName: t.customerName,
                month,
                amount: monthlyAmt,
                paidAmount: 0,
                status: 'pending_collection',
                paidDate: '',
                notes: '',
                createdAt: now.toISOString(),
              });
            }
          }
        }

        await addActivity({
          type: 'batch',
          description: `אצווה #${batchId} — ₪${t.amount.toLocaleString()} מ${t.customerName}${billingMonths > 1 ? ` (${billingMonths} חודשים)` : ''} — ממתין לגביה`,
          customerId: t.customerId,
          customerName: t.customerName,
          amount: t.amount,
          reversible: true,
          reverseData: JSON.stringify({ batchId, customerId: t.customerId }),
          createdAt: now.toISOString(),
        });
      }

      toast.success(`אצוות נוצרה: ${batch.transactionCount} פעולות, ₪${batch.totalAmount.toLocaleString()} — ממתינה לאישור גביה`);
      loadData();
    } catch (e) {
      console.error('Batch creation error:', e);
      toast.error('שגיאה ביצירת אצוות');
    } finally {
      setCreating(false);
      setConfirmCreate(false);
    }
  };

  const handleMarkCollected = async (batch: BillingBatch) => {
    await updateBatch({ ...batch, status: 'collected' });

    // Reload debts to get latest state
    const latestDebts = await getAllDebts();

    for (const t of batch.transactions.filter(tx => tx.status === 'included')) {
      // Find all pending_collection or unpaid debts for this customer
      const customerDebts = latestDebts.filter(d =>
        d.customerId === t.customerId &&
        (d.status === 'pending_collection' || d.status === 'unpaid' || d.status === 'partial') &&
        d.month <= currentMonth
      );
      for (const d of customerDebts) {
        await updateDebt({
          ...d,
          paidAmount: d.amount,
          status: 'paid',
          paidDate: new Date().toISOString().split('T')[0],
          paymentMethod: 'bank',
          notes: (d.notes || '').replace(' | ממתין לגביה', '') + (d.notes ? ' | ' : '') + 'נגבה באצווה #' + batch.id,
        });
      }
    }

    await addActivity({
      type: 'batch_collected',
      description: `אצווה #${batch.id} סומנה כנגבתה — ₪${batch.totalAmount.toLocaleString()} (${batch.transactionCount} פעולות)`,
      amount: batch.totalAmount,
      reversible: true,
      reverseData: JSON.stringify({ batchId: batch.id }),
      createdAt: new Date().toISOString(),
    });

    toast.success(`אצווה #${batch.id} סומנה כנגבתה בהצלחה`);
    setCollectBatch(null);
    loadData();
  };

  const handleCancelBatch = async (batch: BillingBatch) => {
    // Revert all debts back to unpaid
    const latestDebts = await getAllDebts();
    for (const t of batch.transactions.filter(tx => tx.status === 'included')) {
      const customerDebts = latestDebts.filter(d =>
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

    await addActivity({
      type: 'batch_cancelled',
      description: `אצווה #${batch.id} בוטלה — ₪${batch.totalAmount.toLocaleString()} (${batch.transactionCount} פעולות) — חובות שוחזרו`,
      amount: batch.totalAmount,
      createdAt: new Date().toISOString(),
    });

    toast.success(`אצווה #${batch.id} בוטלה — כל החובות שוחזרו`);
    setCancelBatch(null);
    loadData();
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

  // Summary stats
  const totalUncollected = useMemo(() => {
    return debts
      .filter(d => d.month <= currentMonth && d.status !== 'paid' && d.status !== 'advance' && d.status !== 'suspended' && d.status !== 'pending_collection' && existingCustomerIds.has(d.customerId))
      .reduce((s, d) => s + (d.amount - d.paidAmount), 0);
  }, [debts, currentMonth, existingCustomerIds]);

  const totalPendingCollection = useMemo(() => {
    return debts.filter(d => d.status === 'pending_collection' && existingCustomerIds.has(d.customerId)).reduce((s, d) => s + d.amount, 0);
  }, [debts, existingCustomerIds]);

  const totalCollectedThisMonth = useMemo(() => {
    return debts
      .filter(d => d.month === currentMonth && d.status === 'paid' && existingCustomerIds.has(d.customerId))
      .reduce((s, d) => s + d.paidAmount, 0);
  }, [debts, currentMonth, existingCustomerIds]);

  const targetCount = getTargetCustomers().length;
  const alreadyBilledCount = alreadyBilledIds.size;
  const extraDebtsCount = getExtraDebts().length;
  const displayName = (c: Customer) => c.nickname || c.fullName;

  const filteredBankCustomers = useMemo(() => {
    if (!customerSearch) return bankCustomers.filter(c => c.status === 'active');
    const q = customerSearch.toLowerCase();
    return bankCustomers.filter(c => c.status === 'active' && (
      c.fullName.toLowerCase().includes(q) ||
      (c.nickname || '').toLowerCase().includes(q) ||
      c.phone.includes(q)
    ));
  }, [bankCustomers, customerSearch]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass-card border-destructive/20">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium">טרם נגבה (חוב פתוח)</p>
            <p className="text-2xl font-bold text-destructive mt-1">₪{totalUncollected.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-warning/20">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium">ממתין לאישור גביה</p>
            <p className="text-2xl font-bold text-warning mt-1">₪{totalPendingCollection.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-success/20">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium">נגבה החודש</p>
            <p className="text-2xl font-bold text-success mt-1">₪{totalCollectedThisMonth.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Create Batch */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            יצירת אצוות גבייה
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
                    <div className="p-2">
                      <Input placeholder="חפש לקוח..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} className="h-8" />
                    </div>
                    {filteredBankCustomers.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{displayName(c)}</SelectItem>
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
              <Label className="text-xs text-muted-foreground">חודשים</Label>
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
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox id="includeExtras" checked={includeExtraDebts} onCheckedChange={v => setIncludeExtraDebts(!!v)} />
                <Label htmlFor="includeExtras" className="text-sm cursor-pointer">כלול חיובים נוספים ({extraDebtsCount})</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="includePrev" checked={includePreviousDebts} onCheckedChange={v => setIncludePreviousDebts(!!v)} />
                <Label htmlFor="includePrev" className="text-sm cursor-pointer">כלול חובות מחודשים קודמים</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="includeAlready" checked={includeAlreadyBilled} onCheckedChange={v => setIncludeAlreadyBilled(!!v)} />
                <Label htmlFor="includeAlready" className="text-sm cursor-pointer">
                  גבה גם מלקוחות שכבר נגבו
                  {alreadyBilledCount > 0 && <span className="text-warning mr-1">({alreadyBilledCount})</span>}
                </Label>
              </div>
            </div>
            <Button onClick={() => setConfirmCreate(true)} disabled={creating || targetCount === 0} className="gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              צור אצוות ({targetCount} לקוחות)
            </Button>
          </div>

          {includeAlreadyBilled && alreadyBilledCount > 0 && (
            <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>שים לב: {alreadyBilledCount} לקוחות כבר נגבו החודש. הם ייכללו באצווה זו מחדש.</span>
            </div>
          )}
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
              const isCollected = b.status === 'collected';
              // Filter out transactions for deleted customers
              const validTxCount = b.transactions.filter(t => t.status === 'included' && existingCustomerIds.has(t.customerId)).length;
              const deletedTxCount = b.transactions.filter(t => t.status === 'included' && !existingCustomerIds.has(t.customerId)).length;
              
              return (
                <Card key={b.id} className={`glass-card transition-all ${isCollected ? 'border-success/30' : ''}`}>
                  <CardContent className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-medium">אצוות #{b.id}</p>
                          <p className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString('he-IL')} • ערך: {new Date(b.valueDate).toLocaleDateString('he-IL')}</p>
                        </div>
                        <Badge variant={isCollected ? 'default' : b.status === 'exported' ? 'secondary' : 'outline'}
                          className={isCollected ? 'bg-success text-success-foreground' : ''}>
                          {isCollected ? '✓ נגבה' : b.status === 'pending' ? 'ממתין לגביה' : b.status === 'exported' ? 'יוצא' : 'נוצר'}
                        </Badge>
                        {errorCount > 0 && (
                          <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />{errorCount} שגיאות</Badge>
                        )}
                        {deletedTxCount > 0 && (
                          <Badge variant="outline" className="text-muted-foreground gap-1 text-[10px]">{deletedTxCount} לקוחות נמחקו</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-left">
                          <p className="text-sm text-muted-foreground">{validTxCount} פעולות</p>
                          <p className={`font-semibold ${isCollected ? 'text-success' : 'text-foreground'}`}>₪{b.totalAmount.toLocaleString()}</p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => setViewBatch(b)} className="gap-1">
                            <FileText className="h-3.5 w-3.5" />פרטים
                          </Button>
                          {!isCollected && b.status !== 'exported' && (
                            <Button size="sm" variant="default" className="gap-1 bg-success hover:bg-success/90 text-success-foreground" onClick={() => setCollectBatch(b)}>
                              <CheckCircle2 className="h-3.5 w-3.5" />סמן כנגבה
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => handleExportMasav(b)} className="gap-1">
                            <Download className="h-3.5 w-3.5" />מסב
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 text-destructive hover:text-destructive" onClick={() => setCancelBatch(b)}>
                            <XCircle className="h-3.5 w-3.5" />בטל
                          </Button>
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
              <AlertDialogDescription>
                {viewBatch.transactionCount} פעולות • ₪{viewBatch.totalAmount.toLocaleString()}
                {viewBatch.status === 'collected' && ' • ✓ נגבה'}
                {viewBatch.status === 'pending' && ' • ממתין לגביה'}
              </AlertDialogDescription>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewBatch.transactions.map((t, i) => {
                  const customerExists = existingCustomerIds.has(t.customerId);
                  return (
                    <TableRow key={i} className={!customerExists ? 'opacity-50' : ''}>
                      <TableCell>
                        {t.customerName}
                        {!customerExists && <span className="text-xs text-destructive mr-1">(נמחק)</span>}
                      </TableCell>
                      <TableCell className="font-mono" dir="ltr">{t.bankNumber}</TableCell>
                      <TableCell className="font-mono" dir="ltr">{t.branchNumber}</TableCell>
                      <TableCell className="font-mono" dir="ltr">{t.accountNumber}</TableCell>
                      <TableCell className="font-medium">₪{t.amount.toLocaleString()}</TableCell>
                      <TableCell>
                        {t.status === 'included' ? <CheckCircle2 className="h-4 w-4 text-success" /> : (
                          <span className="text-destructive text-xs flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{t.errorMessage}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <AlertDialogFooter>
              <AlertDialogCancel>סגור</AlertDialogCancel>
              {viewBatch.status !== 'collected' && (
                <AlertDialogAction className="bg-success hover:bg-success/90 text-success-foreground" onClick={() => { handleMarkCollected(viewBatch); setViewBatch(null); }}>
                  <CheckCircle2 className="h-4 w-4 ml-1" />סמן כנגבה
                </AlertDialogAction>
              )}
              <AlertDialogAction onClick={() => { handleExportMasav(viewBatch); setViewBatch(null); }}>
                <Download className="h-4 w-4 ml-1" />ייצא מסב
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Confirm Create */}
      <AlertDialog open={confirmCreate} onOpenChange={setConfirmCreate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>יצירת אצוות גבייה</AlertDialogTitle>
            <AlertDialogDescription>
              ייווצרו {targetCount} פעולות גבייה עם תאריך ערך {new Date(valueDate).toLocaleDateString('he-IL')}.
              {billingMonths > 1 && <><br />גבייה עבור {billingMonths} חודשים.</>}
              {extraDebtsCount > 0 && includeExtraDebts && <><br />כולל {extraDebtsCount} חיובים נוספים.</>}
              <br /><br />
              <strong>האצווה תהיה בסטטוס "ממתין לגביה" — לחץ "סמן כנגבה" אחרי שהכסף נכנס.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateBatch}>צור אצוות</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Collect */}
      <AlertDialog open={!!collectBatch} onOpenChange={() => setCollectBatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>אישור גביה</AlertDialogTitle>
            <AlertDialogDescription>
              האם לסמן את אצווה #{collectBatch?.id} כנגבתה?
              <br />סכום: ₪{collectBatch?.totalAmount.toLocaleString()} • {collectBatch?.transactionCount} פעולות
              <br /><br />
              פעולה זו תסמן את כל החובות הקשורים כשולמו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction className="bg-success hover:bg-success/90 text-success-foreground" onClick={() => collectBatch && handleMarkCollected(collectBatch)}>
              <CheckCircle2 className="h-4 w-4 ml-1" />אשר גביה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Cancel Batch */}
      <AlertDialog open={!!cancelBatch} onOpenChange={() => setCancelBatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ביטול אצווה</AlertDialogTitle>
            <AlertDialogDescription>
              האם לבטל את אצווה #{cancelBatch?.id}?
              <br />סכום: ₪{cancelBatch?.totalAmount.toLocaleString()} • {cancelBatch?.transactionCount} פעולות
              <br /><br />
              <strong className="text-destructive">פעולה זו תמחק את האצווה ותחזיר את כל החובות למצב "לא שולם".</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={() => cancelBatch && handleCancelBatch(cancelBatch)}>
              <XCircle className="h-4 w-4 ml-1" />בטל אצווה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
