import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCustomerMonthlyAmount } from '@/lib/billing';
import type { Customer, Group, BillingBatch } from '@/lib/types';

interface Props {
  customers: Customer[];
  groups: Group[];
  batches: BillingBatch[];
  pricePerAmpere: number;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function DashboardCharts({ customers, groups, batches, pricePerAmpere }: Props) {
  const statusData = useMemo(() => {
    const active = customers.filter(c => c.status === 'active').length;
    const paused = customers.filter(c => c.status === 'paused').length;
    const cancelled = customers.filter(c => c.status === 'cancelled').length;
    return [
      { name: 'פעיל', value: active, color: '#10b981' },
      { name: 'מושהה', value: paused, color: '#f59e0b' },
      { name: 'מבוטל', value: cancelled, color: '#ef4444' },
    ].filter(d => d.value > 0);
  }, [customers]);

  const groupIncomeData = useMemo(() => {
    return groups.map(g => {
      const groupCustomers = customers.filter(c => c.groupId === g.id && c.status === 'active');
      const income = groupCustomers.reduce((s, c) => s + getCustomerMonthlyAmount(c, pricePerAmpere), 0);
      return { name: g.name, income, count: groupCustomers.length };
    }).filter(d => d.income > 0).sort((a, b) => b.income - a.income).slice(0, 8);
  }, [customers, groups, pricePerAmpere]);

  const batchHistory = useMemo(() => {
    return batches.slice(0, 12).reverse().map(b => ({
      date: new Date(b.createdAt).toLocaleDateString('he-IL', { month: 'short', day: 'numeric' }),
      amount: b.totalAmount,
      count: b.transactionCount,
    }));
  }, [batches]);

  if (customers.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {statusData.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">התפלגות סטטוס לקוחות</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {statusData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value, 'לקוחות']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {groupIncomeData.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">הכנסה לפי קבוצה</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={groupIncomeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip formatter={(value: number) => [`₪${value.toLocaleString()}`, 'הכנסה']} />
                  <Bar dataKey="income" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {batchHistory.length > 1 && (
        <Card className="glass-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">היסטוריית גביות</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={batchHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip formatter={(value: number) => [`₪${value.toLocaleString()}`, 'סכום']} />
                  <Bar dataKey="amount" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
