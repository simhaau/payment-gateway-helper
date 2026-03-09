import { useState, useEffect, useMemo } from 'react';
import { CreditCard, Download, FileText, AlertCircle, CheckCircle2, Loader2, Search, AlertTriangle } from 'lucide-react';
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
  const bankCustomers = customers.filter(c => (c.paymentMethod || 'bank') !== 'cash');

  // Check which customers were already billed this month
  const alreadyBilledIds = useMemo(() => {
    const ids = new Set<number>();
    for (const b of batches) {
      if (b.status === 'collected' || b.status === 'exported' || b.status === 'pending') {
        // Check if batch is for current month
        const batchMonth = b.date.substring(0, 7);
        if (batchMonth === currentMonth) {
          for (const t of b.transactions) {
            if (t.status === 'included') ids.add(t.customerId);
          }
        }
      }
    }
    return ids;
  }, [batches, currentMonth]);

  const getTargetCustomers = (): Customer[] => {
    let due = getCustomersDueForBilling(bankCustomers);
    if (scope === 'group' && groupId) due = due.filter(c => String(c.groupId) === groupId);
    if (scope === 'single' && singleCustomerId) due = due.filter(c => String(c.id) === singleCustomerId);
    // Filter out already billed unless checkbox is checked
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
      d.month === currentMonth &&
      d.status !== 'paid' &&
      d.status !== 'advance' &&
      d.status !== 'suspended' &&
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

      // Mark batch as pending (not yet collected)
      batch.status = 'pending';
      await addBatch(batch);

      // Mark debts as pending_collection (not paid yet)
      for (const t of batch.transactions.filter(tx => tx.status === 'included')) {
        const custExtras = extras.filter(d => d.customerId === t.customerId && d.status !== 'paid');
        for (const d of custExtras) {
          await updateDebt({ ...d, status: 'pending_collection', notes: d.notes ? `${d.notes} | ממתין לגביה` : 'ממתין לגביה' });
        }
        // Mark monthly debts as pending
        for (let m = 0; m < billingMonths; m++) {
          const monthDate = new Date(now.getFullYear(), now.getMonth() + m);
          const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
          const existingDebt = debts.find(d => d.customerId === t.customerId && d.month === month && d.status !== 'paid' && d.status !== 'advance');
          if (existingDebt) {
            await updateDebt({ ...existingDebt, status: 'pending_collection', notes: existingDebt.notes ? `${existingDebt.notes} | ממתין לגביה` : 'ממתין לגביה' });
          }
        }

        await addActivity({
          type: 'batch',
          description: `אצווה נוצרה: ₪${t.amount.toLocaleString()} מ${t.customerName}${billingMonths > 1 ? ` (${billingMonths} חודשים)` : ''} — ממתין לגביה`,
          customerId: t.customerId,
          customerName: t.customerName,
          amount: t.amount,
          createdAt: now.toISOString(),
        });
      }

      toast.success(`אצוות נוצרה: ${batch.transactionCount} פעולות, ₪${batch.totalAmount.toLocaleString()} — ממתינה לאישור גביה`);
      loadData();
    } catch (e) {
      toast.error('שגיאה ביצירת אצוות');
    } finally {
      setCreating(false);
      setConfirmCreate(false);
    }
  };

  const handleMarkCollected = async (batch: BillingBatch) => {
    // Mark batch as collected and all associated debts as paid
    await updateBatch({ ...batch, status: 'collected' });

    for (const t of batch.transactions.filter(tx => tx.status === 'included')) {
      // Find pending_collection debts for this customer in the batch month range
      const customerDebts = debts.filter(d =>
        d.customerId === t.customerId &&
        (d.status === 'pending_collection' || d.status === 'unpaid' || d.status === 'partial')
      );
      for (const d of customerDebts) {
        if (d.month <= currentMonth) {
          await updateDebt({
            ...d,
            paidAmount: d.amount,
            status: 'paid',
            paidDate: new Date().toISOString().split('T')[0],
            notes: d.notes?.replace(' | ממתין לגביה', '') + ' | נגבה באצווה #' + batch.id,
          });
        }
      }
    }

    await addActivity({
      type: 'batch_collected',
      description: `אצווה #${batch.id} סומנה כנגבתה — ₪${batch.totalAmount.toLocaleString()} (${batch.transactionCount} פעולות)`,
      amount: batch.totalAmount,
      createdAt: new Date().toISOString(),
    });

    toast.success(`אצווה #${batch.id} סומנה כנגבתה בהצלחה`);
    setCollectBatch(null);
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
      .filter(d => d.month <= currentMonth && d.status !== 'paid' && d.status !== 'advance' && d.status !== 'suspended')
      .reduce((s, d) => s + (d.amount - d.paidAmount), 0);
  }, [debts, currentMonth]);

  const totalPendingCollection = useMemo(() => {
    return debts.filter(d => d.status === 'pending_collection').reduce((s, d) => s + d.amount, 0);
  }, [debts]);

  const totalCollectedThisMonth = useMemo(() => {
    return debts
      .filter(d => d.month === currentMonth && d.status === 'paid')
      .reduce((s, d) => s + d.paidAmount, 0);
  }, [debts, currentMonth]);

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
            <p className="text-xs text-muted-foreground font-medium">טרם נגבה</p>
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
              return (
                <Card key={b.id} className={`glass-card ${isCollected ? 'border-success/30' : ''}`}>
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
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-left">
                          <p className="text-sm text-muted-foreground">{b.transactionCount} פעולות</p>
                          <p className={`font-semibold ${isCollected ? 'text-success' : 'text-foreground'}`}>₪{b.totalAmount.toLocaleString()}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setViewBatch(b)} className="gap-1">
                            <FileText className="h-3.5 w-3.5" />פרטים
                          </Button>
                          {!isCollected && (
                            <Button size="sm" variant="default" className="gap-1 bg-success hover:bg-success/90 text-success-foreground" onClick={() => setCollectBatch(b)}>
                              <CheckCircle2 className="h-3.5 w-3.5" />סמן כנגבה
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => handleExportMasav(b)} className="gap-1">
                            <Download className="h-3.5 w-3.5" />מסב
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
                {viewBatch.transactions.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell>{t.customerName}</TableCell>
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
                ))}
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
    </div>
  );
}
