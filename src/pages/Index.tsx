import { useState } from 'react';
import { LayoutDashboard, Users, FolderKanban, CreditCard, Settings, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DashboardView from '@/components/DashboardView';
import CustomersView from '@/components/CustomersView';
import GroupsView from '@/components/GroupsView';
import BillingView from '@/components/BillingView';
import SettingsView from '@/components/SettingsView';

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <CreditCard className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-bold tracking-tight">מערכת גביית מסב</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Ctrl+K</kbd>
            <span>חיפוש מהיר</span>
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
                className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2"
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
