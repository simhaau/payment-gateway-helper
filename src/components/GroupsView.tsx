import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Edit, Users, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getAllGroups, addGroup, updateGroup, deleteGroup, getAllCustomers } from '@/lib/db';
import type { Group, Customer } from '@/lib/types';
import { toast } from 'sonner';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function GroupsView() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const loadData = () => {
    Promise.all([getAllGroups(), getAllCustomers()]).then(([g, c]) => { setGroups(g); setCustomers(c); });
  };

  useEffect(() => { loadData(); }, []);

  const customersByGroup = useMemo(() => {
    const map: Record<number, Customer[]> = {};
    for (const c of customers) {
      if (c.groupId) {
        if (!map[c.groupId]) map[c.groupId] = [];
        map[c.groupId].push(c);
      }
    }
    return map;
  }, [customers]);

  const openDialog = (g?: Group) => {
    if (g) {
      setEditGroup(g);
      setName(g.name);
      setDescription(g.description);
      setColor(g.color);
    } else {
      setEditGroup(null);
      setName('');
      setDescription('');
      setColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('שם הקבוצה חובה'); return; }
    if (editGroup) {
      await updateGroup({ ...editGroup, name, description, color });
      toast.success('הקבוצה עודכנה');
    } else {
      await addGroup({ name, description, color, createdAt: new Date().toISOString() });
      toast.success('קבוצה נוספה');
    }
    setDialogOpen(false);
    loadData();
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    await deleteGroup(deleteId);
    toast.success('הקבוצה נמחקה');
    setDeleteId(null);
    loadData();
  };

  const groupIncome = (gid: number) => {
    return (customersByGroup[gid] || [])
      .filter(c => c.status === 'active')
      .reduce((s, c) => s + c.monthlyAmount, 0);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">ניהול קבוצות</h2>
        <Button onClick={() => openDialog()}>
          <Plus className="h-4 w-4 ml-1" />
          קבוצה חדשה
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p>אין קבוצות עדיין. צור קבוצה חדשה כדי לארגן לקוחות.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map(g => {
            const members = customersByGroup[g.id!] || [];
            const activeMembers = members.filter(m => m.status === 'active');
            return (
              <Collapsible key={g.id} open={expanded === g.id} onOpenChange={() => setExpanded(expanded === g.id ? null : g.id!)}>
                <Card className="glass-card">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CollapsibleTrigger className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }} />
                        <CardTitle className="text-base">{g.name}</CardTitle>
                        <Badge variant="outline">{members.length} לקוחות</Badge>
                        <ChevronDown className={`h-4 w-4 transition-transform ${expanded === g.id ? 'rotate-180' : ''}`} />
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-success font-medium">₪{groupIncome(g.id!).toLocaleString()}/חודש</span>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDialog(g)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(g.id!)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    {g.description && <p className="text-sm text-muted-foreground mt-1">{g.description}</p>}
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="pt-2">
                      {members.length === 0 ? (
                        <p className="text-sm text-muted-foreground">אין לקוחות בקבוצה</p>
                      ) : (
                        <div className="space-y-1">
                          {members.map(m => (
                            <div key={m.id} className="flex items-center justify-between py-1.5 text-sm border-b border-border/30 last:border-0">
                              <span>{m.fullName}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-muted-foreground">{m.phone}</span>
                                <span className="text-success">₪{m.monthlyAmount.toLocaleString()}</span>
                                <Badge variant={m.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                                  {m.status === 'active' ? 'פעיל' : m.status === 'paused' ? 'מושהה' : 'מבוטל'}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Group Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editGroup ? 'עריכת קבוצה' : 'קבוצה חדשה'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>שם הקבוצה *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="לדוגמה: תלמידים" />
            </div>
            <div className="space-y-1.5">
              <Label>תיאור</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>צבע</Label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-foreground' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>ביטול</Button>
              <Button onClick={handleSave}>{editGroup ? 'שמור' : 'צור קבוצה'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת קבוצה</AlertDialogTitle>
            <AlertDialogDescription>הלקוחות לא יימחקו, רק השיוך לקבוצה יוסר.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
