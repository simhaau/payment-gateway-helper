import { useState, useEffect } from 'react';
import { Save, Building2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSettings, saveSettings, exportAllData, importData } from '@/lib/db';
import type { Settings } from '@/lib/types';
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

  useEffect(() => {
    getSettings().then(s => setForm(s));
  }, []);

  const set = (field: keyof Settings, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    await saveSettings(form);
    toast.success('ההגדרות נשמרו');
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
    const example = ['Israel Israeli', 'ישראל ישראלי', '123456789', '050-1234567', '', 'email@example.com', 'תל אביב', 'הרצל', '10', 'bank', '12', '345', '123456', 'Israel Israeli', '25', 'active', ''];
    const csv = [headers.join(','), example.join(',')].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'import_template.csv';
    a.click();
    toast.success('קובץ תבנית הורד');
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
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

      <div className="flex gap-3 flex-wrap">
        <Button onClick={handleSave} className="gap-2">
          <Save className="h-4 w-4" />
          שמור הגדרות
        </Button>
        <Button variant="secondary" onClick={handleExportData}>
          ייצוא נתונים (גיבוי)
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
    </div>
  );
}
