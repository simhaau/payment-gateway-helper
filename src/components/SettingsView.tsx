import { useState, useEffect } from 'react';
import { Save, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSettings, saveSettings, exportAllData } from '@/lib/db';
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
}

function SettingsField({ label, field, value, onChange, dir, placeholder }: SettingsFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={String(value || '')}
        onChange={e => onChange(field, field === 'defaultBillingDay' ? Number(e.target.value) : e.target.value)}
        dir={dir}
        placeholder={placeholder}
        type={field === 'defaultBillingDay' ? 'number' : 'text'}
      />
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
          <div className="mt-4">
            <SettingsField label="יום חיוב ברירת מחדל (1-28)" field="defaultBillingDay" value={form.defaultBillingDay} onChange={set} dir="ltr" placeholder="1" />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={handleSave} className="gap-2">
          <Save className="h-4 w-4" />
          שמור הגדרות
        </Button>
        <Button variant="secondary" onClick={handleExportData}>
          ייצוא כל הנתונים (גיבוי)
        </Button>
      </div>
    </div>
  );
}

