import { useState } from 'react';
import { LayoutDashboard, Users, FolderKanban, CreditCard, Settings } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DashboardView from '@/components/DashboardView';
import CustomersView from '@/components/CustomersView';
import GroupsView from '@/components/GroupsView';
import BillingView from '@/components/BillingView';
import SettingsView from '@/components/SettingsView';
import CommandPalette from '@/components/CommandPalette';
import ThemeToggle from '@/components/ThemeToggle';

const TABS = [
  { id: 'dashboard', label: 'לוח בקרה', icon: LayoutDashboard },
  { id: 'customers', label: 'לקוחות', icon: Users },
  { id: 'groups', label: 'קבוצות', icon: FolderKanban },
  { id: 'billing', label: 'גבייה', icon: CreditCard },
  { id: 'settings', label: 'הגדרות', icon: Settings },
];

const Index = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <CommandPalette onNavigate={setActiveTab} />
      
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <CreditCard className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">מערכת גביית מסב</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
                document.dispatchEvent(event);
              }}
              className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-muted/60 hover:bg-muted px-3 py-1.5 rounded-md border border-border/60 transition-colors cursor-pointer"
            >
              <span>חיפוש מהיר</span>
              <kbd className="px-1.5 py-0.5 bg-background rounded text-[10px] border border-border">⌘K</kbd>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 bg-muted/50 p-1 h-auto flex-wrap">
            {TABS.map(tab => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 transition-all"
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardView onNavigate={setActiveTab} />
          </TabsContent>
          <TabsContent value="customers">
            <CustomersView />
          </TabsContent>
          <TabsContent value="groups">
            <GroupsView />
          </TabsContent>
          <TabsContent value="billing">
            <BillingView />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
