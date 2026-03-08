import { useState, useEffect } from 'react';
import { CreditCard, Download, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAllCustomers, getAllGroups, getAllBatches, addBatch, updateBatch, getSettings } from '@/lib/db';
import { getCustomersDueForBilling, createBillingBatch } from '@/lib/billing';
import { generateMasavFile, validateBatchForMasav, downloadMasavFile } from '@/lib/masav';
import type { Customer, Group, BillingBatch, Settings } from '@/lib/types';
import { toast } from 'sonner';

export default function BillingView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scope, setScope] = useState('all');
  const [groupId, setGroupId] = useState('');
  const [valueDate, setValueDate] = useState(new Date().toISOString().split('T')[0]);
  const [creating, setCreating] = useState(false);
  const [viewBatch, setViewBatch] = useState<BillingBatch | null>(null);
  const [confirmCreate, setConfirmCreate] = useState(false);

  const loadData = () => {
    Promise.all([getAllCustomers(), getAllGroups(), getAllBatches(), getSettings()])
      .then(([c, g, b, s]) => { setCustomers(c); setGroups(g); setBatches(b.sort((a, b) => b.createdAt.localeCompare(a.createdAt))); setSettings(s); });
  };

  useEffect(() => { loadData(); }, []);

  const getTargetCustomers = (): Customer[] => {
    const due = getCustomersDueForBilling(customers);
    if (scope === 'all') return due;
    if (scope === 'group' && groupId) return due.filter(c => String(c.groupId) === groupId);
    return due;
  };

  const handleCreateBatch = async () => {
    setCreating(true);
    try {
      const targets = getTargetCustomers();
      if (targets.length === 0) {
        toast.error('אין לקוחות לגבייה');
        return;
      }
      const batch = createBillingBatch(targets, valueDate);
      const id = await addBatch(batch);
      toast.success(`אצוות גבייה נוצרה: ${batch.transactionCount} פעולות, ₪${batch.totalAmount.toLocaleString()}`);
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
    // Update batch status
    updateBatch({ ...batch, status: 'exported' });
    toast.success('קובץ מסב יוצא בהצלחה');
    loadData();
  };

  const targetCount = getTargetCustomers().length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Create Batch */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            יצירת אצוות גבייה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">היקף</Label>
              <Select value={scope} onValueChange={setScope}>
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
              <Label className="text-xs text-muted-foreground">תאריך ערך</Label>
              <Input type="date" value={valueDate} onChange={e => setValueDate(e.target.value)} dir="ltr" />
            </div>
            <Button onClick={() => setConfirmCreate(true)} disabled={creating || targetCount === 0}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <CreditCard className="h-4 w-4 ml-1" />}
              צור אצוות ({targetCount} לקוחות)
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
                          <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {errorCount} שגיאות
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-left">
                          <p className="text-sm text-muted-foreground">{b.transactionCount} פעולות</p>
                          <p className="text-success font-semibold">₪{b.totalAmount.toLocaleString()}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setViewBatch(b)}>
                            <FileText className="h-3.5 w-3.5 ml-1" />
                            פרטים
                          </Button>
                          <Button size="sm" onClick={() => handleExportMasav(b)}>
                            <Download className="h-3.5 w-3.5 ml-1" />
                            קובץ מסב
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
                    <TableCell className="text-success">₪{t.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      {t.status === 'included' ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <span className="text-destructive text-xs flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {t.errorMessage}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <AlertDialogFooter>
              <AlertDialogCancel>סגור</AlertDialogCancel>
              <AlertDialogAction onClick={() => { handleExportMasav(viewBatch); setViewBatch(null); }}>
                <Download className="h-4 w-4 ml-1" />
                ייצא קובץ מסב
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
