import { useState, useEffect, useMemo } from 'react';
import { Users, TrendingUp, CreditCard, Calendar, Zap, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getAllCustomers, getAllBatches, getAllGroups } from '@/lib/db';
import { calculateExpectedMonthlyIncome, getCustomersDueForBilling } from '@/lib/billing';
import DashboardCharts from './DashboardCharts';
import type { Customer, BillingBatch, Group } from '@/lib/types';

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
}

export default function DashboardView({ onNavigate }: DashboardViewProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    Promise.all([getAllCustomers(), getAllBatches(), getAllGroups()])
      .then(([c, b, g]) => { setCustomers(c); setBatches(b); setGroups(g); });
  }, []);

  const activeCustomers = useMemo(() => customers.filter(c => c.status === 'active'), [customers]);
  const expectedIncome = useMemo(() => calculateExpectedMonthlyIncome(customers), [customers]);
  const dueCustomers = useMemo(() => getCustomersDueForBilling(customers), [customers]);
  const lastBatch = useMemo(() => batches.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0], [batches]);
  const pausedCount = useMemo(() => customers.filter(c => c.status === 'paused').length, [customers]);

  const stats = [
    { label: 'סה"כ לקוחות', value: customers.length, icon: Users, color: 'text-primary' },
    { label: 'לקוחות פעילים', value: activeCustomers.length, icon: Zap, color: 'text-success' },
    { label: 'הכנסה חודשית צפויה', value: `₪${expectedIncome.toLocaleString()}`, icon: TrendingUp, color: 'text-success' },
    { label: 'מושהים', value: pausedCount, icon: Calendar, color: 'text-warning' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <Card key={i} className="glass-card stat-glow hover:shadow-md transition-shadow cursor-default">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color} opacity-70`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <DashboardCharts customers={customers} groups={groups} batches={batches} />

      {/* Quick Actions + Due Customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">פעולות מהירות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start gap-3" onClick={() => onNavigate('customers')}>
              <Users className="h-4 w-4" />
              הוסף לקוח חדש
            </Button>
            <Button variant="secondary" className="w-full justify-start gap-3" onClick={() => onNavigate('billing')}>
              <CreditCard className="h-4 w-4" />
              צור אצוות גבייה
            </Button>
            <Button variant="secondary" className="w-full justify-start gap-3" onClick={() => onNavigate('groups')}>
              <Calendar className="h-4 w-4" />
              נהל קבוצות
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              לקוחות לגבייה ({dueCustomers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dueCustomers.length === 0 ? (
              <p className="text-muted-foreground text-sm">אין לקוחות לגבייה כרגע</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {dueCustomers.slice(0, 10).map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{c.fullName}</p>
                      <p className="text-xs text-muted-foreground">חשבון: {c.accountNumber}</p>
                    </div>
                    <Badge variant="outline" className="text-success border-success/30">
                      ₪{c.monthlyAmount.toLocaleString()}
                    </Badge>
                  </div>
                ))}
                {dueCustomers.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    ועוד {dueCustomers.length - 10} לקוחות...
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {lastBatch && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">אצוות גבייה אחרונה</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">תאריך: </span>
                <span>{new Date(lastBatch.createdAt).toLocaleDateString('he-IL')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">פעולות: </span>
                <span>{lastBatch.transactionCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">סכום: </span>
                <span className="text-success font-medium">₪{lastBatch.totalAmount.toLocaleString()}</span>
              </div>
              <Badge variant={lastBatch.status === 'exported' ? 'default' : 'secondary'}>
                {lastBatch.status === 'pending' ? 'ממתין' : lastBatch.status === 'generated' ? 'נוצר' : 'יוצא'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
