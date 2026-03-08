import { useState, useEffect, useMemo } from 'react';
import { ArrowRight, User, CreditCard, Banknote, Calendar, TrendingUp, TrendingDown, AlertCircle, CheckCircle2, Clock, Zap, Building2, Shuffle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { getDebtsByCustomer, getSettings, getAllActivities, getAllBatches } from '@/lib/db';
import { getCustomerMonthlyAmount } from '@/lib/billing';
import type { Customer, DebtRecord, Settings, ActivityLog, BillingBatch } from '@/lib/types';

interface Props {
  customer: Customer;
  onBack: () => void;
}

export default function CustomerDetailView({ customer, onBack }: Props) {
  const [debts, setDebts] = useState<DebtRecord[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    Promise.all([
      getDebtsByCustomer(customer.id!),
      getSettings(),
      getAllActivities(),
      getAllBatches(),
    ]).then(([d, s, a, b]) => {
      setDebts(d);
      setSettings(s);
      setActivities(a.filter(act => act.customerId === customer.id));
      setBatches(b);
    });
  }, [customer.id]);

  const pricePerAmpere = settings?.pricePerAmpere || 0;
  const monthlyAmount = getCustomerMonthlyAmount(customer, pricePerAmpere);
  const displayName = customer.nickname || customer.fullName;

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Current month status
  const currentMonthDebts = useMemo(() => debts.filter(d => d.month === currentMonth), [debts, currentMonth]);
  const currentMonthTotal = currentMonthDebts.reduce((s, d) => s + d.amount, 0);
  const currentMonthPaid = currentMonthDebts.reduce((s, d) => s + d.paidAmount, 0);
  const currentMonthBalance = currentMonthTotal - currentMonthPaid;

  // Overall stats
  const totalEverCharged = useMemo(() => debts.reduce((s, d) => s + d.amount, 0), [debts]);
  const totalEverPaid = useMemo(() => debts.reduce((s, d) => s + d.paidAmount, 0), [debts]);
  const openDebtTotal = useMemo(() =>
    debts.filter(d => d.status !== 'paid' && d.status !== 'advance').reduce((s, d) => s + (d.amount - d.paidAmount), 0),
    [debts]
  );
  const advanceMonths = useMemo(() => debts.filter(d => d.status === 'advance').length, [debts]);

  // Batch history for this customer
  const customerBatches = useMemo(() => {
    return batches
      .filter(b => b.transactions.some(t => t.customerId === customer.id && t.status === 'included'))
      .map(b => {
        const tx = b.transactions.find(t => t.customerId === customer.id)!;
        return { ...b, customerAmount: tx.amount };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [batches, customer.id]);

  // Monthly breakdown sorted desc
  const monthlyBreakdown = useMemo(() => {
    const map = new Map<string, { debts: DebtRecord[]; total: number; paid: number }>();
    debts.forEach(d => {
      const existing = map.get(d.month) || { debts: [], total: 0, paid: 0 };
      existing.debts.push(d);
      existing.total += d.amount;
      existing.paid += d.paidAmount;
      map.set(d.month, existing);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, data]) => ({ month, ...data, balance: data.total - data.paid }));
  }, [debts]);

  // Sorted activities
  const sortedActivities = useMemo(() =>
    [...activities].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50),
    [activities]
  );

  const paymentMethodLabel = {
    bank: { label: 'הוראת קבע (בנק)', icon: Building2, color: 'text-primary' },
    cash: { label: 'מזומן', icon: Banknote, color: 'text-success' },
    mixed: { label: 'משולב', icon: Shuffle, color: 'text-warning' },
  }[customer.paymentMethod || 'bank'];

  const statusLabel = {
    active: { label: 'פעיל', color: 'bg-success/15 text-success border-success/30' },
    paused: { label: 'מושהה', color: 'bg-warning/15 text-warning border-warning/30' },
    cancelled: { label: 'מבוטל', color: 'bg-destructive/15 text-destructive border-destructive/30' },
  }[customer.status];

  const getDebtStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-success/15 text-success border-success/30 text-xs">שולם</Badge>;
      case 'partial': return <Badge variant="outline" className="text-warning border-warning/30 text-xs">חלקי</Badge>;
      case 'advance': return <Badge className="bg-primary/15 text-primary border-primary/30 text-xs">מראש</Badge>;
      default: return <Badge variant="destructive" className="text-xs">לא שולם</Badge>;
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'payment': return <Banknote className="h-3.5 w-3.5 text-success" />;
      case 'batch': return <CreditCard className="h-3.5 w-3.5 text-primary" />;
      case 'extra_charge': return <Zap className="h-3.5 w-3.5 text-warning" />;
      case 'advance': return <TrendingUp className="h-3.5 w-3.5 text-primary" />;
      case 'cash_override': return <Banknote className="h-3.5 w-3.5 text-success" />;
      case 'debt_deleted': return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowRight className="h-4 w-4" />
          חזור
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{displayName}</h2>
            {customer.nickname && <p className="text-sm text-muted-foreground" dir="ltr">{customer.fullName}</p>}
          </div>
          <Badge className={statusLabel.color}>{statusLabel.label}</Badge>
        </div>
      </div>

      {/* Quick Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">אמפרים</p>
            <p className="text-xl font-bold mt-1">{customer.amperes || 0}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">סכום חודשי</p>
            <p className="text-xl font-bold text-success mt-1">₪{monthlyAmount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">חודש נוכחי</p>
            <p className={`text-xl font-bold mt-1 ${currentMonthBalance > 0 ? 'text-destructive' : 'text-success'}`}>
              {currentMonthBalance > 0 ? `₪${currentMonthBalance.toLocaleString()}` : currentMonthPaid > 0 ? 'שולם ✓' : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">חוב פתוח כולל</p>
            <p className={`text-xl font-bold mt-1 ${openDebtTotal > 0 ? 'text-destructive' : 'text-success'}`}>
              ₪{openDebtTotal.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">סה"כ שולם</p>
            <p className="text-xl font-bold text-success mt-1">₪{totalEverPaid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">חודשים מראש</p>
            <p className="text-xl font-bold text-primary mt-1">{advanceMonths}</p>
          </CardContent>
        </Card>
      </div>

      {/* Customer Details + Current Month */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal & Bank Details */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              פרטי לקוח
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              {customer.idNumber && (
                <div>
                  <p className="text-xs text-muted-foreground">ת.ז</p>
                  <p className="font-mono" dir="ltr">{customer.idNumber}</p>
                </div>
              )}
              {customer.phone && (
                <div>
                  <p className="text-xs text-muted-foreground">טלפון</p>
                  <p className="font-mono" dir="ltr">{customer.phone}</p>
                </div>
              )}
              {customer.email && (
                <div>
                  <p className="text-xs text-muted-foreground">אימייל</p>
                  <p dir="ltr">{customer.email}</p>
                </div>
              )}
              {customer.address && (
                <div>
                  <p className="text-xs text-muted-foreground">כתובת</p>
                  <p>{customer.address}</p>
                </div>
              )}
            </div>
            <Separator />
            <div className="flex items-center gap-2">
              <paymentMethodLabel.icon className={`h-4 w-4 ${paymentMethodLabel.color}`} />
              <span>{paymentMethodLabel.label}</span>
            </div>
            {(customer.paymentMethod === 'bank' || customer.paymentMethod === 'mixed') && customer.bankNumber && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">בנק</p>
                  <p className="font-mono" dir="ltr">{customer.bankNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">סניף</p>
                  <p className="font-mono" dir="ltr">{customer.branchNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">חשבון</p>
                  <p className="font-mono" dir="ltr">{customer.accountNumber}</p>
                </div>
              </div>
            )}
            {customer.paymentMethod === 'mixed' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">סכום בנק</p>
                  <p>₪{(customer.bankAmount || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">סכום מזומן</p>
                  <p>₪{(customer.cashAmount || 0).toLocaleString()}</p>
                </div>
              </div>
            )}
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">תאריך התחלה</p>
                <p>{customer.startDate ? new Date(customer.startDate).toLocaleDateString('he-IL') : '—'}</p>
              </div>
              {customer.endDate && (
                <div>
                  <p className="text-xs text-muted-foreground">תאריך סיום</p>
                  <p>{new Date(customer.endDate).toLocaleDateString('he-IL')}</p>
                </div>
              )}
            </div>
            {customer.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground">הערות</p>
                  <p className="text-muted-foreground">{customer.notes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Current Month Status */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              סטטוס חודש נוכחי ({currentMonth})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentMonthDebts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>אין חיובים לחודש הנוכחי</p>
                <p className="text-xs mt-1">חיוב צפוי: ₪{monthlyAmount.toLocaleString()} ({customer.amperes} אמפר)</p>
              </div>
            ) : (
              <div className="space-y-3">
                {currentMonthDebts.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div>
                      <p className="text-sm font-medium">
                        ₪{d.amount.toLocaleString()}
                        {d.notes && <span className="text-xs text-muted-foreground mr-2">({d.notes})</span>}
                      </p>
                      {d.paidAmount > 0 && d.paidAmount < d.amount && (
                        <p className="text-xs text-muted-foreground">שולם: ₪{d.paidAmount.toLocaleString()} • יתרה: ₪{(d.amount - d.paidAmount).toLocaleString()}</p>
                      )}
                    </div>
                    {getDebtStatusBadge(d.status)}
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between text-sm font-medium">
                  <span>סה"כ חודש נוכחי</span>
                  <span>₪{currentMonthTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">שולם</span>
                  <span className="text-success">₪{currentMonthPaid.toLocaleString()}</span>
                </div>
                {currentMonthBalance > 0 && (
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-destructive">יתרה לתשלום</span>
                    <span className="text-destructive">₪{currentMonthBalance.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Breakdown */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-primary" />
            היסטוריית חיובים לפי חודש ({monthlyBreakdown.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyBreakdown.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">אין היסטוריית חיובים</p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>חודש</TableHead>
                    <TableHead>פירוט</TableHead>
                    <TableHead>סכום</TableHead>
                    <TableHead>שולם</TableHead>
                    <TableHead>יתרה</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyBreakdown.map(m => {
                    const allPaid = m.debts.every(d => d.status === 'paid' || d.status === 'advance');
                    const hasPartial = m.debts.some(d => d.status === 'partial');
                    return (
                      <TableRow key={m.month} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-sm" dir="ltr">{m.month}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                          {m.debts.map(d => d.notes || `₪${d.amount.toLocaleString()}`).join(' • ')}
                        </TableCell>
                        <TableCell>₪{m.total.toLocaleString()}</TableCell>
                        <TableCell className="text-success">₪{m.paid.toLocaleString()}</TableCell>
                        <TableCell className={m.balance > 0 ? 'text-destructive font-medium' : 'text-success'}>
                          ₪{m.balance.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {allPaid ? (
                            <Badge className="bg-success/15 text-success border-success/30 text-xs gap-1">
                              <CheckCircle2 className="h-3 w-3" />שולם
                            </Badge>
                          ) : hasPartial ? (
                            <Badge variant="outline" className="text-warning border-warning/30 text-xs">חלקי</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">חוב פתוח</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bank Batch History */}
      {customerBatches.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              היסטוריית אצוות בנקאיות ({customerBatches.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>אצווה #</TableHead>
                    <TableHead>תאריך</TableHead>
                    <TableHead>תאריך ערך</TableHead>
                    <TableHead>סכום</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerBatches.map(b => (
                    <TableRow key={b.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">#{b.id}</TableCell>
                      <TableCell>{new Date(b.createdAt).toLocaleDateString('he-IL')}</TableCell>
                      <TableCell>{new Date(b.valueDate).toLocaleDateString('he-IL')}</TableCell>
                      <TableCell className="text-success font-medium">₪{b.customerAmount.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={b.status === 'exported' ? 'default' : 'secondary'}>
                          {b.status === 'pending' ? 'ממתין' : b.status === 'generated' ? 'נוצר' : 'יוצא'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Log */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            יומן פעולות ({sortedActivities.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedActivities.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">אין פעולות רשומות</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {sortedActivities.map(a => (
                <div key={a.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="mt-0.5">{getActivityIcon(a.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{a.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(a.createdAt).toLocaleDateString('he-IL')} {new Date(a.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {a.amount && a.amount > 0 && (
                    <span className="text-sm font-medium text-success whitespace-nowrap">₪{a.amount.toLocaleString()}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
