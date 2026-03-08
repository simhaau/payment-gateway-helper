import { useEffect, useState, useMemo } from 'react';
import { Search, Users, CreditCard, Settings, FolderKanban, LayoutDashboard, User } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { getAllCustomers, getAllGroups } from '@/lib/db';
import type { Customer, Group } from '@/lib/types';

interface Props {
  onNavigate: (tab: string) => void;
  onEditCustomer?: (customer: Customer) => void;
}

export default function CommandPalette({ onNavigate, onEditCustomer }: Props) {
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      Promise.all([getAllCustomers(), getAllGroups()]).then(([c, g]) => {
        setCustomers(c);
        setGroups(g);
      });
    }
  }, [open]);

  const filteredCustomers = useMemo(() => {
    if (!query) return customers.slice(0, 8);
    const q = query.toLowerCase();
    return customers.filter(c =>
      c.fullName.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.idNumber.includes(q) ||
      c.email.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [customers, query]);

  const tabs = [
    { id: 'dashboard', label: 'לוח בקרה', icon: LayoutDashboard },
    { id: 'customers', label: 'לקוחות', icon: Users },
    { id: 'groups', label: 'קבוצות', icon: FolderKanban },
    { id: 'billing', label: 'גבייה', icon: CreditCard },
    { id: 'settings', label: 'הגדרות', icon: Settings },
  ];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="חפש לקוחות, ניווט..." value={query} onValueChange={setQuery} dir="rtl" />
      <CommandList>
        <CommandEmpty>לא נמצאו תוצאות</CommandEmpty>
        <CommandGroup heading="ניווט">
          {tabs.map(tab => (
            <CommandItem key={tab.id} onSelect={() => { onNavigate(tab.id); setOpen(false); setQuery(''); }}>
              <tab.icon className="h-4 w-4 ml-2" />
              {tab.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {filteredCustomers.length > 0 && (
          <CommandGroup heading="לקוחות">
            {filteredCustomers.map(c => (
              <CommandItem key={c.id} onSelect={() => {
                if (onEditCustomer) onEditCustomer(c);
                else onNavigate('customers');
                setOpen(false);
                setQuery('');
              }}>
                <User className="h-4 w-4 ml-2" />
                <div className="flex flex-col">
                  <span>{c.fullName}</span>
                  <span className="text-xs text-muted-foreground">{c.phone} • ₪{c.monthlyAmount.toLocaleString()}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
