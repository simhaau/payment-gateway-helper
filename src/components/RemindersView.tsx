import { useState, useEffect, useMemo } from 'react';
import { Bell, Plus, Trash2, Check, Calendar, Repeat, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAllReminders, addReminder, updateReminder, deleteReminder, addActivity } from '@/lib/db';
import type { Reminder } from '@/lib/types';
import { toast } from 'sonner';

const COLORS = [
  { value: '#3b82f6', label: 'כחול' },
  { value: '#22c55e', label: 'ירוק' },
  { value: '#eab308', label: 'צהוב' },
  { value: '#ef4444', label: 'אדום' },
  { value: '#a855f7', label: 'סגול' },
  { value: '#f97316', label: 'כתום' },
  { value: '#06b6d4', label: 'תכלת' },
  { value: '#6b7280', label: 'אפור' },
];

export default function RemindersView() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [addDialog, setAddDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [recurring, setRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState(1);
  const [color, setColor] = useState('#3b82f6');

  const loadData = () => { getAllReminders().then(setReminders); };
  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    let result = reminders.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
    if (filter === 'active') result = result.filter(r => !r.completed);
    if (filter === 'completed') result = result.filter(r => r.completed);
    return result;
  }, [reminders, filter]);

  const today = new Date().toISOString().split('T')[0];
  const overdueCount = reminders.filter(r => !r.completed && r.dueDate < today).length;
  const todayCount = reminders.filter(r => !r.completed && r.dueDate === today).length;

  const handleAdd = async () => {
    if (!title.trim()) { toast.error('כותרת חובה'); return; }
    await addReminder({
      title, description, dueDate, recurring, recurringDay, color, completed: false, completedAt: '', createdAt: new Date().toISOString(),
    });
    await addActivity({ type: 'reminder', description: `תזכורת חדשה: ${title}${recurring ? ' (חוזרת)' : ''}`, createdAt: new Date().toISOString() });
    toast.success('תזכורת נוספה');
    setAddDialog(false);
    setTitle(''); setDescription(''); setRecurring(false);
    loadData();
  };

  const handleToggle = async (r: Reminder) => {
    const completed = !r.completed;
    await updateReminder({ ...r, completed, completedAt: completed ? new Date().toISOString() : '' });

    if (completed && r.recurring) {
      const nextDate = new Date(r.dueDate);
      nextDate.setMonth(nextDate.getMonth() + 1);
      nextDate.setDate(r.recurringDay);
      const { id: _id, ...rest } = r;
      await addReminder({
        ...rest, dueDate: nextDate.toISOString().split('T')[0], completed: false, completedAt: '', createdAt: new Date().toISOString(),
      });
      toast.success('תזכורת הושלמה — תזכורת הבאה נוצרה');
    } else {
      toast.success(completed ? 'תזכורת הושלמה' : 'תזכורת הוחזרה');
    }
    loadData();
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    await deleteReminder(deleteTarget.id);
    toast.success('תזכורת נמחקה');
    setDeleteTarget(null);
    loadData();
  };

  const isOverdue = (r: Reminder) => !r.completed && r.dueDate < today;
  const isToday = (r: Reminder) => r.dueDate === today;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium">פעילות</p>
            <p className="text-2xl font-bold mt-1">{reminders.filter(r => !r.completed).length}</p>
          </CardContent>
        </Card>
        <Card className={`glass-card ${todayCount > 0 ? 'border-primary/30' : ''}`}>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium">להיום</p>
            <p className="text-2xl font-bold text-primary mt-1">{todayCount}</p>
          </CardContent>
        </Card>
        <Card className={`glass-card ${overdueCount > 0 ? 'border-destructive/30' : ''}`}>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium">באיחור</p>
            <p className="text-2xl font-bold text-destructive mt-1">{overdueCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="active">פעילות</SelectItem>
              <SelectItem value="completed">הושלמו</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline">{filtered.length} תזכורות</Badge>
        </div>
        <Button onClick={() => setAddDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          תזכורת חדשה
        </Button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>אין תזכורות</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <Card key={r.id} className={`glass-card transition-all ${r.completed ? 'opacity-60' : ''} ${isOverdue(r) ? 'border-destructive/40' : isToday(r) ? 'border-primary/40' : ''}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${r.completed ? 'line-through text-muted-foreground' : ''}`}>{r.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {r.description && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{r.description}</span>}
                      <span className={`text-xs ${isOverdue(r) ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                        {new Date(r.dueDate).toLocaleDateString('he-IL')}
                      </span>
                      {r.recurring && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                          <Repeat className="h-2.5 w-2.5" />חוזרת
                        </Badge>
                      )}
                      {isOverdue(r) && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">באיחור</Badge>}
                      {isToday(r) && <Badge className="bg-primary/15 text-primary text-[10px] px-1.5 py-0">היום</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!r.completed && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-success border-success/30 hover:bg-success/10 hover:text-success"
                        onClick={() => handleToggle(r)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        הושלם
                      </Button>
                    )}
                    {r.completed && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => handleToggle(r)}>
                        החזר
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(r)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>תזכורת חדשה</DialogTitle>
            <DialogDescription>הוסף תזכורת עם אפשרות לתזמון ותזכורת חוזרת</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>כותרת *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="תזכורת..." />
            </div>
            <div className="space-y-1.5">
              <Label>תיאור</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>תאריך</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>צבע</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c.value} type="button"
                      onClick={() => setColor(c.value)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${color === c.value ? 'border-foreground scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c.value }} title={c.label} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox id="recurring" checked={recurring} onCheckedChange={v => setRecurring(!!v)} />
              <Label htmlFor="recurring" className="cursor-pointer">תזכורת חוזרת כל חודש</Label>
              {recurring && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs">ביום</Label>
                  <Input type="number" min={1} max={28} value={recurringDay} onChange={e => setRecurringDay(Number(e.target.value))} className="w-16 h-8" dir="ltr" />
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setAddDialog(false)}>ביטול</Button>
            <Button onClick={handleAdd}>הוסף תזכורת</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת תזכורת</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק: {deleteTarget?.title}?</AlertDialogDescription>
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
