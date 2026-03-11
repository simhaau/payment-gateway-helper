import { useState, useEffect } from 'react';
import { LayoutDashboard, Users, FolderKanban, CreditCard, Settings, Banknote, History, BarChart3, Zap, Bell } from 'lucide-react';
import DashboardView from '@/components/DashboardView';
import CustomersView from '@/components/CustomersView';
import GroupsView from '@/components/GroupsView';
import BillingView from '@/components/BillingView';
import DebtsView from '@/components/DebtsView';
import SettingsView from '@/components/SettingsView';
import ActivityLogView from '@/components/ActivityLogView';
import ReportsView from '@/components/ReportsView';
import BulkChargeView from '@/components/BulkChargeView';
import RemindersView from '@/components/RemindersView';
import CommandPalette from '@/components/CommandPalette';
import ThemeToggle from '@/components/ThemeToggle';
import { getSettings } from '@/lib/db';

const TABS = [
  { id: 'dashboard', label: 'לוח בקרה', icon: LayoutDashboard },
  { id: 'customers', label: 'לקוחות', icon: Users },
  { id: 'groups', label: 'קבוצות', icon: FolderKanban },
  { id: 'billing', label: 'גבייה', icon: CreditCard },
  { id: 'bulk-charge', label: 'חיוב גורף', icon: Zap },
  { id: 'debts', label: 'חובות', icon: Banknote },
  { id: 'reports', label: 'דוחות', icon: BarChart3 },
  { id: 'reminders', label: 'תזכורות', icon: Bell },
  { id: 'activity', label: 'פעולות', icon: History },
  { id: 'settings', label: 'הגדרות', icon: Settings },
];

const Index = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stickyNav, setStickyNav] = useState(true);

  useEffect(() => {
    getSettings().then(s => setStickyNav(s.stickyNav !== false));
  }, []);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <CommandPalette onNavigate={setActiveTab} />
      
      {/* Header */}
      <header className="border-b border-border/40 bg-card/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
              <CreditCard className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">מערכת גבייה</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
                document.dispatchEvent(event);
              }}
              className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 hover:bg-muted px-3 py-1.5 rounded-lg border border-border/40 transition-colors cursor-pointer"
            >
              <span>חיפוש</span>
              <kbd className="px-1.5 py-0.5 bg-background rounded text-[10px] border border-border/60">⌘K</kbd>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className={`border-b border-border/30 bg-card/30 backdrop-blur-sm ${stickyNav ? 'sticky top-14' : ''} z-40`}>
        <div className="container px-4">
          <div className="flex gap-0.5 overflow-x-auto py-1 -mb-px scrollbar-none">
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="container px-4 py-6">
        {activeTab === 'dashboard' && <DashboardView onNavigate={setActiveTab} />}
        {activeTab === 'customers' && <CustomersView />}
        {activeTab === 'groups' && <GroupsView />}
        {activeTab === 'billing' && <BillingView />}
        {activeTab === 'bulk-charge' && <BulkChargeView />}
        {activeTab === 'debts' && <DebtsView />}
        {activeTab === 'reports' && <ReportsView />}
        {activeTab === 'reminders' && <RemindersView />}
        {activeTab === 'activity' && <ActivityLogView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
};

export default Index;
