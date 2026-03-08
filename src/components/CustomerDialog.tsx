import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addCustomer, updateCustomer } from '@/lib/db';
import type { Customer, Group } from '@/lib/types';
import { EMPTY_CUSTOMER } from '@/lib/types';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  groups: Group[];
  onSaved: () => void;
}

export default function CustomerDialog({ open, onOpenChange, customer, groups, onSaved }: Props) {
  const [form, setForm] = useState<Record<string, any>>(EMPTY_CUSTOMER);
  const isEdit = !!customer;

  useEffect(() => {
    if (customer) setForm(customer);
    else setForm({ ...EMPTY_CUSTOMER, startDate: new Date().toISOString().split('T')[0] });
  }, [customer, open]);

  const set = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.fullName?.trim()) { toast.error('שם הלקוח חובה'); return; }

    const now = new Date().toISOString();
    if (isEdit) {
      await updateCustomer({ ...customer, ...form, updatedAt: now } as Customer);
      toast.success('הלקוח עודכן');
    } else {
      await addCustomer({ ...form, createdAt: now, updatedAt: now, tags: form.tags || [] } as any);
      toast.success('לקוח נוסף');
    }
    onOpenChange(false);
    onSaved();
  };

  const Field = ({ label, field, type = 'text', dir, placeholder }: { label: string; field: string; type?: string; dir?: string; placeholder?: string }) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={form[field] || ''}
        onChange={e => set(field, type === 'number' ? Number(e.target.value) : e.target.value)}
        dir={dir}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'עריכת לקוח' : 'לקוח חדש'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Personal Info */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-primary">פרטים אישיים</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="שם מלא *" field="fullName" placeholder="ישראל ישראלי" />
              <Field label="תעודת זהות" field="idNumber" dir="ltr" placeholder="000000000" />
              <Field label="טלפון" field="phone" type="tel" dir="ltr" placeholder="050-0000000" />
              <Field label="אימייל" field="email" type="email" dir="ltr" />
              <div className="col-span-2">
                <Field label="כתובת" field="address" />
              </div>
            </div>
          </div>

          {/* Bank Details */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-primary">פרטי חשבון בנק</h3>
            <div className="grid grid-cols-3 gap-3">
              <Field label="מספר בנק" field="bankNumber" dir="ltr" placeholder="12" />
              <Field label="מספר סניף" field="branchNumber" dir="ltr" placeholder="345" />
              <Field label="מספר חשבון" field="accountNumber" dir="ltr" placeholder="123456789" />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="שם בעל החשבון" field="accountHolderName" />
              <Field label="מספר אסמכתא הרשאה" field="authorizationRef" dir="ltr" />
              <Field label="תאריך הרשאה" field="authorizationDate" type="date" dir="ltr" />
            </div>
          </div>

          {/* Billing Config */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-primary">הגדרות חיוב</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="סכום חודשי (₪)" field="monthlyAmount" type="number" dir="ltr" />
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">מחזור חיוב</Label>
                <Select value={form.billingCycle || 'monthly'} onValueChange={v => set('billingCycle', v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">חודשי</SelectItem>
                    <SelectItem value="custom">מותאם אישית</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Field label="תאריך התחלה" field="startDate" type="date" dir="ltr" />
              <Field label="תאריך סיום (אופציונלי)" field="endDate" type="date" dir="ltr" />
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">סטטוס</Label>
                <Select value={form.status || 'active'} onValueChange={v => set('status', v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">פעיל</SelectItem>
                    <SelectItem value="paused">מושהה</SelectItem>
                    <SelectItem value="cancelled">מבוטל</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">קבוצה</Label>
                <Select value={form.groupId ? String(form.groupId) : 'none'} onValueChange={v => set('groupId', v === 'none' ? null : Number(v))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא קבוצה</SelectItem>
                    {groups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">הערות</Label>
            <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button onClick={handleSave}>{isEdit ? 'שמור שינויים' : 'הוסף לקוח'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
