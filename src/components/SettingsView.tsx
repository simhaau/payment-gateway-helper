import { useState, useEffect } from 'react';
import { Save, Building2, Upload, Download, Plus, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getSettings, saveSettings, exportAllData, importData, getAllPhases, addPhase, deletePhase, addActivity } from '@/lib/db';
import type { Settings, Phase } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';
import { toast } from 'sonner';

interface SettingsFieldProps {
  label: string;
  field: keyof Settings;
  value: string | number;
  onChange: (field: keyof Settings, value: string | number) => void;
  dir?: string;
  placeholder?: string;
  description?: string;
}

function SettingsField({ label, field, value, onChange, dir, placeholder, description }: SettingsFieldProps) {
  const isNumber = field === 'defaultBillingDay' || field === 'pricePerAmpere' || field === 'billingCycleDay';
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={String(value || '')}
        onChange={e => onChange(field, isNumber ? Number(e.target.value) : e.target.value)}
        dir={dir}
        placeholder={placeholder}
        type={isNumber ? 'number' : 'text'}
      />
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

export default function SettingsView() {
  const [form, setForm] = useState<Settings>(DEFAULT_SETTINGS);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [deletePhaseId, setDeletePhaseId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([getSettings(), getAllPhases()]).then(([s, p]) => { setForm(s); setPhases(p); });
  }, []);

  const set = (field: keyof Settings, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    await saveSettings(form);
    await addActivity({ type: 'settings_updated', description: 'הגדרות המערכת עודכנו', createdAt: new Date().toISOString() });
    toast.success('ההגדרות נשמרו');
  };

  const handleAddPhase = async () => {
    if (!newPhaseName.trim()) return;
    await addPhase({ name: newPhaseName, description: '', createdAt: new Date().toISOString() });
    await addActivity({ type: 'phase_created', description: `פזה חדשה: ${newPhaseName}`, createdAt: new Date().toISOString() });
    setNewPhaseName('');
    const p = await getAllPhases();
    setPhases(p);
    toast.success('פזה נוספה');
  };

  const handleDeletePhase = async () => {
    if (deletePhaseId === null) return;
    await deletePhase(deletePhaseId);
    setDeletePhaseId(null);
    const p = await getAllPhases();
    setPhases(p);
    toast.success('פזה נמחקה');
  };

  const handleExportData = async () => {
    const data = await exportAllData();
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `masav_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toast.success('הנתונים יוצאו');
  };

  const handleDownloadTemplate = () => {
    const headers = ['fullName', 'nickname', 'idNumber', 'phone', 'phone2', 'email', 'city', 'street', 'houseNumber', 'paymentMethod', 'bankNumber', 'branchNumber', 'accountNumber', 'accountHolderName', 'amperes', 'status', 'notes'];
    const example = ['Israel Israeli', 'ישראל', '123456789', '050-1234567', '', 'email@example.com', 'תל אביב', 'הרצל', '10', 'bank', '12', '345', '123456', 'Israel Israeli', '25', 'active', ''];
    const csv = [headers.join(','), example.join(',')].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'import_template.csv';
    a.click();
    toast.success('קובץ תבנית הורד');
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            פרטי הארגון
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingsField label="שם הארגון" field="organizationName" value={form.organizationName} onChange={set} placeholder="שם החברה / העמותה" />
          <div className="grid grid-cols-2 gap-4">
            <SettingsField label="קוד שולח מסב" field="masavSenderCode" value={form.masavSenderCode} onChange={set} dir="ltr" placeholder="00000000" />
            <SettingsField label="קוד מוסד" field="institutionCode" value={form.institutionCode} onChange={set} dir="ltr" placeholder="00000" />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">חשבון בנק של הארגון</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <SettingsField label="מספר בנק" field="bankNumber" value={form.bankNumber} onChange={set} dir="ltr" placeholder="12" />
            <SettingsField label="מספר סניף" field="branchNumber" value={form.branchNumber} onChange={set} dir="ltr" placeholder="345" />
            <SettingsField label="מספר חשבון" field="accountNumber" value={form.accountNumber} onChange={set} dir="ltr" placeholder="123456789" />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">מחזור חיוב ותמחור</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <SettingsField label="יום חיוב ברירת מחדל (1-28)" field="defaultBillingDay" value={form.defaultBillingDay} onChange={set} dir="ltr" placeholder="1" />
            <SettingsField label="יום חידוש מחזור חיוב (1-28)" field="billingCycleDay" value={form.billingCycleDay || 1} onChange={set} dir="ltr" placeholder="1"
              description="ביום זה בחודש כל הלקוחות יתחייבו מחדש" />
          </div>
          <SettingsField label="מחיר לאמפר (₪)" field="pricePerAmpere" value={form.pricePerAmpere} onChange={set} dir="ltr" placeholder="10" />
          <p className="text-xs text-muted-foreground">סכום חודשי = כמות אמפרים × מחיר לאמפר</p>
        </CardContent>
      </Card>

      {/* UI Preferences */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">ממשק משתמש</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>ניווט צף</Label>
              <p className="text-xs text-muted-foreground">הכפתורים של הניווט יהיו צפים (sticky) בראש הדף</p>
            </div>
            <Switch
              checked={form.stickyNav !== false}
              onCheckedChange={v => set('stickyNav' as keyof Settings, v ? 1 : 0)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Phases Management */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-warning" />
            ניהול פזות
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input value={newPhaseName} onChange={e => setNewPhaseName(e.target.value)} placeholder="שם הפזה..." className="flex-1"
              onKeyDown={e => e.key === 'Enter' && handleAddPhase()} />
            <Button onClick={handleAddPhase} disabled={!newPhaseName.trim()} className="gap-1">
              <Plus className="h-4 w-4" />
              הוסף
            </Button>
          </div>
          {phases.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">אין פזות עדיין</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {phases.map(p => (
                <Badge key={p.id} variant="secondary" className="gap-1 pr-1 text-sm">
                  {p.name}
                  <button onClick={() => setDeletePhaseId(p.id!)} className="hover:text-destructive transition-colors p-0.5 rounded">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3 flex-wrap">
        <Button onClick={handleSave} className="gap-2">
          <Save className="h-4 w-4" />
          שמור הגדרות
        </Button>
        <Button variant="secondary" onClick={handleExportData} className="gap-2">
          <Download className="h-4 w-4" />
          ייצוא נתונים
        </Button>
        <Button variant="secondary" className="gap-2" onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json';
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
              const text = await file.text();
              await importData(text);
              toast.success('הנתונים יובאו — רענן את הדף');
              window.location.reload();
            } catch {
              toast.error('שגיאה בייבוא');
            }
          };
          input.click();
        }}>
          <Upload className="h-4 w-4" />
          ייבוא מגיבוי
        </Button>
        <Button variant="outline" onClick={handleDownloadTemplate}>
          הורד תבנית ייבוא CSV
        </Button>
      </div>

      <AlertDialog open={deletePhaseId !== null} onOpenChange={() => setDeletePhaseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת פזה</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את הפזה? לקוחות המשויכים אליה לא ימחקו.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePhase} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
