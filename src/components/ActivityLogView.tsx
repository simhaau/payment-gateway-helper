import { useState, useEffect, useMemo } from 'react';
import { Search, Trash2, History, Banknote, CreditCard, PlusCircle, Calendar, XCircle, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAllActivities, deleteActivity } from '@/lib/db';
import type { ActivityLog } from '@/lib/types';
import { toast } from 'sonner';

const typeConfig: Record<string, { label: string; icon: typeof Banknote; color: string }> = {
  payment: { label: 'תשלום', icon: Banknote, color: 'text-success' },
  batch: { label: 'אצווה', icon: CreditCard, color: 'text-primary' },
  extra_charge: { label: 'חיוב נוסף', icon: PlusCircle, color: 'text-warning' },
  advance: { label: 'מראש', icon: Calendar, color: 'text-primary' },
  debt_created: { label: 'חוב נוצר', icon: PlusCircle, color: 'text-muted-foreground' },
  debt_deleted: { label: 'חוב נמחק', icon: XCircle, color: 'text-destructive' },
  cash_override: { label: 'מזומן', icon: Banknote, color: 'text-success' },
  other: { label: 'אחר', icon: MoreHorizontal, color: 'text-muted-foreground' },
};

export default function ActivityLogView() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<ActivityLog | null>(null);

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
    toast.success('הפעולה נמחקה');
    setDeleteTarget(null);
    loadData();
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
            <SelectItem value="extra_charge">חיוב נוסף</SelectItem>
            <SelectItem value="advance">מראש</SelectItem>
            <SelectItem value="cash_override">מזומן</SelectItem>
            <SelectItem value="debt_deleted">מחיקות</SelectItem>
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
            return (
              <Card key={a.id} className="glass-card">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`shrink-0 ${config.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{a.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{config.label}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.createdAt).toLocaleDateString('he-IL')} {new Date(a.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {a.amount != null && a.amount > 0 && (
                            <span className="text-xs font-semibold text-primary">₪{a.amount.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(a)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת פעולה</AlertDialogTitle>
            <AlertDialogDescription>
              האם למחוק את הרישום: {deleteTarget?.description}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
